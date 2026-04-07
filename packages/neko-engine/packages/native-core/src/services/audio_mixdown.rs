//! AudioMixdown — Multi-track audio mixing for neko-audio projects.
//!
//! Unlike AudioMixer (which is frame-aligned for video export), AudioMixdown
//! operates on sample-aligned buffers for audio-only projects.

use std::collections::HashMap;

use crate::audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat, SoftLimiter};
use crate::error::Result;
use serde::Deserialize;

/// Simplified track description for audio-only mixing.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownTrack {
    pub id: String,
    pub muted: bool,
    pub elements: Vec<MixdownElement>,
}

/// Audio element within a mixdown track.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownElement {
    pub id: String,
    pub src: String,
    pub start_time: f64,
    pub duration: f64,
    pub trim_start: f64,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub muted: bool,
}

fn default_volume() -> f32 {
    1.0
}

struct MixdownSource {
    decoder: FfmpegAudioDecoder,
    current_position: f64,
    residual: Vec<f32>,
}

/// Mixed audio buffer output.
#[derive(Debug)]
pub struct MixdownBuffer {
    pub data: Vec<f32>,
    pub samples: usize,
    pub timestamp: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Audio mixdown engine for multi-track audio projects.
pub struct AudioMixdown {
    sources: HashMap<String, MixdownSource>,
    tracks: Vec<MixdownTrack>,
    sample_rate: u32,
    channels: u16,
    buffer_size: usize,
    limiter: SoftLimiter,
}

impl AudioMixdown {
    pub fn new(tracks: Vec<MixdownTrack>, sample_rate: u32, channels: u16) -> Self {
        Self {
            sources: HashMap::new(),
            tracks,
            sample_rate,
            channels,
            buffer_size: 4096,
            limiter: SoftLimiter::new(0.95, 50.0, sample_rate),
        }
    }

    /// Open decoders for all unique audio sources.
    pub fn initialize(&mut self) -> Result<()> {
        for src in self.collect_sources() {
            if self.sources.contains_key(&src) {
                continue;
            }
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(self.sample_rate)
                .with_output_channels(self.channels);
            match decoder.open(&src) {
                Ok(info) => {
                    tracing::info!(
                        "Mixdown: opened {} — {} Hz, {} ch, {:.2}s",
                        src,
                        info.sample_rate,
                        info.channels,
                        info.duration
                    );
                    self.sources.insert(
                        src,
                        MixdownSource {
                            decoder,
                            current_position: -1.0,
                            residual: Vec::new(),
                        },
                    );
                }
                Err(e) => {
                    tracing::error!("Mixdown: failed to open {}: {}", src, e);
                    return Err(e);
                }
            }
        }
        Ok(())
    }

    /// Update tracks without recreating the mixer.
    pub fn update_tracks(&mut self, tracks: Vec<MixdownTrack>) {
        self.tracks = tracks;
        for src in self.collect_sources() {
            if self.sources.contains_key(&src) {
                continue;
            }
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(self.sample_rate)
                .with_output_channels(self.channels);
            if let Ok(_) = decoder.open(&src) {
                self.sources.insert(
                    src,
                    MixdownSource {
                        decoder,
                        current_position: -1.0,
                        residual: Vec::new(),
                    },
                );
            }
        }
    }

    /// Mix a buffer of audio at the given timeline time.
    pub fn mix_buffer(&mut self, time: f64) -> Result<MixdownBuffer> {
        let needed = self.buffer_size * self.channels as usize;
        let mut output = vec![0.0f32; needed];
        let buf_duration = self.buffer_size as f64 / self.sample_rate as f64;

        let active = self.get_active_elements(time, buf_duration);

        for elem in &active {
            let source = match self.sources.get_mut(&elem.src) {
                Some(s) => s,
                None => continue,
            };

            let source_time = elem.trim_start + (time - elem.start_time);
            let need_seek = source.current_position < 0.0
                || (source_time - source.current_position).abs() > buf_duration * 1.5;

            if need_seek {
                if source.decoder.seek(source_time).is_err() {
                    continue;
                }
                source.residual.clear();
                source.current_position = source_time;
                // Skip priming silence
                for _ in 0..3 {
                    match source.decoder.decode_next() {
                        Ok(Some(f)) => {
                            let samples: &[f32] = bytemuck::cast_slice(&f.data);
                            if samples.iter().any(|s| s.abs() > 0.0) {
                                source.residual.extend_from_slice(samples);
                                break;
                            }
                        }
                        _ => break,
                    }
                }
            }

            // Decode until we have enough samples
            while source.residual.len() < needed {
                match source.decoder.decode_next() {
                    Ok(Some(f)) => {
                        let samples: &[f32] = bytemuck::cast_slice(&f.data);
                        source.residual.extend_from_slice(samples);
                    }
                    _ => {
                        source.residual.resize(needed, 0.0);
                        break;
                    }
                }
            }

            let frame_samples: Vec<f32> = source.residual.drain(..needed).collect();
            source.current_position += buf_duration;

            // Mix with volume
            let vol = elem.volume;
            for (i, sample) in frame_samples.iter().enumerate() {
                if i < output.len() {
                    let s = sample * vol;
                    if s.is_finite() {
                        output[i] += s;
                    }
                }
            }
        }

        self.limiter.process_buffer(&mut output);

        Ok(MixdownBuffer {
            data: output,
            samples: self.buffer_size,
            timestamp: time,
            sample_rate: self.sample_rate,
            channels: self.channels,
        })
    }

    /// Convert f32 buffer to s16le bytes.
    pub fn to_s16_bytes(buf: &MixdownBuffer) -> Vec<u8> {
        let mut out = Vec::with_capacity(buf.data.len() * 2);
        for &sample in &buf.data {
            let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            out.extend_from_slice(&s16.to_le_bytes());
        }
        out
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }

    pub fn close(&mut self) {
        for (_, source) in self.sources.iter_mut() {
            source.decoder.close();
        }
        self.sources.clear();
    }

    // -- private --

    fn collect_sources(&self) -> Vec<String> {
        let mut srcs = Vec::new();
        for track in &self.tracks {
            if track.muted {
                continue;
            }
            for elem in &track.elements {
                if !elem.muted && !srcs.contains(&elem.src) {
                    srcs.push(elem.src.clone());
                }
            }
        }
        srcs
    }

    fn get_active_elements(&self, time: f64, buf_duration: f64) -> Vec<MixdownElement> {
        let mut active = Vec::new();
        for track in &self.tracks {
            if track.muted {
                continue;
            }
            for elem in &track.elements {
                if elem.muted {
                    continue;
                }
                let end = elem.start_time + elem.duration;
                // Element overlaps with [time, time + buf_duration]
                if elem.start_time < time + buf_duration && end > time {
                    active.push(elem.clone());
                }
            }
        }
        active
    }
}

impl Drop for AudioMixdown {
    fn drop(&mut self) {
        self.close();
    }
}
