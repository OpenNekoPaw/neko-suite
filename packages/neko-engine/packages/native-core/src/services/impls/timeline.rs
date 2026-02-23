//! TimelineService implementation
//!
//! Provides timeline composition and playback operations.
//! Supports GPU-accelerated compositing, H.264 preview streaming,
//! and full playback control (pause/resume/speed/loop/seek).

use crate::decoder::{Decoder, HwAccelDecoder, HwAccelType};
use crate::domain::{FrameData, MediaReference, StreamConfig, Timeline, TimelineProjectInfo};
use crate::export::{AudioMixer, ExportSettings, ExportStats};
use crate::jvi::JviLoader;
use crate::error::{Error, Result};
use crate::gpu::{
    BlendMode as GpuBlendMode, ColorSpace, CompositeLayer, GpuCompositor, GpuContext,
    LayerPixelFormat, Nv12Renderer, Nv12TextureImporter, Transform2D,
};
use crate::preview::{PreviewFrame, PreviewPipeline, PreviewPipelineConfig};
use crate::services::impls::stream_loop::{
    pack_pcm_f32le_stream_frame, ActiveStreams, PlaybackState, StreamLoopHandle,
    StreamPlaybackDelegate, WallClockPacer,
    EOF_IDLE_TIMEOUT, eof_idle_wait,
};
use crate::services::{IStreamPlayback, ITaskService, ITimelineService, StreamStats, TimelineStreamResult};
use crate::monitor::SystemMonitor;
use crate::telemetry::metrics::{FrameStatsCollector, FrameTiming};
use neko_types::{BlendMode, FrameFormat, LoopRegion, StreamId};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{broadcast, watch, RwLock};
use tokio_util::sync::CancellationToken;

/// Convert IEEE 754 half-precision float (f16) to single-precision float (f32)
fn f16_to_f32(bits: u16) -> f32 {
    let sign = ((bits >> 15) & 1) as u32;
    let exponent = ((bits >> 10) & 0x1F) as u32;
    let mantissa = (bits & 0x3FF) as u32;

    if exponent == 0 {
        if mantissa == 0 {
            // Signed zero
            f32::from_bits(sign << 31)
        } else {
            // Subnormal: convert to normalized f32
            let mut m = mantissa;
            let mut e = 0i32;
            while (m & 0x400) == 0 {
                m <<= 1;
                e += 1;
            }
            let f32_exp = (127 - 15 - e) as u32;
            let f32_mantissa = (m & 0x3FF) << 13;
            f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
        }
    } else if exponent == 31 {
        // Inf or NaN
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (0xFF << 23) | f32_mantissa)
    } else {
        // Normalized: rebias exponent from f16 bias (15) to f32 bias (127)
        let f32_exp = (exponent + 127 - 15) as u32;
        let f32_mantissa = mantissa << 13;
        f32::from_bits((sign << 31) | (f32_exp << 23) | f32_mantissa)
    }
}

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
    /// Delegate for stream playback control (stop/pause/resume/speed/seek/loop)
    playback: StreamPlaybackDelegate,
    /// Stats watch receivers keyed by video stream_id
    stats_receivers: Arc<RwLock<HashMap<String, watch::Receiver<StreamStats>>>>,
}

impl TimelineService {
    /// Create a new TimelineService
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
            stats_receivers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Hot-update preview quality (resolution/bitrate) for a running stream.
    /// The video loop picks up the new config on the next frame iteration.
    pub async fn set_quality(
        &self,
        stream_id: &StreamId,
        width: u32,
        height: u32,
        bitrate: Option<u64>,
        fps: Option<f64>,
    ) -> Result<()> {
        if !self.active_streams.contains(stream_id).await {
            return Err(Error::Other(format!(
                "Stream '{}' not found for set_quality",
                stream_id.as_str()
            )));
        }

        // Auto-calculate bitrate from resolution if not specified: ~4 bits/pixel
        let bitrate = bitrate.unwrap_or_else(|| (width as u64) * (height as u64) * 4);
        let fps = fps.unwrap_or(30.0);
        let gop_size = (fps as u32).max(1);

        let config = PreviewPipelineConfig {
            width,
            height,
            fps,
            bitrate,
            gop_size,
        };

        tracing::info!(
            "Setting quality for stream '{}': {}x{} @ {}kbps",
            stream_id.as_str(), width, height, bitrate / 1000
        );

        self.playback.update_config(stream_id, config).await
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

    /// Read texture data back to CPU buffer as RGBA8 (4 bytes per pixel)
    ///
    /// Delegates to GpuContext::read_texture_sync for the raw readback,
    /// then converts Rgba16Float (8 bytes/pixel) to RGBA8 (4 bytes/pixel) if needed.
    fn read_texture_to_rgba8(
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        let raw = ctx.read_texture_sync(texture, width, height)?;

        if texture.format() == wgpu::TextureFormat::Rgba16Float {
            Ok(Self::rgba16float_to_rgba8(&raw))
        } else {
            Ok(raw)
        }
    }

    /// Convert Rgba16Float pixel data to RGBA8
    ///
    /// Each Rgba16Float pixel is 8 bytes (4 × f16), converted to 4 bytes (4 × u8).
    fn rgba16float_to_rgba8(data: &[u8]) -> Vec<u8> {
        let pixel_count = data.len() / 8;
        let mut output = Vec::with_capacity(pixel_count * 4);
        for chunk in data.chunks_exact(8) {
            let r = f16_to_f32(u16::from_le_bytes([chunk[0], chunk[1]]));
            let g = f16_to_f32(u16::from_le_bytes([chunk[2], chunk[3]]));
            let b = f16_to_f32(u16::from_le_bytes([chunk[4], chunk[5]]));
            let a = f16_to_f32(u16::from_le_bytes([chunk[6], chunk[7]]));
            output.push((r.clamp(0.0, 1.0) * 255.0) as u8);
            output.push((g.clamp(0.0, 1.0) * 255.0) as u8);
            output.push((b.clamp(0.0, 1.0) * 255.0) as u8);
            output.push((a.clamp(0.0, 1.0) * 255.0) as u8);
        }
        output
    }
}

/// Pack a PreviewFrame (H.264 NAL units from PreviewPipeline) into FrameData for broadcast
///
/// Wire format: [pts_us:i64 LE][dts_us:i64 LE][is_keyframe:u8][duration_us:i64 LE][H.264 NAL data...]
/// PTS/DTS are already in microseconds from PreviewPipeline. Duration is calculated from fps.
fn pack_preview_frame(frame: &PreviewFrame, width: u32, height: u32, fps: f64) -> FrameData {
    let header_size = 8 + 8 + 1 + 8; // pts + dts + is_keyframe + duration
    let duration_us = (1_000_000.0 / fps) as i64;
    let mut data = Vec::with_capacity(header_size + frame.data.len());
    data.extend_from_slice(&frame.pts.to_le_bytes());
    data.extend_from_slice(&frame.dts.to_le_bytes());
    data.push(if frame.is_keyframe { 1 } else { 0 });
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&frame.data);

    FrameData {
        data,
        width,
        height,
        format: FrameFormat::H264,
        timestamp: frame.pts as f64 / 1_000_000.0,
    }
}

impl IStreamPlayback for TimelineService {
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()> {
        // Clean up stats receiver before stopping
        {
            let mut receivers = self.stats_receivers.write().await;
            receivers.remove(stream_id.as_str());
        }
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

impl ITimelineService for TimelineService {
    async fn probe(&self, jvi_path: &Path) -> Result<TimelineProjectInfo> {
        let path = jvi_path.to_path_buf();

        // Load and parse .jvi file in blocking task (file I/O)
        let info = tokio::task::spawn_blocking(move || -> Result<TimelineProjectInfo> {
            let loader = JviLoader::new();
            let (timeline_data, settings) = loader.load(&path)?;

            // Count elements across all tracks
            let element_count: usize = timeline_data.tracks.iter().map(|t| t.elements.len()).sum();

            // Calculate duration: use explicit duration if set, otherwise from elements
            let duration = timeline_data.effective_duration();

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
                    Self::read_texture_to_rgba8(&ctx, &output_texture, src_width, src_height)?;

                Ok((rgba_data, src_width, src_height))
            })
            .await
            .map_err(|e| Error::Other(format!("Element decode task failed: {}", e)))??;

            let (rgba_data, src_width, src_height) = decoded_rgba;

            // Build transform — apply same coordinate conversion as GpuExportPipeline
            let mut transform = element.to_transform_2d();
            if element.transform.is_identity() {
                // No transform specified: auto-scale to fit output (letterbox + center)
                let scale_x = width as f32 / src_width as f32;
                let scale_y = height as f32 / src_height as f32;
                let scale = scale_x.min(scale_y);
                transform.scale_x = scale;
                transform.scale_y = scale;
                transform.x = width as f32 / 2.0;
                transform.y = height as f32 / 2.0;
                transform.anchor_x = 0.5;
                transform.anchor_y = 0.5;
            } else {
                // JVI transform: convert normalized coords to pixel coords
                // and apply fit-to-canvas base scaling to scaleX/scaleY
                let fit_scale_x = width as f32 / src_width as f32;
                let fit_scale_y = height as f32 / src_height as f32;
                let fit_scale = fit_scale_x.min(fit_scale_y);

                // scaleX: 1.0 means "fit to canvas", user scale is relative to that
                transform.scale_x *= fit_scale;
                transform.scale_y *= fit_scale;

                // x/y: normalized (0-1) → pixel coordinates
                transform.x *= width as f32;
                transform.y *= height as f32;
            }

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
    ) -> Result<TimelineStreamResult> {
        let gpu_ctx = self
            .gpu_ctx
            .as_ref()
            .ok_or_else(|| Error::Other("GPU context required for timeline streaming".to_string()))?
            .clone();

        let fps = config.fps;
        let width = config.resolution.width;
        let height = config.resolution.height;
        let mut timeline = timeline.clone();

        // Auto-calculate duration from elements if not explicitly set
        if timeline.duration <= 0.0 {
            timeline.duration = timeline.calculated_duration();
            tracing::info!(
                "Timeline duration auto-calculated from elements: {:.3}s",
                timeline.duration
            );
        }

        // === Shared infrastructure for both loops ===
        let cancel = CancellationToken::new();
        let initial_state = PlaybackState {
            paused: config.initial_paused,
            ..PlaybackState::default()
        };
        let (state_tx, state_rx) = watch::channel(initial_state);

        // Video broadcast channel
        let (video_tx, video_rx) = broadcast::channel::<FrameData>(64);
        let video_stream_id = StreamId::new(&format!("{}-video", session_id));

        // Audio broadcast channel
        let (audio_tx, audio_rx) = broadcast::channel::<FrameData>(64);
        let audio_stream_id = StreamId::new(&format!("{}-audio", session_id));

        // Stats watch channel (latest snapshot, polled on demand)
        let (stats_tx, stats_rx) = watch::channel(StreamStats::default());

        // === Video loop: PreviewPipeline (persistent decoder pool + GPU resources + H.264 encoder) ===
        let video_cancel = cancel.clone();
        let video_state_rx = state_rx.clone();
        let video_timeline = timeline.clone();
        let video_gpu_ctx = gpu_ctx.clone();
        let video_start_time = config.start_time;
        let video_stats_tx = stats_tx.clone();
        let mut video_duration = timeline.duration;
        let video_streams_clone = self.active_streams.clone();
        let video_stream_id_clone = video_stream_id.clone();
        let video_join = tokio::task::spawn_blocking(move || {
            // Create PreviewPipeline (wraps GpuExportPipeline + HwAccelEncoder)
            let preview_config = PreviewPipelineConfig {
                width,
                height,
                fps,
                bitrate: 4_000_000, // 4 Mbps for timeline preview
                gop_size: (fps as u32).max(1), // 1 second GOP
            };

            let mut pipeline = match PreviewPipeline::new(video_timeline.clone(), video_gpu_ctx, preview_config) {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!("Failed to create PreviewPipeline: {}", e);
                    return;
                }
            };

            if let Err(e) = pipeline.initialize() {
                tracing::error!("Failed to initialize PreviewPipeline: {}", e);
                return;
            }

            tracing::info!(
                "PreviewPipeline initialized: {}x{} @ {}fps, hw={}",
                width, height, fps, pipeline.is_hw_active()
            );

            let mut pacer = WallClockPacer::new(fps, 1.0);
            let mut current_speed = 1.0;
            let mut current_time = video_start_time;
            let mut last_seek_seq: u64 = 0;
            let timeline = video_timeline;
            let tx = video_tx;
            let background_color = [0.0_f32, 0.0, 0.0, 1.0];
            let mut stats = FrameStatsCollector::new(std::time::Duration::from_secs(10));
            let mut system_monitor = SystemMonitor::new();
            let mut video_frame_idx: u64 = 0;
            let mut last_timeline_seq: u64 = 0;
            let mut last_config_seq: u64 = 0;

            loop {
                // Check cancellation
                if video_cancel.is_cancelled() { break; }

                // Read playback state
                let state = video_state_rx.borrow().clone();

                // Handle timeline hot-update (dedup via sequence counter)
                if state.timeline_seq != last_timeline_seq {
                    last_timeline_seq = state.timeline_seq;
                    if let Some(new_tl) = &state.timeline_update {
                        let new_timeline = (**new_tl).clone();
                        tracing::info!("Video loop: hot-updating timeline (seq={})", state.timeline_seq);
                        pipeline.update_timeline(new_timeline.clone());
                        video_duration = new_timeline.duration;
                    }
                }

                // Handle config hot-update (resolution/bitrate change)
                if state.config_seq != last_config_seq {
                    last_config_seq = state.config_seq;
                    if let Some(new_config) = &state.config_update {
                        tracing::info!(
                            "Video loop: hot-updating config (seq={}): {}x{} @ {}kbps",
                            state.config_seq, new_config.width, new_config.height, new_config.bitrate / 1000
                        );
                        if let Err(e) = pipeline.update_config(new_config.clone()) {
                            tracing::error!("Video loop: failed to update config: {}", e);
                        }
                    }
                }

                // Handle seek (dedup via monotonic sequence counter)
                if let Some(time) = state.seek_to {
                    if state.seek_seq != last_seek_seq {
                        last_seek_seq = state.seek_seq;
                        current_time = time;
                        pipeline.reset_frame_counter();
                        pacer.reset();
                    }
                }

                // Handle pause
                if state.paused {
                    std::thread::sleep(std::time::Duration::from_millis(16));
                    pacer.reset();
                    continue;
                }

                // Handle speed change
                if (state.speed - current_speed).abs() > 0.001 {
                    current_speed = state.speed;
                    pacer.update_speed(current_speed);
                }

                // Handle loop region
                if let Some(region) = &state.loop_region {
                    if current_time >= region.out_point {
                        current_time = region.in_point;
                        pacer.reset();
                    }
                }

                // Check timeline duration
                if current_time > timeline.duration && timeline.duration > 0.0 {
                    if let Some(region) = &state.loop_region {
                        current_time = region.in_point;
                        pacer.reset();
                    } else {
                        // No loop: enter EOF idle wait for seek
                        match eof_idle_wait(&video_cancel, &video_state_rx, last_seek_seq, EOF_IDLE_TIMEOUT) {
                            Some(time) => {
                                current_time = time;
                                pacer.reset();
                                continue;
                            }
                            None => break, // Cancelled or timeout
                        }
                    }
                }

                // Render frame via PreviewPipeline with timing
                let frame_start = std::time::Instant::now();
                match pipeline.render_frame_timed(current_time, background_color) {
                    Ok((preview_frames, gpu_timing)) => {
                        // Precise encode timing: measure send separately
                        let encode_start = std::time::Instant::now();
                        for pf in &preview_frames {
                            let frame = pack_preview_frame(pf, width, height, fps);
                            let _ = tx.send(frame);
                        }
                        let encode_submit_ns = encode_start.elapsed().as_nanos() as u64;

                        let mut timing = FrameTiming::default();
                        timing.hw_decode_ns = gpu_timing.hw_decode_ns;
                        timing.nv12_import_ns = gpu_timing.nv12_import_ns;
                        timing.nv12_to_rgba_ns = gpu_timing.nv12_to_rgba_ns;
                        timing.composite_ns = gpu_timing.composite_ns;
                        timing.rgba_to_nv12_ns = gpu_timing.rgba_to_nv12_ns;
                        timing.cpu_readback_ns = gpu_timing.cpu_readback_ns;
                        timing.decode_ns = gpu_timing.hw_decode_ns;
                        timing.gpu_ns = gpu_timing.total_ns();
                        timing.encode_submit_ns = encode_submit_ns;
                        timing.encode_ns = encode_submit_ns;
                        timing.total_ns = frame_start.elapsed().as_nanos() as u64;
                        stats.record_frame(timing);
                    }
                    Err(e) => {
                        tracing::warn!("PreviewPipeline render error at {:.3}s: {}", current_time, e);
                    }
                }

                // Sample system resources and push stats periodically (every 30 frames ≈ 1s at 30fps)
                video_frame_idx += 1;
                if video_frame_idx % 30 == 0 {
                    system_monitor.sample();

                    let avg_timing = stats.avg_timing();
                    let stream_stats = StreamStats {
                        video: ExportStats {
                            hw_decode_ms: avg_timing.hw_decode_ns as f64 / 1_000_000.0,
                            nv12_import_ms: avg_timing.nv12_import_ns as f64 / 1_000_000.0,
                            nv12_to_rgba_ms: avg_timing.nv12_to_rgba_ns as f64 / 1_000_000.0,
                            composite_ms: avg_timing.composite_ns as f64 / 1_000_000.0,
                            rgba_to_nv12_ms: avg_timing.rgba_to_nv12_ns as f64 / 1_000_000.0,
                            cpu_readback_ms: avg_timing.cpu_readback_ns as f64 / 1_000_000.0,
                            encode_submit_ms: avg_timing.encode_submit_ns as f64 / 1_000_000.0,
                            decode_time_ms: avg_timing.decode_ns / 1_000_000,
                            composite_time_ms: avg_timing.gpu_ns / 1_000_000,
                            encode_time_ms: avg_timing.encode_ns / 1_000_000,
                            mux_time_ms: 0,
                            avg_fps: stats.current_fps(),
                            peak_memory_bytes: system_monitor.peak_memory(),
                            cpu_usage_percent: system_monitor.avg_cpu_usage(),
                            gpu_usage_percent: system_monitor.avg_gpu_usage(),
                            vram_usage_bytes: system_monitor.peak_vram(),
                        },
                        audio_mix_ms: 0.0,
                        audio_fps: 0.0,
                        current_time,
                        total_duration: video_duration,
                        peak_memory_bytes: system_monitor.peak_memory(),
                        cpu_usage_percent: system_monitor.avg_cpu_usage(),
                    };
                    let _ = video_stats_tx.send_replace(stream_stats);
                }

                current_time += 1.0 / fps;
                pacer.wait_for_next_frame();
            }

            // Log final performance summary with system resource stats
            stats.log_final_summary();
            let avg_timing = stats.avg_timing();
            let video_stats = ExportStats {
                hw_decode_ms: avg_timing.hw_decode_ns as f64 / 1_000_000.0,
                nv12_import_ms: avg_timing.nv12_import_ns as f64 / 1_000_000.0,
                nv12_to_rgba_ms: avg_timing.nv12_to_rgba_ns as f64 / 1_000_000.0,
                composite_ms: avg_timing.composite_ns as f64 / 1_000_000.0,
                rgba_to_nv12_ms: avg_timing.rgba_to_nv12_ns as f64 / 1_000_000.0,
                cpu_readback_ms: avg_timing.cpu_readback_ns as f64 / 1_000_000.0,
                encode_submit_ms: avg_timing.encode_submit_ns as f64 / 1_000_000.0,
                decode_time_ms: avg_timing.decode_ns / 1_000_000,
                composite_time_ms: avg_timing.gpu_ns / 1_000_000,
                encode_time_ms: avg_timing.encode_ns / 1_000_000,
                mux_time_ms: 0,
                avg_fps: stats.current_fps(),
                peak_memory_bytes: system_monitor.peak_memory(),
                cpu_usage_percent: system_monitor.avg_cpu_usage(),
                gpu_usage_percent: system_monitor.avg_gpu_usage(),
                vram_usage_bytes: system_monitor.peak_vram(),
            };
            tracing::info!(
                "=== Video Stream ExportStats ===\n{}",
                serde_json::to_string_pretty(&video_stats).unwrap_or_default()
            );
            // Flush encoder
            if let Ok(flush_frames) = pipeline.flush() {
                for pf in &flush_frames {
                    let frame = pack_preview_frame(pf, width, height, fps);
                    let _ = tx.send(frame);
                }
            }
            pipeline.close();

            // Self-cleanup: remove handle (and linked audio) from ActiveStreams
            let rt = tokio::runtime::Handle::current();
            rt.block_on(video_streams_clone.remove(video_stream_id_clone.as_str()));
        });

        // === Audio mixing loop (new, uses shared state) ===
        let audio_cancel = cancel.clone();
        let audio_state_rx = state_rx.clone();
        let audio_timeline = timeline.clone();
        let audio_fps = fps;
        let audio_start_time = config.start_time;
        let audio_join = tokio::task::spawn_blocking(move || {
            // Build minimal ExportSettings (only fps is needed by AudioMixer)
            let settings = ExportSettings {
                width: 0,
                height: 0,
                fps: audio_fps,
                video_codec: Default::default(),
                video_bitrate: None,
                audio_codec: Default::default(),
                audio_bitrate: None,
                hw_encoder: Default::default(),
                time_range: None,
                preset: Default::default(),
                use_zero_copy_gpu: false,
            };

            let mut mixer = AudioMixer::new(audio_timeline.clone(), &settings);
            if let Err(e) = mixer.initialize() {
                tracing::error!("Failed to initialize AudioMixer: {}", e);
                return;
            }

            // Wait for WebSocket subscriber to connect before producing frames.
            // Without this delay, frames are sent into an empty broadcast channel
            // and lost before the client can subscribe.
            let wait_start = std::time::Instant::now();
            while audio_tx.receiver_count() == 0 {
                if audio_cancel.is_cancelled() { return; }
                std::thread::sleep(std::time::Duration::from_millis(10));
                if wait_start.elapsed() > std::time::Duration::from_secs(5) {
                    tracing::warn!("Audio loop: timed out waiting for subscriber, starting anyway");
                    break;
                }
            }
            tracing::info!(
                "Audio loop: subscriber ready after {:.0}ms",
                wait_start.elapsed().as_millis()
            );

            let mut pacer = WallClockPacer::new(audio_fps, 1.0);
            let mut current_speed = 1.0;
            let frame_duration = 1.0 / audio_fps;
            let mut current_time = audio_start_time;
            let mut last_seek_seq: u64 = 0;
            let mut last_timeline_seq: u64 = 0;
            let sample_rate = mixer.sample_rate();
            let channels = mixer.channels();
            let mut total_frames: u64 = 0;
            let mut total_mix_ns: u64 = 0;
            let loop_start = std::time::Instant::now();
            // Fade-in ramp after seek: number of samples remaining for linear ramp
            // 5ms at 48kHz = 240 samples — eliminates click/pop at seek boundary
            let fade_in_samples_total = (sample_rate as f64 * 0.005) as usize; // 5ms
            let mut fade_in_remaining: usize = 0;

            loop {
                // Check cancellation
                if audio_cancel.is_cancelled() {
                    break;
                }

                // Read playback state
                let state = audio_state_rx.borrow().clone();

                // Handle timeline hot-update (dedup via sequence counter)
                if state.timeline_seq != last_timeline_seq {
                    last_timeline_seq = state.timeline_seq;
                    if let Some(new_tl) = &state.timeline_update {
                        tracing::info!("Audio loop: hot-updating timeline (seq={})", state.timeline_seq);
                        mixer.update_timeline((**new_tl).clone());
                    }
                }

                // Handle seek (dedup via monotonic sequence counter)
                if let Some(time) = state.seek_to {
                    if state.seek_seq != last_seek_seq {
                        last_seek_seq = state.seek_seq;
                        current_time = time;
                        pacer.reset();
                        // Apply fade-in ramp to smooth seek transition
                        fade_in_remaining = fade_in_samples_total;
                    }
                }

                // Handle pause
                if state.paused {
                    std::thread::sleep(std::time::Duration::from_millis(16));
                    pacer.reset();
                    continue;
                }

                // Handle speed change
                if (state.speed - current_speed).abs() > 0.001 {
                    current_speed = state.speed;
                    pacer.update_speed(current_speed);
                }

                // Handle loop region
                if let Some(region) = &state.loop_region {
                    if current_time >= region.out_point {
                        current_time = region.in_point;
                        pacer.reset();
                    }
                }

                // Check timeline duration
                if current_time > audio_timeline.duration && audio_timeline.duration > 0.0 {
                    if let Some(region) = &state.loop_region {
                        current_time = region.in_point;
                        pacer.reset();
                    } else {
                        // No loop: enter EOF idle wait for seek
                        match eof_idle_wait(&audio_cancel, &audio_state_rx, last_seek_seq, EOF_IDLE_TIMEOUT) {
                            Some(time) => {
                                current_time = time;
                                pacer.reset();
                                continue;
                            }
                            None => break, // Cancelled or timeout
                        }
                    }
                }

                // Mix one frame of audio
                let mix_start = std::time::Instant::now();
                match mixer.mix_frame(current_time) {
                    Ok(Some(mut mixed)) => {
                        total_mix_ns += mix_start.elapsed().as_nanos() as u64;
                        total_frames += 1;

                        // Apply fade-in ramp after seek to eliminate click/pop
                        if fade_in_remaining > 0 {
                            let ch = channels as usize;
                            let total = fade_in_samples_total;
                            for i in 0..mixed.samples {
                                if fade_in_remaining == 0 { break; }
                                let progress = 1.0 - (fade_in_remaining as f32 / total as f32);
                                let gain = progress * progress; // quadratic ease-in
                                for c in 0..ch {
                                    let idx = i * ch + c;
                                    if idx < mixed.data.len() {
                                        mixed.data[idx] *= gain;
                                    }
                                }
                                fade_in_remaining -= 1;
                            }
                        }

                        // Cast f32 data to raw bytes
                        let pcm_bytes: &[u8] = bytemuck::cast_slice(&mixed.data);
                        let frame = pack_pcm_f32le_stream_frame(
                            pcm_bytes,
                            current_time,
                            frame_duration,
                            sample_rate,
                            channels,
                        );
                        let _ = audio_tx.send(frame);
                    }
                    Ok(None) => {
                        tracing::warn!("Audio mix returned None at {:.3}s", current_time);
                    }
                    Err(e) => {
                        tracing::warn!("Audio mix error at {:.3}s: {}", current_time, e);
                    }
                }

                current_time += frame_duration;
                pacer.wait_for_next_frame();
            }

            // Log minimal audio summary
            let elapsed = loop_start.elapsed().as_secs_f64();
            let avg_mix_ms = if total_frames > 0 {
                total_mix_ns as f64 / total_frames as f64 / 1_000_000.0
            } else {
                0.0
            };
            tracing::info!(
                "Audio stream ended: {} frames in {:.1}s, avg mix {:.2}ms/frame",
                total_frames, elapsed, avg_mix_ms
            );

            mixer.close();
        });

        // Store paired handles
        let video_handle = StreamLoopHandle {
            stream_id: video_stream_id.clone(),
            cancel: cancel.clone(),
            state_tx: state_tx.clone(),
            join_handle: video_join,
            linked_stream_id: None,
        };
        let audio_handle = StreamLoopHandle {
            stream_id: audio_stream_id.clone(),
            cancel,
            state_tx,
            join_handle: audio_join,
            linked_stream_id: None,
        };
        self.active_streams.insert_paired(video_handle, audio_handle).await;

        // Store stats receiver for polling via get_stream_stats()
        {
            let mut receivers = self.stats_receivers.write().await;
            receivers.insert(
                video_stream_id.as_str().to_string(),
                stats_rx.clone(),
            );
        }

        Ok(TimelineStreamResult {
            video_stream_id,
            video_rx,
            audio_stream_id,
            audio_rx,
            stats_rx,
        })
    }

    async fn get_stream_stats(&self, stream_id: &StreamId) -> Option<StreamStats> {
        let receivers = self.stats_receivers.read().await;
        receivers.get(stream_id.as_str()).map(|rx| rx.borrow().clone())
    }

    async fn update_stream(&self, stream_id: &StreamId, timeline: &Timeline) -> Result<()> {
        // Hot-update timeline data via PlaybackState watch channel.
        // Video/audio loops detect timeline_seq change and call update_timeline()
        // on their respective pipelines (PreviewPipeline / AudioMixer).

        // Verify stream exists in ActiveStreams
        if !self.active_streams.contains(stream_id).await {
            return Err(Error::Other(format!(
                "Stream '{}' not found for update",
                stream_id.as_str()
            )));
        }

        let timeline_arc = std::sync::Arc::new(timeline.clone());

        tracing::info!(
            "Hot-updating stream '{}' timeline via PlaybackState",
            stream_id.as_str()
        );

        self.playback.update_timeline(stream_id, timeline_arc).await
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
