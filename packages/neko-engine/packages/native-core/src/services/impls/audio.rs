//! AudioService implementation
//!
//! Provides audio-related operations: probing, extraction, streaming, and waveform generation.

use crate::audio::{
    AudioCodec as InternalAudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig,
    FfmpegAudioDecoder, FfmpegAudioEncoder, SampleFormat,
};
use crate::domain::{FrameData, TaskHandle};
use crate::error::{Error, Result};
use crate::gpu::GpuContext;
use crate::media_service::probe_media_info;
use crate::services::impls::common::generate_waveform_blocking;
use crate::services::impls::stream_loop::{
    ActiveStreams, create_stream_channels, FramePacer, StreamLoopHandle,
};
use crate::services::{IAudioService, ITaskService};
use neko_types::{FrameFormat, MediaInfo, ResourceId, StreamId, WaveformData};
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

/// AudioService implementation
///
/// Wraps media_service probe for audio file metadata.
/// Supports audio extraction, PCM streaming, and waveform generation.
pub struct AudioService {
    /// GPU context (for future waveform GPU acceleration)
    #[allow(dead_code)]
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Task service for registering long-running operations
    #[allow(dead_code)]
    task_service: Arc<dyn ITaskService + Send + Sync>,
    /// Active stream loops
    active_streams: Arc<ActiveStreams>,
}

impl AudioService {
    /// Create a new AudioService
    pub fn new(
        gpu_ctx: Option<Arc<GpuContext>>,
        task_service: Arc<dyn ITaskService + Send + Sync>,
    ) -> Self {
        Self {
            gpu_ctx,
            task_service,
            active_streams: Arc::new(ActiveStreams::new()),
        }
    }

    /// Convert internal MediaInfo to neko_types::MediaInfo
    fn convert_media_info(info: crate::media_service::MediaInfo) -> MediaInfo {
        MediaInfo {
            duration: info.duration,
            format: info.format,
            file_size: 0,
            video_streams: vec![neko_types::VideoStreamInfo {
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
            }],
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
}

impl IAudioService for AudioService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || probe_media_info(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(Self::convert_media_info(info))
    }

    async fn extract(
        &self,
        resource_id: &ResourceId,
        output_path: &Path,
        _task_handle: Option<TaskHandle>,
    ) -> Result<()> {
        let input_path = resource_id.as_str().to_string();
        let output_path = output_path.to_path_buf();

        tokio::task::spawn_blocking(move || {
            // Open decoder
            let mut decoder = FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
            let audio_info = decoder.open(&input_path)?;

            // Determine codec from output extension
            let codec = match output_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .as_deref()
            {
                Some("aac" | "m4a") => InternalAudioCodec::Aac,
                Some("mp3") => InternalAudioCodec::Mp3,
                Some("flac") => InternalAudioCodec::Flac,
                Some("opus" | "ogg") => InternalAudioCodec::Opus,
                Some("wav" | "pcm") => InternalAudioCodec::Pcm,
                _ => InternalAudioCodec::Aac,
            };

            // Configure encoder
            let config = AudioEncoderConfig::new(
                audio_info.sample_rate,
                audio_info.channels,
                codec,
            );

            let mut encoder = FfmpegAudioEncoder::new();
            encoder.open(&config)?;

            // Create output file
            let mut output_file = File::create(&output_path)
                .map_err(|e| Error::Other(format!("Failed to create output file: {}", e)))?;

            // Decode → encode → write loop
            while let Some(frame) = decoder.decode_next()? {
                let packets = encoder.encode_frame(&frame.data, frame.samples)?;
                for packet in packets {
                    output_file
                        .write_all(&packet.data)
                        .map_err(|e| Error::Other(format!("Failed to write output: {}", e)))?;
                }
            }

            // Flush encoder
            let remaining = encoder.flush()?;
            for packet in remaining {
                output_file
                    .write_all(&packet.data)
                    .map_err(|e| Error::Other(format!("Failed to write output: {}", e)))?;
            }

            output_file
                .flush()
                .map_err(|e| Error::Other(format!("Failed to flush output: {}", e)))?;

            Ok(())
        })
        .await
        .map_err(|e| Error::Other(format!("Audio extraction task failed: {}", e)))?
    }

    async fn start_stream(
        &self,
        resource_id: &ResourceId,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let path = resource_id.as_str().to_string();

        // Create stream channels
        let (stream_id, tx, rx, cancel, _state_tx, state_rx) =
            create_stream_channels(session_id, 64);

        // Spawn decoding loop
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            // Audio doesn't need strict frame pacing, use ~50 packets/sec
            let mut pacer = FramePacer::new(50.0, 1.0);
            let mut current_speed = 1.0;

            // Initialize decoder in blocking context
            let init_result = tokio::task::spawn_blocking({
                let path = path.clone();
                move || -> Result<FfmpegAudioDecoder> {
                    let mut decoder =
                        FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
                    decoder.open(&path)?;
                    Ok(decoder)
                }
            })
            .await;

            let decoder = match init_result {
                Ok(Ok(d)) => d,
                _ => {
                    tracing::error!("Failed to initialize audio stream decoder");
                    return;
                }
            };

            let decoder = std::sync::Arc::new(std::sync::Mutex::new(decoder));

            loop {
                tokio::select! {
                    biased;
                    _ = cancel_clone.cancelled() => break,
                    _ = pacer.tick() => {
                        let state = state_rx.borrow().clone();

                        if state.paused { continue; }

                        // Update speed if changed
                        if (state.speed - current_speed).abs() > 0.001 {
                            current_speed = state.speed;
                            pacer.update_speed(current_speed);
                        }

                        // Decode next audio frame (blocking)
                        let dec = decoder.clone();
                        let frame_result = tokio::task::spawn_blocking(move || -> Result<Option<FrameData>> {
                            let mut d = dec.lock().unwrap();
                            match AudioDecoder::decode_next(&mut *d)? {
                                Some(frame) => {
                                    Ok(Some(FrameData {
                                        data: frame.data,
                                        width: frame.sample_rate,   // Repurpose: sample_rate
                                        height: frame.channels as u32, // Repurpose: channels
                                        format: FrameFormat::Rgba,  // Marker; actual data is PCM F32
                                        timestamp: frame.timestamp,
                                    }))
                                }
                                None => Ok(None),
                            }
                        }).await;

                        match frame_result {
                            Ok(Ok(Some(frame))) => {
                                let _ = tx.send(frame);
                            }
                            Ok(Ok(None)) => {
                                // EOF - check loop
                                let state = state_rx.borrow().clone();
                                if state.loop_region.is_some() {
                                    // Re-open decoder for loop (audio decoder doesn't support seek easily)
                                    let dec = decoder.clone();
                                    let p = path.clone();
                                    let _ = tokio::task::spawn_blocking(move || {
                                        let mut d = dec.lock().unwrap();
                                        AudioDecoder::close(&mut *d);
                                        let _ = d.open(&p);
                                    }).await;
                                } else {
                                    break;
                                }
                            }
                            Ok(Err(e)) => {
                                tracing::warn!("Audio stream decode error: {}", e);
                                break;
                            }
                            Err(e) => {
                                tracing::error!("Audio stream task panic: {}", e);
                                break;
                            }
                        }
                    }
                }
            }
        });

        // Store handle
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx: _state_tx,
            join_handle,
        };
        self.active_streams.insert(handle).await;

        Ok((stream_id, rx))
    }

    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams.stop(stream_id).await
    }

    async fn generate_waveform(
        &self,
        resource_id: &ResourceId,
        _task_handle: Option<TaskHandle>,
    ) -> Result<WaveformData> {
        let path = resource_id.as_str().to_string();

        tokio::task::spawn_blocking(move || generate_waveform_blocking(&path))
            .await
            .map_err(|e| Error::Other(format!("Waveform generation task failed: {}", e)))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::TaskService;

    fn create_test_service() -> AudioService {
        let task_service = Arc::new(TaskService::new());
        AudioService::new(None, task_service)
    }

    #[tokio::test]
    async fn test_audio_service_probe_nonexistent() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.mp3")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_generate_waveform_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp3".to_string());
        let result = service.generate_waveform(&resource_id, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_extract_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp3".to_string());
        let result = service
            .extract(&resource_id, Path::new("/tmp/out.aac"), None)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_start_stream_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp3".to_string());
        let result = service.start_stream(&resource_id, "session1").await;
        // Stream creation succeeds (async), but the decode loop will fail internally
        // The stream_id is returned immediately
        assert!(result.is_ok());
        let (stream_id, _rx) = result.unwrap();
        // Stop the stream (it may have already stopped due to decode error)
        let _ = service.stop_stream(&stream_id).await;
    }

    #[tokio::test]
    async fn test_audio_service_stop_stream_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.stop_stream(&stream_id).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Stream not found"));
    }

    #[test]
    fn test_audio_service_trait_object() {
        fn _assert_impl<T: IAudioService>() {}
        _assert_impl::<AudioService>();
    }
}
