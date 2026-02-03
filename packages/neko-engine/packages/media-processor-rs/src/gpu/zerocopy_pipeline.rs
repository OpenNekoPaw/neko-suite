//! Zero-Copy Pipeline - Unified interface for FFmpeg → wgpu → FFmpeg
//!
//! This module provides a high-level interface for the zero-copy video processing pipeline:
//! 1. Hardware decode (FFmpeg) → GPU texture
//! 2. GPU compositing (wgpu) → processed texture
//! 3. Format conversion (RGBA → NV12)
//! 4. Hardware encode (FFmpeg) ← GPU buffer
//!
//! The pipeline requires GPU texture sharing support (no CPU fallback).

#![allow(dead_code)]

use crate::decoder::{Decoder, HwAccelType, MediaInfo, ZeroCopyDecoder};
use crate::error::{Error, Result};
use crate::gpu::{
    ColorSpace, GpuContext, GpuEncoderBridge, ImportedNv12Texture,
    Nv12RenderCache, Nv12TextureImporter, RgbaToNv12Converter,
};

use std::sync::Arc;

/// Pipeline mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PipelineMode {
    /// Full zero-copy (GPU textures shared between all stages)
    ZeroCopy,
    /// Hybrid (some stages use CPU transfer, but no CPU fallback for failures)
    Hybrid,
}

/// Pipeline statistics
#[derive(Debug, Clone, Default)]
pub struct PipelineStats {
    /// Total frames processed
    pub frames_processed: u64,
    /// Frames decoded
    pub frames_decoded: u64,
    /// Frames encoded
    pub frames_encoded: u64,
    /// Total decode time in microseconds
    pub decode_time_us: u64,
    /// Total composite time in microseconds
    pub composite_time_us: u64,
    /// Total encode time in microseconds
    pub encode_time_us: u64,
    /// GPU memory transfers (should be 0 for true zero-copy)
    pub gpu_transfers: u64,
}

impl PipelineStats {
    /// Get average decode time per frame in microseconds
    pub fn avg_decode_time_us(&self) -> f64 {
        if self.frames_decoded == 0 {
            0.0
        } else {
            self.decode_time_us as f64 / self.frames_decoded as f64
        }
    }

    /// Get average composite time per frame in microseconds
    pub fn avg_composite_time_us(&self) -> f64 {
        if self.frames_processed == 0 {
            0.0
        } else {
            self.composite_time_us as f64 / self.frames_processed as f64
        }
    }

    /// Get average encode time per frame in microseconds
    pub fn avg_encode_time_us(&self) -> f64 {
        if self.frames_encoded == 0 {
            0.0
        } else {
            self.encode_time_us as f64 / self.frames_encoded as f64
        }
    }

    /// Check if pipeline is running in true zero-copy mode
    pub fn is_zero_copy(&self) -> bool {
        self.gpu_transfers == 0
    }
}

/// Zero-copy pipeline configuration
#[derive(Debug, Clone)]
pub struct ZeroCopyPipelineConfig {
    /// Preferred hardware acceleration for decoding
    pub decode_hw_accel: HwAccelType,
    /// Preferred hardware acceleration for encoding
    pub encode_hw_accel: Option<String>,
    /// Output width (None = same as input)
    pub output_width: Option<u32>,
    /// Output height (None = same as input)
    pub output_height: Option<u32>,
    /// Output color space
    pub color_space: ColorSpace,
}

impl Default for ZeroCopyPipelineConfig {
    fn default() -> Self {
        Self {
            decode_hw_accel: HwAccelType::Auto,
            encode_hw_accel: None,
            output_width: None,
            output_height: None,
            color_space: ColorSpace::Bt709,
        }
    }
}

/// Zero-copy video processing pipeline
pub struct ZeroCopyPipeline {
    /// GPU context
    ctx: Arc<GpuContext>,
    /// Pipeline configuration
    config: ZeroCopyPipelineConfig,
    /// Current pipeline mode
    mode: PipelineMode,
    /// Texture importer
    importer: Nv12TextureImporter,
    /// NV12 to RGBA renderer
    nv12_renderer: Nv12RenderCache,
    /// RGBA to NV12 converter
    converter: RgbaToNv12Converter,
    /// Encoder bridge
    encoder_bridge: Option<GpuEncoderBridge>,
    /// Pipeline statistics
    stats: PipelineStats,
    /// Input media info
    input_info: Option<MediaInfo>,
}

impl ZeroCopyPipeline {
    /// Create a new zero-copy pipeline
    pub fn new(ctx: Arc<GpuContext>, config: ZeroCopyPipelineConfig) -> Result<Self> {
        let importer = Nv12TextureImporter::new(ctx.clone());
        let nv12_renderer = Nv12RenderCache::new(ctx.clone())?;
        let converter = RgbaToNv12Converter::new(ctx.clone())?;

        // Determine pipeline mode based on platform capabilities
        let mode = Self::detect_pipeline_mode()?;

        tracing::info!("Zero-copy pipeline initialized with mode: {:?}", mode);

        Ok(Self {
            ctx,
            config,
            mode,
            importer,
            nv12_renderer,
            converter,
            encoder_bridge: None,
            stats: PipelineStats::default(),
            input_info: None,
        })
    }

    /// Detect the best pipeline mode for this platform
    fn detect_pipeline_mode() -> Result<PipelineMode> {
        // TODO: Implement actual capability detection
        // For now, use hybrid mode (some zero-copy, some CPU transfer)
        #[cfg(target_os = "macos")]
        {
            // macOS: VideoToolbox supports IOSurface sharing
            // But wgpu_hal integration is not complete
            Ok(PipelineMode::Hybrid)
        }
        #[cfg(target_os = "linux")]
        {
            // Linux: VAAPI supports DMA-BUF
            // But wgpu_hal integration is not complete
            Ok(PipelineMode::Hybrid)
        }
        #[cfg(target_os = "windows")]
        {
            // Windows: D3D11VA supports shared handles
            // But wgpu_hal integration is not complete
            Ok(PipelineMode::Hybrid)
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err(Error::Other("Zero-copy pipeline not supported on this platform".to_string()))
        }
    }

    /// Get current pipeline mode
    pub fn mode(&self) -> PipelineMode {
        self.mode
    }

    /// Get pipeline statistics
    pub fn stats(&self) -> &PipelineStats {
        &self.stats
    }

    /// Get GPU context
    pub fn gpu_context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }

    /// Initialize pipeline with input video
    pub fn open_input(&mut self, path: &str) -> Result<MediaInfo> {
        // Create hardware decoder with zero-copy output
        let mut decoder = ZeroCopyDecoder::with_hw_accel(self.config.decode_hw_accel);

        let info = decoder.open(path)?;

        // Determine output dimensions
        let output_width = self.config.output_width.unwrap_or(info.width);
        let output_height = self.config.output_height.unwrap_or(info.height);

        // Create encoder bridge
        self.encoder_bridge = Some(GpuEncoderBridge::new(
            self.ctx.clone(),
            output_width,
            output_height,
        )?);

        self.input_info = Some(info.clone());

        tracing::info!(
            "Pipeline opened: {}x{} → {}x{}, mode={:?}",
            info.width,
            info.height,
            output_width,
            output_height,
            self.mode
        );

        Ok(info)
    }

    /// Get input media info
    pub fn input_info(&self) -> Option<&MediaInfo> {
        self.input_info.as_ref()
    }

    /// Process a single frame through the pipeline
    ///
    /// This is a simplified interface for testing. In production, use the
    /// async pipeline for better performance.
    pub fn process_frame_sync(
        &mut self,
        nv12_data: &[u8],
        pts: i64,
    ) -> Result<Vec<u8>> {
        let info = self
            .input_info
            .as_ref()
            .ok_or_else(|| Error::Other("Pipeline not initialized".to_string()))?
            .clone();

        let start = std::time::Instant::now();

        // 1. Import NV12 texture
        let imported = self.import_nv12_texture(nv12_data, info.width, info.height, pts)?;

        self.stats.decode_time_us += start.elapsed().as_micros() as u64;
        self.stats.frames_decoded += 1;

        // 2. Convert NV12 to RGBA for compositing
        let composite_start = std::time::Instant::now();
        let rgba_texture = self.nv12_renderer.render(&imported);
        let rgba_view = rgba_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // TODO: Run compositor shader on rgba_texture
        // For now, just pass through

        self.stats.composite_time_us += composite_start.elapsed().as_micros() as u64;

        // 3. Convert RGBA back to NV12 for encoder
        let encode_start = std::time::Instant::now();
        let output = self.convert_rgba_to_nv12(&rgba_view, info.width, info.height)?;
        self.stats.encode_time_us += encode_start.elapsed().as_micros() as u64;
        self.stats.frames_encoded += 1;

        self.stats.frames_processed += 1;

        Ok(output)
    }

    /// Import NV12 data as GPU texture
    fn import_nv12_texture(
        &self,
        nv12_data: &[u8],
        width: u32,
        height: u32,
        pts: i64,
    ) -> Result<ImportedNv12Texture> {
        // Create a temporary Nv12GpuTexture for the importer
        let gpu_texture = crate::decoder::Nv12GpuTexture {
            width,
            height,
            handle: crate::decoder::GpuTextureHandle::None,
            pts,
            is_keyframe: false,
            color_space: self.config.color_space as i32,
        };

        // Create textures and upload data
        let imported = self.importer.import(&gpu_texture)?;
        self.importer.upload_nv12_data(&imported, nv12_data)?;

        Ok(imported)
    }

    /// Convert RGBA texture to NV12 for encoder
    fn convert_rgba_to_nv12(
        &mut self,
        rgba_view: &wgpu::TextureView,
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        // Create output buffers if needed
        let output = self.converter.create_output_buffers(width, height);

        // Convert RGBA to NV12 on GPU
        self.converter.convert_sync(
            rgba_view,
            &output,
            self.config.color_space as u32,
        )?;

        // Read NV12 data from GPU buffers
        self.converter.read_nv12_data_blocking(&output)
    }

    /// Reset pipeline statistics
    pub fn reset_stats(&mut self) {
        self.stats = PipelineStats::default();
    }

    /// Get NV12 renderer for direct access
    pub fn nv12_renderer(&self) -> &Nv12RenderCache {
        &self.nv12_renderer
    }

    /// Get RGBA to NV12 converter for direct access
    pub fn rgba_to_nv12_converter(&self) -> &RgbaToNv12Converter {
        &self.converter
    }
}

/// Builder for zero-copy pipeline
pub struct ZeroCopyPipelineBuilder {
    config: ZeroCopyPipelineConfig,
}

impl ZeroCopyPipelineBuilder {
    /// Create a new pipeline builder
    pub fn new() -> Self {
        Self {
            config: ZeroCopyPipelineConfig::default(),
        }
    }

    /// Set decode hardware acceleration
    pub fn decode_hw_accel(mut self, hw_accel: HwAccelType) -> Self {
        self.config.decode_hw_accel = hw_accel;
        self
    }

    /// Set output dimensions
    pub fn output_size(mut self, width: u32, height: u32) -> Self {
        self.config.output_width = Some(width);
        self.config.output_height = Some(height);
        self
    }

    /// Set output color space
    pub fn color_space(mut self, color_space: ColorSpace) -> Self {
        self.config.color_space = color_space;
        self
    }

    /// Build the pipeline
    pub fn build(self, ctx: Arc<GpuContext>) -> Result<ZeroCopyPipeline> {
        ZeroCopyPipeline::new(ctx, self.config)
    }
}

impl Default for ZeroCopyPipelineBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_stats() {
        let mut stats = PipelineStats::default();
        stats.frames_decoded = 100;
        stats.decode_time_us = 10000;

        assert_eq!(stats.avg_decode_time_us(), 100.0);
        assert!(stats.is_zero_copy());
    }

    #[test]
    fn test_pipeline_config_default() {
        let config = ZeroCopyPipelineConfig::default();
        assert_eq!(config.decode_hw_accel, HwAccelType::Auto);
        assert_eq!(config.color_space, ColorSpace::Bt709);
    }
}
