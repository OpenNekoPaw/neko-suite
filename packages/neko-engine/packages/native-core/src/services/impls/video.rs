//! VideoService implementation
//!
//! Provides video-related operations: probing, capture, extraction,
//! streaming, transcoding, keyframe analysis, waveform generation, and proxy creation.

use crate::decoder::{Decoder, HwAccelDecoder, HwAccelType};
use crate::domain::{CaptureOptions, ExtractOptions, ExtractType, FrameData, TaskHandle, TranscodeOptions};
use crate::encoder::{
    ContainerFormat, Encoder, EncoderConfig, FfmpegMuxer, HwAccelEncoder, Muxer,
};
use crate::error::{Error, Result};
use crate::gpu::{ColorSpace, GpuContext, Nv12Renderer, Nv12TextureImporter};
use crate::keyframe_cache::{IdrScanner, KeyframeInfo};
use crate::media_service::{encode_rgba_to_jpeg, extract_subtitles, probe_media_info};
use crate::services::impls::common::generate_waveform_blocking;
use crate::services::impls::stream_loop::{
    pack_h264_frame, ActiveStreams, create_stream_channels, FramePacer, PlaybackState,
    StreamLoopHandle,
};
use crate::services::{ITaskService, IVideoService};
use neko_types::{FrameFormat, MediaInfo, ResourceId, StreamId, WaveformData};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::broadcast;

// =============================================================================
// Type conversion helpers: neko_types ↔ crate::encoder types
// =============================================================================

/// Convert neko_types::VideoCodec → crate::encoder::VideoCodec
fn to_encoder_codec(codec: neko_types::VideoCodec) -> crate::encoder::VideoCodec {
    match codec {
        neko_types::VideoCodec::H264 => crate::encoder::VideoCodec::H264,
        neko_types::VideoCodec::H265 => crate::encoder::VideoCodec::H265,
        neko_types::VideoCodec::Vp9 => crate::encoder::VideoCodec::Vp9,
        neko_types::VideoCodec::ProRes => crate::encoder::VideoCodec::ProRes,
        // Av1 not supported by encoder, fall back to H264
        neko_types::VideoCodec::Av1 => crate::encoder::VideoCodec::H264,
    }
}

/// Convert neko_types::HwEncoderType → crate::encoder::HwEncoderType
fn to_encoder_hw_type(hw: neko_types::HwEncoderType) -> crate::encoder::HwEncoderType {
    match hw {
        neko_types::HwEncoderType::None => crate::encoder::HwEncoderType::None,
        neko_types::HwEncoderType::Auto => crate::encoder::HwEncoderType::Auto,
        neko_types::HwEncoderType::VideoToolbox => crate::encoder::HwEncoderType::VideoToolbox,
        neko_types::HwEncoderType::Nvenc => crate::encoder::HwEncoderType::Nvenc,
        neko_types::HwEncoderType::Vaapi => crate::encoder::HwEncoderType::Vaapi,
        neko_types::HwEncoderType::Qsv => crate::encoder::HwEncoderType::Qsv,
        // Amf not supported by encoder, fall back to Auto
        neko_types::HwEncoderType::Amf => crate::encoder::HwEncoderType::Auto,
    }
}

/// Convert neko_types::EncoderPreset → crate::encoder::EncoderPreset
fn to_encoder_preset(preset: neko_types::EncoderPreset) -> crate::encoder::EncoderPreset {
    match preset {
        neko_types::EncoderPreset::Ultrafast => crate::encoder::EncoderPreset::Ultrafast,
        neko_types::EncoderPreset::Fast => crate::encoder::EncoderPreset::Fast,
        neko_types::EncoderPreset::Medium => crate::encoder::EncoderPreset::Medium,
        neko_types::EncoderPreset::Slow => crate::encoder::EncoderPreset::Slow,
        neko_types::EncoderPreset::Veryslow => crate::encoder::EncoderPreset::Veryslow,
    }
}

/// Infer ContainerFormat from output file extension
fn container_from_path(path: &Path) -> ContainerFormat {
    match path.extension().and_then(|e| e.to_str()) {
        Some("mp4") | Some("m4v") => ContainerFormat::Mp4,
        Some("mkv") => ContainerFormat::Mkv,
        Some("webm") => ContainerFormat::WebM,
        Some("mov") => ContainerFormat::Mov,
        _ => ContainerFormat::Mp4, // Default
    }
}

/// VideoService implementation
///
/// Wraps decoder, encoder, keyframe_cache, and media_service modules.
pub struct VideoService {
    /// GPU context for hardware acceleration
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Task service for registering long-running operations
    #[allow(dead_code)]
    task_service: Arc<dyn ITaskService + Send + Sync>,
    /// Active stream loops
    active_streams: Arc<ActiveStreams>,
}

impl VideoService {
    /// Create a new VideoService
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
            file_size: 0, // Not available from probe
            video_streams: vec![neko_types::VideoStreamInfo {
                index: 0,
                codec: info.codec,
                width: info.width,
                height: info.height,
                fps: info.fps,
                bitrate: info.bitrate,
                pixel_format: "yuv420p".to_string(), // Default, not available from probe
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

    /// Read texture data back to CPU buffer
    fn read_texture_to_buffer(
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        let device = ctx.device();
        let queue = ctx.queue();

        let bytes_per_row = width * 4;
        let padded_bytes_per_row = (bytes_per_row + 255) & !255; // Align to 256

        let buffer_size = (padded_bytes_per_row * height) as u64;
        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Texture Readback Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Texture Readback Encoder"),
        });

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &staging_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        queue.submit(std::iter::once(encoder.finish()));

        // Map buffer and read data
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });

        device.poll(wgpu::Maintain::Wait);
        rx.recv()
            .map_err(|_| Error::Other("Buffer map channel closed".to_string()))?
            .map_err(|e| Error::Other(format!("Buffer map error: {:?}", e)))?;

        let data = buffer_slice.get_mapped_range();

        // Remove padding if necessary
        let result = if padded_bytes_per_row == bytes_per_row {
            data.to_vec()
        } else {
            let mut result = Vec::with_capacity((width * height * 4) as usize);
            for row in 0..height {
                let start = (row * padded_bytes_per_row) as usize;
                let end = start + bytes_per_row as usize;
                result.extend_from_slice(&data[start..end]);
            }
            result
        };

        drop(data);
        staging_buffer.unmap();

        Ok(result)
    }
}

impl IVideoService for VideoService {
    async fn probe(&self, path: &Path) -> Result<MediaInfo> {
        // Use blocking task for FFmpeg probe
        let path = path.to_path_buf();
        let info = tokio::task::spawn_blocking(move || probe_media_info(&path))
            .await
            .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        Ok(Self::convert_media_info(info))
    }

    async fn capture(
        &self,
        resource_id: &ResourceId,
        time_seconds: f64,
        options: CaptureOptions,
    ) -> Result<FrameData> {
        // Get the path from resource_id (for now, resource_id contains the path)
        let path = resource_id.as_str().to_string();
        let gpu_ctx = self.gpu_ctx.clone();
        let quality = options.quality;
        let format = options.format;

        // Run capture in blocking task since decoder is not async
        let result = tokio::task::spawn_blocking(move || -> Result<FrameData> {
            // Create hardware decoder
            let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);

            // Open video file
            let media_info = decoder.open(&path)?;
            let width = media_info.width;
            let height = media_info.height;

            // Decode frame at specified time
            let gpu_texture = decoder
                .decode_gpu_at(time_seconds)?
                .ok_or_else(|| Error::Other(format!("No frame at time {}", time_seconds)))?;

            // If we have GPU context, use GPU pipeline for NV12 -> RGBA conversion
            if let Some(ctx) = gpu_ctx {
                // Import NV12 texture to wgpu
                let importer = Nv12TextureImporter::new(Arc::clone(&ctx));
                let nv12_texture = importer.import(&gpu_texture)?;

                // Convert NV12 to RGBA using GPU
                let renderer = Nv12Renderer::new(Arc::clone(&ctx))?;
                let output_texture = renderer.create_output_texture(width, height);
                let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
                renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                // Read RGBA data from GPU
                let rgba_data = Self::read_texture_to_buffer(&ctx, &output_texture, width, height)?;

                // Encode based on format
                let (data, output_format) = match format {
                    FrameFormat::Jpeg => {
                        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)?;
                        (jpeg_data, FrameFormat::Jpeg)
                    }
                    FrameFormat::Rgba => (rgba_data, FrameFormat::Rgba),
                    _ => {
                        // Default to JPEG for other formats
                        let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)?;
                        (jpeg_data, FrameFormat::Jpeg)
                    }
                };

                Ok(FrameData {
                    data,
                    width,
                    height,
                    format: output_format,
                    timestamp: time_seconds,
                })
            } else {
                // CPU fallback - decode to CPU frame
                // For now, return error as CPU path is not implemented
                Err(Error::Other("GPU context required for capture".to_string()))
            }
        })
        .await
        .map_err(|e| Error::Other(format!("Capture task failed: {}", e)))??;

        Ok(result)
    }

    async fn extract(
        &self,
        resource_id: &ResourceId,
        options: ExtractOptions,
        _task_handle: Option<TaskHandle>,
    ) -> Result<Vec<FrameData>> {
        match options.extract_type {
            ExtractType::Subtitles => {
                let path = resource_id.as_str().to_string();
                let tracks = tokio::task::spawn_blocking(move || extract_subtitles(&path))
                    .await
                    .map_err(|e| Error::Other(format!("Subtitle extraction task failed: {}", e)))??;

                // Convert internal types to neko_types (which has Serialize)
                let typed_tracks: Vec<neko_types::ExtractedSubtitleTrack> = tracks
                    .into_iter()
                    .map(|t| neko_types::ExtractedSubtitleTrack {
                        index: t.stream_index,
                        language: t.language,
                        cues: t
                            .cues
                            .into_iter()
                            .map(|c| neko_types::SubtitleCue {
                                start_time: c.start_time,
                                end_time: c.end_time,
                                text: c.text,
                            })
                            .collect(),
                    })
                    .collect();

                let json = serde_json::to_vec(&typed_tracks)
                    .map_err(|e| Error::Other(format!("Subtitle serialization failed: {}", e)))?;

                Ok(vec![FrameData {
                    data: json,
                    width: 0,
                    height: 0,
                    format: FrameFormat::Rgba, // Marker; actual data is JSON
                    timestamp: 0.0,
                }])
            }
            ExtractType::Frame { time } => {
                let frame = self
                    .capture(resource_id, time, CaptureOptions::default())
                    .await?;
                Ok(vec![frame])
            }
            ExtractType::FrameRange { start, end, fps } => {
                let frame_interval = 1.0 / fps;
                let mut frames = Vec::new();
                let mut time = start;
                while time <= end {
                    let frame = self
                        .capture(resource_id, time, CaptureOptions::default())
                        .await?;
                    frames.push(frame);
                    time += frame_interval;
                }
                Ok(frames)
            }
        }
    }

    async fn start_stream(
        &self,
        resource_id: &ResourceId,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let gpu_ctx = self.gpu_ctx.clone().ok_or_else(|| {
            Error::Other("GPU context required for video streaming".to_string())
        })?;

        let path = resource_id.as_str().to_string();

        // Probe to get video info
        let media_info = tokio::task::spawn_blocking({
            let path = path.clone();
            move || probe_media_info(Path::new(&path))
        })
        .await
        .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        let width = media_info.width;
        let height = media_info.height;
        let fps = media_info.fps;

        // Create stream channels
        let (stream_id, tx, rx, cancel, state_tx, state_rx) =
            create_stream_channels(session_id, 64);

        // Spawn decoding loop
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            let mut pacer = FramePacer::new(fps, 1.0);
            let mut current_speed = 1.0;

            // Initialize decoder and encoder in blocking context
            let init_result = tokio::task::spawn_blocking({
                let path = path.clone();
                move || -> Result<(HwAccelDecoder, HwAccelEncoder)> {
                    let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
                    decoder.open(&path)?;

                    let mut encoder = HwAccelEncoder::new();
                    let encoder_config = EncoderConfig::new(width, height, fps, crate::encoder::VideoCodec::H264)
                        .with_preset(crate::encoder::EncoderPreset::Fast)
                        .with_hw_encoder(crate::encoder::HwEncoderType::Auto)
                        .with_gop_size(30)
                        .with_max_b_frames(0);
                    Encoder::open(&mut encoder, &encoder_config)?;

                    Ok((decoder, encoder))
                }
            })
            .await;

            let (decoder, encoder) = match init_result {
                Ok(Ok((d, e))) => (d, e),
                _ => {
                    tracing::error!("Failed to initialize video stream decoder/encoder");
                    return;
                }
            };

            let decoder = std::sync::Arc::new(std::sync::Mutex::new(decoder));
            let encoder = std::sync::Arc::new(std::sync::Mutex::new(encoder));

            loop {
                tokio::select! {
                    biased;
                    _ = cancel_clone.cancelled() => break,
                    _ = pacer.tick() => {
                        let state = state_rx.borrow().clone();

                        // Handle seek request
                        if let Some(time) = state.seek_to {
                            let dec = decoder.clone();
                            let _ = tokio::task::spawn_blocking(move || {
                                let mut d = dec.lock().unwrap();
                                d.seek(time)
                            }).await;
                            // Note: seek_to is not cleared here since VideoService
                            // doesn't expose pause/seek controls (Timeline does)
                        }

                        if state.paused { continue; }

                        // Update speed if changed
                        if (state.speed - current_speed).abs() > 0.001 {
                            current_speed = state.speed;
                            pacer.update_speed(current_speed);
                        }

                        let dec = decoder.clone();
                        let enc = encoder.clone();
                        let frame_result = tokio::task::spawn_blocking(move || -> Result<Vec<FrameData>> {
                            let mut d = dec.lock().unwrap();
                            let gpu_texture = match d.decode_next_gpu()? {
                                Some(t) => t,
                                None => return Ok(vec![]),
                            };

                            let tex_width = gpu_texture.width;
                            let tex_height = gpu_texture.height;
                            let pts = gpu_texture.pts;

                            // Encode GPU texture directly to H.264 (zero-copy on macOS)
                            let mut e = enc.lock().unwrap();
                            let gpu_handle = match gpu_texture.handle {
                                #[cfg(target_os = "macos")]
                                crate::decoder::GpuTextureHandle::VideoToolbox { io_surface, .. } => io_surface,
                                _ => return Err(Error::Other("Unsupported GPU texture handle for encoding".to_string())),
                            };
                            let packets = Encoder::encode_frame_gpu(&mut *e, gpu_handle, pts)?;

                            let frames: Vec<FrameData> = packets
                                .iter()
                                .map(|p| pack_h264_frame(p, tex_width, tex_height))
                                .collect();

                            Ok(frames)
                        }).await;

                        match frame_result {
                            Ok(Ok(frames)) if !frames.is_empty() => {
                                for frame in frames {
                                    let _ = tx.send(frame);
                                }
                            }
                            Ok(Ok(_)) => {
                                // No frame (EOF) - check loop
                                let state = state_rx.borrow().clone();
                                if let Some(region) = &state.loop_region {
                                    let dec = decoder.clone();
                                    let start = region.in_point;
                                    let _ = tokio::task::spawn_blocking(move || {
                                        dec.lock().unwrap().seek(start)
                                    }).await;
                                } else {
                                    break;
                                }
                            }
                            Ok(Err(e)) => {
                                tracing::warn!("Video stream decode error: {}", e);
                                break;
                            }
                            Err(e) => {
                                tracing::error!("Video stream task panic: {}", e);
                                break;
                            }
                        }
                    }
                }
            }

            // Flush encoder
            let enc = encoder.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let mut e = enc.lock().unwrap();
                if let Ok(packets) = Encoder::flush(&mut *e) {
                    for p in &packets {
                        let _ = tx.send(pack_h264_frame(p, width, height));
                    }
                }
                Encoder::close(&mut *e);
            }).await;
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

    async fn transcode(
        &self,
        resource_id: &ResourceId,
        output_path: &Path,
        options: TranscodeOptions,
        _task_handle: Option<TaskHandle>,
    ) -> Result<()> {
        let path = resource_id.as_str().to_string();
        let output = output_path.to_path_buf();

        tokio::task::spawn_blocking(move || -> Result<()> {
            // Open decoder
            let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
            let media_info = decoder.open(&path)?;

            let width = options.resolution.map(|r| r.width).unwrap_or(media_info.width);
            let height = options.resolution.map(|r| r.height).unwrap_or(media_info.height);
            let fps = media_info.fps;

            // Configure encoder (convert neko_types → encoder types)
            let codec = to_encoder_codec(options.video_codec);
            let mut encoder_config = EncoderConfig::new(width, height, fps, codec);
            if let Some(bitrate) = options.bitrate {
                encoder_config = encoder_config.with_bitrate(bitrate);
            }
            encoder_config = encoder_config
                .with_preset(to_encoder_preset(options.preset))
                .with_hw_encoder(to_encoder_hw_type(options.hw_encoder));

            // Open encoder
            let mut encoder = HwAccelEncoder::new();
            Encoder::open(&mut encoder, &encoder_config)?;

            // Open muxer
            let mut muxer = FfmpegMuxer::new();
            let container = container_from_path(&output);
            muxer.open(output.to_str().unwrap_or("output.mp4"), container)?;
            muxer.add_video_stream(&encoder_config)?;
            muxer.write_header()?;

            // Decode → Encode → Mux loop
            loop {
                let nv12_texture = match decoder.decode_next_gpu()? {
                    Some(t) => t,
                    None => break,
                };

                // Use GPU zero-copy encoding path
                let gpu_handle = match nv12_texture.handle {
                    #[cfg(target_os = "macos")]
                    crate::decoder::GpuTextureHandle::VideoToolbox { io_surface, .. } => io_surface,
                    _ => return Err(Error::Other("Unsupported GPU texture handle for encoding".to_string())),
                };
                let packets = encoder.encode_frame_gpu(gpu_handle, nv12_texture.pts)?;
                for packet in &packets {
                    muxer.write_video_packet(packet)?;
                }
            }

            // Flush encoder
            let flush_packets = Encoder::flush(&mut encoder)?;
            for packet in &flush_packets {
                muxer.write_video_packet(packet)?;
            }

            Encoder::close(&mut encoder);
            muxer.finish()?;

            Ok(())
        })
        .await
        .map_err(|e| Error::Other(format!("Transcode task failed: {}", e)))?
    }

    async fn get_keyframes(&self, resource_id: &ResourceId) -> Result<Vec<KeyframeInfo>> {
        let path = resource_id.as_str().to_string();
        tokio::task::spawn_blocking(move || {
            let scanner = IdrScanner::new(&path)?;
            scanner.scan_idr_frames()
        })
        .await
        .map_err(|e| Error::Other(format!("Keyframe scan task failed: {}", e)))?
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

    async fn generate_proxy(
        &self,
        resource_id: &ResourceId,
        output_path: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<()> {
        // Probe to get original resolution
        let path = resource_id.as_str().to_string();
        let media_info = tokio::task::spawn_blocking({
            let path = path.clone();
            move || probe_media_info(Path::new(&path))
        })
        .await
        .map_err(|e| Error::Other(format!("Probe task failed: {}", e)))??;

        // Proxy: 1/4 resolution, max 960x540, low bitrate, fast preset
        let proxy_width = (media_info.width / 4).max(320);
        let proxy_height = (media_info.height / 4).max(180);
        let (proxy_width, proxy_height) = if proxy_width > 960 {
            let scale = 960.0 / proxy_width as f64;
            ((proxy_width as f64 * scale) as u32, (proxy_height as f64 * scale) as u32)
        } else {
            (proxy_width, proxy_height)
        };
        // Ensure even dimensions
        let proxy_width = proxy_width & !1;
        let proxy_height = proxy_height & !1;

        let proxy_options = TranscodeOptions {
            video_codec: neko_types::VideoCodec::H264,
            resolution: Some(neko_types::Resolution::new(proxy_width, proxy_height)),
            bitrate: Some(1_000_000), // 1 Mbps
            hw_encoder: neko_types::HwEncoderType::Auto,
            preset: neko_types::EncoderPreset::Fast,
        };

        self.transcode(resource_id, output_path, proxy_options, task_handle)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::TaskService;

    fn create_test_service() -> VideoService {
        let task_service = Arc::new(TaskService::new());
        VideoService::new(None, task_service)
    }

    #[tokio::test]
    async fn test_video_service_probe_nonexistent() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.mp4")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_get_keyframes_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let result = service.get_keyframes(&resource_id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_generate_waveform_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let result = service.generate_waveform(&resource_id, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_extract_subtitles_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let options = ExtractOptions {
            extract_type: ExtractType::Subtitles,
            time_range: None,
        };
        let result = service.extract(&resource_id, options, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_extract_frame_no_gpu() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let options = ExtractOptions {
            extract_type: ExtractType::Frame { time: 1.0 },
            time_range: None,
        };
        let result = service.extract(&resource_id, options, None).await;
        // Should fail because no GPU context or file doesn't exist
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_extract_frame_range_no_gpu() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let options = ExtractOptions {
            extract_type: ExtractType::FrameRange {
                start: 0.0,
                end: 5.0,
                fps: 1.0,
            },
            time_range: None,
        };
        let result = service.extract(&resource_id, options, None).await;
        // Should fail because no GPU context or file doesn't exist
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_start_stream_no_gpu() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("test".to_string());
        let result = service.start_stream(&resource_id, "session1").await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("GPU context required"));
    }

    #[tokio::test]
    async fn test_video_service_stop_stream_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.stop_stream(&stream_id).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Stream not found"));
    }

    #[tokio::test]
    async fn test_video_service_transcode_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let result = service
            .transcode(
                &resource_id,
                Path::new("/tmp/out.mp4"),
                TranscodeOptions::default(),
                None,
            )
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_video_service_generate_proxy_nonexistent() {
        let service = create_test_service();
        let resource_id = ResourceId::from_string("/nonexistent/file.mp4".to_string());
        let result = service
            .generate_proxy(&resource_id, Path::new("/tmp/proxy.mp4"), None)
            .await;
        assert!(result.is_err());
    }
}
