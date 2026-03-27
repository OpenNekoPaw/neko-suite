//! GPU Export Pipeline - GPU-centric multi-source video export
//!
//! Orchestrates the full GPU pipeline for timeline-based video export:
//!
//! ```text
//! HwAccelDecoder[N] → Nv12TextureImporter → Nv12RenderCache
//!   → GpuLayer → TextureCompositor → RGBA texture → NV12 (GPU) → Encoder
//! ```
//!
//! All compositing stays on GPU. RGBA→NV12 conversion is done via GPU compute
//! shader to avoid CPU overhead. Only the final NV12 readback is CPU-bound.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use crate::decoder::{global_pool, HwAccelDecoder, HwAccelType};
use crate::domain::{Element, ElementType, Timeline};
use crate::error::{Error, Result};
use crate::gpu::scene_renderer::CameraParams;
use crate::gpu::{
    BlurParams, BlurType, ChromaticAberrationParams, CustomShaderProcessor, GlowParams,
    GpuBlurProcessor, GpuContext, GpuLayer, GpuLayerBuilder, GpuStyleProcessor, LutRegistry,
    Nv12OutputBuffers, Nv12RenderCache, Nv12TextureImporter, RgbaToNv12Converter, SharpenParams,
    TextRenderer, TextureCompositeResult, TextureCompositor, TextureTransitionProcessor,
    TransitionParams, TransitionType, VignetteParams,
};
use crate::telemetry::spans::span;
use crate::services::{ISceneService, SceneService};
use neko_types::TrackType;

use super::types::ExportSettings;

// =============================================================================
// Effect Dispatcher — maps ElementEffect to GPU processors
// =============================================================================

/// Dispatches `ElementEffect` instances to the appropriate GPU processor.
///
/// Phase 2: operates on `&[u8]` RGBA buffers (CPU round-trip per effect).
/// Future: GPU texture-to-texture pass for zero-copy effect chains.
///
/// Used by both export pipeline and composite preview pipeline.
pub struct EffectDispatcher {
    custom_shader: CustomShaderProcessor,
    blur_processor: GpuBlurProcessor,
    style_processor: GpuStyleProcessor,
}

impl EffectDispatcher {
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self {
            custom_shader: CustomShaderProcessor::new(ctx.clone())?,
            blur_processor: GpuBlurProcessor::new(ctx.clone())?,
            style_processor: GpuStyleProcessor::new(ctx)?,
        })
    }

    /// Apply all enabled effects on an element in stack order.
    /// Returns the processed RGBA pixel buffer.
    pub fn apply_effects(
        &self,
        mut pixels: Vec<u8>,
        width: u32,
        height: u32,
        effects: &[neko_types::ElementEffect],
    ) -> Result<Vec<u8>> {
        let mut sorted: Vec<&neko_types::ElementEffect> =
            effects.iter().filter(|e| e.enabled).collect();
        sorted.sort_by_key(|e| e.order);

        for fx in sorted {
            match self.apply_single(&pixels, width, height, fx) {
                Ok(result) => pixels = result,
                Err(e) => {
                    tracing::warn!(
                        "Effect '{}' ({}) failed, skipping: {}",
                        fx.effect_type,
                        fx.id,
                        e
                    );
                    // Graceful degradation: continue with unmodified pixels
                }
            }
        }
        Ok(pixels)
    }

    fn apply_single(
        &self,
        pixels: &[u8],
        width: u32,
        height: u32,
        fx: &neko_types::ElementEffect,
    ) -> Result<Vec<u8>> {
        let params = &fx.parameters;
        match fx.effect_type.as_str() {
            // Blur effects → GpuBlurProcessor
            "gaussian-blur" => {
                let radius = Self::get_f32(params, "radius", 10.0);
                self.blur_processor.apply_blur(
                    pixels,
                    width,
                    height,
                    &BlurParams {
                        blur_type: BlurType::Gaussian as u32,
                        radius,
                        strength: 1.0,
                        samples: 32,
                        ..Default::default()
                    },
                )
            }
            "motion-blur" => {
                let distance = Self::get_f32(params, "distance", 20.0);
                let angle = Self::get_f32(params, "angle", 0.0).to_radians();
                self.blur_processor.apply_blur(
                    pixels,
                    width,
                    height,
                    &BlurParams {
                        blur_type: BlurType::Directional as u32,
                        radius: distance,
                        direction_x: angle.cos(),
                        direction_y: angle.sin(),
                        ..Default::default()
                    },
                )
            }
            "radial-blur" => {
                let amount = Self::get_f32(params, "amount", 20.0) / 100.0;
                let center_x = Self::get_f32(params, "centerX", 50.0) / 100.0;
                let center_y = Self::get_f32(params, "centerY", 50.0) / 100.0;
                self.blur_processor.apply_blur(
                    pixels,
                    width,
                    height,
                    &BlurParams {
                        blur_type: BlurType::Radial as u32,
                        center_x,
                        center_y,
                        strength: amount,
                        ..Default::default()
                    },
                )
            }
            "sharpen" => {
                let amount = Self::get_f32(params, "amount", 1.0);
                let radius = Self::get_f32(params, "radius", 1.0);
                let threshold = Self::get_f32(params, "threshold", 0.0);
                self.blur_processor.apply_sharpen(
                    pixels,
                    width,
                    height,
                    &SharpenParams::with_options(amount, radius, threshold),
                )
            }

            // Style effects → GpuStyleProcessor
            "vignette" => {
                let amount = Self::get_f32(params, "amount", 0.5);
                let radius = Self::get_f32(params, "radius", 0.5);
                let softness = Self::get_f32(params, "softness", 0.5);
                let roundness = Self::get_f32(params, "roundness", 1.0);
                self.style_processor.apply_vignette(
                    pixels,
                    width,
                    height,
                    &VignetteParams::with_options(amount, radius, softness, roundness),
                )
            }
            "glow" => {
                let intensity = Self::get_f32(params, "intensity", 0.5);
                let threshold = Self::get_f32(params, "threshold", 0.5);
                let radius = Self::get_f32(params, "radius", 10.0);
                self.style_processor.apply_glow(
                    pixels,
                    width,
                    height,
                    &GlowParams::with_options(intensity, threshold, radius),
                )
            }
            "chromatic-aberration" => {
                let amount = Self::get_f32(params, "amount", 0.01);
                let angle = Self::get_f32(params, "angle", 0.0);
                let center_x = Self::get_f32(params, "centerX", 0.5);
                let center_y = Self::get_f32(params, "centerY", 0.5);
                self.style_processor.apply_chromatic_aberration(
                    pixels,
                    width,
                    height,
                    &ChromaticAberrationParams::with_options(amount, angle, center_x, center_y),
                )
            }

            // Color correction → GpuStyleProcessor
            "color-correction" => {
                let brightness = Self::get_f32(params, "brightness", 0.0);
                let contrast = Self::get_f32(params, "contrast", 1.0);
                let saturation = Self::get_f32(params, "saturation", 1.0);
                let exposure = Self::get_f32(params, "exposure", 0.0);
                let gamma = Self::get_f32(params, "gamma", 1.0);
                let hue_shift = Self::get_f32(params, "hueShift", 0.0);
                let vibrance = Self::get_f32(params, "vibrance", 0.0);
                let temperature = Self::get_f32(params, "temperature", 0.0);
                let tint = Self::get_f32(params, "tint", 0.0);
                let highlights = Self::get_f32(params, "highlights", 0.0);
                let shadows = Self::get_f32(params, "shadows", 0.0);
                let whites = Self::get_f32(params, "whites", 0.0);
                let blacks = Self::get_f32(params, "blacks", 0.0);

                // Color wheels (3-way correction)
                let cw_enabled = if Self::get_bool(params, "cw_enabled", false) {
                    1.0
                } else {
                    0.0
                };
                let cw_shadows_r = Self::get_f32(params, "cw_shadows_r", 0.5);
                let cw_shadows_g = Self::get_f32(params, "cw_shadows_g", 0.5);
                let cw_shadows_b = Self::get_f32(params, "cw_shadows_b", 0.5);
                let cw_shadows_brightness =
                    Self::get_f32(params, "cw_shadows_brightness", 0.0);
                let cw_midtones_r = Self::get_f32(params, "cw_midtones_r", 0.5);
                let cw_midtones_g = Self::get_f32(params, "cw_midtones_g", 0.5);
                let cw_midtones_b = Self::get_f32(params, "cw_midtones_b", 0.5);
                let cw_midtones_brightness =
                    Self::get_f32(params, "cw_midtones_brightness", 0.0);
                let cw_highlights_r = Self::get_f32(params, "cw_highlights_r", 0.5);
                let cw_highlights_g = Self::get_f32(params, "cw_highlights_g", 0.5);
                let cw_highlights_b = Self::get_f32(params, "cw_highlights_b", 0.5);
                let cw_highlights_brightness =
                    Self::get_f32(params, "cw_highlights_brightness", 0.0);

                // HSL per-color adjustments (variable count, max 8)
                let hsl_count = Self::get_f32(params, "hsl_count", 0.0);
                let mut hsl_data = [0.0f32; 32];
                let count = (hsl_count as usize).min(8);
                for i in 0..count {
                    hsl_data[i * 4] =
                        Self::get_f32(params, &format!("hsl_{}_target", i), 0.0);
                    hsl_data[i * 4 + 1] =
                        Self::get_f32(params, &format!("hsl_{}_hue", i), 0.0);
                    hsl_data[i * 4 + 2] =
                        Self::get_f32(params, &format!("hsl_{}_sat", i), 0.0);
                    hsl_data[i * 4 + 3] =
                        Self::get_f32(params, &format!("hsl_{}_lum", i), 0.0);
                }

                let mut result = self.style_processor.apply_color_correction(
                    pixels,
                    width,
                    height,
                    &crate::gpu::ColorCorrectionParams {
                        brightness,
                        contrast,
                        saturation,
                        exposure,
                        gamma,
                        hue_shift,
                        vibrance,
                        temperature,
                        tint,
                        highlights,
                        shadows,
                        whites,
                        blacks,
                        cw_enabled,
                        cw_shadows_r,
                        cw_shadows_g,
                        cw_shadows_b,
                        cw_shadows_brightness,
                        cw_midtones_r,
                        cw_midtones_g,
                        cw_midtones_b,
                        cw_midtones_brightness,
                        cw_highlights_r,
                        cw_highlights_g,
                        cw_highlights_b,
                        cw_highlights_brightness,
                        hsl_count,
                        hsl_data,
                        _padding: [0.0; 3],
                    },
                )?;

                // Apply curves LUT (CPU-side, after GPU color correction)
                let has_curves = Self::get_bool(params, "curves_enabled", false);
                if has_curves {
                    Self::apply_curves_lut(&mut result, params);
                }

                // Apply 3D LUT (CPU trilinear interpolation via global LutRegistry)
                let lut_id = Self::get_str(params, "lut_id");
                let lut_intensity = Self::get_f32(params, "lut_intensity", 1.0);
                if let Some(id) = lut_id {
                    LutRegistry::global().apply_to_pixels(&id, &mut result, lut_intensity);
                }

                Ok(result)
            }

            // Preset shaders → CustomShaderProcessor (noise, pixelate, etc.)
            "noise" | "pixelate" | "edge-detect" | "posterize" | "rgb-split" | "wave-distort" => {
                // Map TS kebab-case to Rust snake_case shader IDs
                let shader_id = fx.effect_type.replace('-', "_");
                let json_params = serde_json::Value::Object(params.clone());
                self.custom_shader
                    .apply(pixels, width, height, &shader_id, &json_params)
            }

            // Custom user-registered shaders
            _ => {
                // Try as custom shader ID (registered via effects:register)
                let json_params = serde_json::Value::Object(params.clone());
                self.custom_shader
                    .apply(pixels, width, height, &fx.effect_type, &json_params)
            }
        }
    }

    /// Parse a JSON string containing a 256-entry LUT array
    fn parse_lut(
        params: &serde_json::Map<String, serde_json::Value>,
        key: &str,
    ) -> Option<Vec<u8>> {
        let json_str = params.get(key)?.as_str()?;
        let values: Vec<f64> = serde_json::from_str(json_str).ok()?;
        if values.len() != 256 {
            return None;
        }
        Some(
            values
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0).round() as u8)
                .collect(),
        )
    }

    /// Apply curves LUT to RGBA pixel buffer (CPU-side).
    /// Supports RGB master curve, per-channel R/G/B, and luminance curve.
    fn apply_curves_lut(
        pixels: &mut [u8],
        params: &serde_json::Map<String, serde_json::Value>,
    ) {
        let lut_rgb = Self::parse_lut(params, "curve_rgb");
        let lut_r = Self::parse_lut(params, "curve_r");
        let lut_g = Self::parse_lut(params, "curve_g");
        let lut_b = Self::parse_lut(params, "curve_b");
        let lut_luma = Self::parse_lut(params, "curve_luma");

        // Apply per-pixel (RGBA layout, 4 bytes per pixel)
        for chunk in pixels.chunks_exact_mut(4) {
            let mut r = chunk[0];
            let mut g = chunk[1];
            let mut b = chunk[2];

            // Master RGB curve (applied to all channels)
            if let Some(ref lut) = lut_rgb {
                r = lut[r as usize];
                g = lut[g as usize];
                b = lut[b as usize];
            }

            // Per-channel curves
            if let Some(ref lut) = lut_r {
                r = lut[r as usize];
            }
            if let Some(ref lut) = lut_g {
                g = lut[g as usize];
            }
            if let Some(ref lut) = lut_b {
                b = lut[b as usize];
            }

            // Luminance curve (apply luminance shift while preserving color)
            if let Some(ref lut) = lut_luma {
                let luma = (0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32) as u8;
                let new_luma = lut[luma as usize] as f32;
                let old_luma = luma as f32;
                if old_luma > 0.5 {
                    let ratio = new_luma / old_luma;
                    r = (r as f32 * ratio).min(255.0) as u8;
                    g = (g as f32 * ratio).min(255.0) as u8;
                    b = (b as f32 * ratio).min(255.0) as u8;
                } else {
                    // Near-black: add the difference
                    let diff = new_luma - old_luma;
                    r = (r as f32 + diff).clamp(0.0, 255.0) as u8;
                    g = (g as f32 + diff).clamp(0.0, 255.0) as u8;
                    b = (b as f32 + diff).clamp(0.0, 255.0) as u8;
                }
            }

            chunk[0] = r;
            chunk[1] = g;
            chunk[2] = b;
            // Alpha (chunk[3]) unchanged
        }
    }

    /// Extract an f32 parameter from the JSON map, with a default value.
    fn get_f32(
        params: &serde_json::Map<String, serde_json::Value>,
        key: &str,
        default: f32,
    ) -> f32 {
        params
            .get(key)
            .and_then(|v| v.as_f64())
            .map(|v| v as f32)
            .unwrap_or(default)
    }

    /// Extract a bool parameter from the JSON map, with a default value.
    fn get_bool(
        params: &serde_json::Map<String, serde_json::Value>,
        key: &str,
        default: bool,
    ) -> bool {
        params
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(default)
    }

    /// Extract an optional string parameter from the JSON map.
    fn get_str<'a>(
        params: &'a serde_json::Map<String, serde_json::Value>,
        key: &str,
    ) -> Option<&'a str> {
        params.get(key).and_then(|v| v.as_str())
    }
}

// =============================================================================
// GPU Pipeline Timing
// =============================================================================

/// Detailed timing breakdown for GPU pipeline stages
#[derive(Debug, Clone, Default)]
pub struct GpuPipelineTiming {
    /// Hardware decode time in nanoseconds
    pub hw_decode_ns: u64,
    /// NV12 texture import to wgpu in nanoseconds
    pub nv12_import_ns: u64,
    /// NV12 to RGBA conversion in nanoseconds
    pub nv12_to_rgba_ns: u64,
    /// Layer composition in nanoseconds
    pub composite_ns: u64,
    /// RGBA to NV12 conversion in nanoseconds
    pub rgba_to_nv12_ns: u64,
    /// CPU readback in nanoseconds
    pub cpu_readback_ns: u64,
}

impl GpuPipelineTiming {
    /// Get total GPU pipeline time in nanoseconds
    pub fn total_ns(&self) -> u64 {
        self.hw_decode_ns
            + self.nv12_import_ns
            + self.nv12_to_rgba_ns
            + self.composite_ns
            + self.rgba_to_nv12_ns
            + self.cpu_readback_ns
    }
}

/// Result of processing a frame to NV12 with timing information
pub struct Nv12FrameResult {
    /// NV12 data (empty if using zero-copy)
    pub data: Vec<u8>,
    /// IOSurface handle for zero-copy (macOS only)
    pub gpu_handle: Option<usize>,
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Detailed timing breakdown
    pub timing: GpuPipelineTiming,
}

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
            // Use Rgba16Float for HDR support and to avoid color banding
            format: wgpu::TextureFormat::Rgba16Float,
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
    decoders: HashMap<String, HwAccelDecoder>,
    /// NV12 texture importer (hardware decoder → wgpu)
    nv12_importer: Nv12TextureImporter,
    /// NV12 → RGBA renderer (pure GPU render pipeline)
    nv12_renderer: Nv12RenderCache,
    /// Multi-layer GPU texture compositor
    compositor: TextureCompositor,
    /// RGBA → NV12 converter for encoder output
    rgba_to_nv12: RgbaToNv12Converter,
    /// Timeline data
    timeline: Timeline,
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
    /// Text renderer for text elements (lazy-initialized)
    text_renderer: Option<TextRenderer>,
    /// Effect dispatcher for per-element GPU effects (None when GPU unavailable)
    effect_dispatcher: Option<EffectDispatcher>,
    /// Texture-based transition processor for GPU zero-copy transitions
    transition_processor: TextureTransitionProcessor,
    /// Scene service for 3D element rendering
    scene_service: Option<Arc<SceneService>>,
    /// Zero-copy RGBA→NV12 converter (macOS only, outputs to IOSurface)
    #[cfg(target_os = "macos")]
    zerocopy_converter: Option<crate::gpu::RgbaToNv12TextureConverter>,
}

impl GpuExportPipeline {
    /// Create a new GPU export pipeline
    pub fn new(
        timeline: Timeline,
        settings: ExportSettings,
        ctx: Arc<GpuContext>,
        scene_service: Option<Arc<SceneService>>,
    ) -> Result<Self> {
        let total_frames = timeline.total_frames_at_fps(settings.fps);
        let output_width = settings.width;
        let output_height = settings.height;

        let nv12_importer = Nv12TextureImporter::new(ctx.clone());
        let nv12_renderer = Nv12RenderCache::new(ctx.clone())?;
        let compositor = TextureCompositor::new(ctx.clone())?;
        let rgba_to_nv12 = RgbaToNv12Converter::new(ctx.clone())?;
        let effect_dispatcher = EffectDispatcher::new(ctx.clone()).ok();
        let transition_processor = TextureTransitionProcessor::new(ctx.clone())?;

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
            text_renderer: None,
            effect_dispatcher,
            transition_processor,
            scene_service,
            #[cfg(target_os = "macos")]
            zerocopy_converter: None,
        })
    }

    /// Initialize all required video decoders from the pool
    pub fn initialize(&mut self) -> Result<()> {
        let sources = self.timeline.get_media_sources();
        let pool = global_pool();

        for src in sources {
            let mut guard = pool.acquire(&src, HwAccelType::Auto)?;
            let decoder = guard
                .take_decoder()
                .ok_or_else(|| Error::Other("Decoder guard was empty".to_string()))?;

            tracing::info!(
                "Acquired pooled HW decoder for {}: hw={}",
                src,
                decoder.is_hw_active()
            );
            self.decoders.insert(src, decoder);
        }

        Ok(())
    }

    /// Hot-update timeline data for an active pipeline.
    /// Opens decoders for any new media sources via pool, keeps existing decoders intact.
    pub fn update_timeline(&mut self, timeline: Timeline) {
        // Open decoders for new sources that don't exist yet
        let new_sources = timeline.get_media_sources();
        let pool = global_pool();
        for src in &new_sources {
            if !self.decoders.contains_key(src) {
                match pool.acquire(src, HwAccelType::Auto) {
                    Ok(mut guard) => {
                        if let Some(decoder) = guard.take_decoder() {
                            tracing::info!(
                                "Hot-update: acquired pooled decoder for new source {}",
                                src
                            );
                            self.decoders.insert(src.clone(), decoder);
                        }
                    }
                    Err(e) => {
                        tracing::error!("Hot-update: failed to acquire decoder for {}: {}", src, e);
                    }
                }
            }
        }

        // Update timeline and recalculate duration
        self.total_frames = timeline.total_frames_at_fps(self.settings.fps);
        self.timeline = timeline;
    }

    /// Get total frames to export
    pub fn total_frames(&self) -> u64 {
        self.total_frames
    }

    /// Hot-update output resolution (for preview quality changes).
    /// Invalidates NV12 output cache and texture pool so they are
    /// re-allocated at the new size on the next frame.
    pub fn update_resolution(&mut self, width: u32, height: u32) {
        if self.output_width == width && self.output_height == height {
            return;
        }
        tracing::info!(
            "GpuExportPipeline: resolution {}x{} -> {}x{}",
            self.output_width,
            self.output_height,
            width,
            height
        );
        self.output_width = width;
        self.output_height = height;
        self.settings.width = width;
        self.settings.height = height;
        // Invalidate cached buffers sized for the old resolution
        self.nv12_output_cache = None;
    }

    /// Get output dimensions
    pub fn output_dimensions(&self) -> (u32, u32) {
        (self.output_width, self.output_height)
    }

    /// Process a single frame entirely on GPU
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → GpuLayer → Composite
    /// Returns the composited result as a GPU texture.
    #[tracing::instrument(
        skip(self),
        fields(
            time = %format!("{:.3}s", time),
        )
    )]
    pub fn process_frame(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<TextureCompositeResult> {
        let mut timing = GpuPipelineTiming::default();
        self.process_frame_timed(time, background_color, &mut timing)
    }

    /// Process a single frame with detailed timing breakdown
    ///
    /// Same as `process_frame` but populates timing information.
    fn process_frame_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
        timing: &mut GpuPipelineTiming,
    ) -> Result<TextureCompositeResult> {
        // Mark frame boundary for Tracy
        crate::telemetry::spans::mark_frame_boundary();

        // Release textures from previous frame back to pool
        self.layer_texture_pool.release_all();

        let media_elements = {
            let _span = tracing::debug_span!(span::DECODE_VISIBLE_MEDIA).entered();
            self.collect_visible_media(time)
        };
        tracing::debug!(
            "Found {} visible media elements at time {:.2}s",
            media_elements.len(),
            time
        );

        let mut gpu_layers: Vec<GpuLayer> = Vec::new();
        {
            let _span =
                tracing::debug_span!(span::GPU_PIPELINE, layers = media_elements.len()).entered();
            for (media, z_idx) in &media_elements {
                if let Some(layer) = self.decode_to_gpu_layer_timed(media, time, *z_idx, timing)? {
                    gpu_layers.push(layer);
                }
            }
        }

        // Render text elements on top of media layers
        let text_z_start = media_elements.len() as i32;
        let text_elements = self.collect_visible_text(time, text_z_start);
        if !text_elements.is_empty() {
            tracing::debug!(
                "Rendering {} text elements at time {:.2}s",
                text_elements.len(),
                time
            );
            for (text, z_idx) in &text_elements {
                if let Some(layer) = self.render_text_to_gpu_layer(text, *z_idx) {
                    gpu_layers.push(layer);
                }
            }
        }

        // Render 3D scene elements
        let scene3d_z_start = (media_elements.len() + text_elements.len()) as i32;
        let scene3d_elements = self.collect_visible_scene3d(time, scene3d_z_start);
        if !scene3d_elements.is_empty() {
            tracing::debug!(
                "Rendering {} scene3d elements at time {:.2}s",
                scene3d_elements.len(),
                time
            );
            for (scene3d, z_idx) in &scene3d_elements {
                if let Some(layer) = self.render_scene3d_to_gpu_layer(scene3d, time, *z_idx) {
                    gpu_layers.push(layer);
                }
            }
        }

        tracing::debug!("Created {} GPU layers for compositing", gpu_layers.len());

        // Apply transitions: blend paired layers via texture-based GPU transition
        self.apply_transitions(&media_elements, &mut gpu_layers)?;

        let layer_refs: Vec<&GpuLayer> = gpu_layers.iter().collect();
        let result = {
            let start = Instant::now();
            let _span = tracing::debug_span!(
                span::COMPOSITE,
                width = self.output_width,
                height = self.output_height,
                layer_count = layer_refs.len()
            )
            .entered();
            let result = self.compositor.composite(
                &layer_refs,
                self.output_width,
                self.output_height,
                background_color,
            );
            timing.composite_ns += start.elapsed().as_nanos() as u64;
            result
        };

        result
    }

    /// Process a single frame and read back to CPU
    ///
    /// Calls `process_frame()` then reads the GPU texture to CPU memory.
    /// CPU readback is needed because hardware encoder zero-copy is not yet implemented.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    pub fn process_frame_to_cpu(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<u8>> {
        let result = self.process_frame(time, background_color)?;
        let _span = tracing::debug_span!(span::CPU_READBACK).entered();
        self.ctx
            .read_texture_sync(&result.texture, result.width, result.height)
    }

    /// Process a single frame and convert to NV12 format for encoding
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → Composite → NV12 Convert
    /// The RGBA→NV12 conversion is done on GPU via compute shader.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    pub fn process_frame_to_nv12(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Vec<u8>> {
        let result = self.process_frame_to_nv12_timed(time, background_color)?;
        Ok(result.data)
    }

    /// Process a single frame to NV12 with detailed timing breakdown
    ///
    /// Returns NV12 data along with timing for each pipeline stage.
    /// Use this method when you need performance metrics.
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    pub fn process_frame_to_nv12_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Nv12FrameResult> {
        let mut timing = GpuPipelineTiming::default();

        // Process frame with internal timing
        let result = self.process_frame_timed(time, background_color, &mut timing)?;

        // Create texture view for the composited RGBA texture
        let texture_view = result
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

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
        {
            let start = Instant::now();
            let _span = tracing::debug_span!(span::RGBA_TO_NV12).entered();
            self.rgba_to_nv12.convert(&texture_view, nv12_output, 1)?;
            timing.rgba_to_nv12_ns = start.elapsed().as_nanos() as u64;
        }

        // Read NV12 data back to CPU
        let data = {
            let start = Instant::now();
            let _span = tracing::debug_span!(span::CPU_READBACK).entered();
            let data = self.rgba_to_nv12.read_nv12_data_blocking(nv12_output)?;
            timing.cpu_readback_ns = start.elapsed().as_nanos() as u64;
            data
        };

        Ok(Nv12FrameResult {
            data,
            gpu_handle: None,
            width: result.width,
            height: result.height,
            timing,
        })
    }

    /// Process a single frame and return IOSurface handle for zero-copy encoding (macOS only)
    ///
    /// Full pipeline: Decode → NV12 Import → RGBA Convert → Composite → NV12 Convert → IOSurface
    /// The output IOSurface can be passed directly to VideoToolbox encoder.
    ///
    /// Returns the IOSurface handle that can be used with `HwAccelEncoder::encode_frame_gpu()`.
    #[cfg(target_os = "macos")]
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    pub fn process_frame_to_iosurface(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<usize> {
        let result = self.process_frame_to_iosurface_timed(time, background_color)?;
        Ok(result.gpu_handle.unwrap())
    }

    /// Process a single frame to IOSurface with detailed timing breakdown (macOS only)
    #[cfg(target_os = "macos")]
    #[tracing::instrument(skip(self), fields(time = %format!("{:.3}s", time)))]
    pub fn process_frame_to_iosurface_timed(
        &mut self,
        time: f64,
        background_color: [f32; 4],
    ) -> Result<Nv12FrameResult> {
        use crate::gpu::RgbaToNv12TextureConverter;

        let mut timing = GpuPipelineTiming::default();

        let result = self.process_frame_timed(time, background_color, &mut timing)?;

        // Create texture view for the composited RGBA texture
        let texture_view = result
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Lazy initialize zero-copy converter
        if self.zerocopy_converter.is_none() {
            self.zerocopy_converter = Some(RgbaToNv12TextureConverter::new(self.ctx.clone())?);
            tracing::info!("Initialized zero-copy RGBA→NV12 converter (IOSurface output)");
        }

        let converter = self.zerocopy_converter.as_mut().unwrap();

        // Convert RGBA to NV12 and return IOSurface handle
        let gpu_handle = {
            let start = Instant::now();
            let _span = tracing::debug_span!(span::RGBA_TO_NV12, zerocopy = true).entered();
            let handle =
                converter.convert_to_iosurface(&texture_view, result.width, result.height, 1)?;
            timing.rgba_to_nv12_ns = start.elapsed().as_nanos() as u64;
            handle
        };

        Ok(Nv12FrameResult {
            data: Vec::new(),
            gpu_handle: Some(gpu_handle),
            width: result.width,
            height: result.height,
            timing,
        })
    }

    /// Close all decoders and return them to the pool for reuse
    pub fn close(&mut self) {
        let pool = global_pool();
        for (src, decoder) in self.decoders.drain() {
            tracing::debug!("Returning decoder for {} to pool", src);
            pool.return_decoder(decoder, &src, HwAccelType::Auto);
        }
    }

    // =========================================================================
    // Internal methods
    // =========================================================================

    /// Apply texture-based transitions between paired layers.
    ///
    /// Scans media elements for transition info, pre-composites each pair to
    /// canvas-sized textures, applies the GPU transition effect, and replaces
    /// the pair with a single blended layer.
    fn apply_transitions(
        &self,
        media_elements: &[(Element, i32)],
        gpu_layers: &mut Vec<GpuLayer>,
    ) -> Result<()> {
        // Collect transition pairs: (from_layer_idx, to_layer_idx, type, progress)
        let mut transition_pairs: Vec<(usize, usize, String, f64)> = Vec::new();
        for (idx, (element, _)) in media_elements.iter().enumerate() {
            if let Some(ref trans) = element.transition {
                let to_idx = trans.paired_layer_index;
                if to_idx < gpu_layers.len() && idx < gpu_layers.len() && idx != to_idx {
                    transition_pairs.push((
                        idx,
                        to_idx,
                        trans.transition_type.clone(),
                        trans.progress,
                    ));
                }
            }
        }

        if transition_pairs.is_empty() {
            return Ok(());
        }

        tracing::debug!(
            "Processing {} transition pair(s)",
            transition_pairs.len()
        );

        let mut removal_indices: Vec<usize> = Vec::new();

        for (from_idx, to_idx, transition_type, progress) in &transition_pairs {
            let from_idx = *from_idx;
            let to_idx = *to_idx;

            // Pre-composite each layer individually to canvas-sized Rgba16Float texture
            let from_result = self.compositor.composite(
                &[&gpu_layers[from_idx]],
                self.output_width,
                self.output_height,
                [0.0, 0.0, 0.0, 0.0], // transparent background
            )?;
            let to_result = self.compositor.composite(
                &[&gpu_layers[to_idx]],
                self.output_width,
                self.output_height,
                [0.0, 0.0, 0.0, 0.0],
            )?;

            // Apply GPU transition
            let params = TransitionParams::new(
                TransitionType::from_str(transition_type),
                *progress as f32,
            );

            let (blended_texture, _blended_view) = self.transition_processor.apply_transition(
                &from_result.view,
                &to_result.view,
                self.output_width,
                self.output_height,
                &params,
            )?;

            // Replace from_layer with blended result (identity transform, full canvas)
            gpu_layers[from_idx] = GpuLayer::from_rgba(
                blended_texture,
                self.output_width,
                self.output_height,
                crate::gpu::Transform2D {
                    x: self.output_width as f32 / 2.0,
                    y: self.output_height as f32 / 2.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation: 0.0,
                    anchor_x: 0.5,
                    anchor_y: 0.5,
                    _padding: 0.0,
                },
                1.0,
                crate::gpu::BlendMode::Normal,
                gpu_layers[from_idx].z_index,
            );

            // Mark to_layer for removal
            removal_indices.push(to_idx);
        }

        // Remove consumed to_layers in reverse order to maintain valid indices
        removal_indices.sort_unstable();
        removal_indices.dedup();
        for idx in removal_indices.into_iter().rev() {
            if idx < gpu_layers.len() {
                gpu_layers.remove(idx);
            }
        }

        Ok(())
    }

    /// Collect visible media elements at a given time
    fn collect_visible_media(&self, time: f64) -> Vec<(Element, i32)> {
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

                if element.is_media() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Collect visible text elements at a given time
    fn collect_visible_text(&self, time: f64, z_index_start: i32) -> Vec<(Element, i32)> {
        let mut result = Vec::new();
        let mut z_index = z_index_start;

        for track in &self.timeline.tracks {
            if track.muted {
                continue;
            }

            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }

                if element.is_text() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Collect visible 3D scene elements at a given time
    fn collect_visible_scene3d(&self, time: f64, z_index_start: i32) -> Vec<(Element, i32)> {
        let mut result = Vec::new();
        let mut z_index = z_index_start;

        for track in &self.timeline.tracks {
            if track.muted || !matches!(track.track_type, TrackType::Scene3d) {
                continue;
            }

            for element in &track.elements {
                if !element.is_visible_at(time) {
                    continue;
                }

                if element.is_scene3d() {
                    result.push((element.clone(), z_index));
                    z_index += 1;
                }
            }
        }

        result
    }

    /// Render a text element to a GpuLayer
    fn render_text_to_gpu_layer(&mut self, element: &Element, z_index: i32) -> Option<GpuLayer> {
        let text_data = match &element.element_type {
            ElementType::Text(t) => t,
            _ => return None,
        };

        // Lazy-initialize text renderer
        if self.text_renderer.is_none() {
            self.text_renderer = Some(TextRenderer::new(self.ctx.clone()));
        }

        let renderer = self.text_renderer.as_mut().unwrap();

        // Build text style from Phase 2 fields
        let style_opts = crate::gpu::TextStyle {
            line_height: Some(text_data.line_height),
            text_decoration: Some(text_data.text_decoration.clone()),
            stroke_color: Some(text_data.stroke_color.clone()),
            stroke_width: Some(text_data.stroke_width),
            shadow: text_data
                .shadow
                .as_ref()
                .map(|s| crate::gpu::TextShadowStyle {
                    color: s.color.clone(),
                    offset_x: s.offset_x,
                    offset_y: s.offset_y,
                    blur: s.blur,
                }),
            background_color: Some(text_data.background_color.clone()),
        };

        // Rasterize text to RGBA buffer with full styling
        let rasterized = renderer.rasterize_styled(
            &text_data.content,
            &text_data.font_family,
            text_data.font_size,
            &text_data.color,
            &text_data.font_weight,
            &text_data.font_style,
            Some(self.output_width as f32),
            &style_opts,
        )?;

        let width = rasterized.width;
        let height = rasterized.height;

        // Upload to GPU texture
        let texture = renderer.upload_to_texture(&rasterized);

        // Build transform: use element transform, or center text in output
        let transform = if !element.transform.is_identity() {
            element.to_transform_2d()
        } else {
            // Default: center the text in the output
            crate::gpu::Transform2D {
                x: self.output_width as f32 / 2.0,
                y: self.output_height as f32 / 2.0,
                scale_x: 1.0,
                scale_y: 1.0,
                rotation: 0.0,
                anchor_x: 0.5,
                anchor_y: 0.5,
                _padding: 0.0,
            }
        };

        let layer = GpuLayerBuilder::new()
            .transform(transform)
            .opacity(element.opacity as f32)
            .z_index(z_index)
            .build_from_rgba(texture, width, height);

        tracing::debug!(
            "Rendered text '{}' to {}x{} texture (z_index={})",
            text_data.content,
            width,
            height,
            z_index
        );

        Some(layer)
    }

    /// Render a 3D scene element to a GpuLayer
    fn render_scene3d_to_gpu_layer(
        &self,
        element: &Element,
        time: f64,
        z_index: i32,
    ) -> Option<GpuLayer> {
        let scene_data = match &element.element_type {
            ElementType::Scene3D(s) => s,
            _ => return None,
        };

        let service = self.scene_service.as_ref()?;

        // Calculate animation time: relative to element start, scaled by speed
        let source_time = element.get_source_time(time);
        let scene_time = (source_time * scene_data.animation_speed) as f32;

        // Build camera override if specified
        let camera_override = scene_data.camera_override.as_ref().map(|c| CameraParams {
            position: glam::Vec3::new(c.position[0], c.position[1], c.position[2]),
            target: glam::Vec3::new(c.target[0], c.target[1], c.target[2]),
            up: glam::Vec3::new(c.up[0], c.up[1], c.up[2]),
            fov_y: c.fov_y.to_radians(),
            ..CameraParams::default()
        });

        // Render the 3D scene
        let output = service
            .render_frame(
                scene_data.animation_clip.as_deref(),
                scene_time,
                (self.output_width, self.output_height),
                camera_override.as_ref(),
                scene_data.background_color,
            )
            .map_err(|e| {
                tracing::warn!("Scene3D render failed for {}: {}", scene_data.src, e);
                e
            })
            .ok()?;

        // Build transform from element (or default to identity)
        let transform = if !element.transform.is_identity() {
            element.to_transform_2d()
        } else {
            // Default: center the scene in the output
            crate::gpu::Transform2D {
                x: self.output_width as f32 / 2.0,
                y: self.output_height as f32 / 2.0,
                scale_x: 1.0,
                scale_y: 1.0,
                rotation: 0.0,
                anchor_x: 0.5,
                anchor_y: 0.5,
                _padding: 0.0,
            }
        };

        let layer = output.into_gpu_layer(
            transform,
            element.opacity as f32,
            element.to_gpu_blend_mode(),
            z_index,
        );

        tracing::debug!(
            "Rendered scene3d '{}' to {}x{} (z_index={})",
            scene_data.src,
            self.output_width,
            self.output_height,
            z_index
        );

        Some(layer)
    }

    /// Decode a media element to a GPU layer
    ///
    /// Pipeline: HwAccelDecoder → Nv12GpuTexture → ImportedNv12Texture → RGBA → GpuLayer
    #[tracing::instrument(
        skip(self, element),
        fields(
            src = %element.source_path().unwrap_or_default(),
            z_index = z_index,
        )
    )]
    #[allow(dead_code)] // Phase 2: convenience wrapper over decode_to_gpu_layer_timed
    fn decode_to_gpu_layer(
        &mut self,
        element: &Element,
        timeline_time: f64,
        z_index: i32,
    ) -> Result<Option<GpuLayer>> {
        let mut timing = GpuPipelineTiming::default();
        self.decode_to_gpu_layer_timed(element, timeline_time, z_index, &mut timing)
    }

    /// Decode a media element to a GPU layer with timing breakdown
    fn decode_to_gpu_layer_timed(
        &mut self,
        element: &Element,
        timeline_time: f64,
        z_index: i32,
        timing: &mut GpuPipelineTiming,
    ) -> Result<Option<GpuLayer>> {
        let src = element
            .source_path()
            .ok_or_else(|| Error::Other("Element has no source path".to_string()))?;

        let decoder = self
            .decoders
            .get_mut(&src)
            .ok_or_else(|| Error::Other(format!("No decoder found for source: {}", src)))?;

        let source_time = element.get_source_time(timeline_time);

        // Debug: Log seek time
        if timeline_time < 0.2 || (timeline_time > 30.0 && timeline_time < 30.2) {
            tracing::debug!(
                "Seeking to source_time={:.2}s for timeline_time={:.2}s",
                source_time,
                timeline_time
            );
        }

        // Step 1: Hardware decode → NV12 GPU texture
        let nv12_texture = {
            let start = Instant::now();
            let _span = tracing::trace_span!(span::HW_DECODE).entered();
            let result = match decoder.decode_gpu_at(source_time)? {
                Some(tex) => tex,
                None => {
                    tracing::warn!("No frame at source time {:.2}s for {}", source_time, src);
                    return Ok(None);
                }
            };
            timing.hw_decode_ns += start.elapsed().as_nanos() as u64;
            result
        };

        let width = nv12_texture.width;
        let height = nv12_texture.height;

        // Step 2: Import NV12 GPU texture → wgpu textures
        let imported = {
            let start = Instant::now();
            let _span = tracing::trace_span!(span::NV12_IMPORT).entered();
            let result = self.nv12_importer.import(&nv12_texture)?;
            timing.nv12_import_ns += start.elapsed().as_nanos() as u64;
            result
        };

        // Step 3: NV12 → RGBA on GPU (render pipeline)
        let rgba_texture = {
            let start = Instant::now();
            let _span = tracing::trace_span!(span::NV12_TO_RGBA).entered();
            let result = self.nv12_renderer.render(&imported);
            timing.nv12_to_rgba_ns += start.elapsed().as_nanos() as u64;
            result
        };

        // Step 3.5: Apply per-element visual effects (CPU round-trip, Phase 2)
        let effects_applied_texture: Option<wgpu::Texture> = if !element.effects.is_empty() {
            if let Some(ref dispatcher) = self.effect_dispatcher {
                let _span =
                    tracing::trace_span!("EFFECT_DISPATCH", effects = element.effects.len())
                        .entered();
                // Read RGBA from GPU texture to CPU
                match self.ctx.read_texture_sync(rgba_texture, width, height) {
                    Ok(pixels) => {
                        match dispatcher.apply_effects(pixels, width, height, &element.effects) {
                            Ok(processed) => {
                                // Upload processed pixels back as a new texture
                                let tex =
                                    self.ctx.device().create_texture(&wgpu::TextureDescriptor {
                                        label: Some("Effects Output"),
                                        size: wgpu::Extent3d {
                                            width,
                                            height,
                                            depth_or_array_layers: 1,
                                        },
                                        mip_level_count: 1,
                                        sample_count: 1,
                                        dimension: wgpu::TextureDimension::D2,
                                        format: wgpu::TextureFormat::Rgba8Unorm,
                                        usage: wgpu::TextureUsages::COPY_SRC
                                            | wgpu::TextureUsages::COPY_DST
                                            | wgpu::TextureUsages::TEXTURE_BINDING,
                                        view_formats: &[],
                                    });
                                self.ctx.queue().write_texture(
                                    wgpu::ImageCopyTexture {
                                        texture: &tex,
                                        mip_level: 0,
                                        origin: wgpu::Origin3d::ZERO,
                                        aspect: wgpu::TextureAspect::All,
                                    },
                                    &processed,
                                    wgpu::ImageDataLayout {
                                        offset: 0,
                                        bytes_per_row: Some(width * 4),
                                        rows_per_image: Some(height),
                                    },
                                    wgpu::Extent3d {
                                        width,
                                        height,
                                        depth_or_array_layers: 1,
                                    },
                                );
                                Some(tex)
                            }
                            Err(e) => {
                                tracing::error!(
                                    "Effect dispatch failed: {}, using original frame",
                                    e
                                );
                                None
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Texture readback failed: {}, using original frame", e);
                        None
                    }
                }
            } else {
                None
            }
        } else {
            None
        };
        let effective_rgba = effects_applied_texture.as_ref().unwrap_or(rgba_texture);

        // Step 4: Copy to pooled texture (avoids per-frame allocation)
        let tex_idx = self.layer_texture_pool.acquire(&self.ctx, width, height);
        {
            let _span = tracing::trace_span!(span::GPU_SUBMIT).entered();
            let dst = self.layer_texture_pool.get(tex_idx);
            let mut encoder =
                self.ctx
                    .device()
                    .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                        label: Some("Texture Copy Encoder"),
                    });

            encoder.copy_texture_to_texture(
                wgpu::ImageCopyTexture {
                    texture: effective_rgba,
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
        let owned_texture = self.layer_texture_pool.in_use.pop().unwrap();

        // Calculate transform: always apply fit-to-canvas base scaling
        // JVI transform semantics:
        //   x/y: normalized position (0-1), where 0.5 = center
        //   scaleX/scaleY: relative to fit-to-canvas size (1.0 = 100% fit)
        //   anchorX/anchorY: normalized anchor point (0-1)
        let mut transform = element.to_transform_2d();
        if element.transform.is_identity() {
            // No transform specified: auto-scale to fit output (letterbox + center)
            let scale_x = self.output_width as f32 / width as f32;
            let scale_y = self.output_height as f32 / height as f32;
            let scale = scale_x.min(scale_y);
            transform.scale_x = scale;
            transform.scale_y = scale;
            transform.x = self.output_width as f32 / 2.0;
            transform.y = self.output_height as f32 / 2.0;
            transform.anchor_x = 0.5;
            transform.anchor_y = 0.5;
        } else {
            // JVI transform: convert normalized coords to pixel coords
            // and apply fit-to-canvas base scaling to scaleX/scaleY
            let fit_scale_x = self.output_width as f32 / width as f32;
            let fit_scale_y = self.output_height as f32 / height as f32;
            let fit_scale = fit_scale_x.min(fit_scale_y);

            // scaleX: 1.0 means "fit to canvas", user scale is relative to that
            transform.scale_x *= fit_scale;
            transform.scale_y *= fit_scale;

            // x/y: normalized (0-1) → pixel coordinates
            transform.x *= self.output_width as f32;
            transform.y *= self.output_height as f32;
        }

        let layer = {
            let _span = tracing::trace_span!(span::LAYER_RENDER).entered();
            GpuLayerBuilder::new()
                .transform(transform)
                .opacity(element.opacity as f32)
                .blend_mode(element.to_gpu_blend_mode())
                .z_index(z_index)
                .build_from_rgba(owned_texture, width, height)
        };

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
    use neko_types::Resolution;

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
            use_zero_copy_gpu: false,
        }
    }

    #[tokio::test]
    async fn test_pipeline_creation() {
        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(_) => return, // Skip if no GPU
        };

        let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
        timeline.duration = 10.0;

        let pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx, None).unwrap();
        assert_eq!(pipeline.total_frames(), 300);
        assert_eq!(pipeline.output_dimensions(), (1920, 1080));
    }

    #[tokio::test]
    async fn test_empty_timeline_process() {
        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(_) => return,
        };

        let mut timeline = Timeline::new(Resolution::full_hd(), 30.0);
        timeline.duration = 10.0;

        let mut pipeline = GpuExportPipeline::new(timeline, create_test_settings(), ctx, None).unwrap();
        pipeline.initialize().unwrap();

        let result = pipeline.process_frame(5.0, [0.0, 0.0, 0.0, 1.0]).unwrap();
        assert_eq!(result.width, 1920);
        assert_eq!(result.height, 1080);
        assert_eq!(result.layer_count, 0);
    }
}
