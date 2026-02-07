//! Shared utilities for service implementations

use crate::audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat};
use crate::error::{Error, Result};
use neko_types::WaveformData;

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
    let mut decoder = FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
    let audio_info = decoder.open(path)?;

    let mut waveform = WaveformData::new(
        audio_info.sample_rate,
        audio_info.channels,
        PEAKS_PER_SECOND,
        audio_info.duration,
    );

    let samples_per_peak = audio_info.sample_rate as f64 / PEAKS_PER_SECOND as f64;
    let channels = audio_info.channels as usize;
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
