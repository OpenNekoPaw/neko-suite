//! Export Service - Main orchestrator for compat mode video export
//!
//! Coordinates GpuExportPipeline, AudioMixer, and AsyncExportPipeline
//! to perform server-side video export with audio mixing.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::{broadcast, RwLock};

use crate::encoder::{AsyncExportPipeline, CompositedFrame, ContainerFormat, PipelineConfig};
use crate::error::{Error, Result};
use crate::gpu::GpuContext;

use super::audio_mixer::AudioMixer;
use super::gpu_export_pipeline::GpuExportPipeline;
use super::types::{
    ExportJobConfig, ExportMetadata, ExportProgress, ExportStartResponse, ExportState, ExportStats,
};

/// Active export job
struct ExportJob {
    /// Job configuration
    config: ExportJobConfig,
    /// Current state
    state: ExportState,
    /// Cancellation flag
    cancel_flag: Arc<AtomicBool>,
    /// Start time
    start_time: Instant,
    /// Current frame
    current_frame: u64,
    /// Total frames
    total_frames: u64,
    /// Export metadata
    metadata: Option<ExportMetadata>,
    /// Performance stats
    stats: ExportStats,
    /// Decode time accumulator (atomic for thread safety)
    decode_time_us: Arc<AtomicU64>,
    /// Composite time accumulator
    composite_time_us: Arc<AtomicU64>,
}

impl ExportJob {
    fn new(config: ExportJobConfig, total_frames: u64) -> Self {
        Self {
            config,
            state: ExportState::Pending,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            start_time: Instant::now(),
            current_frame: 0,
            total_frames,
            metadata: None,
            stats: ExportStats::default(),
            decode_time_us: Arc::new(AtomicU64::new(0)),
            composite_time_us: Arc::new(AtomicU64::new(0)),
        }
    }

    fn to_progress(&self) -> ExportProgress {
        let elapsed_ms = self.start_time.elapsed().as_millis() as u64;
        let progress = if self.total_frames > 0 {
            (self.current_frame as f64 / self.total_frames as f64) * 100.0
        } else {
            0.0
        };

        // Estimate remaining time
        let estimated_remaining_ms = if self.current_frame > 0 && progress > 0.0 {
            let ms_per_frame = elapsed_ms as f64 / self.current_frame as f64;
            let remaining_frames = self.total_frames - self.current_frame;
            (ms_per_frame * remaining_frames as f64) as u64
        } else {
            0
        };

        // Calculate average FPS
        let avg_fps = if elapsed_ms > 0 {
            (self.current_frame as f64 / elapsed_ms as f64) * 1000.0
        } else {
            0.0
        };

        // Build stats
        let stats = ExportStats {
            decode_time_ms: self.decode_time_us.load(Ordering::Relaxed) / 1000,
            composite_time_ms: self.composite_time_us.load(Ordering::Relaxed) / 1000,
            encode_time_ms: self.stats.encode_time_ms,
            mux_time_ms: self.stats.mux_time_ms,
            avg_fps,
            peak_memory_bytes: self.stats.peak_memory_bytes,
            cpu_usage_percent: self.stats.cpu_usage_percent,
            gpu_usage_percent: self.stats.gpu_usage_percent,
            vram_usage_bytes: self.stats.vram_usage_bytes,
        };

        ExportProgress {
            job_id: self.config.job_id.clone(),
            state: self.state,
            progress,
            current_frame: self.current_frame,
            total_frames: self.total_frames,
            elapsed_ms,
            estimated_remaining_ms,
            error: None,
            metadata: self.metadata.clone(),
            stats: Some(stats),
        }
    }
}

/// Export service for managing export jobs
pub struct ExportService {
    /// GPU context for compositing
    gpu_ctx: Arc<GpuContext>,
    /// Active export jobs
    jobs: Arc<RwLock<HashMap<String, ExportJob>>>,
    /// Progress broadcast channel
    progress_tx: broadcast::Sender<ExportProgress>,
}

impl ExportService {
    /// Create a new export service
    pub async fn new() -> Result<Self> {
        let gpu_ctx = Arc::new(GpuContext::new().await.map_err(|e| {
            Error::Other(format!("Failed to create GPU context: {}", e))
        })?);

        let (progress_tx, _) = broadcast::channel(100);

        Ok(Self {
            gpu_ctx,
            jobs: Arc::new(RwLock::new(HashMap::new())),
            progress_tx,
        })
    }

    /// Create with existing GPU context
    pub fn with_gpu_context(gpu_ctx: Arc<GpuContext>) -> Self {
        let (progress_tx, _) = broadcast::channel(100);

        Self {
            gpu_ctx,
            jobs: Arc::new(RwLock::new(HashMap::new())),
            progress_tx,
        }
    }

    /// Start an export job
    pub async fn start_export(&self, config: ExportJobConfig) -> Result<ExportStartResponse> {
        let job_id = config.job_id.clone();
        let total_frames = config.timeline.total_frames(config.settings.fps);

        // Create job
        let job = ExportJob::new(config.clone(), total_frames);
        let cancel_flag = Arc::clone(&job.cancel_flag);

        // Store job
        {
            let mut jobs = self.jobs.write().await;
            if jobs.contains_key(&job_id) {
                return Err(Error::Other(format!("Job {} already exists", job_id)));
            }
            jobs.insert(job_id.clone(), job);
        }

        // Spawn export worker in blocking thread
        let gpu_ctx = Arc::clone(&self.gpu_ctx);
        let jobs = Arc::clone(&self.jobs);
        let progress_tx = self.progress_tx.clone();
        let job_id_clone = job_id.clone();

        tokio::task::spawn_blocking(move || {
            let result = Self::export_worker_sync(
                config,
                gpu_ctx,
                jobs.clone(),
                progress_tx,
                cancel_flag,
            );

            // Update job state on completion (need to use block_on for async)
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                let mut jobs_guard = jobs.write().await;
                if let Some(job) = jobs_guard.get_mut(&job_id_clone) {
                    match &result {
                        Ok(()) => {
                            job.state = ExportState::Completed;
                            tracing::info!("Export job {} completed", job_id_clone);
                        }
                        Err(Error::Cancelled) => {
                            job.state = ExportState::Cancelled;
                            tracing::info!("Export job {} cancelled", job_id_clone);
                        }
                        Err(e) => {
                            job.state = ExportState::Error;
                            tracing::error!("Export job {} failed: {}", job_id_clone, e);
                        }
                    }
                }
            });

            result
        });

        Ok(ExportStartResponse {
            job_id,
            total_frames,
        })
    }

    /// Cancel an export job
    pub async fn cancel_export(&self, job_id: &str) -> bool {
        let jobs = self.jobs.read().await;
        if let Some(job) = jobs.get(job_id) {
            job.cancel_flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    /// Get export progress
    pub async fn get_progress(&self, job_id: &str) -> Option<ExportProgress> {
        let jobs = self.jobs.read().await;
        jobs.get(job_id).map(|job| job.to_progress())
    }

    /// Subscribe to progress updates
    pub fn subscribe_progress(&self) -> broadcast::Receiver<ExportProgress> {
        self.progress_tx.subscribe()
    }

    /// Export worker - runs the actual export pipeline
    ///
    /// This function runs in a blocking thread because GpuExportPipeline
    /// and AudioMixer contain FFmpeg contexts that are not Send.
    fn export_worker_sync(
        config: ExportJobConfig,
        gpu_ctx: Arc<GpuContext>,
        jobs: Arc<RwLock<HashMap<String, ExportJob>>>,
        progress_tx: broadcast::Sender<ExportProgress>,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<()> {
        let job_id = config.job_id.clone();

        // Update state to Initializing (blocking)
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(&jobs, &job_id, ExportState::Initializing));
        }

        // Initialize GPU export pipeline (decode + composite)
        let mut gpu_pipeline = GpuExportPipeline::new(
            config.timeline.clone(),
            config.settings.clone(),
            Arc::clone(&gpu_ctx),
        )?;
        gpu_pipeline.initialize()?;

        // Initialize audio mixer
        let mut audio_mixer = AudioMixer::new(config.timeline.clone(), &config.settings);
        if let Err(e) = audio_mixer.initialize() {
            tracing::warn!("Audio mixer initialization failed (continuing without audio): {}", e);
        }

        let total_frames = gpu_pipeline.total_frames();
        let (output_width, output_height) = gpu_pipeline.output_dimensions();
        let fps = config.settings.fps;

        // Build export metadata
        let metadata = ExportMetadata {
            width: output_width,
            height: output_height,
            fps,
            video_bitrate: config.settings.video_bitrate.unwrap_or(5_000_000),
            audio_bitrate: config.settings.audio_bitrate.unwrap_or(128_000),
            video_codec: format!("{:?}", config.settings.video_codec),
            audio_codec: format!("{:?}", config.settings.audio_codec),
            render_mode: "wgpu".to_string(),
            hw_encoder: if config.settings.hw_encoder != super::types::ExportHwEncoder::None {
                Some(format!("{:?}", config.settings.hw_encoder))
            } else {
                None
            },
        };

        // Update job with metadata
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_metadata(&jobs, &job_id, metadata));
        }

        // Create pipeline config
        let pipeline_config = PipelineConfig {
            compose_buffer_size: 3,
            encode_buffer_size: 4,
            mux_buffer_size: 8,
            encoder_config: config.settings.to_encoder_config(),
            container: ContainerFormat::Mp4,
            output_path: config.output_path.clone(),
            total_frames,
        };

        // Start encode-only pipeline (compositing done by GpuExportPipeline)
        let pipeline = AsyncExportPipeline::start_encode_only(pipeline_config)?;

        // Update state to Encoding
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(&jobs, &job_id, ExportState::Encoding));
        }

        // Collect audio frames for later muxing
        let mut audio_frames: Vec<Vec<f32>> = Vec::new();

        // Process frames
        let frame_duration = 1.0 / fps;
        for frame_idx in 0..total_frames {
            // Check cancellation
            if cancel_flag.load(Ordering::Relaxed) {
                pipeline.cancel();
                return Err(Error::Cancelled);
            }

            let time = frame_idx as f64 * frame_duration;

            // GPU pipeline: decode + composite + NV12 convert (all on GPU)
            let decode_start = Instant::now();

            // Use zero-copy path on macOS, CPU path on other platforms
            #[cfg(target_os = "macos")]
            let (nv12_data, gpu_handle) = {
                // Zero-copy: get IOSurface handle directly
                match gpu_pipeline.process_frame_to_iosurface(time, [0.0, 0.0, 0.0, 1.0]) {
                    Ok(io_surface) => (Vec::new(), Some(io_surface)),
                    Err(e) => {
                        tracing::warn!("Zero-copy failed, falling back to CPU: {}", e);
                        let data = gpu_pipeline.process_frame_to_nv12(time, [0.0, 0.0, 0.0, 1.0])?;
                        (data, None)
                    }
                }
            };

            #[cfg(not(target_os = "macos"))]
            let (nv12_data, gpu_handle) = {
                let data = gpu_pipeline.process_frame_to_nv12(time, [0.0, 0.0, 0.0, 1.0])?;
                (data, None)
            };

            let decode_time = decode_start.elapsed();

            // Mix audio for this frame
            if let Ok(Some(audio_frame)) = audio_mixer.mix_frame(time) {
                audio_frames.push(audio_frame.data);
            }

            // Update decode time stats
            {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(Self::add_decode_time(&jobs, &job_id, decode_time.as_micros() as u64));
            }

            // Submit frame to encoder (zero-copy or CPU path)
            pipeline.submit_composited(CompositedFrame {
                index: frame_idx,
                pts: frame_idx as i64,
                data: nv12_data,
                width: output_width,
                height: output_height,
                gpu_handle,
            })?;

            // Update progress (every 10 frames to reduce overhead)
            if frame_idx % 10 == 0 || frame_idx == total_frames - 1 {
                let rt = tokio::runtime::Handle::current();
                rt.block_on(Self::update_job_progress(&jobs, &job_id, frame_idx + 1));

                // Broadcast progress
                if let Some(progress) = rt.block_on(Self::get_job_progress(&jobs, &job_id)) {
                    let _ = progress_tx.send(progress);
                }
            }
        }

        // Update state to Muxing (audio)
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(&jobs, &job_id, ExportState::Muxing));
        }

        // Wait for video pipeline to complete
        pipeline.wait()?;

        // Update state to Finalizing
        {
            let rt = tokio::runtime::Handle::current();
            rt.block_on(Self::update_job_state(&jobs, &job_id, ExportState::Finalizing));
        }

        // Mux audio into the output file if we have audio
        if !audio_frames.is_empty() {
            tracing::info!("Muxing {} audio frames into output", audio_frames.len());
            Self::mux_audio_to_output(
                &config.output_path,
                &audio_frames,
                audio_mixer.sample_rate(),
                audio_mixer.channels(),
            )?;
        }

        Ok(())
    }

    /// Mux audio data into the output video file
    fn mux_audio_to_output(
        output_path: &str,
        audio_frames: &[Vec<f32>],
        sample_rate: u32,
        channels: u16,
    ) -> Result<()> {
        use std::process::Command;
        use std::io::Write;

        // Calculate total samples
        let total_samples: usize = audio_frames.iter().map(|f| f.len()).sum();
        if total_samples == 0 {
            return Ok(());
        }

        // Convert F32 to S16 PCM
        let mut pcm_data = Vec::with_capacity(total_samples * 2);
        for frame in audio_frames {
            for &sample in frame {
                let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                pcm_data.extend_from_slice(&s16.to_le_bytes());
            }
        }

        // Create temp file for raw audio
        let temp_audio_path = format!("{}.temp_audio.raw", output_path);
        let temp_output_path = format!("{}.temp_muxed.mp4", output_path);

        // Write raw PCM to temp file
        {
            let mut file = std::fs::File::create(&temp_audio_path)
                .map_err(|e| Error::Other(format!("Failed to create temp audio file: {}", e)))?;
            file.write_all(&pcm_data)
                .map_err(|e| Error::Other(format!("Failed to write audio data: {}", e)))?;
        }

        // Use ffmpeg to mux audio into video
        // Note: Don't use -shortest as it would truncate the video to audio length
        let result = Command::new("ffmpeg")
            .args([
                "-y",
                "-i", output_path,
                "-f", "s16le",
                "-ar", &sample_rate.to_string(),
                "-ac", &channels.to_string(),
                "-i", &temp_audio_path,
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "128k",
                "-map", "0:v:0",  // Map video from first input
                "-map", "1:a:0",  // Map audio from second input
                &temp_output_path,
            ])
            .output();

        // Clean up temp audio file
        let _ = std::fs::remove_file(&temp_audio_path);

        match result {
            Ok(output) => {
                if output.status.success() {
                    // Replace original with muxed version
                    std::fs::rename(&temp_output_path, output_path)
                        .map_err(|e| Error::Other(format!("Failed to replace output file: {}", e)))?;
                    tracing::info!("Audio muxed successfully");
                    Ok(())
                } else {
                    let _ = std::fs::remove_file(&temp_output_path);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    tracing::warn!("Audio muxing failed: {}", stderr);
                    // Don't fail the export, just skip audio
                    Ok(())
                }
            }
            Err(e) => {
                tracing::warn!("Failed to run ffmpeg for audio muxing: {}", e);
                // Don't fail the export, just skip audio
                Ok(())
            }
        }
    }

    /// Update job state
    async fn update_job_state(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        state: ExportState,
    ) {
        let mut jobs_guard = jobs.write().await;
        if let Some(job) = jobs_guard.get_mut(job_id) {
            job.state = state;
        }
    }

    /// Update job metadata
    async fn update_job_metadata(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        metadata: ExportMetadata,
    ) {
        let mut jobs_guard = jobs.write().await;
        if let Some(job) = jobs_guard.get_mut(job_id) {
            job.metadata = Some(metadata);
        }
    }

    /// Add decode time to stats
    async fn add_decode_time(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        time_us: u64,
    ) {
        let jobs_guard = jobs.read().await;
        if let Some(job) = jobs_guard.get(job_id) {
            job.decode_time_us.fetch_add(time_us, Ordering::Relaxed);
        }
    }

    /// Update job progress
    async fn update_job_progress(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
        current_frame: u64,
    ) {
        let mut jobs_guard = jobs.write().await;
        if let Some(job) = jobs_guard.get_mut(job_id) {
            job.current_frame = current_frame;
        }
    }

    /// Get job progress
    async fn get_job_progress(
        jobs: &Arc<RwLock<HashMap<String, ExportJob>>>,
        job_id: &str,
    ) -> Option<ExportProgress> {
        let jobs_guard = jobs.read().await;
        jobs_guard.get(job_id).map(|job| job.to_progress())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_job_progress() {
        use crate::export::types::{
            ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportSettings,
            ExportVideoCodec, TimelineData,
        };

        let config = ExportJobConfig {
            job_id: "test-job".to_string(),
            output_path: "/tmp/test.mp4".to_string(),
            settings: ExportSettings {
                width: 1920,
                height: 1080,
                fps: 30.0,
                video_codec: ExportVideoCodec::H264,
                video_bitrate: None,
                audio_codec: ExportAudioCodec::Aac,
                audio_bitrate: None,
                hw_encoder: ExportHwEncoder::None,
                time_range: None,
                preset: ExportPreset::Medium,
            },
            timeline: TimelineData {
                duration: 10.0,
                tracks: vec![],
            },
        };

        let mut job = ExportJob::new(config, 300);
        job.current_frame = 150;

        let progress = job.to_progress();
        assert_eq!(progress.job_id, "test-job");
        assert_eq!(progress.total_frames, 300);
        assert_eq!(progress.current_frame, 150);
        assert!((progress.progress - 50.0).abs() < 0.1);
    }
}
