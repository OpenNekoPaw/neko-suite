//! Shared utilities for service implementations

use crate::audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat};
use crate::domain::LoudnessAnalysis;
use crate::error::{Error, Result};
use crate::media_service::MediaInfo as InternalMediaInfo;
use ebur128::{EbuR128, Mode};
use neko_types::{MediaInfo, WaveformData};

/// Convert internal probe MediaInfo to neko_types::MediaInfo
///
/// Correctly handles audio-only files by returning empty video_streams
/// when the probe reports no video dimensions.
pub fn convert_media_info(info: InternalMediaInfo) -> MediaInfo {
    let video_streams = if info.width > 0 && info.height > 0 {
        vec![neko_types::VideoStreamInfo {
            index: 0,
            codec: info.codec,
            width: info.width,
            height: info.height,
            fps: info.fps,
            bitrate: info.bitrate,
            pixel_format: "yuv420p".to_string(),
            hw_accel: None,
            frame_count: None,
            color_space: None,
            color_range: None,
        }]
    } else {
        vec![]
    };

    MediaInfo {
        duration: info.duration,
        format: info.format,
        file_size: 0,
        video_streams,
        audio_streams: if info.has_audio {
            vec![neko_types::AudioStreamInfo {
                index: 0,
                codec: info.audio_codec.unwrap_or_default(),
                sample_rate: info.audio_sample_rate.unwrap_or(0),
                channels: info.audio_channels.unwrap_or(0) as u16,
                bitrate: info.audio_bitrate,
                channel_layout: None,
                language: None,
            }]
        } else {
            vec![]
        },
        subtitle_streams: info
            .subtitle_streams
            .into_iter()
            .map(|s| neko_types::SubtitleStreamInfo {
                index: s.index,
                codec: s.codec,
                language: s.language,
                title: s.title,
            })
            .collect(),
    }
}

/// Default peaks per second for waveform generation
const PEAKS_PER_SECOND: u32 = 100;

/// Generate waveform data from an audio/video file.
///
/// This is a blocking function — call from `spawn_blocking`.
///
/// # Arguments
/// * `path` - Path to the media file (video or audio)
///
/// # Returns
/// * `WaveformData` with per-channel peak arrays at 100 peaks/sec resolution
pub fn generate_waveform_blocking(path: &str) -> Result<WaveformData> {
    // Force stereo downmix to avoid FFmpeg resampler "Input changed" errors
    // with multi-channel audio (e.g. 5.1 surround AAC)
    let mut decoder = FfmpegAudioDecoder::new()
        .with_output_format(SampleFormat::F32)
        .with_output_channels(2);
    let audio_info = decoder.open(path)?;

    let channels: usize = 2;
    let mut waveform = WaveformData::new(
        audio_info.sample_rate,
        channels as u16,
        PEAKS_PER_SECOND,
        audio_info.duration,
    );

    let samples_per_peak = audio_info.sample_rate as f64 / PEAKS_PER_SECOND as f64;
    let num_peaks = waveform.num_peaks();

    let mut sample_offset: u64 = 0;

    while let Some(frame) = decoder.decode_next()? {
        let samples: &[f32] = bytemuck::cast_slice(&frame.data);
        let frame_samples = samples.len() / channels;

        for s in 0..frame_samples {
            let global_sample = sample_offset + s as u64;
            let peak_index = (global_sample as f64 / samples_per_peak) as usize;

            if peak_index >= num_peaks {
                break;
            }

            for ch in 0..channels {
                let value = samples[s * channels + ch].abs();
                if let Some(peak) = waveform.peaks.get_mut(ch) {
                    if peak_index < peak.len() && value > peak[peak_index] {
                        peak[peak_index] = value;
                    }
                }
            }
        }

        sample_offset += frame_samples as u64;
    }

    Ok(waveform)
}

/// Analyze audio loudness per ITU-R BS.1770-4 (EBU R128).
///
/// This is a blocking function — call from `spawn_blocking`.
///
/// # Arguments
/// * `path` - Path to the media file (audio or video — FFmpeg extracts the audio stream)
/// * `target_lufs` - Target integrated loudness in LUFS (e.g. -14.0 for streaming)
///
/// # Returns
/// * `LoudnessAnalysis` with integrated LUFS, true peak, LRA, and recommended gain
pub fn analyze_loudness_blocking(path: &str, target_lufs: f64) -> Result<LoudnessAnalysis> {
    // Decode to F32 interleaved, preserve original channel count
    // (ebur128 handles channel weighting internally per BS.1770-4)
    let mut decoder = FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
    let audio_info = decoder.open(path)?;

    let channels = audio_info.channels as u32;
    let sample_rate = audio_info.sample_rate;

    // Initialize EBU R128 meter with integrated loudness, true peak, and LRA
    let mut meter = EbuR128::new(channels, sample_rate, Mode::I | Mode::TRUE_PEAK | Mode::LRA)
        .map_err(|e| Error::Other(format!("Failed to initialize EBU R128 meter: {}", e)))?;

    // Feed all decoded frames to the meter
    while let Some(frame) = decoder.decode_next()? {
        let samples: &[f32] = bytemuck::cast_slice(&frame.data);
        meter
            .add_frames_f32(samples)
            .map_err(|e| Error::Other(format!("EBU R128 add_frames error: {}", e)))?;
    }

    // Extract integrated loudness
    let integrated_lufs = meter
        .loudness_global()
        .map_err(|e| Error::Other(format!("Failed to get integrated loudness: {}", e)))?;

    // Handle silence: ebur128 returns -f64::INFINITY for pure silence
    if integrated_lufs.is_infinite() || integrated_lufs.is_nan() {
        return Ok(LoudnessAnalysis {
            integrated_lufs: -70.0,
            true_peak_dbfs: -100.0,
            loudness_range: 0.0,
            recommended_gain: 0.0,
            target_lufs,
        });
    }

    // True peak: max across all channels (linear → dBFS)
    let mut true_peak_linear = 0.0_f64;
    for ch in 0..channels {
        let peak = meter.true_peak(ch).map_err(|e| {
            Error::Other(format!("Failed to get true peak for channel {}: {}", ch, e))
        })?;
        if peak > true_peak_linear {
            true_peak_linear = peak;
        }
    }
    let true_peak_dbfs = if true_peak_linear > 0.0 {
        20.0 * true_peak_linear.log10()
    } else {
        -100.0
    };

    // Loudness range
    let loudness_range = meter
        .loudness_range()
        .map_err(|e| Error::Other(format!("Failed to get loudness range: {}", e)))?;

    // Calculate recommended gain, clamped to practical range
    let recommended_gain = (target_lufs - integrated_lufs).clamp(-60.0, 60.0);

    Ok(LoudnessAnalysis {
        integrated_lufs,
        true_peak_dbfs,
        loudness_range,
        recommended_gain,
        target_lufs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_waveform_nonexistent_file() {
        let result = generate_waveform_blocking("/nonexistent/file.mp4");
        assert!(result.is_err());
    }

    #[test]
    fn test_analyze_loudness_nonexistent_file() {
        let result = analyze_loudness_blocking("/nonexistent/file.mp3", -14.0);
        assert!(result.is_err());
    }
}
