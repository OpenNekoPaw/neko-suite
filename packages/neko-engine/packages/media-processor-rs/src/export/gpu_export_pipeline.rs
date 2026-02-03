//! GPU Export Pipeline - GPU-centric multi-source video export
//!
//! Orchestrates the full GPU pipeline for timeline-based video export:
//!
//! ```text
//! ZeroCopyDecoder[N] → Nv12TextureImporter → Nv12RenderCache
//!   → GpuLayer → TextureCompositor → RGBA texture → NV12 (GPU) → Encoder
//! ```
//!
//! All compositing stays on GPU. RGBA→NV12 conversion is done via GPU compute
//! shader to avoid CPU overhead. Only the final NV12 readback is CPU-bound.

use std::collections::HashMap;
use std::sync::Arc;

use crate::decoder::{Decoder, HwAccelType, ZeroCopyDecoder};
use crate::error::{Error, Result};
use crate::gpu::{
    GpuContext, GpuLayer, GpuLayerBuilder, Nv12OutputBuffers, Nv12RenderCache, Nv12TextureImporter,
    RgbaToNv12Converter, TextureCompositeResult, TextureCompositor,
};

use super::types::{ElementData, ExportSettings, MediaElementData, TimelineData, TrackType};

// =============================================================================
// Layer Texture Pool
// =============================================================================

/// Simple texture pool for reusing layer textures across frames
///
/// Avoids per-frame texture allocation by recycling textures between frames.
/// All textures in the pool have the same dimensions (output_width × output_height).
struct LayerTexturePool {
    /// Available textures ready for reuse
    available: Vec<wgpu::Texture>,
    /// Textures currently in use by the current frame
    in_use: Vec<wgpu::Texture>,
    /// Cached texture dimensions
    width: u32,
    height: u32,
}

impl LayerTexturePool {
    /// Create an empty texture pool
    fn new() -> Self {
        Self {
            available: Vec::new(),
            in_use: Vec::new(),
            width: 0,
            height: 0,
        }
    }

    /// Acquire a texture from the pool, creating one if necessary
    ///
    /// Returns the index of the texture in the in_use vector.
    fn acquire(&mut self, ctx: &GpuContext, width: u32, height: u32) -> usize {
        // If dimensions changed, clear the pool
        if self.width != width || self.height != height {
            self.available.clear();
            self.in_use.clear();
            self.width = width;
            self.height = height;
        }

        // Try to reuse an available texture
        if let Some(texture) = self.available.pop() {
            self.in_use.push(texture);
            return self.in_use.len() - 1;
        }

        // Create a new texture
        let texture = ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("LayerTexturePool Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        self.in_use.push(texture);
        self.in_use.len() - 1
    }

    /// Get reference to a texture by index
    fn get(&self, index: usize) -> &wgpu::Texture {
        &self.in_use[index]
    }

    /// Release all in-use textures back to the available pool
    ///
    /// Call this at the start of each frame to recycle textures.
    fn release_all(&mut self) {
        self.available.append(&mut self.in_use);
    }

    /// Clear all textures from the pool
    #[allow(dead_code)]
    fn clear(&mut self) {
        self.available.clear();
        self.in_use.clear();
    }
}

/// GPU-centric export pipeline (Facade)
///
/// Orchestrates multi-source decoding, GPU compositing, and output
/// for timeline-based video export. Replaces the former `TimelineDecoder`
/// which mixed decoding and compositing responsibilities.
///
/// All visual processing stays on GPU textures until the final NV12 readback.
pub struct GpuExportPipeline {
    /// Shared GPU context
    ctx: Arc<GpuContext>,
    /// Video decoders keyed by source path
    decoders: HashMap<String, ZeroCopyDecoder>,
    /// NV12 texture importer (hardware decoder → wgpu)
    nv12_importer: Nv12TextureImporter,
    /// NV12 → RGBA renderer (pure GPU render pipeline)
    nv12_renderer: Nv12RenderCache,
    /// Multi-layer GPU texture compositor
    compositor: TextureCompositor,
    /// RGBA → NV12 converter for encoder output
    rgba_to_nv12: RgbaToNv12Converter,
    /// Timeline data
    timeline: TimelineData,
    /// Export settings
    #[allow(dead_code)]
    settings: ExportSettings,
    /// Total frames to export
    total_frames: u64,
    /// Output width
    output_width: u32,
    /// Output height
    output_height: u32,
    /// Cached NV12 output buffers (reused across frames)
    nv12_output_cache: Option<Nv12OutputBuffers>,
    /// Texture pool for layer textures (reused across frames)
    layer_texture_pool: LayerTexturePool,
    /// Zero-copy RGBA→NV12 converter (macOS only, outputs to IOSurface)
    #[cfg(target_os = "macos")]
    zerocopy_converter: Option<crate::gpu::RgbaToNv12TextureConverter>,
}

impl GpuExportPipeline {
    /// Create a new GPU export pipeline
    pub fn new(
        timeline: TimelineData,
        settings: ExportSettings,
        ctx: Arc<GpuContext>,
    ) -> Result<Self> {
        let total_frames = timeline.total_frames(settings.fps);
        let output_width = settings.width;
        let output_height = settings.height;

        let nv12_importer = Nv12TextureImporter::new(ctx.clone());
        let nv12_renderer = Nv12RenderCache::new(ctx.clone())?;
        let compositor = TextureCompositor::new(ctx.clone())?;
        let rgba_to_nv12 = RgbaToNv12Converter::new(ctx.clone())?;

        Ok(Self {
            ctx,
            decoders: HashMap::new(),
            nv12_importer,
            nv12_renderer,
            compositor,
            rgba_to_nv12,
            timeline,
            settings,
            total_frames,
            output_width,
            output_height,
            nv12_output_cache: None,
            layer_texture_pool: LayerTexturePool::new(),
            #[cfg(target_os = "macos")]
            zerocopy_converter: None,
        })
    }

    /// Initialize all required video decoders
    pub fn initialize(&mut self) -> Result<()> {
        let sources = self.timeline.get_media_sources();

        for src in sources {
            let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);

            match decoder.open(&src) {
                Ok(info) => {
                    tracing::info!(
                        "Opened HW decoder for {}: {}x{} @ {:.2}fps, {:.2}s",
                        src,
                        info.width,
                        info.height,
                        info.fps,
                        info.duration
                    );
                    self.decoders.insert(src, decoder);
                }
                Err(e) => {
                    tracing::error!("Failed to open HW decoder for {}: {}", src, e);
                    return Err(e);
                }
            }
        }

        Ok(())
    }

    /// Get total frames to export
    pub fn total_frames(&self) -> u64 {
        self.total_frames
    }

    /// Get output dimensions
    pub fn output_dimensions(&self) -> (u32, u32) {
        (self.output_width, self.output_height)
    }

    /// Process a single frame entirely on GPU
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → GpuLayer → Composite
    /// Returns the composited result as a GPU texture.
    pub fn process_frame(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<TextureCompositeResult> {
        // Release textures from previous frame back to pool
        self.layer_texture_pool.release_all();

        let media_elements = self.collect_visible_media(time);
        tracing::debug!("Found {} visible media elements at time {:.2}s", media_elements.len(), time);

        let mut gpu_layers: Vec<GpuLayer> = Vec::new();
        for (media, z_idx) in media_elements {
            if let Some(layer) = self.decode_to_gpu_layer(&media, time, z_idx)? {
                gpu_layers.push(layer);
            }
        }

        let layer_refs: Vec<&GpuLayer> = gpu_layers.iter().collect();
        self.compositor.composite(
            &layer_refs,
            self.output_width,
            self.output_height,
            background_color,
        )
    }

    /// Process a single frame and read back to CPU
    ///
    /// Calls `process_frame()` then reads the GPU texture to CPU memory.
    /// CPU readback is needed because hardware encoder zero-copy is not yet implemented.
    pub fn process_frame_to_cpu(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<u8>> {
        let result = self.process_frame(time, background_color)?;
        self.ctx
            .read_texture_sync(&result.texture, result.width, result.height)
    }

    /// Process a single frame and convert to NV12 format for encoding
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → Composite → NV12 Convert
    /// The RGBA→NV12 conversion is done on GPU via compute shader.
    pub fn process_frame_to_nv12(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<u8>> {
        let result = self.process_frame(time, background_color)?;

        // Create texture view for the composited RGBA texture
        let texture_view = result.texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Reuse or create NV12 output buffers (cached for performance)
        let needs_new_buffers = match &self.nv12_output_cache {
            Some(cache) => cache.width != result.width || cache.height != result.height,
            None => true,
        };
        if needs_new_buffers {
            self.nv12_output_cache = Some(
                self.rgba_to_nv12
                    .create_output_buffers(result.width, result.height),
            );
        }
        let nv12_output = self.nv12_output_cache.as_ref().unwrap();

        // Convert RGBA to NV12 on GPU (BT.709 for HD video)
        self.rgba_to_nv12.convert(&texture_view, nv12_output, 1)?;

        // Read NV12 data back to CPU
        self.rgba_to_nv12.read_nv12_data_blocking(nv12_output)
    }

    /// Process a single frame and return IOSurface handle for zero-copy encoding (macOS only)
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → Composite → NV12 Convert → IOSurface
    /// The output IOSurface can be passed directly to VideoToolbox encoder.
    ///
    /// Returns the IOSurface handle that can be used with `HwAccelEncoder::encode_frame_gpu()`.
    #[cfg(target_os = "macos")]
    pub fn process_frame_to_iosurface(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<usize> {
        use crate::gpu::RgbaToNv12TextureConverter;

        let result = self.process_frame(time, background_color)?;

        // Create texture view for the composited RGBA texture
        let texture_view = result.texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Lazy initialize zero-copy converter
        if self.zerocopy_converter.is_none() {
            self.zerocopy_converter = Some(RgbaToNv12TextureConverter::new(self.ctx.clone())?);
            tracing::info!("Initialized zero-copy RGBA→NV12 converter (IOSurface output)");
        }

        let converter = self.zerocopy_converter.as_mut().unwrap();

        // Convert RGBA to NV12 and return IOSurface handle
        converter.convert_to_iosurface(&texture_view, result.width, result.height, 1)
    }

    /// Close all decoders and release resources
    pub fn close(&mut self) {
        for (src, decoder) in self.decoders.iter_mut() {
            tracing::debug!("Closing decoder for {}", src);
            decoder.close();
        }
        self.decoders.clear();
    }

    // =========================================================================
    // Internal methods
    // =========================================================================

    /// Collect visible media elements at a given time
    fn collect_visible_media(&self, time: f64) -> Vec<(MediaElementData, i32)> {
        let mut result = Vec::new();
        let mut z_index = 0i32;

        for track in &self.timeline.tracks {
            // Skip muted tracks and non-video tracks (Media is alias for Video)
            if track.muted || !matches!(track.track_type, TrackType::Video | TrackType::Media) {
                continue;
            }

            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }

                match element {
                    ElementData::Media(media) => {
                        result.push((media.clone(), z_index));
                        z_index += 1;
                    }
                    ElementData::Text(text) => {
                        // TODO(P1): Implement text rendering to GPU texture
                        tracing::debug!(
                            "Text element '{}' at {:.2}s (not implemented)",
                            text.text,
                            time
                        );
                    }
                    ElementData::Audio(_) => {}
                }
            }
        }

        result
    }

    /// Decode a media element to a GPU layer
    ///
    /// Pipeline: ZeroCopyDecoder → Nv12GpuTexture → ImportedNv12Texture → RGBA → GpuLayer
    fn decode_to_gpu_layer(
        &mut self,
        media: &MediaElementData,
        timeline_time: f64,
        z_index: i32,
    ) -> Result<Option<GpuLayer>> {
        let decoder = self.decoders.get_mut(&media.src).ok_or_else(|| {
            Error::Other(format!("No decoder found for source: {}", media.src))
        })?;

        let source_time = media.get_source_time(timeline_time);

        // Debug: Log seek time
        if timeline_time < 0.2 || (timeline_time > 30.0 && timeline_time < 30.2) {
            tracing::debug!("Seeking to source_time={:.2}s for timeline_time={:.2}s", source_time, timeline_time);
        }

        // Step 1: Hardware decode → NV12 GPU texture
        // Use decode_gpu_at which handles seeking and decoding to the target time
        let nv12_texture = match decoder.decode_gpu_at(source_time)? {
            Some(tex) => tex,
            None => {
                tracing::warn!(
                    "No frame at source time {:.2}s for {}",
                    source_time,
                    media.src
                );
                return Ok(None);
            }
        };

        let width = nv12_texture.width;
        let height = nv12_texture.height;

        // Step 2: Import NV12 GPU texture → wgpu textures
        let imported = self.nv12_importer.import(&nv12_texture)?;

        // Step 3: NV12 → RGBA on GPU (render pipeline)
        let rgba_texture = self.nv12_renderer.render(&imported);

        // Step 4: Copy to pooled texture (avoids per-frame allocation)
        // Acquire texture first, then copy to avoid borrow conflict
        let tex_idx = self.layer_texture_pool.acquire(&self.ctx, width, height);
        {
            let dst = self.layer_texture_pool.get(tex_idx);
            let mut encoder = self.ctx.device().create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Texture Copy Encoder"),
            });

            encoder.copy_texture_to_texture(
                wgpu::ImageCopyTexture {
                    texture: rgba_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::ImageCopyTexture {
                    texture: dst,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );

            self.ctx.queue().submit(std::iter::once(encoder.finish()));
        }

        // Step 5: Build GpuLayer using the pooled texture
        // Note: We need to get the texture again after the borrow ends
        let owned_texture = self.layer_texture_pool.in_use.pop().unwrap();

        // Calculate transform: if no transform is specified, scale to fit output
        let mut transform = media.to_transform_2d();
        if media.transform.is_none() {
            // Auto-scale to fit output while maintaining aspect ratio
            let scale_x = self.output_width as f32 / width as f32;
            let scale_y = self.output_height as f32 / height as f32;
            // Use the smaller scale to fit within output (letterbox)
            let scale = scale_x.min(scale_y);
            transform.scale_x = scale;
            transform.scale_y = scale;
            // Center the video in the output
            // Position is in pixels, anchor is at center of the layer
            transform.x = self.output_width as f32 / 2.0;
            transform.y = self.output_height as f32 / 2.0;
            transform.anchor_x = 0.5;
            transform.anchor_y = 0.5;
        }

        let layer = GpuLayerBuilder::new()
            .transform(transform)
            .opacity(media.opacity)
            .blend_mode(media.get_blend_mode())
            .z_index(z_index)
            .build_from_rgba(owned_texture, width, height);

        Ok(Some(layer))
    }
}

impl Drop for GpuExportPipeline {
    fn drop(&mut self) {
        self.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::types::{ExportAudioCodec, ExportHwEncoder, ExportPreset, ExportVideoCodec};

    fn create_test_settings() -> ExportSettings {
        ExportSettings {
            width: 1920,
            height: 1080,
            fps: 30.0,
            video_codec: ExportVideoCodec::H264,
            video_bitrate: None,
            audio_codec: ExportAudioCodec::Aac,
            audio_bitrate: None,
            hw_encoder: ExportHwEncoder::None,
            time_range: None,
            preset: ExportPreset::Medium,
        }
    }

    #[tokio::test]
    async fn test_pipeline_creation() {
        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(_) => return, // Skip if no GPU
        };

        let timeline = TimelineData {
            duration: 10.0,
            tracks: vec![],
        };

        let pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx).unwrap();
        assert_eq!(pipeline.total_frames(), 300);
        assert_eq!(pipeline.output_dimensions(), (1920, 1080));
    }

    #[tokio::test]
    async fn test_empty_timeline_process() {
        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(_) => return,
        };

        let timeline = TimelineData {
            duration: 10.0,
            tracks: vec![],
        };

        let mut pipeline =
            GpuExportPipeline::new(timeline, create_test_settings(), ctx).unwrap();
        pipeline.initialize().unwrap();

        let result = pipeline
            .process_frame(5.0, [0.0, 0.0, 0.0, 1.0])
            .unwrap();
        assert_eq!(result.width, 1920);
        assert_eq!(result.height, 1080);
        assert_eq!(result.layer_count, 0);
    }
}
