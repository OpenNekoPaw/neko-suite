//! AudioService implementation
//!
//! Provides audio-related operations: probing, transcoding, streaming, and waveform generation.

use crate::audio::mic_capture::{AudioInputDevice, MicCaptureService, MonitorData, RecordCaptureConfig, RecordingResult};
use crate::audio::{
    AudioCodec as InternalAudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig,
    FfmpegAudioDecoder, FfmpegAudioEncoder, SampleFormat,
};
use crate::domain::{AudioTranscodeOptions, FrameData, LoudnessAnalysis, SilenceAnalysis};
use crate::error::{Error, Result};
use crate::gpu::GpuContext;
use crate::media_service::global_probe_cache;
use crate::services::impls::common::{
    analyze_loudness_blocking, convert_media_info, detect_silence_blocking,
    generate_waveform_blocking,
};
use crate::services::impls::stream_loop::{
    create_stream_channels, eof_idle_wait, pack_pcm_f32le_stream_frame, ActiveStreams,
    StreamLoopHandle, StreamPlaybackDelegate, WallClockPacer, EOF_IDLE_TIMEOUT,
};
use crate::services::{IAudioService, IStreamPlayback, ITaskService};
use neko_types::{LoopRegion, MediaInfo, StreamId, WaveformData};
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
    /// Delegate for stream playback control (stop/pause/resume/speed/seek/loop)
    playback: StreamPlaybackDelegate,
    /// Microphone capture service (lazy-initialized)
    mic_capture: Arc<MicCaptureService>,
}

impl AudioService {
    /// Create a new AudioService
    pub fn new(
        gpu_ctx: Option<Arc<GpuContext>>,
        task_service: Arc<dyn ITaskService + Send + Sync>,
    ) -> Self {
        let active_streams = Arc::new(ActiveStreams::new());
        let playback = StreamPlaybackDelegate::new(active_streams.clone());
        Self {
            gpu_ctx,
            task_service,
            active_streams,
            playback,
            mic_capture: Arc::new(MicCaptureService::new()),
        }
    }

    /// Get mic capture service reference (for monitor endpoint access)
    pub fn mic_capture(&self) -> &MicCaptureService {
        &self.mic_capture
    }
}

impl IStreamPlayback for AudioService {
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.stop_stream(stream_id).await
    }

    async fn pause(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.pause(stream_id).await
    }

    async fn resume(&self, stream_id: &StreamId) -> Result<()> {
        self.playback.resume(stream_id).await
    }

    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()> {
        self.playback.set_speed(stream_id, speed).await
    }

    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.playback.seek(stream_id, time_seconds).await
    }

    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()> {
        self.playback.set_loop(stream_id, region).await
    }
}

impl IAudioService for AudioService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || global_probe_cache().probe(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(convert_media_info(info))
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

        // Spawn decode loop in a single blocking thread
        // No Opus encoding — send raw PCM f32le directly (WebView doesn't support WebCodecs AudioDecoder)
        let cancel_clone = cancel.clone();
        let streams_clone = self.active_streams.clone();
        let stream_id_clone = stream_id.clone();
        let join_handle = tokio::task::spawn_blocking(move || {
            // Initialize decoder: output F32 interleaved at 48kHz stereo
            let mut decoder = FfmpegAudioDecoder::new()
                .with_output_format(SampleFormat::F32)
                .with_output_sample_rate(48000)
                .with_output_channels(2);
            let _audio_info = match decoder.open(&path) {
                Ok(info) => info,
                Err(e) => {
                    tracing::error!("Failed to open audio decoder: {}", e);
                    return;
                }
            };

            let sample_rate = 48000u32;
            let channels = 2u16;

            // Typical decoded frame ~1024 samples at 48kHz ≈ 21ms; 50fps pacer is a safe upper bound
            let mut pacer = WallClockPacer::new(50.0, 1.0);
            let mut current_speed = 1.0;
            let mut last_seen_paused = false;
            let mut last_seek_seq: u64 = 0;
            // Fade-in ramp after seek: 5ms at 48kHz = 240 samples
            let fade_in_samples_total = (sample_rate as f64 * 0.005) as usize;
            let mut fade_in_remaining: usize = 0;

            loop {
                // Check cancellation
                if cancel_clone.is_cancelled() {
                    break;
                }

                // Read playback state
                let state = state_rx.borrow().clone();

                // Handle seek request (dedup via seek_seq)
                if let Some(time) = state.seek_to {
                    if state.seek_seq != last_seek_seq {
                        last_seek_seq = state.seek_seq;
                        let _ = AudioDecoder::seek(&mut decoder, time);
                        pacer.reset();
                        fade_in_remaining = fade_in_samples_total;
                    }
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

                // Decode next audio frame and send raw PCM
                match AudioDecoder::decode_next(&mut decoder) {
                    Ok(Some(frame)) => {
                        let duration = frame.duration();
                        let mut pcm_data = frame.data.clone();

                        // Apply fade-in ramp after seek to eliminate click/pop
                        if fade_in_remaining > 0 {
                            let ch = channels as usize;
                            let total = fade_in_samples_total;
                            // PCM data is raw bytes of f32le samples
                            let samples: &mut [f32] = bytemuck::cast_slice_mut(&mut pcm_data);
                            let num_samples = samples.len() / ch;
                            for i in 0..num_samples {
                                if fade_in_remaining == 0 {
                                    break;
                                }
                                let progress = 1.0 - (fade_in_remaining as f32 / total as f32);
                                let gain = progress * progress; // quadratic ease-in
                                for c in 0..ch {
                                    samples[i * ch + c] *= gain;
                                }
                                fade_in_remaining -= 1;
                            }
                        }

                        let packed = pack_pcm_f32le_stream_frame(
                            &pcm_data,
                            frame.timestamp,
                            duration,
                            sample_rate,
                            channels,
                        );
                        let _ = tx.send(packed);
                    }
                    Ok(None) => {
                        // EOF — check loop region first
                        let state = state_rx.borrow().clone();
                        if let Some(ref region) = state.loop_region {
                            let seek_time = region.in_point;
                            let _ = AudioDecoder::seek(&mut decoder, seek_time);
                            pacer.reset();
                        } else {
                            // No loop: enter EOF idle wait for seek
                            match eof_idle_wait(
                                &cancel_clone,
                                &state_rx,
                                last_seek_seq,
                                EOF_IDLE_TIMEOUT,
                            ) {
                                Some(time) => {
                                    let _ = AudioDecoder::seek(&mut decoder, time);
                                    pacer.reset();
                                }
                                None => break, // Cancelled or timeout
                            }
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

            // Self-cleanup: remove handle from ActiveStreams when loop exits
            let rt = tokio::runtime::Handle::current();
            rt.block_on(streams_clone.remove(stream_id_clone.as_str()));
        });

        // Store handle
        let handle = StreamLoopHandle {
            stream_id: stream_id.clone(),
            cancel,
            state_tx,
            join_handle,
            linked_stream_id: None,
        };
        self.active_streams.insert(handle).await;

        Ok((stream_id, rx))
    }

    async fn generate_waveform(&self, source: &Path) -> Result<WaveformData> {
        let path = source.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || generate_waveform_blocking(&path))
            .await
            .map_err(|e| Error::Other(format!("Waveform generation task failed: {}", e)))?
    }

    async fn analyze_loudness(&self, path: &Path, target_lufs: f64) -> Result<LoudnessAnalysis> {
        let path = path.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || analyze_loudness_blocking(&path, target_lufs))
            .await
            .map_err(|e| Error::Other(format!("Loudness analysis task failed: {}", e)))?
    }

    async fn detect_silence(
        &self,
        path: &Path,
        threshold_dbfs: f64,
        min_duration: f64,
    ) -> Result<SilenceAnalysis> {
        let path = path.to_string_lossy().to_string();

        tokio::task::spawn_blocking(move || {
            detect_silence_blocking(&path, threshold_dbfs, min_duration)
        })
        .await
        .map_err(|e| Error::Other(format!("Silence detection task failed: {}", e)))?
    }

    fn list_input_devices(&self) -> Vec<AudioInputDevice> {
        self.mic_capture.list_devices()
    }

    fn record_start(
        &self,
        device_id: Option<&str>,
        config: RecordCaptureConfig,
    ) -> Result<StreamId> {
        self.mic_capture.start_capture(device_id, config)
    }

    async fn record_stop(&self, stream_id: &str) -> Result<RecordingResult> {
        self.mic_capture.stop_capture(stream_id).await
    }

    fn monitor_data(&self, stream_id: &str) -> Option<MonitorData> {
        self.mic_capture.get_monitor_data(stream_id)
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
        let result = service
            .generate_waveform(Path::new("/nonexistent/file.mp3"))
            .await;
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
        let result = service
            .start_stream(Path::new("/nonexistent/file.mp3"), "session1")
            .await;
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
        assert!(result.unwrap_err().to_string().contains("Stream not found"));
    }

    #[tokio::test]
    async fn test_audio_service_analyze_loudness_nonexistent() {
        let service = create_test_service();
        let result = service
            .analyze_loudness(Path::new("/nonexistent/file.mp3"), -14.0)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_service_detect_silence_nonexistent() {
        let service = create_test_service();
        let result = service
            .detect_silence(Path::new("/nonexistent/file.mp3"), -40.0, 0.5)
            .await;
        assert!(result.is_err());
    }

    #[test]
    fn test_audio_service_trait_object() {
        fn _assert_impl<T: IAudioService>() {}
        _assert_impl::<AudioService>();
    }

    /// Integration test: start audio stream with real mp3 file and verify PCM f32le frames
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

        // Receive a few frames and verify they have the 22-byte PCM header
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
                            // Wire format: pts_us(8) + duration_us(8) + sample_rate(4) + channels(2) = 22 bytes
                            assert!(f.data.len() > 22, "Frame data should have 22-byte header + PCM data");

                            // Parse header
                            let pts_us = i64::from_le_bytes(f.data[0..8].try_into().unwrap());
                            let duration_us = i64::from_le_bytes(f.data[8..16].try_into().unwrap());
                            let sample_rate = u32::from_le_bytes(f.data[16..20].try_into().unwrap());
                            let channels = u16::from_le_bytes(f.data[20..22].try_into().unwrap());

                            assert!(sample_rate > 0, "Sample rate should be > 0, got {}", sample_rate);
                            assert!(channels > 0, "Channels should be > 0, got {}", channels);
                            assert!(pts_us >= 0, "PTS should be >= 0, got {}", pts_us);
                            assert!(duration_us > 0, "Duration should be > 0, got {}", duration_us);

                            // Verify PCM payload is aligned to f32 (4 bytes)
                            let pcm_len = f.data.len() - 22;
                            assert_eq!(pcm_len % 4, 0, "PCM data should be aligned to f32 (4 bytes)");

                            frames_received += 1;
                            if frames_received >= 5 { break; }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }

        assert!(
            frames_received >= 3,
            "Should receive at least 3 PCM frames, got {}",
            frames_received
        );
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
                            assert!(f.data.len() > 22, "Frame should have 22-byte header + PCM data");
                            frames_received += 1;
                            if frames_received >= 5 { break; }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }

        assert!(
            frames_received >= 3,
            "Should receive at least 3 PCM frames from aac, got {}",
            frames_received
        );
        let _ = service.stop_stream(&stream_id).await;
    }
}
