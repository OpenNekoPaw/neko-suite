//! AudioMixdown — Multi-track audio mixing for neko-audio projects.
//!
//! Unlike AudioMixer (which is frame-aligned for video export), AudioMixdown
//! operates on sample-aligned buffers for audio-only projects.
//!
//! Supports per-track: volume, pan, solo, mute, effect chain, fade in/out, gain.
//! Supports master bus: effect chain, master volume, soft limiter.

use std::collections::HashMap;

use crate::audio::dsp::effect_factory::{build_effect_chain, AudioEffectConfig};
use crate::audio::dsp::gain::db_to_linear;
use crate::audio::dsp::{AudioEffect, EffectChain};
use crate::audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat, SoftLimiter};
use crate::error::Result;
use serde::Deserialize;

/// Full mix configuration sent from the TS layer.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownConfig {
    pub tracks: Vec<MixdownTrack>,
    #[serde(default)]
    pub master_effects: Vec<AudioEffectConfig>,
    #[serde(default = "default_volume")]
    pub master_volume: f32,
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,
    #[serde(default = "default_channels")]
    pub channels: u16,
}

/// Simplified track description for audio-only mixing.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixdownTrack {
    pub id: String,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub effect_chain: Vec<AudioEffectConfig>,
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
    #[serde(default)]
    pub trim_start: f64,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default)]
    pub pan: f32,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub fade_in: f64,
    #[serde(default)]
    pub fade_out: f64,
    #[serde(default)]
    pub gain: f64,
}

fn default_volume() -> f32 {
    1.0
}

fn default_sample_rate() -> u32 {
    48000
}

fn default_channels() -> u16 {
    2
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
    master_volume: f32,
    master_effect_chain: EffectChain,
    track_effect_chains: HashMap<String, EffectChain>,
    has_solo: bool,
}

impl AudioMixdown {
    pub fn new(config: MixdownConfig) -> Self {
        let has_solo = config.tracks.iter().any(|t| t.solo);
        let master_chain = build_effect_chain(&config.master_effects).unwrap_or_default();

        let mut track_chains = HashMap::new();
        for track in &config.tracks {
            if !track.effect_chain.is_empty() {
                if let Ok(chain) = build_effect_chain(&track.effect_chain) {
                    track_chains.insert(track.id.clone(), chain);
                }
            }
        }

        Self {
            sources: HashMap::new(),
            tracks: config.tracks,
            sample_rate: config.sample_rate,
            channels: config.channels,
            buffer_size: 4096,
            limiter: SoftLimiter::new(0.95, 50.0, config.sample_rate),
            master_volume: config.master_volume,
            master_effect_chain: master_chain,
            track_effect_chains: track_chains,
            has_solo,
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

    /// Hot-update configuration without recreating decoders.
    pub fn update_config(&mut self, config: MixdownConfig) {
        self.has_solo = config.tracks.iter().any(|t| t.solo);
        self.master_volume = config.master_volume;

        if let Ok(chain) = build_effect_chain(&config.master_effects) {
            self.master_effect_chain = chain;
        }

        self.track_effect_chains.clear();
        for track in &config.tracks {
            if !track.effect_chain.is_empty() {
                if let Ok(chain) = build_effect_chain(&track.effect_chain) {
                    self.track_effect_chains.insert(track.id.clone(), chain);
                }
            }
        }

        self.tracks = config.tracks;

        for src in self.collect_sources() {
            if self.sources.contains_key(&src) {
                continue;
            }
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(self.sample_rate)
                .with_output_channels(self.channels);
            if decoder.open(&src).is_ok() {
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
    ///
    /// Pipeline:
    /// 1. For each active track (respecting solo/mute):
    ///    a. Decode elements → apply per-element volume/pan/fade/gain
    ///    b. Sum into per-track buffer
    ///    c. Run track effect chain
    ///    d. Apply track volume/pan
    /// 2. Sum all track buffers into master output
    /// 3. Run master effect chain
    /// 4. Apply master volume + limiter
    pub fn mix_buffer(&mut self, time: f64) -> Result<MixdownBuffer> {
        let needed = self.buffer_size * self.channels as usize;
        let mut output = vec![0.0f32; needed];
        let buf_duration = self.buffer_size as f64 / self.sample_rate as f64;
        let ch = self.channels as usize;

        for track in &self.tracks {
            if self.is_track_muted(track) {
                continue;
            }

            let mut track_buf = vec![0.0f32; needed];

            for elem in &track.elements {
                if elem.muted {
                    continue;
                }
                let end = elem.start_time + elem.duration;
                if elem.start_time >= time + buf_duration || end <= time {
                    continue;
                }

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

                // Mix element samples with per-element volume, pan, fade, gain
                for frame_idx in 0..(self.buffer_size) {
                    let sample_time = time + frame_idx as f64 / self.sample_rate as f64;
                    let vol = self.compute_element_volume(elem, sample_time);

                    let base_idx = frame_idx * ch;
                    if ch >= 2 {
                        let (gain_l, gain_r) = equal_power_pan(elem.pan);
                        if base_idx + 1 < frame_samples.len() && base_idx + 1 < track_buf.len() {
                            let sl = frame_samples[base_idx] * vol * gain_l;
                            let sr = frame_samples[base_idx + 1] * vol * gain_r;
                            if sl.is_finite() {
                                track_buf[base_idx] += sl;
                            }
                            if sr.is_finite() {
                                track_buf[base_idx + 1] += sr;
                            }
                        }
                    } else if base_idx < frame_samples.len() && base_idx < track_buf.len() {
                        let s = frame_samples[base_idx] * vol;
                        if s.is_finite() {
                            track_buf[base_idx] += s;
                        }
                    }
                }
            }

            // Run track effect chain
            if let Some(chain) = self.track_effect_chains.get_mut(&track.id) {
                chain.process(&mut track_buf, self.channels, self.sample_rate);
            }

            // Apply track volume and pan, then sum into master output
            let (track_gain_l, track_gain_r) = equal_power_pan(track.pan);
            let track_vol = track.volume;
            for i in 0..needed {
                let pan_gain = if ch >= 2 {
                    if i % 2 == 0 { track_gain_l } else { track_gain_r }
                } else {
                    1.0
                };
                let s = track_buf[i] * track_vol * pan_gain;
                if s.is_finite() {
                    output[i] += s;
                }
            }
        }

        // Master effect chain
        self.master_effect_chain
            .process(&mut output, self.channels, self.sample_rate);

        // Master volume
        if (self.master_volume - 1.0).abs() > f32::EPSILON {
            for sample in output.iter_mut() {
                *sample *= self.master_volume;
            }
        }

        // Limiter
        self.limiter.process_buffer(&mut output);

        Ok(MixdownBuffer {
            data: output,
            samples: self.buffer_size,
            timestamp: time,
            sample_rate: self.sample_rate,
            channels: self.channels,
        })
    }

    /// Reset all effect chains and decoders (after seek).
    pub fn reset(&mut self) {
        self.master_effect_chain.reset();
        for chain in self.track_effect_chains.values_mut() {
            chain.reset();
        }
        for source in self.sources.values_mut() {
            source.current_position = -1.0;
            source.residual.clear();
        }
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

    /// Compute total project duration (max end time across all elements).
    pub fn total_duration(&self) -> f64 {
        self.tracks
            .iter()
            .flat_map(|t| &t.elements)
            .map(|e| e.start_time + e.duration)
            .fold(0.0, f64::max)
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }

    pub fn buffer_size(&self) -> usize {
        self.buffer_size
    }

    pub fn close(&mut self) {
        for (_, source) in self.sources.iter_mut() {
            source.decoder.close();
        }
        self.sources.clear();
    }

    // -- private --

    fn is_track_muted(&self, track: &MixdownTrack) -> bool {
        if track.muted {
            return true;
        }
        if self.has_solo && !track.solo {
            return true;
        }
        false
    }

    fn compute_element_volume(&self, elem: &MixdownElement, time: f64) -> f32 {
        let relative_time = time - elem.start_time;
        let mut vol = elem.volume;

        // Apply gain (dB → linear)
        if elem.gain != 0.0 {
            let clamped = elem.gain.clamp(-60.0, 60.0);
            vol *= db_to_linear(clamped as f32);
        }

        // Fade in (linear)
        if elem.fade_in > 0.0 && relative_time < elem.fade_in {
            let t = (relative_time / elem.fade_in).clamp(0.0, 1.0) as f32;
            vol *= t;
        }

        // Fade out (linear)
        let time_to_end = elem.duration - relative_time;
        if elem.fade_out > 0.0 && time_to_end < elem.fade_out {
            let t = (time_to_end / elem.fade_out).clamp(0.0, 1.0) as f32;
            vol *= t;
        }

        vol.clamp(0.0, 10.0)
    }

    fn collect_sources(&self) -> Vec<String> {
        let mut srcs = Vec::new();
        for track in &self.tracks {
            if self.is_track_muted(track) {
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
}

impl Drop for AudioMixdown {
    fn drop(&mut self) {
        self.close();
    }
}

/// Equal-power panning: pan = -1.0 (left) to 1.0 (right).
/// Returns (left_gain, right_gain).
fn equal_power_pan(pan: f32) -> (f32, f32) {
    let angle = (pan.clamp(-1.0, 1.0) + 1.0) * 0.25 * std::f32::consts::PI;
    (angle.cos(), angle.sin())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(tracks: Vec<MixdownTrack>) -> MixdownConfig {
        MixdownConfig {
            tracks,
            master_effects: vec![],
            master_volume: 1.0,
            sample_rate: 48000,
            channels: 2,
        }
    }

    #[test]
    fn test_equal_power_pan_center() {
        let (l, r) = equal_power_pan(0.0);
        assert!((l - r).abs() < 0.01, "Center pan should be equal L/R");
        assert!((l - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_equal_power_pan_hard_left() {
        let (l, r) = equal_power_pan(-1.0);
        assert!((l - 1.0).abs() < 0.01);
        assert!(r < 0.01);
    }

    #[test]
    fn test_solo_mutes_others() {
        let config = make_config(vec![
            MixdownTrack {
                id: "a".into(),
                muted: false,
                solo: true,
                volume: 1.0,
                pan: 0.0,
                effect_chain: vec![],
                elements: vec![],
            },
            MixdownTrack {
                id: "b".into(),
                muted: false,
                solo: false,
                volume: 1.0,
                pan: 0.0,
                effect_chain: vec![],
                elements: vec![],
            },
        ]);
        let mixdown = AudioMixdown::new(config);
        assert!(!mixdown.is_track_muted(&mixdown.tracks[0]));
        assert!(mixdown.is_track_muted(&mixdown.tracks[1]));
    }

    #[test]
    fn test_element_fade_in() {
        let config = make_config(vec![]);
        let mixdown = AudioMixdown::new(config);
        let elem = MixdownElement {
            id: "e1".into(),
            src: "test.wav".into(),
            start_time: 0.0,
            duration: 10.0,
            trim_start: 0.0,
            volume: 1.0,
            pan: 0.0,
            muted: false,
            fade_in: 2.0,
            fade_out: 0.0,
            gain: 0.0,
        };
        let vol_at_0 = mixdown.compute_element_volume(&elem, 0.0);
        let vol_at_1 = mixdown.compute_element_volume(&elem, 1.0);
        let vol_at_2 = mixdown.compute_element_volume(&elem, 2.0);
        assert!(vol_at_0 < 0.01);
        assert!((vol_at_1 - 0.5).abs() < 0.01);
        assert!((vol_at_2 - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_element_gain_db() {
        let config = make_config(vec![]);
        let mixdown = AudioMixdown::new(config);
        let elem = MixdownElement {
            id: "e1".into(),
            src: "test.wav".into(),
            start_time: 0.0,
            duration: 10.0,
            trim_start: 0.0,
            volume: 1.0,
            pan: 0.0,
            muted: false,
            fade_in: 0.0,
            fade_out: 0.0,
            gain: 6.0,
        };
        let vol = mixdown.compute_element_volume(&elem, 5.0);
        assert!((vol - 2.0).abs() < 0.1, "+6dB ≈ 2x gain");
    }
}
