//! MediaStreamService - Unified A/V fMP4 streaming
//!
//! Combines video and audio encoding into a single fMP4 stream.
//! Architecture: Video Encode Thread + Audio Encode Thread → AVPacket channel → Muxing Thread
//!
//! The muxing thread collects encoded packets, feeds them to SegmentBuilder,
//! and broadcasts fMP4 segments via the standard FrameData broadcast channel.

use crate::audio::{
    AudioDecoder, AudioEncoder, AudioEncoderConfig, FfmpegAudioDecoder, FfmpegAudioEncoder,
    SampleFormat,
};
use crate::decoder::{Decoder, HwAccelDecoder, HwAccelType};
use crate::domain::FrameData;
use crate::encoder::{EncodedPacket, Encoder, EncoderConfig, HwAccelEncoder};
use crate::error::{Error, Result};
use crate::media_service::probe_media_info;
use crate::services::impls::segment_builder::{SegmentBuilder, SegmentMode};
use crate::services::impls::stream_loop::{
    create_stream_channels, pack_fmp4_message, ActiveStreams, Fmp4MessageType,
    StreamLoopHandle, WallClockPacer,
};
use crate::services::media::IMediaStreamService;

use neko_types::{AudioCodec, StreamId};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

/// Unified A/V fMP4 stream service
pub struct MediaStreamService {
    gpu_ctx: Option<Arc<crate::gpu::GpuContext>>,
    active_streams: ActiveStreams,
}

impl MediaStreamService {
    pub fn new(gpu_ctx: Option<Arc<crate::gpu::GpuContext>>) -> Self {
        Self {
            gpu_ctx,
            active_streams: ActiveStreams::new(),
        }
    }
}

/// Internal enum for the A/V packet merge channel
enum AVPacket {
    /// Raw pointer to the encoder's AVCodecContext — used once by the muxing thread
    /// to call `avcodec_parameters_from_context()` before writing the init segment.
    ///
    /// Safety: The encoder must remain open until the muxing thread has consumed this.
    /// The video encode thread sends this *before* any Video packets and waits
    /// implicitly (sync_channel backpressure) so the encoder is still alive.
    VideoCodecContext(*const ffmpeg_next::ffi::AVCodecContext),
    Video(EncodedPacket),
    Audio(EncodedPacket),
    /// Signal that video encoding is done
    VideoEof,
    /// Signal that audio encoding is done
    AudioEof,
}

// Safety: The raw pointer in VideoCodecContext is only read once on the muxing thread
// while the encoder is guaranteed to be alive on the video encode thread.
unsafe impl Send for AVPacket {}

impl IMediaStreamService for MediaStreamService {
    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let _gpu_ctx = self.gpu_ctx.clone().ok_or_else(|| {
            Error::Other("GPU context required for media streaming".into())
        })?;

        let path = source.to_string_lossy().to_string();

        // Probe media info
        let media_info: crate::media_service::MediaInfo = tokio::task::spawn_blocking({
            let path = path.clone();
            move || probe_media_info(Path::new(&path))
        })
        .await
        .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        let width = media_info.width;
        let height = media_info.height;
        let fps = media_info.fps;
        let has_audio = media_info.has_audio;

        // Create stream channels (smaller buffer for fMP4 segments which are larger)
        let (stream_id, tx, rx, cancel, state_tx, _state_rx) =
            create_stream_channels(session_id, 32);

        // Encoder configs
        let video_config = EncoderConfig::new(width, height, fps, crate::encoder::VideoCodec::H264)
            .with_preset(crate::encoder::EncoderPreset::Fast)
            .with_hw_encoder(crate::encoder::HwEncoderType::Auto)
            .with_gop_size(1) // All-Intra
            .with_max_b_frames(0);
            // Note: global_header=false (default) — VideoToolbox with global_header
            // produces black frames. Instead, we extract SPS/PPS from the first keyframe.

        let audio_config = AudioEncoderConfig::new(48000, 2, AudioCodec::Opus)
            .with_bitrate(128_000)
            .with_sample_format(SampleFormat::F32);

        // A/V packet merge channel
        let (av_tx, av_rx) = std::sync::mpsc::sync_channel::<AVPacket>(32);

        let cancel_clone = cancel.clone();
        let cancel_clone2 = cancel.clone();
        let cancel_clone3 = cancel.clone();
        let state_tx_clone = state_tx.clone();
        let state_tx_clone2 = state_tx.clone();
        let video_state_rx = state_tx.subscribe();
        let audio_state_rx = state_tx.subscribe();

        let path_v = path.clone();
        let path_a = path.clone();
        let video_config_clone = video_config.clone();
        let audio_config_clone = audio_config.clone();

        // Seek counters for video and audio threads
        let seek_counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let seek_counter_v = seek_counter.clone();
        let seek_counter_a = seek_counter.clone();
        let _seek_counter_m = seek_counter.clone();

        let av_tx_v = av_tx.clone();
        let av_tx_a = av_tx;

        let join_handle = tokio::task::spawn_blocking(move || {
            // =================================================================
            // Video Encode Thread
            // =================================================================
            let encode_cancel = cancel_clone.clone();
            let video_handle = std::thread::spawn(move || {
                let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
                if let Err(e) = decoder.open(&path_v) {
                    tracing::error!("[fMP4] Failed to open video decoder: {}", e);
                    let _ = av_tx_v.send(AVPacket::VideoEof);
                    return;
                }

                let mut encoder = HwAccelEncoder::new();
                if let Err(e) = Encoder::open(&mut encoder, &video_config_clone) {
                    tracing::error!("[fMP4] Failed to open video encoder: {}", e);
                    let _ = av_tx_v.send(AVPacket::VideoEof);
                    return;
                }

                // VideoToolbox generates extradata after encoding the first frame,
                // so we track whether we've sent it yet.
                let mut extradata_sent = false;

                loop {
                    if encode_cancel.is_cancelled() { break; }

                    let state = video_state_rx.borrow().clone();

                    // Handle seek
                    if let Some(time) = state.seek_to {
                        let _ = decoder.seek(time);
                        Encoder::close(&mut encoder);
                        if let Err(e) = Encoder::open(&mut encoder, &video_config_clone) {
                            tracing::error!("[fMP4] Failed to re-open video encoder: {}", e);
                            break;
                        }
                        seek_counter_v.fetch_add(1, std::sync::atomic::Ordering::Release);
                        state_tx_clone.send_modify(|s| s.seek_to = None);
                    }

                    if state.paused {
                        std::thread::sleep(std::time::Duration::from_millis(16));
                        continue;
                    }

                    // Decode next GPU frame
                    let gpu_texture = match decoder.decode_next_gpu() {
                        Ok(Some(t)) => t,
                        Ok(None) => {
                            let state = video_state_rx.borrow().clone();
                            if let Some(region) = &state.loop_region {
                                let _ = decoder.seek(region.in_point);
                                continue;
                            }
                            break; // EOF
                        }
                        Err(e) => {
                            tracing::warn!("[fMP4] Video decode error: {}", e);
                            break;
                        }
                    };

                    let pts = gpu_texture.pts;
                    let gpu_handle = match gpu_texture.handle {
                        #[cfg(target_os = "macos")]
                        crate::decoder::GpuTextureHandle::VideoToolbox { io_surface, .. } => io_surface,
                        #[allow(unreachable_patterns)]
                        _ => {
                            tracing::warn!("[fMP4] Unsupported GPU texture handle");
                            break;
                        }
                    };

                    match Encoder::encode_frame_gpu(&mut encoder, gpu_handle, pts) {
                        Ok(packets) => {
                            // After first encode, send codec context pointer so the
                            // muxing thread can call avcodec_parameters_from_context()
                            if !extradata_sent {
                                if let Some(ctx_ptr) = encoder.codec_context_ptr() {
                                    tracing::info!("[fMP4] Sending encoder codec context to muxer");
                                    let _ = av_tx_v.send(AVPacket::VideoCodecContext(ctx_ptr));
                                    extradata_sent = true;
                                }
                            }
                            for p in packets {
                                if av_tx_v.send(AVPacket::Video(p)).is_err() {
                                    return;
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("[fMP4] Video encode error: {}", e);
                            break;
                        }
                    }
                }

                // Flush encoder
                if let Ok(packets) = Encoder::flush(&mut encoder) {
                    for p in packets {
                        let _ = av_tx_v.send(AVPacket::Video(p));
                    }
                }
                Encoder::close(&mut encoder);
                let _ = av_tx_v.send(AVPacket::VideoEof);
            });

            // =================================================================
            // Audio Encode Thread (only if source has audio)
            // =================================================================
            let audio_handle: Option<std::thread::JoinHandle<()>> = if has_audio {
                let encode_cancel = cancel_clone2.clone();
                Some(std::thread::spawn(move || {
                    let mut decoder = FfmpegAudioDecoder::new()
                        .with_output_format(SampleFormat::F32)
                        .with_output_sample_rate(48000)
                        .with_output_channels(2);
                    if let Err(e) = decoder.open(&path_a) {
                        tracing::error!("[fMP4] Failed to open audio decoder: {}", e);
                        let _ = av_tx_a.send(AVPacket::AudioEof);
                        return;
                    }

                    let mut encoder = FfmpegAudioEncoder::new();
                    if let Err(e) = AudioEncoder::open(&mut encoder, &audio_config_clone) {
                        tracing::error!("[fMP4] Failed to open audio encoder: {}", e);
                        let _ = av_tx_a.send(AVPacket::AudioEof);
                        return;
                    }

                    loop {
                        if encode_cancel.is_cancelled() { break; }

                        let state = audio_state_rx.borrow().clone();

                        if let Some(time) = state.seek_to {
                            let _ = AudioDecoder::seek(&mut decoder, time);
                            AudioEncoder::close(&mut encoder);
                            if let Err(e) = AudioEncoder::open(&mut encoder, &audio_config_clone) {
                                tracing::error!("[fMP4] Failed to re-open audio encoder: {}", e);
                                break;
                            }
                            seek_counter_a.fetch_add(1, std::sync::atomic::Ordering::Release);
                            state_tx_clone2.send_modify(|s| s.seek_to = None);
                        }

                        if state.paused {
                            std::thread::sleep(std::time::Duration::from_millis(16));
                            continue;
                        }

                        match AudioDecoder::decode_next(&mut decoder) {
                            Ok(Some(frame)) => {
                                match AudioEncoder::encode_frame(&mut encoder, &frame.data, frame.samples) {
                                    Ok(packets) => {
                                        for p in &packets {
                                            // Convert audio EncodedAudioPacket to EncodedPacket
                                            let ep = EncodedPacket {
                                                data: p.data.clone(),
                                                pts: p.pts,
                                                dts: p.pts,
                                                is_keyframe: true, // Opus packets are always key
                                                duration: p.duration,
                                                stream_index: 1,
                                            };
                                            if av_tx_a.send(AVPacket::Audio(ep)).is_err() {
                                                return;
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        tracing::warn!("[fMP4] Audio encode error: {}", e);
                                    }
                                }
                            }
                            Ok(None) => {
                                // Flush
                                if let Ok(packets) = AudioEncoder::flush(&mut encoder) {
                                    for p in &packets {
                                        let ep = EncodedPacket {
                                            data: p.data.clone(),
                                            pts: p.pts,
                                            dts: p.pts,
                                            is_keyframe: true,
                                            duration: p.duration,
                                            stream_index: 1,
                                        };
                                        let _ = av_tx_a.send(AVPacket::Audio(ep));
                                    }
                                }
                                let state = audio_state_rx.borrow().clone();
                                if state.loop_region.is_some() {
                                    AudioDecoder::close(&mut decoder);
                                    if decoder.open(&path_a).is_err() { break; }
                                    AudioEncoder::close(&mut encoder);
                                    if AudioEncoder::open(&mut encoder, &audio_config_clone).is_err() { break; }
                                } else {
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::warn!("[fMP4] Audio decode error: {}", e);
                                break;
                            }
                        }
                    }
                    let _ = av_tx_a.send(AVPacket::AudioEof);
                }))
            } else {
                None
            };

            // =================================================================
            // Muxing + Pacing Thread (runs on spawn_blocking thread)
            // =================================================================
            let audio_cfg = if has_audio { Some(&audio_config) } else { None };
            let mut builder = match SegmentBuilder::new(&video_config, audio_cfg, SegmentMode::FixedFrames(15)) {
                Ok(b) => b,
                Err(e) => {
                    tracing::error!("[fMP4] Failed to create SegmentBuilder: {}", e);
                    cancel_clone3.cancel();
                    let _ = video_handle.join();
                    if let Some(h) = audio_handle { let _ = h.join(); }
                    return;
                }
            };

            // Wait for codec context + first keyframe before writing init segment
            let mut init_sent = false;
            let mut codec_params_copied = false;

            // DEBUG: dump fMP4 data to file for analysis
            let debug_file = std::fs::File::create("/tmp/debug_fmp4.mp4").ok();
            let mut debug_writer = debug_file.map(std::io::BufWriter::new);
            // DEBUG: dump raw H.264 packets to file (before muxing)
            let debug_h264_file = std::fs::File::create("/tmp/debug_raw.h264").ok();
            let mut debug_h264_writer = debug_h264_file.map(std::io::BufWriter::new);
            let mut debug_h264_count = 0u32;

            let mut pacer = WallClockPacer::new(fps, 1.0);
            let mut video_eof = false;
            let mut audio_eof = !has_audio; // If no audio, treat as already done
            let mut last_timestamp = 0.0;

            // Buffer video packets received before init segment is ready
            let mut pending_video: Vec<EncodedPacket> = Vec::new();

            loop {
                if cancel_clone3.is_cancelled() { break; }
                if video_eof && audio_eof { break; }

                // Receive next A/V packet
                match av_rx.recv_timeout(std::time::Duration::from_millis(100)) {
                    Ok(AVPacket::VideoCodecContext(encoder_ctx)) => {
                        // Copy basic codec parameters (width, height, codec type).
                        // Without global_header, extradata will be empty — we'll set
                        // it from the first keyframe below.
                        unsafe {
                            if let Err(e) = builder.copy_video_params_from_encoder(encoder_ctx) {
                                tracing::error!("[fMP4] Failed to copy encoder params: {}", e);
                                break;
                            }
                        }
                        codec_params_copied = true;
                        tracing::info!("[fMP4] Codec params copied (extradata will come from first keyframe)");

                        // Try to produce init segment if we already have a pending keyframe
                        if !pending_video.is_empty() && pending_video[0].is_keyframe {
                            if let Err(e) = builder.set_video_extradata_from_keyframe(&pending_video[0].data) {
                                tracing::error!("[fMP4] Failed to set extradata from keyframe: {}", e);
                                break;
                            }
                            match builder.init_segment() {
                                Ok(init) => {
                                    if let Some(ref mut w) = debug_writer {
                                        use std::io::Write;
                                        let _ = w.write_all(&init);
                                        let _ = w.flush();
                                    }
                                    let msg = pack_fmp4_message(Fmp4MessageType::Init, &init, 0.0);
                                    let _ = tx.send(msg);
                                    init_sent = true;
                                    tracing::info!("[fMP4] Init segment sent: {} bytes", init.len());
                                    // Flush pending video packets
                                    for pv in pending_video.drain(..) {
                                        last_timestamp = pv.pts as f64 / fps;
                                        if let Ok(Some(segment)) = builder.write_video(&pv) {
                                            if let Some(ref mut w) = debug_writer {
                                                use std::io::Write;
                                                let _ = w.write_all(&segment);
                                                let _ = w.flush();
                                            }
                                            let msg = pack_fmp4_message(
                                                Fmp4MessageType::Segment, &segment, last_timestamp,
                                            );
                                            let _ = tx.send(msg);
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::error!("[fMP4] Failed to produce init segment: {}", e);
                                    break;
                                }
                            }
                        }
                    }
                    Ok(AVPacket::Video(p)) => {
                        // DEBUG: write raw H.264 Annex B packet data
                        if debug_h264_count < 100 {
                            if let Some(ref mut w) = debug_h264_writer {
                                use std::io::Write;
                                let _ = w.write_all(&p.data);
                                let _ = w.flush();
                                debug_h264_count += 1;
                            }
                        }

                        // If init not sent yet, check if we can produce it now
                        if !init_sent {
                            pending_video.push(p);

                            // Need both: codec params + first keyframe
                            if codec_params_copied && pending_video[0].is_keyframe {
                                if let Err(e) = builder.set_video_extradata_from_keyframe(&pending_video[0].data) {
                                    tracing::error!("[fMP4] Failed to set extradata from keyframe: {}", e);
                                    break;
                                }
                                match builder.init_segment() {
                                    Ok(init) => {
                                        if let Some(ref mut w) = debug_writer {
                                            use std::io::Write;
                                            let _ = w.write_all(&init);
                                            let _ = w.flush();
                                        }
                                        let msg = pack_fmp4_message(Fmp4MessageType::Init, &init, 0.0);
                                        let _ = tx.send(msg);
                                        init_sent = true;
                                        tracing::info!("[fMP4] Init segment sent: {} bytes", init.len());
                                        // Flush pending video packets
                                        for pv in pending_video.drain(..) {
                                            last_timestamp = pv.pts as f64 / fps;
                                            if let Ok(Some(segment)) = builder.write_video(&pv) {
                                                if let Some(ref mut w) = debug_writer {
                                                    use std::io::Write;
                                                    let _ = w.write_all(&segment);
                                                    let _ = w.flush();
                                                }
                                                let msg = pack_fmp4_message(
                                                    Fmp4MessageType::Segment, &segment, last_timestamp,
                                                );
                                                let _ = tx.send(msg);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        tracing::error!("[fMP4] Failed to produce init segment: {}", e);
                                        break;
                                    }
                                }
                            }
                            continue;
                        }

                        last_timestamp = p.pts as f64 / fps;
                        match builder.write_video(&p) {
                            Ok(Some(segment)) => {
                                if let Some(ref mut w) = debug_writer {
                                    use std::io::Write;
                                    let _ = w.write_all(&segment);
                                    let _ = w.flush();
                                }
                                let msg = pack_fmp4_message(
                                    Fmp4MessageType::Segment,
                                    &segment,
                                    last_timestamp,
                                );
                                let _ = tx.send(msg);
                            }
                            Ok(None) => {}
                            Err(e) => {
                                tracing::warn!("[fMP4] write_video error: {}", e);
                            }
                        }
                        pacer.wait_for_next_frame();
                    }
                    Ok(AVPacket::Audio(p)) => {
                        if !init_sent { continue; }
                        if let Err(e) = builder.write_audio(&p) {
                            tracing::warn!("[fMP4] write_audio error: {}", e);
                        }
                    }
                    Ok(AVPacket::VideoEof) => {
                        video_eof = true;
                        if init_sent {
                            if let Ok(Some(segment)) = builder.force_flush() {
                                let msg = pack_fmp4_message(
                                    Fmp4MessageType::Segment,
                                    &segment,
                                    last_timestamp,
                                );
                                let _ = tx.send(msg);
                            }
                        }
                    }
                    Ok(AVPacket::AudioEof) => {
                        audio_eof = true;
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        pacer.reset();
                        continue;
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }

            // Wait for encode threads
            let _ = video_handle.join();
            if let Some(h) = audio_handle {
                let _ = h.join();
            }

            tracing::info!("[fMP4] Stream ended, {} segments produced", builder.segment_sequence());
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

    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.seek_to = Some(time_seconds))
            .await
    }

    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.speed = speed)
            .await
    }
}
