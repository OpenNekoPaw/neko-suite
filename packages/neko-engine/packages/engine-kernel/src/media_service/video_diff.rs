//! Video Content Diff - Frame-level comparison via FFmpeg SSIM/PSNR
//!
//! Compares two video files by:
//! 1. Running FFmpeg `ssim` + `psnr` filters **in parallel** (two threads)
//! 2. Parsing logs into structured data
//! 3. Merging per-frame SSIM/PSNR into unified FrameMetric list
//! 4. Optionally comparing audio tracks via `audio_diff`
//! 5. Optionally generating a visual difference video (blend=difference)
//!
//! SSIM and PSNR are independent I/O-bound FFmpeg processes, so running them
//! concurrently via `std::thread::scope` reduces analysis time by ~30-50%.
//!
//! This hybrid approach leverages FFmpeg's SIMD-optimized SSIM/PSNR computation
//! while providing structured Rust output compatible with the ActionResponse protocol.
//!
//! ## Performance Optimization
//!
//! For long videos, frame-by-frame analysis can be slow. Use `sample_fps` to downsample:
//!
//! ```rust,ignore
//! let opts = VideoDiffOptions {
//!     sample_fps: Some(1.0),  // Analyze at 1fps instead of full frame rate
//!     ..Default::default()
//! };
//! ```
//!
//! Performance impact for 60-minute video:
//! - Full rate (30fps): ~108K frames → ~30 seconds
//! - Sampled (1fps): ~3.6K frames → ~1-2 seconds (15-30x faster)
//!
//! The sampling is done via FFmpeg's `fps` filter before SSIM/PSNR computation,
//! ensuring accurate timestamps in the output.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::audio_diff::{diff_audio_content, AudioContentDiff};
use super::ffmpeg_parser::{parse_psnr_log, parse_ssim_log};
use super::probe::global_probe_cache;
use crate::error::{Error, Result};

// ─────────────────────────────────────────────────────────────
// FFmpeg binary discovery
// ─────────────────────────────────────────────────────────────

static FFMPEG_BIN: OnceLock<PathBuf> = OnceLock::new();

/// Locate the `ffmpeg` CLI binary. Search order:
/// 1. `FFMPEG_PATH` environment variable (explicit override)
/// 2. Same directory as the currently running executable
/// 3. System PATH (via `which`/`where`)
///
/// Falls back to bare `"ffmpeg"` if nothing is found, letting
/// the OS handle the error with a clear message.
fn ffmpeg_binary() -> &'static Path {
    FFMPEG_BIN
        .get_or_init(|| {
            // 1. Explicit env var
            if let Ok(p) = std::env::var("FFMPEG_PATH") {
                let path = PathBuf::from(&p);
                if path.is_file() {
                    tracing::debug!(path = %path.display(), "Using FFMPEG_PATH");
                    return path;
                }
            }

            // 2. Next to current executable
            if let Ok(exe) = std::env::current_exe() {
                if let Some(dir) = exe.parent() {
                    let candidate = dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
                    if candidate.is_file() {
                        tracing::debug!(path = %candidate.display(), "Found ffmpeg next to executable");
                        return candidate;
                    }
                }
            }

            // 3. System PATH via `which` (Unix) or `where` (Windows)
            let which_cmd = if cfg!(windows) { "where" } else { "which" };
            if let Ok(output) = std::process::Command::new(which_cmd)
                .arg("ffmpeg")
                .output()
            {
                if output.status.success() {
                    let path_str = String::from_utf8_lossy(&output.stdout);
                    let path = PathBuf::from(path_str.trim());
                    if path.is_file() {
                        tracing::debug!(path = %path.display(), "Found ffmpeg in system PATH");
                        return path;
                    }
                }
            }

            tracing::warn!("ffmpeg binary not found — video diff will fail. \
                Set FFMPEG_PATH env var or install ffmpeg to your system PATH.");
            PathBuf::from("ffmpeg")
        })
        .as_path()
}

/// SSIM threshold below which a frame is considered "different"
const DEFAULT_SSIM_THRESHOLD: f64 = 0.95;
/// Minimum gap (in seconds) to merge adjacent diff regions
const REGION_MERGE_GAP: f64 = 0.5;

// ─────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────

/// Options for video content diff
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDiffOptions {
    /// SSIM threshold: frames below this are "different" (default 0.95)
    #[serde(default = "default_ssim_threshold")]
    pub ssim_threshold: f64,

    /// Whether to generate a visual difference video
    #[serde(default)]
    pub generate_diff_video: bool,

    /// Output path for the difference video (required when generate_diff_video=true)
    #[serde(default)]
    pub diff_video_output: Option<String>,

    /// Whether to include audio waveform comparison
    #[serde(default = "default_true")]
    pub include_audio: bool,

    /// Start time in seconds for range-based diff (None = from beginning)
    #[serde(default)]
    pub start_time: Option<f64>,

    /// End time in seconds for range-based diff (None = to end)
    #[serde(default)]
    pub end_time: Option<f64>,

    /// Sample frame rate for diff computation (None = full frame rate)
    /// Example: 1.0 = sample 1 frame per second
    #[serde(default)]
    pub sample_fps: Option<f64>,
}

fn default_ssim_threshold() -> f64 {
    DEFAULT_SSIM_THRESHOLD
}
fn default_true() -> bool {
    true
}

impl Default for VideoDiffOptions {
    fn default() -> Self {
        Self {
            ssim_threshold: DEFAULT_SSIM_THRESHOLD,
            generate_diff_video: false,
            diff_video_output: None,
            include_audio: true,
            start_time: None,
            end_time: None,
            sample_fps: None,
        }
    }
}

/// Video content diff result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoContentDiff {
    // ── Global metrics ──
    /// Average SSIM across all frames (0.0-1.0)
    pub avg_ssim: f64,
    /// Minimum SSIM (worst frame)
    pub min_ssim: f64,
    /// Average PSNR in dB
    pub avg_psnr: f64,
    /// Minimum PSNR in dB (worst frame)
    pub min_psnr: f64,

    // ── Video metadata ──
    pub duration_a: f64,
    pub duration_b: f64,
    pub fps_a: f64,
    pub fps_b: f64,
    pub width_a: u32,
    pub height_a: u32,
    pub width_b: u32,
    pub height_b: u32,

    // ── Frame-level analysis ──
    /// Total frames compared
    pub total_frames_compared: u64,
    /// Number of frames that differ (SSIM < threshold)
    pub diff_frame_count: u64,
    /// Percentage of frames that differ (0.0-100.0)
    pub diff_frame_percent: f64,
    /// Per-frame SSIM/PSNR data
    pub frame_metrics: Vec<FrameMetric>,

    // ── Diff regions ──
    /// Contiguous time regions where video differs
    pub diff_regions: Vec<VideoDiffRegion>,

    // ── Audio comparison (optional) ──
    /// Audio waveform diff (if include_audio=true and both have audio)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_diff: Option<AudioContentDiff>,

    // ── Diff video (optional) ──
    /// Path to generated difference video
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diff_video_path: Option<String>,
}

/// Per-frame SSIM and PSNR metrics
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameMetric {
    /// Frame number (1-based)
    pub frame: u64,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// SSIM value (0.0-1.0)
    pub ssim: f64,
    /// PSNR value in dB
    pub psnr: f64,
}

/// A contiguous time region where video content differs
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDiffRegion {
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
    /// Average SSIM in this region
    pub avg_ssim: f64,
    /// Minimum SSIM in this region
    pub min_ssim: f64,
    /// Number of diff frames in this region
    pub frame_count: u64,
}

// ─────────────────────────────────────────────────────────────
// Core implementation
// ─────────────────────────────────────────────────────────────

/// Compare two video files at the content level
pub fn diff_video_content<P: AsRef<Path>>(
    source_a: P,
    source_b: P,
    opts: &VideoDiffOptions,
) -> Result<VideoContentDiff> {
    let path_a = source_a.as_ref();
    let path_b = source_b.as_ref();

    // Validate files exist
    if !path_a.exists() {
        return Err(Error::FileNotFound(path_a.display().to_string()));
    }
    if !path_b.exists() {
        return Err(Error::FileNotFound(path_b.display().to_string()));
    }

    // Step 1: Probe metadata
    let info_a = global_probe_cache().probe(path_a)?;
    let info_b = global_probe_cache().probe(path_b)?;

    let fps_a = if info_a.fps > 0.0 { info_a.fps } else { 30.0 };
    let fps_b = if info_b.fps > 0.0 { info_b.fps } else { 30.0 };

    // Step 2+3: Run FFmpeg SSIM and PSNR in parallel
    // Both are independent I/O-bound FFmpeg processes — concurrent execution
    // reduces analysis time by ~30-50%.
    let (ssim_result, psnr_result) = std::thread::scope(|s| {
        let ssim_handle = s.spawn(|| -> Result<Vec<_>> {
            let log = run_ffmpeg_ssim(
                path_a,
                path_b,
                opts.start_time,
                opts.end_time,
                opts.sample_fps,
            )?;
            parse_ssim_log(&log)
        });
        let psnr_handle = s.spawn(|| -> Result<Vec<_>> {
            let log = run_ffmpeg_psnr(
                path_a,
                path_b,
                opts.start_time,
                opts.end_time,
                opts.sample_fps,
            )?;
            parse_psnr_log(&log)
        });
        // scope blocks until both threads finish
        (ssim_handle.join(), psnr_handle.join())
    });

    let ssim_entries = ssim_result
        .map_err(|_| Error::Other("SSIM thread panicked".into()))
        .and_then(|r| r)?;
    let psnr_entries = psnr_result
        .map_err(|_| Error::Other("PSNR thread panicked".into()))
        .and_then(|r| r)?;

    // Step 4: Merge SSIM + PSNR into FrameMetric list
    // Use the lower fps for timestamp calculation
    let base_fps = fps_a.min(fps_b);
    let frame_metrics =
        build_frame_metrics(&ssim_entries, &psnr_entries, base_fps, opts.sample_fps);

    // Step 5: Compute global metrics
    let total = frame_metrics.len() as u64;
    let (avg_ssim, min_ssim) = if total > 0 {
        let sum: f64 = frame_metrics.iter().map(|f| f.ssim).sum();
        let min = frame_metrics
            .iter()
            .map(|f| f.ssim)
            .fold(f64::INFINITY, f64::min);
        (sum / total as f64, min)
    } else {
        (1.0, 1.0)
    };

    let (avg_psnr, min_psnr) = if total > 0 {
        let finite_psnrs: Vec<f64> = frame_metrics
            .iter()
            .map(|f| f.psnr)
            .filter(|p| p.is_finite())
            .collect();
        if finite_psnrs.is_empty() {
            (f64::INFINITY, f64::INFINITY)
        } else {
            let sum: f64 = finite_psnrs.iter().sum();
            let min = finite_psnrs.iter().cloned().fold(f64::INFINITY, f64::min);
            (sum / finite_psnrs.len() as f64, min)
        }
    } else {
        (f64::INFINITY, f64::INFINITY)
    };

    // Step 6: Identify diff frames and build regions
    let diff_frame_count = frame_metrics
        .iter()
        .filter(|f| f.ssim < opts.ssim_threshold)
        .count() as u64;
    let diff_frame_percent = if total > 0 {
        (diff_frame_count as f64 / total as f64) * 100.0
    } else {
        0.0
    };

    let diff_regions = build_diff_regions(&frame_metrics, opts.ssim_threshold, base_fps);

    // Step 7: Audio diff (optional)
    let audio_diff = if opts.include_audio && info_a.has_audio && info_b.has_audio {
        let sa = path_a.to_string_lossy();
        let sb = path_b.to_string_lossy();
        match diff_audio_content(&sa, &sb) {
            Ok(ad) => Some(ad),
            Err(e) => {
                tracing::warn!("Audio diff failed (skipping): {}", e);
                None
            }
        }
    } else {
        None
    };

    // Step 8: Generate diff video (optional)
    let diff_video_path = if opts.generate_diff_video {
        if let Some(ref output) = opts.diff_video_output {
            match generate_diff_video(path_a, path_b, Path::new(output)) {
                Ok(()) => Some(output.clone()),
                Err(e) => {
                    tracing::warn!("Diff video generation failed: {}", e);
                    None
                }
            }
        } else {
            tracing::warn!("generate_diff_video=true but no diff_video_output specified");
            None
        }
    } else {
        None
    };

    Ok(VideoContentDiff {
        avg_ssim,
        min_ssim,
        avg_psnr,
        min_psnr,
        duration_a: info_a.duration,
        duration_b: info_b.duration,
        fps_a,
        fps_b,
        width_a: info_a.width,
        height_a: info_a.height,
        width_b: info_b.width,
        height_b: info_b.height,
        total_frames_compared: total,
        diff_frame_count,
        diff_frame_percent,
        frame_metrics,
        diff_regions,
        audio_diff,
        diff_video_path,
    })
}

// ─────────────────────────────────────────────────────────────
// FFmpeg command runners
// ─────────────────────────────────────────────────────────────

/// Run FFmpeg SSIM filter and return the log content.
/// Uses scale2ref to scale input B to match input A's resolution when they differ.
/// Supports optional time range via start_time/end_time parameters.
/// Supports optional frame sampling via sample_fps parameter.
fn run_ffmpeg_ssim(
    path_a: &Path,
    path_b: &Path,
    start_time: Option<f64>,
    end_time: Option<f64>,
    sample_fps: Option<f64>,
) -> Result<String> {
    // Use SystemTime nanos as unique suffix to prevent concurrent collisions
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let tmp = std::env::temp_dir().join(format!("neko_ssim_{}_{}.log", std::process::id(), nanos));

    // Build filter chain with optional fps sampling
    let filter = if let Some(fps) = sample_fps {
        // Apply fps resampling before scale2ref and ssim
        format!(
            "[1:v]fps=fps={}:round=near[b_fps];[0:v]fps=fps={}:round=near[a_fps];[b_fps][a_fps]scale2ref=flags=bicubic[scaled][ref];[ref][scaled]ssim=stats_file={}",
            fps, fps, tmp.display()
        )
    } else {
        // Original filter without sampling
        format!(
            "[1:v][0:v]scale2ref=flags=bicubic[scaled][ref];[ref][scaled]ssim=stats_file={}",
            tmp.display()
        )
    };

    let mut cmd = std::process::Command::new(ffmpeg_binary());

    // Input A with optional time range
    if let Some(t) = start_time {
        cmd.args(["-ss", &t.to_string()]);
    }
    cmd.args(["-i", &path_a.to_string_lossy()]);

    // Input B with optional time range
    if let Some(t) = start_time {
        cmd.args(["-ss", &t.to_string()]);
    }
    cmd.args(["-i", &path_b.to_string_lossy()]);

    // Duration limit (if end_time specified)
    if let Some(end) = end_time {
        if let Some(start) = start_time {
            let duration = (end - start).max(0.0);
            cmd.args(["-t", &duration.to_string()]);
        } else {
            cmd.args(["-to", &end.to_string()]);
        }
    }

    cmd.args(["-filter_complex", &filter, "-f", "null", "-"]);

    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| Error::Other(format!("Failed to run ffmpeg ssim (binary: {}): {}", ffmpeg_binary().display(), e)))?;

    // Check exit status FIRST (before checking file existence)
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_file(&tmp);
        return Err(Error::Other(format!(
            "FFmpeg SSIM failed (exit {}): {}",
            output.status,
            &stderr[..stderr.len().min(500)]
        )));
    }

    if !tmp.exists() {
        return Err(Error::Other(
            "FFmpeg SSIM succeeded but produced no stats file".into(),
        ));
    }

    let content = std::fs::read_to_string(&tmp)
        .map_err(|e| Error::Other(format!("Failed to read SSIM log: {}", e)))?;

    let _ = std::fs::remove_file(&tmp);

    Ok(content)
}

/// Run FFmpeg PSNR filter and return the log content.
/// Uses scale2ref to scale input B to match input A's resolution when they differ.
/// Supports optional time range via start_time/end_time parameters.
/// Supports optional frame sampling via sample_fps parameter.
fn run_ffmpeg_psnr(
    path_a: &Path,
    path_b: &Path,
    start_time: Option<f64>,
    end_time: Option<f64>,
    sample_fps: Option<f64>,
) -> Result<String> {
    // Use SystemTime nanos as unique suffix to prevent concurrent collisions
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let tmp = std::env::temp_dir().join(format!("neko_psnr_{}_{}.log", std::process::id(), nanos));

    // Build filter chain with optional fps sampling
    let filter = if let Some(fps) = sample_fps {
        // Apply fps resampling before scale2ref and psnr
        format!(
            "[1:v]fps=fps={}:round=near[b_fps];[0:v]fps=fps={}:round=near[a_fps];[b_fps][a_fps]scale2ref=flags=bicubic[scaled][ref];[ref][scaled]psnr=stats_file={}",
            fps, fps, tmp.display()
        )
    } else {
        // Original filter without sampling
        format!(
            "[1:v][0:v]scale2ref=flags=bicubic[scaled][ref];[ref][scaled]psnr=stats_file={}",
            tmp.display()
        )
    };

    let mut cmd = std::process::Command::new(ffmpeg_binary());

    // Input A with optional time range
    if let Some(t) = start_time {
        cmd.args(["-ss", &t.to_string()]);
    }
    cmd.args(["-i", &path_a.to_string_lossy()]);

    // Input B with optional time range
    if let Some(t) = start_time {
        cmd.args(["-ss", &t.to_string()]);
    }
    cmd.args(["-i", &path_b.to_string_lossy()]);

    // Duration limit (if end_time specified)
    if let Some(end) = end_time {
        if let Some(start) = start_time {
            let duration = (end - start).max(0.0);
            cmd.args(["-t", &duration.to_string()]);
        } else {
            cmd.args(["-to", &end.to_string()]);
        }
    }

    cmd.args(["-filter_complex", &filter, "-f", "null", "-"]);

    let output = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| Error::Other(format!("Failed to run ffmpeg psnr (binary: {}): {}", ffmpeg_binary().display(), e)))?;

    // Check exit status FIRST (before checking file existence)
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_file(&tmp);
        return Err(Error::Other(format!(
            "FFmpeg PSNR failed (exit {}): {}",
            output.status,
            &stderr[..stderr.len().min(500)]
        )));
    }

    if !tmp.exists() {
        return Err(Error::Other(
            "FFmpeg PSNR succeeded but produced no stats file".into(),
        ));
    }

    let content = std::fs::read_to_string(&tmp)
        .map_err(|e| Error::Other(format!("Failed to read PSNR log: {}", e)))?;

    let _ = std::fs::remove_file(&tmp);

    Ok(content)
}

/// Generate a visual difference video using FFmpeg blend=difference
fn generate_diff_video(path_a: &Path, path_b: &Path, output: &Path) -> Result<()> {
    let result = std::process::Command::new(ffmpeg_binary())
        .args([
            "-y",
            "-i",
            &path_a.to_string_lossy(),
            "-i",
            &path_b.to_string_lossy(),
            "-filter_complex",
            "blend=all_mode=difference",
            "-an",
            &output.to_string_lossy(),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| Error::Other(format!("Failed to run ffmpeg blend (binary: {}): {}", ffmpeg_binary().display(), e)))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(Error::Other(format!(
            "FFmpeg blend failed: {}",
            stderr.chars().take(500).collect::<String>()
        )));
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────
// Data aggregation helpers
// ─────────────────────────────────────────────────────────────

/// Merge SSIM and PSNR entries into a unified FrameMetric list
fn build_frame_metrics(
    ssim_entries: &[super::ffmpeg_parser::SsimEntry],
    psnr_entries: &[super::ffmpeg_parser::PsnrEntry],
    fps: f64,
    sample_fps: Option<f64>,
) -> Vec<FrameMetric> {
    let count = ssim_entries.len();
    let mut metrics = Vec::with_capacity(count);

    // Use sample_fps for timestamp calculation if sampling is enabled
    let effective_fps = sample_fps.unwrap_or(fps);

    for (i, ssim) in ssim_entries.iter().enumerate() {
        let psnr = psnr_entries
            .get(i)
            .map(|p| p.psnr_avg)
            .unwrap_or(f64::INFINITY);

        let timestamp = if effective_fps > 0.0 {
            (ssim.frame as f64 - 1.0) / effective_fps
        } else {
            0.0
        };

        metrics.push(FrameMetric {
            frame: ssim.frame,
            timestamp,
            ssim: ssim.all,
            psnr,
        });
    }

    metrics
}

/// Build contiguous diff regions from frame metrics
fn build_diff_regions(
    metrics: &[FrameMetric],
    ssim_threshold: f64,
    fps: f64,
) -> Vec<VideoDiffRegion> {
    if metrics.is_empty() {
        return Vec::new();
    }

    let frame_duration = if fps > 0.0 { 1.0 / fps } else { 1.0 / 30.0 };

    // Collect diff frames
    let diff_frames: Vec<&FrameMetric> =
        metrics.iter().filter(|f| f.ssim < ssim_threshold).collect();

    if diff_frames.is_empty() {
        return Vec::new();
    }

    // Build regions by merging adjacent diff frames
    let mut regions: Vec<VideoDiffRegion> = Vec::new();
    let mut region_start = diff_frames[0].timestamp;
    let mut region_end = diff_frames[0].timestamp + frame_duration;
    let mut region_ssim_sum = diff_frames[0].ssim;
    let mut region_ssim_min = diff_frames[0].ssim;
    let mut region_count: u64 = 1;

    for frame in diff_frames.iter().skip(1) {
        let gap = frame.timestamp - region_end;

        if gap <= REGION_MERGE_GAP {
            // Extend current region
            region_end = frame.timestamp + frame_duration;
            region_ssim_sum += frame.ssim;
            region_ssim_min = region_ssim_min.min(frame.ssim);
            region_count += 1;
        } else {
            // Finalize current region and start new one
            regions.push(VideoDiffRegion {
                start: region_start,
                end: region_end,
                avg_ssim: region_ssim_sum / region_count as f64,
                min_ssim: region_ssim_min,
                frame_count: region_count,
            });

            region_start = frame.timestamp;
            region_end = frame.timestamp + frame_duration;
            region_ssim_sum = frame.ssim;
            region_ssim_min = frame.ssim;
            region_count = 1;
        }
    }

    // Push last region
    regions.push(VideoDiffRegion {
        start: region_start,
        end: region_end,
        avg_ssim: region_ssim_sum / region_count as f64,
        min_ssim: region_ssim_min,
        frame_count: region_count,
    });

    regions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_frame_metrics_basic() {
        use super::super::ffmpeg_parser::{PsnrEntry, SsimEntry};

        let ssim = vec![
            SsimEntry {
                frame: 1,
                y: 0.99,
                u: 0.99,
                v: 0.99,
                all: 0.99,
            },
            SsimEntry {
                frame: 2,
                y: 0.85,
                u: 0.86,
                v: 0.87,
                all: 0.86,
            },
        ];
        let psnr = vec![
            PsnrEntry {
                frame: 1,
                mse_avg: 0.1,
                psnr_avg: 48.0,
            },
            PsnrEntry {
                frame: 2,
                mse_avg: 5.0,
                psnr_avg: 31.0,
            },
        ];

        let metrics = build_frame_metrics(&ssim, &psnr, 30.0, None);
        assert_eq!(metrics.len(), 2);
        assert_eq!(metrics[0].frame, 1);
        assert!((metrics[0].timestamp - 0.0).abs() < 1e-6);
        assert!((metrics[0].ssim - 0.99).abs() < 1e-6);
        assert!((metrics[0].psnr - 48.0).abs() < 1e-6);
        assert!((metrics[1].timestamp - 1.0 / 30.0).abs() < 1e-6);
    }

    #[test]
    fn test_build_frame_metrics_mismatched_lengths() {
        use super::super::ffmpeg_parser::{PsnrEntry, SsimEntry};

        let ssim = vec![
            SsimEntry {
                frame: 1,
                y: 0.99,
                u: 0.99,
                v: 0.99,
                all: 0.99,
            },
            SsimEntry {
                frame: 2,
                y: 0.85,
                u: 0.86,
                v: 0.87,
                all: 0.86,
            },
            SsimEntry {
                frame: 3,
                y: 0.90,
                u: 0.91,
                v: 0.92,
                all: 0.91,
            },
        ];
        let psnr = vec![PsnrEntry {
            frame: 1,
            mse_avg: 0.1,
            psnr_avg: 48.0,
        }];

        let metrics = build_frame_metrics(&ssim, &psnr, 30.0, None);
        assert_eq!(metrics.len(), 3);
        // Frame 2 and 3 should have INFINITY psnr (no matching PSNR entry)
        assert!(metrics[1].psnr.is_infinite());
        assert!(metrics[2].psnr.is_infinite());
    }

    #[test]
    fn test_build_diff_regions_no_diffs() {
        let metrics = vec![
            FrameMetric {
                frame: 1,
                timestamp: 0.0,
                ssim: 0.99,
                psnr: 48.0,
            },
            FrameMetric {
                frame: 2,
                timestamp: 1.0 / 30.0,
                ssim: 0.98,
                psnr: 45.0,
            },
        ];
        let regions = build_diff_regions(&metrics, 0.95, 30.0);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_build_diff_regions_all_diff() {
        let metrics = vec![
            FrameMetric {
                frame: 1,
                timestamp: 0.0,
                ssim: 0.80,
                psnr: 30.0,
            },
            FrameMetric {
                frame: 2,
                timestamp: 1.0 / 30.0,
                ssim: 0.82,
                psnr: 31.0,
            },
            FrameMetric {
                frame: 3,
                timestamp: 2.0 / 30.0,
                ssim: 0.78,
                psnr: 29.0,
            },
        ];
        let regions = build_diff_regions(&metrics, 0.95, 30.0);
        assert_eq!(regions.len(), 1); // All adjacent → merged into one region
        assert_eq!(regions[0].frame_count, 3);
        assert!((regions[0].min_ssim - 0.78).abs() < 1e-6);
    }

    #[test]
    fn test_build_diff_regions_with_gap() {
        let metrics = vec![
            FrameMetric {
                frame: 1,
                timestamp: 0.0,
                ssim: 0.80,
                psnr: 30.0,
            },
            FrameMetric {
                frame: 2,
                timestamp: 1.0 / 30.0,
                ssim: 0.82,
                psnr: 31.0,
            },
            // Gap: frame 3-30 are fine (ssim > 0.95)
            FrameMetric {
                frame: 30,
                timestamp: 29.0 / 30.0,
                ssim: 0.99,
                psnr: 48.0,
            },
            // Another diff at 2 seconds
            FrameMetric {
                frame: 60,
                timestamp: 59.0 / 30.0,
                ssim: 0.70,
                psnr: 25.0,
            },
        ];
        let regions = build_diff_regions(&metrics, 0.95, 30.0);
        assert_eq!(regions.len(), 2); // Two separate regions
        assert_eq!(regions[0].frame_count, 2);
        assert_eq!(regions[1].frame_count, 1);
    }

    #[test]
    fn test_build_diff_regions_empty() {
        let regions = build_diff_regions(&[], 0.95, 30.0);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_video_diff_options_default() {
        let opts = VideoDiffOptions::default();
        assert!((opts.ssim_threshold - 0.95).abs() < 1e-6);
        assert!(!opts.generate_diff_video);
        assert!(opts.include_audio);
        assert!(opts.diff_video_output.is_none());
    }

    #[test]
    fn test_video_diff_options_deserialize() {
        let json = r#"{"ssimThreshold": 0.90, "generateDiffVideo": true, "diffVideoOutput": "/tmp/diff.mp4"}"#;
        let opts: VideoDiffOptions = serde_json::from_str(json).unwrap();
        assert!((opts.ssim_threshold - 0.90).abs() < 1e-6);
        assert!(opts.generate_diff_video);
        assert_eq!(opts.diff_video_output.as_deref(), Some("/tmp/diff.mp4"));
    }

    #[test]
    fn test_video_content_diff_serialize() {
        let diff = VideoContentDiff {
            avg_ssim: 0.95,
            min_ssim: 0.80,
            avg_psnr: 40.0,
            min_psnr: 30.0,
            duration_a: 10.0,
            duration_b: 10.0,
            fps_a: 30.0,
            fps_b: 30.0,
            width_a: 1920,
            height_a: 1080,
            width_b: 1920,
            height_b: 1080,
            total_frames_compared: 300,
            diff_frame_count: 10,
            diff_frame_percent: 3.33,
            frame_metrics: vec![],
            diff_regions: vec![],
            audio_diff: None,
            diff_video_path: None,
        };

        let json = serde_json::to_value(&diff).unwrap();
        assert_eq!(json["avgSsim"], 0.95);
        assert_eq!(json["diffFrameCount"], 10);
        assert!(json.get("audioDiff").is_none()); // skip_serializing_if
        assert!(json.get("diffVideoPath").is_none());
    }

    #[test]
    fn test_diff_video_content_file_not_found() {
        let result = diff_video_content(
            "/nonexistent/a.mp4",
            "/nonexistent/b.mp4",
            &VideoDiffOptions::default(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_video_diff_options_with_sample_fps() {
        let json = r#"{"ssimThreshold": 0.90, "sampleFps": 1.0}"#;
        let opts: VideoDiffOptions = serde_json::from_str(json).unwrap();
        assert!((opts.ssim_threshold - 0.90).abs() < 1e-6);
        assert_eq!(opts.sample_fps, Some(1.0));
    }

    #[test]
    fn test_build_frame_metrics_with_sampling() {
        use super::super::ffmpeg_parser::{PsnrEntry, SsimEntry};

        let ssim = vec![
            SsimEntry {
                frame: 1,
                y: 0.99,
                u: 0.99,
                v: 0.99,
                all: 0.99,
            },
            SsimEntry {
                frame: 2,
                y: 0.85,
                u: 0.86,
                v: 0.87,
                all: 0.86,
            },
        ];
        let psnr = vec![
            PsnrEntry {
                frame: 1,
                mse_avg: 0.1,
                psnr_avg: 48.0,
            },
            PsnrEntry {
                frame: 2,
                mse_avg: 5.0,
                psnr_avg: 31.0,
            },
        ];

        // With 1fps sampling, frame 1 → 0s, frame 2 → 1s
        let metrics = build_frame_metrics(&ssim, &psnr, 30.0, Some(1.0));
        assert_eq!(metrics.len(), 2);
        assert!((metrics[0].timestamp - 0.0).abs() < 1e-6);
        assert!((metrics[1].timestamp - 1.0).abs() < 1e-6);
    }
}
