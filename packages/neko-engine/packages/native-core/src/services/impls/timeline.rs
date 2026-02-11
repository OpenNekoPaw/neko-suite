//! TimelineService implementation
//!
//! Provides timeline composition and playback operations.
//! Supports GPU-accelerated compositing, H.264 preview streaming,
//! and full playback control (pause/resume/speed/loop/seek).

use crate::decoder::{Decoder, HwAccelDecoder, HwAccelType};
use crate::domain::{FrameData, MediaReference, StreamConfig, Timeline, TimelineProjectInfo};
use crate::encoder::{Encoder, EncoderConfig, HwAccelEncoder};
use crate::jvi::JviLoader;
use crate::error::{Error, Result};
use crate::gpu::{
    BlendMode as GpuBlendMode, ColorSpace, CompositeLayer, GpuCompositor, GpuContext,
    LayerPixelFormat, Nv12OutputBuffers, Nv12Renderer, Nv12TextureImporter, RgbaToNv12Converter,
    Transform2D,
};
use crate::keyframe_cache::IdrScanner;
use crate::services::impls::stream_loop::{
    pack_h264_frame, ActiveStreams, create_stream_channels, FramePacer, StreamLoopHandle,
};
use crate::services::{ITaskService, ITimelineService};
use neko_types::{BlendMode, FrameFormat, LoopRegion, StreamId};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::broadcast;

/// TimelineService implementation
///
/// Provides timeline composition, H.264 preview streaming, and playback control.
pub struct TimelineService {
    /// GPU context for compositing
    #[allow(dead_code)]
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Task service for registering long-running operations
    #[allow(dead_code)]
    task_service: Arc<dyn ITaskService + Send + Sync>,
    /// Active stream loops
    active_streams: Arc<ActiveStreams>,
}

impl TimelineService {
    /// Create a new TimelineService
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

    /// Convert domain BlendMode to GPU BlendMode
    fn convert_blend_mode(mode: &BlendMode) -> GpuBlendMode {
        match mode {
            BlendMode::Normal => GpuBlendMode::Normal,
            BlendMode::Multiply => GpuBlendMode::Multiply,
            BlendMode::Screen => GpuBlendMode::Screen,
            BlendMode::Overlay => GpuBlendMode::Overlay,
            BlendMode::Darken => GpuBlendMode::Darken,
            BlendMode::Lighten => GpuBlendMode::Lighten,
            BlendMode::ColorDodge => GpuBlendMode::ColorDodge,
            BlendMode::ColorBurn => GpuBlendMode::ColorBurn,
            BlendMode::HardLight => GpuBlendMode::HardLight,
            BlendMode::SoftLight => GpuBlendMode::SoftLight,
            BlendMode::Difference => GpuBlendMode::Difference,
            BlendMode::Exclusion => GpuBlendMode::Exclusion,
            BlendMode::Hue => GpuBlendMode::Hue,
            BlendMode::Saturation => GpuBlendMode::Saturation,
            BlendMode::Color => GpuBlendMode::Color,
            BlendMode::Luminosity => GpuBlendMode::Luminosity,
        }
    }

    /// Read texture data back to CPU buffer (assumes RGBA8 / 4 bytes per pixel)
    fn read_texture_to_buffer(
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        let device = ctx.device();
        let queue = ctx.queue();

        let bytes_per_pixel = texture.format().block_copy_size(None).unwrap_or(4);
        let bytes_per_row = width * bytes_per_pixel;
        let padded_bytes_per_row = (bytes_per_row + 255) & !255;

        let buffer_size = (padded_bytes_per_row * height) as u64;
        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Timeline Readback Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Timeline Readback Encoder"),
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

        // Unpad rows: copy only the valid bytes_per_row from each padded row
        let unpadded_row_size = bytes_per_row as usize;
        let result = if padded_bytes_per_row == bytes_per_row {
            data.to_vec()
        } else {
            let mut result = Vec::with_capacity(unpadded_row_size * height as usize);
            for row in 0..height {
                let start = (row * padded_bytes_per_row) as usize;
                let end = start + unpadded_row_size;
                result.extend_from_slice(&data[start..end]);
            }
            result
        };

        drop(data);
        staging_buffer.unmap();

        Ok(result)
    }
}

impl ITimelineService for TimelineService {
    async fn probe(&self, jvi_path: &Path) -> Result<TimelineProjectInfo> {
        let path = jvi_path.to_path_buf();

        // Load and parse .jvi file in blocking task (file I/O)
        let info = tokio::task::spawn_blocking(move || -> Result<TimelineProjectInfo> {
            let loader = JviLoader::new();
            let (timeline_data, settings) = loader.load(&path)?;

            // Count elements across all tracks
            let element_count: usize = timeline_data.tracks.iter().map(|t| t.elements.len()).sum();

            // Calculate duration from elements
            let duration = timeline_data
                .tracks
                .iter()
                .flat_map(|t| t.elements.iter())
                .map(|e| e.start_time + e.duration)
                .fold(0.0_f64, f64::max);

            // Collect media references and check file existence
            let base_dir = path.parent().unwrap_or_else(|| Path::new("."));
            let mut media_references = Vec::new();

            for track in &timeline_data.tracks {
                for element in &track.elements {
                    let (element_id, src, media_type) = match &element.element_type {
                        crate::domain::ElementType::Media(m) => {
                            (element.id.clone(), m.src.clone(), "video".to_string())
                        }
                        crate::domain::ElementType::Audio(a) => {
                            (element.id.clone(), a.src.clone(), "audio".to_string())
                        }
                        crate::domain::ElementType::Text(_) => {
                            (element.id.clone(), String::new(), "text".to_string())
                        }
                        _ => {
                            (element.id.clone(), String::new(), "other".to_string())
                        }
                    };

                    // Only add media references for elements with source files
                    if !src.is_empty() {
                        let resolved_path = if Path::new(&src).is_absolute() {
                            PathBuf::from(&src)
                        } else {
                            base_dir.join(&src)
                        };
                        let exists = resolved_path.exists();

                        media_references.push(MediaReference {
                            element_id,
                            path: resolved_path.to_string_lossy().to_string(),
                            exists,
                            media_type,
                        });
                    }
                }
            }

            // Read project name and version from raw JSON
            // (JviLoader converts to Timeline which doesn't preserve these)
            let raw_content = std::fs::read_to_string(&path)
                .map_err(|e| Error::Other(format!("Failed to re-read JVI file: {}", e)))?;
            let raw_json: serde_json::Value = serde_json::from_str(&raw_content)
                .map_err(|e| Error::Other(format!("Failed to re-parse JVI JSON: {}", e)))?;

            let name = raw_json
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string();
            let version = raw_json
                .get("version")
                .and_then(|v| v.as_str())
                .unwrap_or("1.0")
                .to_string();

            Ok(TimelineProjectInfo {
                name,
                version,
                width: settings.width,
                height: settings.height,
                fps: settings.fps,
                duration,
                track_count: timeline_data.tracks.len(),
                element_count,
                media_references,
            })
        })
        .await
        .map_err(|e| Error::Other(format!("Timeline probe task failed: {}", e)))??;

        Ok(info)
    }

    async fn composite(
        &self,
        timeline: &Timeline,
        frame_number: u64,
    ) -> Result<FrameData> {
        let gpu_ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU context required for compositing".to_string()))?
            .clone();

        let time = frame_number as f64 / timeline.fps;
        let width = timeline.resolution.width;
        let height = timeline.resolution.height;

        // Collect visible elements at this time
        let visible_elements = timeline.elements_at_time(time);

        // Decode each element's frame and build composite layers
        let mut layers: Vec<CompositeLayer> = Vec::new();

        for (z_index, element) in visible_elements.iter().enumerate() {
            let source_path = match element.source_path() {
                Some(path) => path,
                None => continue, // Skip non-media elements (text, shape, etc.)
            };

            let source_time = element.get_source_time(time);
            let ctx = gpu_ctx.clone();

            // Decode frame in blocking task
            let decoded_rgba = tokio::task::spawn_blocking(move || -> Result<(Vec<u8>, u32, u32)> {
                let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
                let media_info = decoder.open(&source_path)?;
                let src_width = media_info.width;
                let src_height = media_info.height;

                let gpu_texture = decoder
                    .decode_gpu_at(source_time)?
                    .ok_or_else(|| {
                        Error::Other(format!("No frame at time {} for {}", source_time, source_path))
                    })?;

                // NV12 → RGBA via GPU
                let importer = Nv12TextureImporter::new(Arc::clone(&ctx));
                let nv12_texture = importer.import(&gpu_texture)?;

                let renderer = Nv12Renderer::new(Arc::clone(&ctx))?;
                let output_texture = renderer.create_output_texture(src_width, src_height);
                let output_view =
                    output_texture.create_view(&wgpu::TextureViewDescriptor::default());
                renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                let rgba_data =
                    Self::read_texture_to_buffer(&ctx, &output_texture, src_width, src_height)?;

                Ok((rgba_data, src_width, src_height))
            })
            .await
            .map_err(|e| Error::Other(format!("Element decode task failed: {}", e)))??;

            let (rgba_data, src_width, src_height) = decoded_rgba;

            // Build transform
            let transform = Transform2D {
                x: element.transform.x,
                y: element.transform.y,
                scale_x: element.transform.scale_x,
                scale_y: element.transform.scale_y,
                rotation: element.transform.rotation,
                anchor_x: element.transform.anchor_x,
                anchor_y: element.transform.anchor_y,
                _padding: 0.0,
            };

            layers.push(CompositeLayer {
                data: rgba_data,
                width: src_width,
                height: src_height,
                pixel_format: LayerPixelFormat::Rgba,
                transform,
                opacity: element.opacity as f32,
                blend_mode: Self::convert_blend_mode(&element.blend_mode),
                z_index: z_index as i32,
                mask: None,
                mask_inverted: false,
            });
        }

        // Composite all layers
        let compositor = GpuCompositor::new(gpu_ctx)?;
        let result = compositor.composite(&layers, width, height, [0.0, 0.0, 0.0, 1.0])?;

        Ok(FrameData {
            data: result.data,
            width: result.width,
            height: result.height,
            format: FrameFormat::Rgba,
            timestamp: time,
        })
    }

    async fn start_stream(
        &self,
        timeline: &Timeline,
        session_id: &str,
        config: StreamConfig,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)> {
        let gpu_ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU context required for timeline streaming".to_string()))?
            .clone();

        let fps = config.fps;
        let width = config.resolution.width;
        let height = config.resolution.height;
        let timeline = timeline.clone();

        // Create stream channels
        let (stream_id, tx, rx, cancel, state_tx, state_rx) =
            create_stream_channels(session_id, 64);

        // Spawn composite + encode loop
        let cancel_clone = cancel.clone();
        let join_handle = tokio::spawn(async move {
            let mut pacer = FramePacer::new(fps, 1.0);
            let mut current_speed = 1.0;
            let mut frame_number: u64 = (config.start_time * fps) as u64;
            let mut last_seek: Option<f64> = None;

            // Initialize encoder in blocking context
            let init_result = tokio::task::spawn_blocking({
                move || -> Result<HwAccelEncoder> {
                    let mut encoder = HwAccelEncoder::new();
                    let encoder_config =
                        EncoderConfig::new(width, height, fps, crate::encoder::VideoCodec::H264)
                            .with_preset(crate::encoder::EncoderPreset::Fast)
                            .with_hw_encoder(crate::encoder::HwEncoderType::Auto)
                            .with_gop_size(30)
                            .with_max_b_frames(0);
                    Encoder::open(&mut encoder, &encoder_config)?;
                    Ok(encoder)
                }
            })
            .await;

            let encoder = match init_result {
                Ok(Ok(e)) => e,
                _ => {
                    tracing::error!("Failed to initialize timeline stream encoder");
                    return;
                }
            };

            let encoder = std::sync::Arc::new(std::sync::Mutex::new(encoder));

            loop {
                tokio::select! {
                    biased;
                    _ = cancel_clone.cancelled() => break,
                    _ = pacer.tick() => {
                        let state = state_rx.borrow().clone();

                        // Handle seek request (deduplicate by comparing with last_seek)
                        if let Some(time) = state.seek_to {
                            if last_seek != Some(time) {
                                last_seek = Some(time);
                                frame_number = (time * fps) as u64;
                            }
                        } else {
                            last_seek = None;
                        }

                        if state.paused { continue; }

                        // Update speed if changed
                        if (state.speed - current_speed).abs() > 0.001 {
                            current_speed = state.speed;
                            pacer.update_speed(current_speed);
                        }

                        // Check loop region
                        let current_time = frame_number as f64 / fps;
                        if let Some(region) = &state.loop_region {
                            if current_time >= region.out_point {
                                frame_number = (region.in_point * fps) as u64;
                            }
                        }

                        // Check timeline duration
                        if current_time > timeline.duration && timeline.duration > 0.0 {
                            // Check if looping
                            if let Some(region) = &state.loop_region {
                                frame_number = (region.in_point * fps) as u64;
                            } else {
                                break; // End of timeline
                            }
                        }

                        // Composite frame
                        let time = frame_number as f64 / fps;

                        let ctx = gpu_ctx.clone();
                        let enc = encoder.clone();
                        let tl_width = width;
                        let tl_height = height;
                        let tl_clone = timeline.clone();
                        let current_frame = frame_number;

                        let frame_result = tokio::task::spawn_blocking(move || -> Result<Vec<FrameData>> {
                            let visible_elements = tl_clone.elements_at_time(time);
                            let mut layers: Vec<CompositeLayer> = Vec::new();

                            for (z_index, element) in visible_elements.iter().enumerate() {
                                let source_path = match element.source_path() {
                                    Some(path) => path,
                                    None => continue,
                                };

                                let source_time = element.get_source_time(time);

                                // Decode frame
                                let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
                                let media_info = decoder.open(&source_path)?;
                                let src_width = media_info.width;
                                let src_height = media_info.height;

                                let gpu_texture = match decoder.decode_gpu_at(source_time)? {
                                    Some(t) => t,
                                    None => continue,
                                };

                                // NV12 → RGBA via GPU
                                let importer = Nv12TextureImporter::new(Arc::clone(&ctx));
                                let nv12_texture = importer.import(&gpu_texture)?;

                                let renderer = Nv12Renderer::new(Arc::clone(&ctx))?;
                                let output_texture = renderer.create_output_texture(src_width, src_height);
                                let output_view =
                                    output_texture.create_view(&wgpu::TextureViewDescriptor::default());
                                renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                                let rgba_data = Self::read_texture_to_buffer(
                                    &ctx, &output_texture, src_width, src_height,
                                )?;

                                let transform = Transform2D {
                                    x: element.transform.x,
                                    y: element.transform.y,
                                    scale_x: element.transform.scale_x,
                                    scale_y: element.transform.scale_y,
                                    rotation: element.transform.rotation,
                                    anchor_x: element.transform.anchor_x,
                                    anchor_y: element.transform.anchor_y,
                                    _padding: 0.0,
                                };

                                layers.push(CompositeLayer {
                                    data: rgba_data,
                                    width: src_width,
                                    height: src_height,
                                    pixel_format: LayerPixelFormat::Rgba,
                                    transform,
                                    opacity: element.opacity as f32,
                                    blend_mode: Self::convert_blend_mode(&element.blend_mode),
                                    z_index: z_index as i32,
                                    mask: None,
                                    mask_inverted: false,
                                });
                            }

                            // Composite all layers
                            let compositor = GpuCompositor::new(ctx.clone())?;
                            let result = compositor.composite(&layers, tl_width, tl_height, [0.0, 0.0, 0.0, 1.0])?;

                            // RGBA CPU → upload to texture → NV12 GPU → read back → encode
                            let device = ctx.device();
                            let queue = ctx.queue();

                            // Upload RGBA to texture
                            let rgba_texture = device.create_texture(&wgpu::TextureDescriptor {
                                label: Some("Timeline RGBA Upload"),
                                size: wgpu::Extent3d {
                                    width: tl_width,
                                    height: tl_height,
                                    depth_or_array_layers: 1,
                                },
                                mip_level_count: 1,
                                sample_count: 1,
                                dimension: wgpu::TextureDimension::D2,
                                format: wgpu::TextureFormat::Rgba8Unorm,
                                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                                view_formats: &[],
                            });

                            queue.write_texture(
                                wgpu::ImageCopyTexture {
                                    texture: &rgba_texture,
                                    mip_level: 0,
                                    origin: wgpu::Origin3d::ZERO,
                                    aspect: wgpu::TextureAspect::All,
                                },
                                &result.data,
                                wgpu::ImageDataLayout {
                                    offset: 0,
                                    bytes_per_row: Some(tl_width * 4),
                                    rows_per_image: Some(tl_height),
                                },
                                wgpu::Extent3d {
                                    width: tl_width,
                                    height: tl_height,
                                    depth_or_array_layers: 1,
                                },
                            );

                            let rgba_view = rgba_texture.create_view(&wgpu::TextureViewDescriptor::default());

                            // Convert RGBA → NV12 on GPU
                            let mut converter = RgbaToNv12Converter::new(ctx.clone())?;
                            let nv12_buffers = converter.create_output_buffers(tl_width, tl_height);
                            converter.convert_sync(&rgba_view, &nv12_buffers, 1)?; // 1 = BT.709

                            // Read NV12 data back to CPU
                            let nv12_data = converter.read_nv12_data_blocking(&nv12_buffers)?;

                            // Encode NV12 → H.264
                            let mut e = enc.lock().unwrap();
                            let pts = current_frame as i64;
                            let packets = Encoder::encode_frame(&mut *e, &nv12_data, pts)?;

                            let frames: Vec<FrameData> = packets
                                .iter()
                                .map(|p| pack_h264_frame(p, tl_width, tl_height))
                                .collect();

                            Ok(frames)
                        }).await;

                        match frame_result {
                            Ok(Ok(frames)) => {
                                for frame in frames {
                                    let _ = tx.send(frame);
                                }
                            }
                            Ok(Err(e)) => {
                                tracing::warn!("Timeline stream composite error: {}", e);
                                // Continue on error (skip frame)
                            }
                            Err(e) => {
                                tracing::error!("Timeline stream task panic: {}", e);
                                break;
                            }
                        }

                        frame_number += 1;
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

    async fn set_loop(
        &self,
        stream_id: &StreamId,
        region: Option<LoopRegion>,
    ) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.loop_region = region)
            .await
    }

    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()> {
        self.active_streams
            .update_state(stream_id, |s| s.seek_to = Some(time_seconds))
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::TaskService;
    use neko_types::Resolution;

    fn create_test_service() -> TimelineService {
        let task_service = Arc::new(TaskService::new());
        TimelineService::new(None, task_service)
    }

    fn create_test_timeline() -> Timeline {
        Timeline::new(Resolution::full_hd(), 30.0)
    }

    #[tokio::test]
    async fn test_timeline_service_composite_no_gpu() {
        let service = create_test_service();
        let timeline = create_test_timeline();
        let result = service.composite(&timeline, 0).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("GPU context required"));
    }

    #[tokio::test]
    async fn test_timeline_service_start_stream_no_gpu() {
        let service = create_test_service();
        let timeline = create_test_timeline();
        let config = StreamConfig::default();
        let result = service.start_stream(&timeline, "session1", config).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("GPU context required"));
    }

    #[tokio::test]
    async fn test_timeline_service_stop_stream_not_found() {
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
    async fn test_timeline_service_pause_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.pause(&stream_id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_service_resume_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.resume(&stream_id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_service_set_speed_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.set_speed(&stream_id, 2.0).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_service_seek_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let result = service.seek(&stream_id, 1.0).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_service_set_loop_not_found() {
        let service = create_test_service();
        let stream_id = StreamId::new("test");
        let region = LoopRegion::new(0.0, 5.0);
        let result = service.set_loop(&stream_id, Some(region)).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_timeline_service_trait_object() {
        fn _assert_impl<T: ITimelineService>() {}
        _assert_impl::<TimelineService>();
    }

    #[tokio::test]
    async fn test_timeline_service_probe_file_not_found() {
        let service = create_test_service();
        let result = service.probe(Path::new("/nonexistent/file.jvi")).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_service_probe_valid_jvi() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let json = r#"{
            "version": "1.0",
            "name": "Test Project",
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30,
            "tracks": [
                {
                    "id": "track-1",
                    "name": "Main Track",
                    "type": "media",
                    "elements": [
                        {
                            "type": "media",
                            "id": "elem-1",
                            "name": "clip1.mp4",
                            "src": "clip1.mp4",
                            "duration": 5.0,
                            "startTime": 0.0
                        }
                    ],
                    "muted": false
                },
                {
                    "id": "track-2",
                    "name": "Audio Track",
                    "type": "audio",
                    "elements": [],
                    "muted": false
                }
            ]
        }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json.as_bytes()).unwrap();

        let service = create_test_service();
        let result = service.probe(temp_file.path()).await;
        assert!(result.is_ok());

        let info = result.unwrap();
        assert_eq!(info.name, "Test Project");
        assert_eq!(info.version, "1.0");
        assert_eq!(info.width, 1920);
        assert_eq!(info.height, 1080);
        assert_eq!(info.fps, 30.0);
        assert_eq!(info.track_count, 2);
        assert_eq!(info.element_count, 1);
        assert_eq!(info.media_references.len(), 1);
        assert_eq!(info.media_references[0].element_id, "elem-1");
        assert_eq!(info.media_references[0].media_type, "video");
        assert!(!info.media_references[0].exists); // clip1.mp4 doesn't exist
    }
}
