//! Audio Mixer - Multi-track audio mixing for export
//!
//! Decodes and mixes multiple audio sources based on timeline data.
//! Supports volume, pan, fade in/out effects.

use std::collections::HashMap;

use crate::audio::{AudioDecoder, FfmpegAudioDecoder, SampleFormat};
use crate::domain::{ElementType, Timeline};
use crate::animation::{Easing, EasingType};
use crate::error::Result;

use super::types::ExportSettings;

/// Audio source with decoder and metadata
struct AudioSource {
    decoder: FfmpegAudioDecoder,
    /// Current decode position in seconds (tracked to avoid unnecessary seeks)
    current_position: f64,
    /// Residual samples from previous decode (interleaved f32)
    residual: Vec<f32>,
}

/// Active audio element at a specific time
#[derive(Clone)]
struct ActiveAudioElement {
    src: String,
    volume: f32,
    pan: f32,
    fade_in: f64,
    fade_out: f64,
    fade_in_curve: EasingType,
    fade_out_curve: EasingType,
    gain: f64,
    start_time: f64,
    duration: f64,
    trim_start: f64,
}

impl ActiveAudioElement {
    fn effective_volume(&self, timeline_time: f64) -> f32 {
        let relative_time = timeline_time - self.start_time;
        let mut vol = self.volume;

        // Apply gain (dB → linear): linear = 10^(dB/20)
        if self.gain != 0.0 {
            vol *= (10.0_f64.powf(self.gain / 20.0)) as f32;
        }

        // Apply fade in with easing curve
        if self.fade_in > 0.0 && relative_time < self.fade_in {
            let t = (relative_time / self.fade_in).clamp(0.0, 1.0);
            vol *= Easing::evaluate(self.fade_in_curve, t) as f32;
        }

        // Apply fade out with easing curve
        let time_to_end = self.duration - relative_time;
        if self.fade_out > 0.0 && time_to_end < self.fade_out {
            let t = (time_to_end / self.fade_out).clamp(0.0, 1.0);
            vol *= Easing::evaluate(self.fade_out_curve, t) as f32;
        }

        vol.clamp(0.0, 1.0)
    }

    fn get_source_time(&self, timeline_time: f64) -> f64 {
        self.trim_start + (timeline_time - self.start_time)
    }
}

/// Mixed audio frame output
#[derive(Debug)]
pub struct MixedAudioFrame {
    pub data: Vec<f32>,
    pub samples: usize,
    pub timestamp: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Audio mixer for multi-track audio mixing
pub struct AudioMixer {
    sources: HashMap<String, AudioSource>,
    timeline: Timeline,
    output_sample_rate: u32,
    output_channels: u16,
    samples_per_frame: usize,
    limiter: SoftLimiter,
}

impl AudioMixer {
    pub fn new(timeline: Timeline, settings: &ExportSettings) -> Self {
        let output_sample_rate = 48000;
        let samples_per_frame = (settings.fps.recip() * output_sample_rate as f64) as usize;
        Self {
            sources: HashMap::new(),
            timeline,
            output_sample_rate,
            output_channels: 2,
            samples_per_frame,
            limiter: SoftLimiter::new(0.95, 50.0, output_sample_rate),
        }
    }

    pub fn initialize(&mut self) -> Result<()> {
        let audio_sources = self.get_audio_sources();
        for src in audio_sources {
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(self.output_sample_rate)
                .with_output_channels(self.output_channels);
            match decoder.open(&src) {
                Ok(info) => {
                    tracing::info!(
                        "Opened audio decoder for {}: {} Hz, {} ch, {:.2}s",
                        src, info.sample_rate, info.channels, info.duration
                    );
                    self.sources.insert(src.clone(), AudioSource {
                        decoder,
                        current_position: -1.0,
                        residual: Vec::new(),
                    });
                }
                Err(e) => {
                    tracing::error!("Failed to open audio decoder for {}: {}", src, e);
                    return Err(e);
                }
            }
        }
        Ok(())
    }

    /// Hot-update timeline data without recreating the mixer.
    /// Opens decoders for any new audio sources, keeps existing decoders intact.
    pub fn update_timeline(&mut self, timeline: Timeline) {
        self.timeline = timeline;
        let new_sources = self.get_audio_sources();
        for src in &new_sources {
            if !self.sources.contains_key(src) {
                let mut decoder = FfmpegAudioDecoder::new()
                    .with_output_format(SampleFormat::F32)
                    .with_output_sample_rate(self.output_sample_rate)
                    .with_output_channels(self.output_channels);
                match decoder.open(src) {
                    Ok(info) => {
                        tracing::info!(
                            "Hot-update: opened audio decoder for {}: {} Hz, {} ch",
                            src, info.sample_rate, info.channels
                        );
                        self.sources.insert(src.clone(), AudioSource {
                            decoder,
                            current_position: -1.0,
                            residual: Vec::new(),
                        });
                    }
                    Err(e) => {
                        tracing::error!("Hot-update: failed to open audio decoder for {}: {}", src, e);
                    }
                }
            }
        }
    }

    fn get_audio_sources(&self) -> Vec<String> {
        let mut sources = Vec::new();
        for track in &self.timeline.tracks {
            if track.muted { continue; }
            for element in &track.elements {
                if let Some(src) = element.source_path() {
                    let dominated = match &element.element_type {
                        ElementType::Audio(_) => true,
                        ElementType::Media(_) if !element.is_audio_muted() => true,
                        _ => false,
                    };
                    if dominated && !sources.contains(&src) {
                        sources.push(src);
                    }
                }
            }
        }
        sources
    }

    fn get_active_elements(&self, time: f64) -> Vec<ActiveAudioElement> {
        let mut active = Vec::new();
        for track in &self.timeline.tracks {
            if track.muted { continue; }
            for element in &track.elements {
                if !element.is_visible_at(time) { continue; }
                match &element.element_type {
                    ElementType::Audio(audio) => {
                        if element.is_audio_muted() { continue; }
                        // Get fade curves and gain from AudioProperties if available
                        let (fade_in_curve, fade_out_curve, gain) = audio.audio.as_ref()
                            .map(|a| (a.fade_in_curve, a.fade_out_curve, a.gain))
                            .unwrap_or((EasingType::Linear, EasingType::Linear, 0.0));
                        active.push(ActiveAudioElement {
                            src: audio.src.clone(),
                            volume: element.effective_volume(),
                            pan: element.effective_pan(),
                            fade_in: audio.fade_in,
                            fade_out: audio.fade_out,
                            fade_in_curve,
                            fade_out_curve,
                            gain,
                            start_time: element.start_time,
                            duration: element.duration,
                            trim_start: element.trim_start,
                        });
                    }
                    ElementType::Media(media) if !element.is_audio_muted() => {
                        // Skip if audio is handled by a linked audio element in audio track
                        if media.linked_audio_id.is_some() { continue; }
                        // Get fade curves and gain from AudioProperties if available
                        let (fade_in_curve, fade_out_curve, gain) = media.audio.as_ref()
                            .map(|a| (a.fade_in_curve, a.fade_out_curve, a.gain))
                            .unwrap_or((EasingType::Linear, EasingType::Linear, 0.0));
                        active.push(ActiveAudioElement {
                            src: media.src.clone(),
                            volume: element.effective_volume(),
                            pan: 0.0,
                            fade_in: media.audio.as_ref().map(|a| a.fade_in).unwrap_or(0.0),
                            fade_out: media.audio.as_ref().map(|a| a.fade_out).unwrap_or(0.0),
                            fade_in_curve,
                            fade_out_curve,
                            gain,
                            start_time: element.start_time,
                            duration: element.duration,
                            trim_start: element.trim_start,
                        });
                    }
                    _ => {}
                }
            }
        }
        active
    }

    pub fn mix_frame(&mut self, time: f64) -> Result<Option<MixedAudioFrame>> {
        let active_elements = self.get_active_elements(time);
        let buffer_size = self.samples_per_frame * self.output_channels as usize;

        if active_elements.is_empty() {
            return Ok(Some(MixedAudioFrame {
                data: vec![0.0; buffer_size],
                samples: self.samples_per_frame,
                timestamp: time,
                sample_rate: self.output_sample_rate,
                channels: self.output_channels,
            }));
        }

        let mut output = vec![0.0f32; buffer_size];
        let frame_duration = self.samples_per_frame as f64 / self.output_sample_rate as f64;

        for element in &active_elements {
            let source = match self.sources.get_mut(&element.src) {
                Some(s) => s,
                None => continue,
            };
            let source_time = element.get_source_time(time);

            // Determine if seek is needed: only seek when time is non-sequential
            // (first call, or time jumped by more than 1.5x frame duration)
            let need_seek = source.current_position < 0.0
                || (source_time - source.current_position).abs() > frame_duration * 1.5;

            if need_seek {
                if source.decoder.seek(source_time).is_err() {
                    continue;
                }
                source.residual.clear();
                source.current_position = source_time; // Align to requested time, not decoder timestamp
                // After seek, decode a few frames to skip AAC priming silence
                for _ in 0..3 {
                    match source.decoder.decode_next() {
                        Ok(Some(f)) => {
                            let samples: &[f32] = bytemuck::cast_slice(&f.data);
                            let max_abs = samples.iter().fold(0.0f32, |a, &b| a.max(b.abs()));
                            if max_abs > 0.0 {
                                // Found non-silent frame, use it as start of residual
                                source.residual.extend_from_slice(samples);
                                break;
                            }
                        }
                        _ => break,
                    }
                }
            }

            // Collect enough samples for this frame by continuous decoding
            let needed = self.samples_per_frame * self.output_channels as usize;
            while source.residual.len() < needed {
                match source.decoder.decode_next() {
                    Ok(Some(f)) => {
                        let samples: &[f32] = bytemuck::cast_slice(&f.data);
                        source.residual.extend_from_slice(samples);
                    }
                    _ => {
                        // EOF or error — pad with silence
                        source.residual.resize(needed, 0.0);
                        break;
                    }
                }
            }

            // Take exactly `needed` samples from the residual buffer
            let frame_samples: Vec<f32> = source.residual.drain(..needed).collect();

            // Advance current_position by the actual consumed duration
            source.current_position += frame_duration;
            let volume = element.effective_volume(time);

            // Mix into output with volume and pan
            let pan_angle = (element.pan + 1.0) * std::f32::consts::FRAC_PI_4;
            let left_gain = pan_angle.cos() * volume;
            let right_gain = pan_angle.sin() * volume;
            let channels = self.output_channels as usize;
            for i in 0..self.samples_per_frame {
                let idx = i * channels;
                if idx + 1 < frame_samples.len() && idx + 1 < output.len() {
                    output[idx] += frame_samples[idx] * left_gain;
                    output[idx + 1] += frame_samples[idx + 1] * right_gain;
                }
            }
        }

        // Apply soft limiter to prevent clipping distortion
        self.limiter.process_buffer(&mut output);

        Ok(Some(MixedAudioFrame {
            data: output,
            samples: self.samples_per_frame,
            timestamp: time,
            sample_rate: self.output_sample_rate,
            channels: self.output_channels,
        }))
    }

    pub fn to_s16_bytes(frame: &MixedAudioFrame) -> Vec<u8> {
        let mut output = Vec::with_capacity(frame.data.len() * 2);
        for &sample in &frame.data {
            let s16 = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
            output.extend_from_slice(&s16.to_le_bytes());
        }
        output
    }

    pub fn sample_rate(&self) -> u32 { self.output_sample_rate }
    pub fn channels(&self) -> u16 { self.output_channels }

    pub fn close(&mut self) {
        for (src, source) in self.sources.iter_mut() {
            tracing::debug!("Closing audio decoder for {}", src);
            source.decoder.close();
        }
        self.sources.clear();
    }
}

impl Drop for AudioMixer {
    fn drop(&mut self) { self.close(); }
}

/// Soft limiter to prevent clipping with smooth gain reduction
struct SoftLimiter {
    threshold: f32,      // Limiting threshold (default 0.95)
    knee_width: f32,     // Soft knee width (default 0.1)
    release_coeff: f32,  // Release coefficient
    envelope: f32,       // Envelope follower state
}

impl SoftLimiter {
    fn new(threshold: f32, release_ms: f32, sample_rate: u32) -> Self {
        let release_samples = release_ms * 0.001 * sample_rate as f32;
        let release_coeff = if release_samples > 0.0 {
            (-2.2 / release_samples).exp()
        } else {
            0.0
        };
        Self {
            threshold,
            knee_width: 0.1,
            release_coeff,
            envelope: 0.0,
        }
    }

    fn process(&mut self, sample: f32) -> f32 {
        let abs_sample = sample.abs();

        // Peak envelope follower
        if abs_sample > self.envelope {
            self.envelope = abs_sample;
        } else {
            self.envelope = self.release_coeff * self.envelope
                          + (1.0 - self.release_coeff) * abs_sample;
        }

        // Soft knee compression
        let over = self.envelope - self.threshold;
        if over <= -self.knee_width {
            // Below knee: no compression
            sample
        } else if over >= self.knee_width {
            // Above knee: full compression
            sample * (self.threshold / self.envelope.max(0.0001))
        } else {
            // In knee: smooth transition
            let knee_factor = (over + self.knee_width) / (2.0 * self.knee_width);
            let gain = 1.0 - knee_factor * (1.0 - self.threshold / self.envelope.max(0.0001));
            sample * gain
        }
    }

    fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process(*sample);
        }
    }
}
