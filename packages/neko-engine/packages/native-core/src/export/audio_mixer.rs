//! Audio Mixer - Multi-track audio mixing for export
//!
//! Decodes and mixes multiple audio sources based on timeline data.
//! Supports volume, pan, fade in/out effects.

use std::collections::HashMap;

use crate::audio::{AudioDecoder, DecodedAudioFrame, FfmpegAudioDecoder, SampleFormat};
use crate::error::Result;

use super::types::{ElementData, ExportSettings, TimelineData};

/// Audio source with decoder and metadata
#[allow(dead_code)]
struct AudioSource {
    decoder: FfmpegAudioDecoder,
    src: String,
    sample_rate: u32,
    channels: u16,
}

/// Active audio element at a specific time
#[derive(Clone)]
struct ActiveAudioElement {
    src: String,
    volume: f32,
    pan: f32,
    fade_in: f64,
    fade_out: f64,
    start_time: f64,
    duration: f64,
    trim_start: f64,
}

impl ActiveAudioElement {
    fn effective_volume(&self, timeline_time: f64) -> f32 {
        let relative_time = timeline_time - self.start_time;
        let mut vol = self.volume;
        if self.fade_in > 0.0 && relative_time < self.fade_in {
            vol *= (relative_time / self.fade_in) as f32;
        }
        let time_to_end = self.duration - relative_time;
        if self.fade_out > 0.0 && time_to_end < self.fade_out {
            vol *= (time_to_end / self.fade_out) as f32;
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
    timeline: TimelineData,
    output_sample_rate: u32,
    output_channels: u16,
    samples_per_frame: usize,
    limiter: SoftLimiter,
}

impl AudioMixer {
    pub fn new(timeline: TimelineData, settings: &ExportSettings) -> Self {
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
                        src,
                        sample_rate: info.sample_rate,
                        channels: info.channels,
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

    fn get_audio_sources(&self) -> Vec<String> {
        let mut sources = Vec::new();
        for track in &self.timeline.tracks {
            if track.muted { continue; }
            for element in &track.elements {
                match element {
                    ElementData::Audio(audio) => {
                        if !sources.contains(&audio.src) {
                            sources.push(audio.src.clone());
                        }
                    }
                    ElementData::Media(media) if !media.muted => {
                        if !sources.contains(&media.src) {
                            sources.push(media.src.clone());
                        }
                    }
                    _ => {}
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
                match element {
                    ElementData::Audio(audio) => {
                        // Skip muted audio elements
                        if audio.is_muted() { continue; }
                        active.push(ActiveAudioElement {
                            src: audio.src.clone(),
                            volume: audio.effective_volume(),
                            pan: audio.effective_pan(),
                            fade_in: audio.fade_in,
                            fade_out: audio.fade_out,
                            start_time: audio.start_time,
                            duration: audio.duration,
                            trim_start: audio.trim_start,
                        });
                    }
                    ElementData::Media(media) if !media.muted => {
                        active.push(ActiveAudioElement {
                            src: media.src.clone(),
                            volume: media.volume,
                            pan: 0.0,
                            fade_in: 0.0,
                            fade_out: 0.0,
                            start_time: media.start_time,
                            duration: media.duration,
                            trim_start: media.trim_start,
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
        for element in &active_elements {
            let source = match self.sources.get_mut(&element.src) {
                Some(s) => s,
                None => continue,
            };
            let source_time = element.get_source_time(time);
            if source.decoder.seek(source_time).is_err() { continue; }
            let frame = match source.decoder.decode_next()? {
                Some(f) => f,
                None => continue,
            };
            let volume = element.effective_volume(time);
            self.mix_samples(&frame, &mut output, volume, element.pan);
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

    fn mix_samples(&self, frame: &DecodedAudioFrame, output: &mut [f32], volume: f32, pan: f32) {
        let input_samples: &[f32] = bytemuck::cast_slice(&frame.data);
        let pan_angle = (pan + 1.0) * std::f32::consts::FRAC_PI_4;
        let left_gain = pan_angle.cos() * volume;
        let right_gain = pan_angle.sin() * volume;

        if frame.channels == 2 {
            for i in 0..frame.samples.min(output.len() / 2) {
                let idx = i * 2;
                if idx + 1 < input_samples.len() && idx + 1 < output.len() {
                    output[idx] += input_samples[idx] * left_gain;
                    output[idx + 1] += input_samples[idx + 1] * right_gain;
                }
            }
        } else if frame.channels == 1 {
            for i in 0..frame.samples.min(output.len() / 2) {
                if i < input_samples.len() {
                    let out_idx = i * 2;
                    output[out_idx] += input_samples[i] * left_gain;
                    output[out_idx + 1] += input_samples[i] * right_gain;
                }
            }
        }
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
