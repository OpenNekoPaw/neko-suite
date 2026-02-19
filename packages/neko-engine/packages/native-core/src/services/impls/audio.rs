//! AudioService implementation
//!
//! Provides audio-related operations: probing, transcoding, streaming, and waveform generation.

use crate::audio::{
    AudioCodec as InternalAudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig,
    FfmpegAudioDecoder, FfmpegAudioEncoder, SampleFormat,
};
use crate::domain::{AudioTranscodeOptions, FrameData};
use crate::error::{Error, Result};
use crate::gpu::GpuContext;
use crate::media_service::probe_media_info;
use crate::services::impls::common::generate_waveform_blocking;
use crate::services::impls::stream_loop::{
    pack_opus_frame, pack_pcm_frame, ActiveStreams, create_stream_channels, WallClockPacer,
    StreamLoopHandle,
};
use crate::services::{IAudioService, ITaskService};
use neko_types::{MediaInfo, StreamId, WaveformData};
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

/// AudioService implementation
///
/// Wraps media_service probe for audio file metadata.
/// Supports audio transcoding, PCM streaming, and waveform generation.
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

    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: AudioTranscodeOptions,
    ) -> Result<()> {
        let input_path = source.to_string_lossy().to_string();
        let output_path = output_path.to_path_buf();

        tokio::task::spawn_blocking(move || {
            // Open decoder
            let mut decoder = FfmpegAudioDecoder::new().with_output_format(SampleFormat::F32);
            let audio_info = decoder.open(&input_path)?;

            // Determine codec: options.format > output extension > default
            let codec = if let Some(fmt) = options.format {
                match fmt {
                    crate::domain::AudioOutputFormat::Aac => InternalAudioCodec::Aac,
                    crate::domain::AudioOutputFormat::Mp3 => InternalAudioCodec::Mp3,
                    crate::domain::AudioOutputFormat::Opus => InternalAudioCodec::Opus,
                    crate::domain::AudioOutputFormat::Flac => InternalAudioCodec::Flac,
                    crate::domain::AudioOutputFormat::Pcm => InternalAudioCodec::Pcm,
                }
            } else {
                match output_path
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
                }
            };

            // Configure encoder with options
            let sample_rate = options.sample_rate.unwrap_or(audio_info.sample_rate);
            let channels = options.channels.unwrap_or(audio_info.channels as u16);

            let mut config = AudioEncoderConfig::new(sample_rate, channels, codec);
            if let Some(bitrate) = options.bitrate {
                config = config.with_bitrate(bitrate);
            }

            let mut encoder = FfmpegAudioEncoder::new();
            encoder.open(&config)?;

            // Create output file
            let mut output_file = File::create(&output_path)
                .map_err(|e| Error::Other(format!("Failed to create output file: {}", e)))?;

            // Decode → encode → write loop
            while let Some(frame) = decoder.decode_next()? {
                // Skip frames outside time range if specified
                if let Some((start, end)) = options.time_range {
                    if frame.timestamp < start {
                        continue;
                    }
                    if frame.timestamp > end {
                        break;
                    }
                }

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
        .map_err(|e| Error::Other(format!("Audio transcode task failed: {}", e)))?
    }

    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let path = source.to_string_lossy().to_string();

        // Create stream channels
        let (stream_id, tx, rx, cancel, state_tx, state_rx) =
            create_stream_channels(session_id, 64);

        // Spawn entire decode→encode loop in a single blocking thread
        let cancel_clone = cancel.clone();
        let state_tx_clone = state_tx.clone();
        let join_handle = tokio::task::spawn_blocking(move || {
            // Initialize decoder: output F32 packed at 48kHz stereo (Opus standard)
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(48000)
                .with_output_channels(2);
            let audio_info = match decoder.open(&path) {
                Ok(info) => info,
                Err(e) => {
                    tracing::error!("Failed to open audio decoder: {}", e);
                    return;
                }
            };

            // Initialize Opus encoder: 48kHz / Stereo / 128kbps
            let opus_config = AudioEncoderConfig::new(48000, 2, InternalAudioCodec::Opus)
                .with_bitrate(128_000)
                .with_sample_format(SampleFormat::F32);
            let mut encoder = FfmpegAudioEncoder::new();
            if let Err(e) = AudioEncoder::open(&mut encoder, &opus_config) {
                tracing::error!("Failed to open Opus encoder: {}", e);
                return;
            }

            let sample_rate = 48000u32;
            let channels = 2u16;

            // Opus outputs ~50 packets/sec (960 samples/frame at 48kHz = 20ms)
            let mut pacer = WallClockPacer::new(50.0, 1.0);
            let mut current_speed = 1.0;

            let mut last_seen_paused = false;

            // PTS offset in samples: after seek, encoder resets PTS to 0.
            // We add this offset to restore absolute timeline.
            let mut pts_offset_samples: i64 = 0;

            loop {
                // Check cancellation
                if cancel_clone.is_cancelled() { break; }

                // Read playback state
                let state = state_rx.borrow().clone();

                // Handle seek request
                if let Some(time) = state.seek_to {
                    let _ = AudioDecoder::seek(&mut decoder, time);
                    // Reset encoder on seek: close + reopen to flush stale FIFO
                    AudioEncoder::close(&mut encoder);
                    if let Err(e) = AudioEncoder::open(&mut encoder, &opus_config) {
                        tracing::error!("Failed to re-open Opus encoder after seek: {}", e);
                        break;
                    }
                    pacer.reset();
                    state_tx_clone.send_modify(|s| s.seek_to = None);
                    // Record PTS offset: seek target time → samples
                    pts_offset_samples = (time * sample_rate as f64) as i64;
                }

                // Detect pause→resume transition: reset pacer to avoid time jump
                if last_seen_paused && !state.paused {
                    pacer.reset();
                }
                last_seen_paused = state.paused;

                // When paused, sleep and continue
                if state.paused {
                    std::thread::sleep(std::time::Duration::from_millis(16));
                    continue;
                }

                // Update speed if changed
                if (state.speed - current_speed).abs() > 0.001 {
                    current_speed = state.speed;
                    pacer.update_speed(current_speed);
                }

                // Decode next audio frame
                match AudioDecoder::decode_next(&mut decoder) {
                    Ok(Some(frame)) => {
                        // Encode PCM → Opus (FIFO handles frame size alignment)
                        match AudioEncoder::encode_frame(&mut encoder, &frame.data, frame.samples) {
                            Ok(mut packets) => {
                                for p in &mut packets {
                                    // Restore absolute PTS by adding offset from seek
                                    p.pts += pts_offset_samples;
                                    let packed = pack_opus_frame(p, sample_rate, channels);
                                    let _ = tx.send(packed);
                                }
                            }
                            Err(e) => {
                                tracing::warn!("Opus encode error: {}", e);
                            }
                        }
                    }
                    Ok(None) => {
                        // EOF — flush encoder then check loop
                        if let Ok(mut packets) = AudioEncoder::flush(&mut encoder) {
                            for p in &mut packets {
                                p.pts += pts_offset_samples;
                                let packed = pack_opus_frame(p, sample_rate, channels);
                                let _ = tx.send(packed);
                            }
                        }

                        let state = state_rx.borrow().clone();
                        if state.loop_region.is_some() {
                            // Re-open decoder + encoder for loop
                            AudioDecoder::close(&mut decoder);
                            if decoder.open(&path).is_err() {
                                break;
                            }
                            AudioEncoder::close(&mut encoder);
                            if AudioEncoder::open(&mut encoder, &opus_config).is_err() {
                                break;
                            }
                            pacer.reset();
                        } else {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Audio stream decode error: {}", e);
                        break;
                    }
                }

                // Wall-clock pacing
                pacer.wait_for_next_frame();
            }
        });

        // Store handle
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx,
            join_handle,
        };
        self.active_streams.insert(handle).await;

        Ok((stream_id, rx))
    }

    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams.stop(stream_id).await
    }

    async fn pause(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.paused = true)
            .await
    }

    async fn resume(&self, stream_id: &StreamId) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.paused = false)
            .await
    }

    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.speed = speed)
            .await
    }

    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.seek_to = Some(time_seconds))
            .await
    }

    async fn generate_waveform(
        &self,
        source: &Path,
    ) -> Result<WaveformData> {
        let path = source.to_string_lossy().to_string();

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
        let result = service.generate_waveform(Path::new("/nonexistent/file.mp3")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_transcode_nonexistent() {
        let service = create_test_service();
        let result = service
            .transcode(
                Path::new("/nonexistent/file.mp3"),
                Path::new("/tmp/out.aac"),
                AudioTranscodeOptions::default(),
            )
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_start_stream_nonexistent() {
        let service = create_test_service();
        let result = service.start_stream(Path::new("/nonexistent/file.mp3"), "session1").await;
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

    /// Integration test: start audio stream with real mp3 file and verify PCM frames are produced
    #[tokio::test]
    async fn test_audio_stream_real_file_mp3() {
        let test_file = std::path::Path::new("/Users/feng/git/neko-test/cases/test.mp3");
        if !test_file.exists() {
            eprintln!("Skipping test: test file not found at {:?}", test_file);
            return;
        }

        let service = create_test_service();
        let result = service.start_stream(test_file, "test-audio").await;
        assert!(result.is_ok(), "start_stream should succeed");

        let (stream_id, mut rx) = result.unwrap();

        // Receive a few frames and verify they have PCM header
        let mut frames_received = 0;
        let timeout = tokio::time::sleep(std::time::Duration::from_secs(3));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => break,
                frame = rx.recv() => {
                    match frame {
                        Ok(f) => {
                            assert_eq!(f.format, neko_types::FrameFormat::PcmF32, "Frame should be PcmF32");
                            // Verify wire format header: pts(8) + sampleRate(4) + channels(4) = 16 bytes min
                            assert!(f.data.len() > 16, "Frame data should have header + PCM data");

                            // Parse header
                            let pts = f64::from_le_bytes(f.data[0..8].try_into().unwrap());
                            let sample_rate = u32::from_le_bytes(f.data[8..12].try_into().unwrap());
                            let channels = u32::from_le_bytes(f.data[12..16].try_into().unwrap());

                            assert!(sample_rate > 0, "Sample rate should be > 0, got {}", sample_rate);
                            assert!(channels > 0, "Channels should be > 0, got {}", channels);
                            assert!(pts >= 0.0, "PTS should be >= 0, got {}", pts);

                            frames_received += 1;
                            if frames_received >= 5 { break; }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }

        assert!(frames_received >= 3, "Should receive at least 3 PCM frames, got {}", frames_received);
        let _ = service.stop_stream(&stream_id).await;
    }

    /// Integration test: start audio stream with real aac file
    #[tokio::test]
    async fn test_audio_stream_real_file_aac() {
        let test_file = std::path::Path::new("/Users/feng/git/neko-test/cases/test.aac");
        if !test_file.exists() {
            eprintln!("Skipping test: test file not found at {:?}", test_file);
            return;
        }

        let service = create_test_service();
        let result = service.start_stream(test_file, "test-aac").await;
        assert!(result.is_ok(), "start_stream should succeed for aac");

        let (stream_id, mut rx) = result.unwrap();

        let mut frames_received = 0;
        let timeout = tokio::time::sleep(std::time::Duration::from_secs(3));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                _ = &mut timeout => break,
                frame = rx.recv() => {
                    match frame {
                        Ok(f) => {
                            assert_eq!(f.format, neko_types::FrameFormat::PcmF32);
                            frames_received += 1;
                            if frames_received >= 5 { break; }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }

        assert!(frames_received >= 3, "Should receive at least 3 PCM frames from aac, got {}", frames_received);
        let _ = service.stop_stream(&stream_id).await;
    }
}
