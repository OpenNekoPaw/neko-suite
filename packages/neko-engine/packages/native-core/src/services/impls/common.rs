//! Shared utilities for service implementations

use crate::audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat};
use crate::error::Result;
use crate::media_service::MediaInfo as InternalMediaInfo;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_waveform_nonexistent_file() {
        let result = generate_waveform_blocking("/nonexistent/file.mp4");
        assert!(result.is_err());
    }
}
