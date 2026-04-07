//! MicCaptureService - Cross-platform microphone capture via cpal
//!
//! Provides audio input device enumeration, real-time recording to WAV files,
//! and low-latency monitor data (RMS/Peak) for level meters.
//!
//! Architecture:
//! - cpal callback runs on a real-time audio thread (MUST NOT block)
//! - Callback pushes samples to crossbeam bounded channel (lock-free producer)
//! - Tokio task reads from channel: computes RMS/Peak + writes WAV via spawn_blocking
//! - Monitor data stored in AtomicU32 (reinterpreted as f32) for zero-lock reads

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use crossbeam_channel::bounded;
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use neko_types::StreamId;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

// =============================================================================
// Types
// =============================================================================

/// Audio input device info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputDevice {
    pub id: String,
    pub name: String,
    pub sample_rates: Vec<u32>,
    pub channels: Vec<u16>,
    pub is_default: bool,
}

/// Real-time monitor data (level meter)
#[derive(Debug, Clone, Serialize)]
pub struct MonitorData {
    pub rms: f32,
    pub peak: f32,
    pub clipping: bool,
}

/// Recording session result
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingResult {
    pub path: String,
    pub duration_seconds: f64,
    pub format: String,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Recording config
#[derive(Debug, Clone)]
pub struct RecordCaptureConfig {
    pub sample_rate: u32,
    pub channels: u16,
    pub output_path: PathBuf,
}

impl Default for RecordCaptureConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48000,
            channels: 1,
            output_path: PathBuf::from("recording.wav"),
        }
    }
}

// =============================================================================
// Active Recording Session
// =============================================================================

/// Wrapper to hold cpal::Stream across thread boundaries.
/// Safety: We only hold the stream to keep it alive; we never call methods
/// on it from a different thread. Dropping it stops the capture.
struct SendStream(#[allow(dead_code)] cpal::Stream);
// SAFETY: cpal::Stream is safe to hold across threads — the callback runs
// on its own RT thread regardless. We only store it for RAII lifetime.
unsafe impl Send for SendStream {}

struct ActiveRecording {
    cancel: CancellationToken,
    /// cpal stream handle (must stay alive during recording)
    _stream: SendStream,
    /// Atomic monitor values (f32 stored as u32 bits)
    rms_atomic: Arc<AtomicU32>,
    peak_atomic: Arc<AtomicU32>,
    clipping_atomic: Arc<AtomicBool>,
    /// Total samples written (for duration calculation)
    samples_written: Arc<AtomicU32>,
    sample_rate: u32,
    channels: u16,
    output_path: PathBuf,
}

// =============================================================================
// MicCaptureService
// =============================================================================

pub struct MicCaptureService {
    recordings: Mutex<HashMap<String, ActiveRecording>>,
}

impl Default for MicCaptureService {
    fn default() -> Self {
        Self::new()
    }
}

impl MicCaptureService {
    pub fn new() -> Self {
        Self {
            recordings: Mutex::new(HashMap::new()),
        }
    }

    /// List available audio input devices
    pub fn list_devices(&self) -> Vec<AudioInputDevice> {
        let host = cpal::default_host();
        let default_device_name = host
            .default_input_device()
            .and_then(|d| d.name().ok())
            .unwrap_or_default();

        let mut devices = Vec::new();

        if let Ok(input_devices) = host.input_devices() {
            for device in input_devices {
                let name = device.name().unwrap_or_else(|_| "Unknown".to_string());
                let is_default = name == default_device_name;

                // Collect supported configs
                let mut sample_rates = Vec::new();
                let mut channels = Vec::new();

                if let Ok(configs) = device.supported_input_configs() {
                    for config in configs {
                        let min_sr = config.min_sample_rate().0;
                        let max_sr = config.max_sample_rate().0;
                        // Add common sample rates within range
                        for &sr in &[8000, 16000, 22050, 44100, 48000, 96000] {
                            if sr >= min_sr && sr <= max_sr && !sample_rates.contains(&sr) {
                                sample_rates.push(sr);
                            }
                        }
                        let ch = config.channels();
                        if !channels.contains(&ch) {
                            channels.push(ch);
                        }
                    }
                }

                devices.push(AudioInputDevice {
                    id: name.clone(),
                    name,
                    sample_rates,
                    channels,
                    is_default,
                });
            }
        }

        devices
    }

    /// Start recording from the specified device
    pub fn start_capture(
        &self,
        device_id: Option<&str>,
        config: RecordCaptureConfig,
    ) -> crate::error::Result<StreamId> {
        let host = cpal::default_host();

        // Find device
        let device = if let Some(id) = device_id {
            host.input_devices()
                .map_err(|e| {
                    crate::error::Error::Other(format!("Failed to enumerate devices: {e}"))
                })?
                .find(|d| d.name().map(|n| n == id).unwrap_or(false))
                .ok_or_else(|| crate::error::Error::Other(format!("Device not found: {id}")))?
        } else {
            host.default_input_device()
                .ok_or_else(|| crate::error::Error::Other("No default input device".to_string()))?
        };

        let sample_rate = config.sample_rate;
        let channels = config.channels;

        // Build cpal stream config
        let stream_config = cpal::StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        // Crossbeam channel for RT-safe transfer
        let (tx, rx) = bounded::<Vec<f32>>(1024);

        // Atomic monitor values
        let rms_atomic = Arc::new(AtomicU32::new(0));
        let peak_atomic = Arc::new(AtomicU32::new(0));
        let clipping_atomic = Arc::new(AtomicBool::new(false));
        let samples_written = Arc::new(AtomicU32::new(0));

        // Build cpal input stream
        let tx_clone = tx.clone();
        let stream = device
            .build_input_stream(
                &stream_config,
                move |data: &[f32], _info: &cpal::InputCallbackInfo| {
                    // RT thread: lock-free send, drop on overflow (don't block)
                    let _ = tx_clone.try_send(data.to_vec());
                },
                move |err| {
                    tracing::error!("cpal input error: {err}");
                },
                None,
            )
            .map_err(|e| {
                crate::error::Error::Other(format!("Failed to build input stream: {e}"))
            })?;

        stream
            .play()
            .map_err(|e| crate::error::Error::Other(format!("Failed to start stream: {e}")))?;

        // Generate stream ID
        let stream_id = StreamId::new(&format!("mic-{}", uuid::Uuid::new_v4()));
        let cancel = CancellationToken::new();

        // Spawn writer task
        let cancel_clone = cancel.clone();
        let rms_clone = rms_atomic.clone();
        let peak_clone = peak_atomic.clone();
        let clipping_clone = clipping_atomic.clone();
        let samples_clone = samples_written.clone();
        let output_path = config.output_path.clone();
        let out_path = output_path.clone();

        tokio::spawn(async move {
            // Open WAV writer in blocking context
            let spec = WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 32,
                sample_format: HoundSampleFormat::Float,
            };

            let writer = match WavWriter::create(&out_path, spec) {
                Ok(w) => Arc::new(Mutex::new(Some(w))),
                Err(e) => {
                    tracing::error!("Failed to create WAV writer: {e}");
                    return;
                }
            };

            let mut total_samples: u64 = 0;

            loop {
                tokio::select! {
                    _ = cancel_clone.cancelled() => break,
                    result = tokio::task::spawn_blocking({
                        let rx = rx.clone();
                        move || rx.recv_timeout(std::time::Duration::from_millis(100))
                    }) => {
                        match result {
                            Ok(Ok(samples)) => {
                                // Compute RMS and Peak
                                let mut sum_sq = 0.0f64;
                                let mut peak = 0.0f32;
                                for &s in &samples {
                                    sum_sq += (s as f64) * (s as f64);
                                    let abs = s.abs();
                                    if abs > peak { peak = abs; }
                                }
                                let rms = (sum_sq / samples.len().max(1) as f64).sqrt() as f32;

                                rms_clone.store(rms.to_bits(), Ordering::Relaxed);
                                peak_clone.store(peak.to_bits(), Ordering::Relaxed);
                                clipping_clone.store(peak >= 0.99, Ordering::Relaxed);

                                // Write to WAV
                                if let Ok(mut guard) = writer.lock() {
                                    if let Some(ref mut w) = *guard {
                                        for &s in &samples {
                                            if w.write_sample(s).is_err() {
                                                break;
                                            }
                                        }
                                    }
                                }

                                total_samples += samples.len() as u64;
                                samples_clone.store(
                                    (total_samples / channels as u64).min(u32::MAX as u64) as u32,
                                    Ordering::Relaxed,
                                );
                            }
                            Ok(Err(_)) => {
                                // Timeout or channel closed — check cancellation
                                if cancel_clone.is_cancelled() { break; }
                            }
                            Err(_) => break,
                        }
                    }
                }
            }

            // Finalize WAV
            if let Ok(mut guard) = writer.lock() {
                if let Some(w) = guard.take() {
                    if let Err(e) = w.finalize() {
                        tracing::error!("Failed to finalize WAV: {e}");
                    }
                }
            }

            tracing::info!("Recording stopped: {} samples written", total_samples);
        });

        // Store active recording
        let recording = ActiveRecording {
            cancel,
            _stream: SendStream(stream),
            rms_atomic,
            peak_atomic,
            clipping_atomic,
            samples_written,
            sample_rate,
            channels,
            output_path,
        };

        self.recordings
            .lock()
            .map_err(|_| crate::error::Error::Other("Lock poisoned".to_string()))?
            .insert(stream_id.as_str().to_string(), recording);

        Ok(stream_id)
    }

    /// Stop recording and return result
    pub async fn stop_capture(&self, stream_id: &str) -> crate::error::Result<RecordingResult> {
        let recording = self
            .recordings
            .lock()
            .map_err(|_| crate::error::Error::Other("Lock poisoned".to_string()))?
            .remove(stream_id)
            .ok_or_else(|| {
                crate::error::Error::Other(format!("Recording not found: {stream_id}"))
            })?;

        // Signal cancellation and wait for writer to finish
        recording.cancel.cancel();
        // Small delay for writer task to finalize WAV
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let total_frames = recording.samples_written.load(Ordering::Relaxed);
        let duration = total_frames as f64 / recording.sample_rate as f64;

        Ok(RecordingResult {
            path: recording.output_path.to_string_lossy().to_string(),
            duration_seconds: duration,
            format: "wav".to_string(),
            sample_rate: recording.sample_rate,
            channels: recording.channels,
        })
    }

    /// Get current monitor data for a recording session
    pub fn get_monitor_data(&self, stream_id: &str) -> Option<MonitorData> {
        let recordings = self.recordings.lock().ok()?;
        let recording = recordings.get(stream_id)?;

        Some(MonitorData {
            rms: f32::from_bits(recording.rms_atomic.load(Ordering::Relaxed)),
            peak: f32::from_bits(recording.peak_atomic.load(Ordering::Relaxed)),
            clipping: recording.clipping_atomic.load(Ordering::Relaxed),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_devices_does_not_panic() {
        let service = MicCaptureService::new();
        let devices = service.list_devices();
        // Should not panic; may return empty on CI without audio devices
        assert!(devices.len() >= 0);
    }

    #[test]
    fn test_monitor_data_nonexistent_stream() {
        let service = MicCaptureService::new();
        assert!(service.get_monitor_data("nonexistent").is_none());
    }

    #[test]
    fn test_default_record_config() {
        let config = RecordCaptureConfig::default();
        assert_eq!(config.sample_rate, 48000);
        assert_eq!(config.channels, 1);
    }
}
