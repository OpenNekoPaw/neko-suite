//! MediaProcessor N-API class

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Arc, Mutex};

use super::types::{
    JsAudioEncoderConfig, JsAudioFrame, JsAudioInfo, JsBlurParams,
    JsChromaticAberrationParams, JsDecoderConfig, JsEffectParams, JsEncodedAudioPacket,
    JsEncodedPacket, JsEncoderConfig, JsFilmGrainParams, JsFrameData, JsGlowParams, JsGpuInfo,
    JsHwAccelInfo, JsSharpenParams, JsTextureFormat, JsTextureHandle, JsTransitionParams,
    JsVignetteParams,
};
use neko_native_core::audio::{AudioDecoder, AudioEncoder, FfmpegAudioDecoder, FfmpegAudioEncoder};
use neko_native_core::decoder::{Decoder, HwAccelType, ZeroCopyDecoder};
use neko_native_core::encoder::{Encoder, HwAccelEncoder, HwEncoderType};
use neko_native_core::gpu::{
    BlurParams, ChromaticAberrationParams, EffectParams, FilmGrainParams, GlowParams,
    GpuBlurProcessor, GpuContext, GpuProcessor, GpuStyleProcessor, GpuTransitionProcessor,
    SharpenParams, TextureFormat, TexturePool, TransitionParams, VignetteParams,
};

/// High-performance media processor with GPU acceleration
#[napi]
pub struct MediaProcessor {
    gpu_ctx: Arc<GpuContext>,
    gpu_processor: Arc<GpuProcessor>,
    blur_processor: Arc<GpuBlurProcessor>,
    style_processor: Arc<GpuStyleProcessor>,
    transition_processor: Arc<GpuTransitionProcessor>,
    texture_pool: Mutex<TexturePool>,
}

#[napi]
impl MediaProcessor {
    /// Create a new MediaProcessor instance
    #[napi(factory)]
    pub async fn create() -> Result<Self> {
        // Initialize tracing (only once)
        let _ = tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::from_default_env()
                    .add_directive(tracing::Level::INFO.into()),
            )
            .try_init();

        tracing::info!("Creating MediaProcessor...");

        // Initialize GPU context
        let gpu_ctx = GpuContext::new()
            .await
            .map_err(|e| Error::from_reason(format!("GPU initialization failed: {}", e)))?;

        let gpu_ctx = Arc::new(gpu_ctx);

        tracing::info!("GPU initialized: {}", gpu_ctx.info().name);

        // Create GPU processor
        let gpu_processor = GpuProcessor::new(gpu_ctx.clone())
            .map_err(|e| Error::from_reason(format!("GPU processor creation failed: {}", e)))?;

        let gpu_processor = Arc::new(gpu_processor);

        // Create blur processor
        let blur_processor = GpuBlurProcessor::new(gpu_ctx.clone())
            .map_err(|e| Error::from_reason(format!("Blur processor creation failed: {}", e)))?;

        let blur_processor = Arc::new(blur_processor);

        // Create style processor
        let style_processor = GpuStyleProcessor::new(gpu_ctx.clone())
            .map_err(|e| Error::from_reason(format!("Style processor creation failed: {}", e)))?;

        let style_processor = Arc::new(style_processor);

        // Create transition processor
        let transition_processor = GpuTransitionProcessor::new(gpu_ctx.clone())
            .map_err(|e| Error::from_reason(format!("Transition processor creation failed: {}", e)))?;

        let transition_processor = Arc::new(transition_processor);

        // Create texture pool
        let texture_pool = TexturePool::new(gpu_ctx.device().clone(), gpu_ctx.queue().clone());

        tracing::info!("MediaProcessor created successfully");

        Ok(Self {
            gpu_ctx,
            gpu_processor,
            blur_processor,
            style_processor,
            transition_processor,
            texture_pool: Mutex::new(texture_pool),
        })
    }

    /// Get GPU information
    #[napi]
    pub fn get_gpu_info(&self) -> JsGpuInfo {
        JsGpuInfo::from(self.gpu_ctx.info())
    }

    /// Detect available hardware acceleration
    #[napi]
    pub fn detect_hw_accel(&self) -> JsHwAccelInfo {
        use neko_native_core::decoder::detect_hw_accel;
        use neko_native_core::encoder::hwaccel::detect_hw_encoders;

        // Detect decoders
        let available_decoders = detect_hw_accel();
        let decoders: Vec<String> = available_decoders
            .iter()
            .filter_map(|t| match t {
                HwAccelType::VideoToolbox => Some("videotoolbox".to_string()),
                HwAccelType::Vaapi => Some("vaapi".to_string()),
                HwAccelType::Cuda => Some("cuda".to_string()),
                HwAccelType::D3d11va => Some("d3d11va".to_string()),
                HwAccelType::Auto => None, // Don't list Auto as available
            })
            .collect();

        let recommended_decoder = available_decoders.first().cloned().unwrap_or(HwAccelType::Auto);
        let recommended_decoder_str = match recommended_decoder {
            HwAccelType::VideoToolbox => "videotoolbox",
            HwAccelType::Vaapi => "vaapi",
            HwAccelType::Cuda => "cuda",
            HwAccelType::D3d11va => "d3d11va",
            HwAccelType::Auto => "auto",
        };

        // Detect encoders
        let available_encoders = detect_hw_encoders();
        let encoders: Vec<String> = available_encoders
            .iter()
            .filter_map(|t| match t {
                HwEncoderType::VideoToolbox => Some("videotoolbox".to_string()),
                HwEncoderType::Vaapi => Some("vaapi".to_string()),
                HwEncoderType::Nvenc => Some("nvenc".to_string()),
                HwEncoderType::Qsv => Some("qsv".to_string()),
                HwEncoderType::None => Some("none".to_string()),
                HwEncoderType::Auto => None,
            })
            .collect();

        let recommended_encoder = available_encoders.first().cloned().unwrap_or(HwEncoderType::None);
        let recommended_encoder_str = match recommended_encoder {
            HwEncoderType::VideoToolbox => "videotoolbox",
            HwEncoderType::Vaapi => "vaapi",
            HwEncoderType::Nvenc => "nvenc",
            HwEncoderType::Qsv => "qsv",
            _ => "none",
        };

        JsHwAccelInfo {
            decoders,
            encoders,
            recommended_decoder: recommended_decoder_str.to_string(),
            recommended_encoder: recommended_encoder_str.to_string(),
        }
    }

    /// Decode a single frame using true zero-copy (macOS only)
    ///
    /// This method uses IOSurface → Metal → wgpu path to avoid any CPU memory copy.
    /// Returns RGBA frame data after GPU color conversion.
    #[cfg(target_os = "macos")]
    #[napi]
    pub fn decode_frame_zerocopy(
        &self,
        config: JsDecoderConfig,
        time_seconds: f64,
    ) -> Result<JsFrameData> {
        use neko_native_core::gpu::{ColorSpace, MacOsTextureImporter, Nv12Renderer};
        use neko_native_core::decoder::GpuTextureHandle;

        tracing::info!(
            "Zero-copy decode: path={}, time={}s",
            config.path, time_seconds
        );

        // Create zero-copy hardware decoder
        let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::VideoToolbox);

        decoder
            .open(&config.path)
            .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

        // Seek to requested time
        decoder
            .seek(time_seconds)
            .map_err(|e| Error::from_reason(format!("Failed to seek: {}", e)))?;

        // Decode frame as GPU texture
        let gpu_texture = decoder
            .decode_next_gpu()
            .map_err(|e| Error::from_reason(format!("Failed to decode: {}", e)))?
            .ok_or_else(|| Error::from_reason("No frame at specified time"))?;

        let width = gpu_texture.width;
        let height = gpu_texture.height;
        let pts = gpu_texture.pts;
        let is_keyframe = gpu_texture.is_keyframe;

        // Extract IOSurface from GPU handle
        let io_surface = match &gpu_texture.handle {
            GpuTextureHandle::VideoToolbox { io_surface, .. } => *io_surface,
            _ => return Err(Error::from_reason("Expected VideoToolbox handle for zero-copy")),
        };

        if io_surface == 0 {
            return Err(Error::from_reason("No IOSurface available for zero-copy import"));
        }

        // Create MacOS texture importer
        let importer = MacOsTextureImporter::new(Arc::clone(&self.gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to create importer: {}", e)))?;

        // Import IOSurface directly into wgpu (zero-copy!)
        let nv12_texture = unsafe {
            importer.import_iosurface(io_surface, &gpu_texture)
                .map_err(|e| Error::from_reason(format!("Failed to import IOSurface: {}", e)))?
        };

        // Create NV12 renderer for GPU color conversion
        let renderer = Nv12Renderer::new(Arc::clone(&self.gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to create renderer: {}", e)))?;

        // Create output RGBA texture
        let output_texture = renderer.create_output_texture(width, height);
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Render NV12 to RGBA (GPU)
        renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

        // Read back RGBA data
        let rgba_data = self.read_texture_to_buffer(&output_texture, width, height)
            .map_err(|e| Error::from_reason(format!("Failed to read texture: {}", e)))?;

        let timestamp = pts as f64 * decoder.media_info().map(|i| 1.0 / i.fps).unwrap_or(1.0 / 30.0);

        tracing::info!(
            "Zero-copy decode complete: {}x{} (no CPU memory copy in decode path!)",
            width, height
        );

        Ok(JsFrameData {
            width,
            height,
            format: "rgba".to_string(),
            data: rgba_data.into(),
            timestamp,
            is_keyframe,
        })
    }

    /// Decode a single frame from a video file (GPU only)
    ///
    /// Uses hardware decoding with GPU color conversion.
    /// Returns error if decoding fails (frame will be dropped).
    #[napi]
    pub fn decode_frame(
        &self,
        config: JsDecoderConfig,
        time_seconds: f64,
    ) -> Result<JsFrameData> {
        // Always use GPU pipeline: HW decode (NV12) → GPU convert (RGBA)
        self.decode_frame_with_gpu_conversion(&config, time_seconds)
    }

    /// Decode frame using GPU color conversion (NV12 → RGBA)
    ///
    /// Uses ZeroCopyDecoder for hardware decoding with GPU texture output.
    /// Converts NV12 GPU texture to RGBA using wgpu shader.
    fn decode_frame_with_gpu_conversion(
        &self,
        config: &JsDecoderConfig,
        time_seconds: f64,
    ) -> Result<JsFrameData> {
        use neko_native_core::gpu::{ColorSpace, Nv12Renderer, Nv12TextureImporter};

        // Determine hardware acceleration type (default to Auto for GPU pipeline)
        let hw_accel_type = match config.hw_accel.as_deref() {
            Some("videotoolbox") => HwAccelType::VideoToolbox,
            Some("vaapi") => HwAccelType::Vaapi,
            Some("cuda") => HwAccelType::Cuda,
            Some("d3d11va") => HwAccelType::D3d11va,
            _ => HwAccelType::Auto, // Default to Auto for best performance
        };

        tracing::info!(
            "GPU decode: path={}, time={}s, hw_accel={:?}",
            config.path, time_seconds, hw_accel_type
        );

        // Create zero-copy decoder
        let mut decoder = ZeroCopyDecoder::with_hw_accel(hw_accel_type);

        decoder
            .open(&config.path)
            .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

        // Seek to requested time
        decoder
            .seek(time_seconds)
            .map_err(|e| Error::from_reason(format!("Failed to seek: {}", e)))?;

        // Decode frame as GPU texture
        let gpu_texture = decoder
            .decode_next_gpu()
            .map_err(|e| Error::from_reason(format!("Failed to decode frame: {}", e)))?
            .ok_or_else(|| Error::from_reason("No frame at specified time"))?;

        let width = gpu_texture.width;
        let height = gpu_texture.height;
        let pts = gpu_texture.pts;
        let is_keyframe = gpu_texture.is_keyframe;
        let timestamp = pts as f64 * decoder.media_info().map(|i| 1.0 / i.fps).unwrap_or(1.0 / 30.0);

        // Create NV12 texture importer
        let importer = Nv12TextureImporter::new(Arc::clone(&self.gpu_ctx));

        // Import or create NV12 textures based on GPU handle
        let nv12_texture = importer
            .import(&gpu_texture)
            .map_err(|e| Error::from_reason(format!("Failed to import GPU texture: {}", e)))?;

        // Create NV12 renderer for conversion
        let renderer = Nv12Renderer::new(Arc::clone(&self.gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to create renderer: {}", e)))?;

        // Create output RGBA texture
        let output_texture = renderer.create_output_texture(width, height);
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Render NV12 to RGBA
        renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

        // Read back RGBA data
        let device = self.gpu_ctx.device();
        let queue = self.gpu_ctx.queue();

        let bytes_per_row = width * 4;
        let align = 256u32;
        let padded_bytes_per_row = (bytes_per_row + align - 1) / align * align;
        let buffer_size = (padded_bytes_per_row * height) as u64;

        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("RGBA Staging Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("RGBA Readback Encoder"),
        });

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: &output_texture,
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

        queue.submit(Some(encoder.finish()));

        // Map and read buffer
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        device.poll(wgpu::Maintain::Wait);

        rx.recv()
            .map_err(|_| Error::from_reason("Channel closed"))?
            .map_err(|e| Error::from_reason(format!("Map failed: {:?}", e)))?;

        // Copy data, removing padding if necessary
        let mapped_data = buffer_slice.get_mapped_range();
        let rgba_data = if padded_bytes_per_row == bytes_per_row {
            mapped_data.to_vec()
        } else {
            let mut unpadded_data = Vec::with_capacity((bytes_per_row * height) as usize);
            for y in 0..height {
                let start = (y * padded_bytes_per_row) as usize;
                let end = start + bytes_per_row as usize;
                unpadded_data.extend_from_slice(&mapped_data[start..end]);
            }
            unpadded_data
        };
        drop(mapped_data);
        staging_buffer.unmap();

        tracing::info!(
            "GPU decode: {}x{} NV12 → RGBA (hw={:?})",
            width, height, hw_accel_type
        );

        Ok(JsFrameData {
            width,
            height,
            format: "rgba".to_string(),
            data: rgba_data.into(),
            timestamp,
            is_keyframe,
        })
    }

    /// Decode a range of frames from a video file (GPU only)
    ///
    /// Uses hardware decoding with GPU color conversion.
    /// Frames that fail to decode are skipped (dropped).
    #[napi]
    pub fn decode_frame_range(
        &self,
        config: JsDecoderConfig,
        start_time: f64,
        end_time: f64,
        fps: f64,
    ) -> Result<Vec<JsFrameData>> {
        use neko_native_core::gpu::{ColorSpace, Nv12Renderer, Nv12TextureImporter};

        // Determine hardware acceleration type
        let hw_accel_type = match config.hw_accel.as_deref() {
            Some("videotoolbox") => HwAccelType::VideoToolbox,
            Some("vaapi") => HwAccelType::Vaapi,
            Some("cuda") => HwAccelType::Cuda,
            Some("d3d11va") => HwAccelType::D3d11va,
            Some("auto") => HwAccelType::Auto,
            _ => HwAccelType::Auto, // Default to auto for GPU pipeline
        };

        // Calculate frame times
        let frame_interval = 1.0 / fps;
        let mut current_time = start_time;
        let mut frames = Vec::new();

        // Create zero-copy hardware decoder
        let mut decoder = ZeroCopyDecoder::with_hw_accel(hw_accel_type);

        decoder
            .open(&config.path)
            .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

        // Create GPU converters
        let importer = Nv12TextureImporter::new(Arc::clone(&self.gpu_ctx));
        let renderer = Nv12Renderer::new(Arc::clone(&self.gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to create renderer: {}", e)))?;

        while current_time <= end_time {
            // Seek to requested time
            if let Err(e) = decoder.seek(current_time) {
                tracing::warn!("Failed to seek to {}: {}", current_time, e);
                current_time += frame_interval;
                continue;
            }

            // Try to decode frame as GPU texture, skip on failure
            match decoder.decode_next_gpu() {
                Ok(Some(gpu_texture)) => {
                    let width = gpu_texture.width;
                    let height = gpu_texture.height;
                    let pts = gpu_texture.pts;
                    let is_keyframe = gpu_texture.is_keyframe;
                    let timestamp = pts as f64 * decoder.media_info().map(|i| 1.0 / i.fps).unwrap_or(1.0 / 30.0);

                    // Import GPU texture to wgpu
                    if let Ok(nv12_texture) = importer.import(&gpu_texture) {
                        // Create output RGBA texture
                        let output_texture = renderer.create_output_texture(width, height);
                        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

                        // Render NV12 to RGBA
                        renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

                        // Read back RGBA data
                        if let Ok(rgba_data) = self.read_texture_to_buffer(&output_texture, width, height) {
                            frames.push(JsFrameData {
                                width,
                                height,
                                format: "rgba".to_string(),
                                data: rgba_data.into(),
                                timestamp,
                                is_keyframe,
                            });
                        } else {
                            tracing::warn!("Dropping frame at {}s: GPU readback failed", current_time);
                        }
                    } else {
                        tracing::warn!("Dropping frame at {}s: GPU import failed", current_time);
                    }
                }
                Ok(None) => {
                    tracing::warn!("Dropping frame at {}s: No frame at time", current_time);
                }
                Err(e) => {
                    tracing::warn!("Dropping frame at {}s: Decode error: {}", current_time, e);
                }
            }

            current_time += frame_interval;
        }

        Ok(frames)
    }

    /// Helper to read texture data back to CPU buffer
    fn read_texture_to_buffer(
        &self,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> std::result::Result<Vec<u8>, String> {
        let device = self.gpu_ctx.device();
        let queue = self.gpu_ctx.queue();

        let bytes_per_row = width * 4;
        let align = 256u32;
        let padded_bytes_per_row = (bytes_per_row + align - 1) / align * align;
        let buffer_size = (padded_bytes_per_row * height) as u64;

        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Staging Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Readback Encoder"),
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

        queue.submit(Some(encoder.finish()));

        // Map and read buffer
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        device.poll(wgpu::Maintain::Wait);

        rx.recv()
            .map_err(|_| "Channel closed".to_string())?
            .map_err(|e| format!("Map failed: {:?}", e))?;

        // Copy data, removing padding if necessary
        let mapped_data = buffer_slice.get_mapped_range();
        let rgba_data = if padded_bytes_per_row == bytes_per_row {
            mapped_data.to_vec()
        } else {
            let mut unpadded_data = Vec::with_capacity((bytes_per_row * height) as usize);
            for y in 0..height {
                let start = (y * padded_bytes_per_row) as usize;
                let end = start + bytes_per_row as usize;
                unpadded_data.extend_from_slice(&mapped_data[start..end]);
            }
            unpadded_data
        };
        drop(mapped_data);
        staging_buffer.unmap();

        Ok(rgba_data)
    }

    /// Apply GPU effects to a frame
    #[napi]
    pub fn apply_effects(
        &self,
        frame: JsFrameData,
        params: JsEffectParams,
    ) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let effect_params: EffectParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .gpu_processor
            .process_frame(&frame.data, frame.width, frame.height, &effect_params)
            .map_err(|e| Error::from_reason(format!("GPU processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    /// Apply blur effect to a frame
    #[napi]
    pub fn apply_blur(&self, frame: JsFrameData, params: JsBlurParams) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let blur_params: BlurParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .blur_processor
            .apply_blur(&frame.data, frame.width, frame.height, &blur_params)
            .map_err(|e| Error::from_reason(format!("Blur processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    /// Apply sharpen effect to a frame
    #[napi]
    pub fn apply_sharpen(&self, frame: JsFrameData, params: JsSharpenParams) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let sharpen_params: SharpenParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .blur_processor
            .apply_sharpen(&frame.data, frame.width, frame.height, &sharpen_params)
            .map_err(|e| Error::from_reason(format!("Sharpen processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    // =========================================================================
    // Style Effect Methods
    // =========================================================================

    /// Apply vignette effect to a frame
    #[napi]
    pub fn apply_vignette(
        &self,
        frame: JsFrameData,
        params: JsVignetteParams,
    ) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let vignette_params: VignetteParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .style_processor
            .apply_vignette(&frame.data, frame.width, frame.height, &vignette_params)
            .map_err(|e| Error::from_reason(format!("Vignette processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    /// Apply film grain effect to a frame
    #[napi]
    pub fn apply_film_grain(
        &self,
        frame: JsFrameData,
        params: JsFilmGrainParams,
    ) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let film_grain_params: FilmGrainParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .style_processor
            .apply_film_grain(&frame.data, frame.width, frame.height, &film_grain_params)
            .map_err(|e| Error::from_reason(format!("Film grain processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    /// Apply glow/bloom effect to a frame
    #[napi]
    pub fn apply_glow(&self, frame: JsFrameData, params: JsGlowParams) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let glow_params: GlowParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .style_processor
            .apply_glow(&frame.data, frame.width, frame.height, &glow_params)
            .map_err(|e| Error::from_reason(format!("Glow processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    /// Apply chromatic aberration effect to a frame
    #[napi]
    pub fn apply_chromatic_aberration(
        &self,
        frame: JsFrameData,
        params: JsChromaticAberrationParams,
    ) -> Result<JsFrameData> {
        // Only process RGBA frames
        if frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU effects",
            ));
        }

        let chromatic_params: ChromaticAberrationParams = params.into();

        // Process frame on GPU
        let processed_data = self
            .style_processor
            .apply_chromatic_aberration(&frame.data, frame.width, frame.height, &chromatic_params)
            .map_err(|e| {
                Error::from_reason(format!("Chromatic aberration processing failed: {}", e))
            })?;

        Ok(JsFrameData {
            width: frame.width,
            height: frame.height,
            format: frame.format,
            data: processed_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    // =========================================================================
    // Transition Methods
    // =========================================================================

    /// Apply transition effect between two frames
    #[napi]
    pub fn apply_transition(
        &self,
        from_frame: JsFrameData,
        to_frame: JsFrameData,
        params: JsTransitionParams,
    ) -> Result<JsFrameData> {
        // Only process RGBA frames
        if from_frame.format != "rgba" || to_frame.format != "rgba" {
            return Err(Error::from_reason(
                "Only RGBA format is supported for GPU transitions",
            ));
        }

        // Frames must have same dimensions
        if from_frame.width != to_frame.width || from_frame.height != to_frame.height {
            return Err(Error::from_reason(
                "From and to frames must have the same dimensions",
            ));
        }

        let transition_params: TransitionParams = params.into();

        // Process transition on GPU
        let processed_data = self
            .transition_processor
            .apply_transition(
                &from_frame.data,
                &to_frame.data,
                from_frame.width,
                from_frame.height,
                &transition_params,
            )
            .map_err(|e| Error::from_reason(format!("Transition processing failed: {}", e)))?;

        Ok(JsFrameData {
            width: from_frame.width,
            height: from_frame.height,
            format: from_frame.format,
            data: processed_data.into(),
            timestamp: from_frame.timestamp,
            is_keyframe: from_frame.is_keyframe,
        })
    }

    /// Process a frame: decode and apply effects in one call
    #[napi]
    pub fn process_frame(
        &self,
        config: JsDecoderConfig,
        time_seconds: f64,
        params: Option<JsEffectParams>,
    ) -> Result<JsFrameData> {
        // Decode frame (always use RGBA for GPU processing)
        let mut decode_config = config.clone();
        decode_config.output_format = Some("rgba".to_string());

        let frame = self.decode_frame(decode_config, time_seconds)?;

        // Apply effects if params provided
        if let Some(params) = params {
            self.apply_effects(frame, params)
        } else {
            Ok(frame)
        }
    }

    // =========================================================================
    // Zero-copy Texture Methods
    // =========================================================================

    /// Upload a frame to GPU texture and return a handle
    /// This enables zero-copy rendering in WebGPU
    #[napi]
    pub fn upload_to_texture(
        &self,
        frame: JsFrameData,
        format: Option<JsTextureFormat>,
    ) -> Result<JsTextureHandle> {
        let texture_format = format
            .map(TextureFormat::from)
            .unwrap_or(TextureFormat::Rgba8);

        let mut pool = self
            .texture_pool
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock texture pool"))?;

        let handle = pool.upload_frame(frame.width, frame.height, texture_format, &frame.data);

        Ok(JsTextureHandle::from(&handle))
    }

    /// Decode a frame directly to GPU texture (zero-copy path)
    /// Returns a texture handle instead of raw pixel data
    #[napi]
    pub fn decode_to_texture(
        &self,
        config: JsDecoderConfig,
        time_seconds: f64,
    ) -> Result<JsTextureHandle> {
        // Decode frame first
        let frame = self.decode_frame(config, time_seconds)?;

        // Upload to texture
        self.upload_to_texture(frame, Some(JsTextureFormat::Rgba8))
    }

    /// Get texture data back from GPU (for fallback/debugging)
    /// This copies data from GPU to CPU, use sparingly
    #[napi]
    pub fn read_texture(&self, handle: JsTextureHandle) -> Result<JsFrameData> {
        let pool = self
            .texture_pool
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock texture pool"))?;

        let texture = pool
            .get(handle.id as u64)
            .ok_or_else(|| Error::from_reason("Texture not found"))?;

        let (width, height) = texture.dimensions();

        // WebGPU requires bytes_per_row to be aligned to 256 bytes
        let bytes_per_pixel = 4u32; // RGBA
        let unpadded_bytes_per_row = width * bytes_per_pixel;
        let align = 256u32;
        let padded_bytes_per_row = (unpadded_bytes_per_row + align - 1) / align * align;

        let buffer_size = (padded_bytes_per_row * height) as u64;
        let staging_buffer = self.gpu_ctx.create_buffer(
            buffer_size,
            wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        );

        // Copy texture to buffer
        let mut encoder = self
            .gpu_ctx
            .device()
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Texture Read Encoder"),
            });

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: texture.texture(),
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

        self.gpu_ctx.queue().submit(Some(encoder.finish()));

        // Map and read buffer
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        self.gpu_ctx.device().poll(wgpu::Maintain::Wait);

        rx.recv()
            .map_err(|_| Error::from_reason("Channel closed"))?
            .map_err(|e| Error::from_reason(format!("Map failed: {:?}", e)))?;

        // Copy data, removing padding if necessary
        let mapped_data = buffer_slice.get_mapped_range();
        let data = if padded_bytes_per_row == unpadded_bytes_per_row {
            mapped_data.to_vec()
        } else {
            // Remove row padding
            let mut unpadded_data = Vec::with_capacity((unpadded_bytes_per_row * height) as usize);
            for y in 0..height {
                let start = (y * padded_bytes_per_row) as usize;
                let end = start + unpadded_bytes_per_row as usize;
                unpadded_data.extend_from_slice(&mapped_data[start..end]);
            }
            unpadded_data
        };
        drop(mapped_data);
        staging_buffer.unmap();

        Ok(JsFrameData {
            width,
            height,
            format: handle.format.clone(),
            data: data.into(),
            timestamp: 0.0,
            is_keyframe: false,
        })
    }

    /// Clear all textures from the pool
    #[napi]
    pub fn clear_texture_pool(&self) -> Result<()> {
        let mut pool = self
            .texture_pool
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock texture pool"))?;

        pool.clear();
        Ok(())
    }

    /// Get number of textures in the pool
    #[napi]
    pub fn texture_pool_size(&self) -> Result<u32> {
        let pool = self
            .texture_pool
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock texture pool"))?;

        Ok(pool.len() as u32)
    }

    /// Release all resources
    #[napi]
    pub fn dispose(&mut self) {
        tracing::info!("Disposing MediaProcessor...");

        // Clear texture pool
        if let Ok(mut pool) = self.texture_pool.lock() {
            pool.clear();
        }

        // Resources will be cleaned up when dropped
    }

    // =========================================================================
    // GPU Format Conversion Methods
    // =========================================================================

    /// Convert RGBA frame to NV12 format using GPU compute shader
    ///
    /// This is the GPU-accelerated version of RGBA to NV12 conversion,
    /// suitable for hardware encoder input.
    ///
    /// @param frame - Input RGBA frame data
    /// @param colorSpace - Color space: 0 = BT.601, 1 = BT.709 (default), 2 = BT.2020
    /// @returns NV12 frame data (Y plane followed by UV plane)
    #[napi]
    pub fn rgba_to_nv12(&self, frame: JsFrameData, color_space: Option<u32>) -> Result<JsFrameData> {
        use neko_native_core::gpu::RgbaToNv12Converter;

        let width = frame.width;
        let height = frame.height;
        let color_space = color_space.unwrap_or(1); // Default to BT.709

        // Create converter
        let converter = RgbaToNv12Converter::new(Arc::clone(&self.gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to create converter: {}", e)))?;

        // Create input texture from RGBA data
        let device = self.gpu_ctx.device();
        let queue = self.gpu_ctx.queue();

        let input_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("RGBA Input Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // Upload RGBA data to texture
        queue.write_texture(
            wgpu::ImageCopyTexture {
                texture: &input_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &frame.data,
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

        let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Create output buffers
        let output_buffers = converter.create_output_buffers(width, height);

        // Convert RGBA to NV12
        converter
            .convert(&input_view, &output_buffers, color_space)
            .map_err(|e| Error::from_reason(format!("Conversion failed: {}", e)))?;

        // Read back NV12 data
        let y_size = output_buffers.y_size();
        let uv_size = output_buffers.uv_size();
        let total_size = y_size + uv_size;

        // Create staging buffers for readback
        let y_staging = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Y Staging Buffer"),
            size: y_size as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let uv_staging = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("UV Staging Buffer"),
            size: uv_size as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        // Copy from GPU buffers to staging
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("NV12 Readback Encoder"),
        });

        encoder.copy_buffer_to_buffer(&output_buffers.y_buffer, 0, &y_staging, 0, y_size as u64);
        encoder.copy_buffer_to_buffer(&output_buffers.uv_buffer, 0, &uv_staging, 0, uv_size as u64);

        queue.submit(Some(encoder.finish()));

        // Map and read Y plane
        let y_slice = y_staging.slice(..);
        let (y_tx, y_rx) = std::sync::mpsc::channel();
        y_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = y_tx.send(result);
        });

        // Map and read UV plane
        let uv_slice = uv_staging.slice(..);
        let (uv_tx, uv_rx) = std::sync::mpsc::channel();
        uv_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = uv_tx.send(result);
        });

        device.poll(wgpu::Maintain::Wait);

        y_rx.recv()
            .map_err(|_| Error::from_reason("Y channel closed"))?
            .map_err(|e| Error::from_reason(format!("Y map failed: {:?}", e)))?;

        uv_rx.recv()
            .map_err(|_| Error::from_reason("UV channel closed"))?
            .map_err(|e| Error::from_reason(format!("UV map failed: {:?}", e)))?;

        // Combine Y and UV planes
        let mut nv12_data = Vec::with_capacity(total_size);
        nv12_data.extend_from_slice(&y_slice.get_mapped_range());
        nv12_data.extend_from_slice(&uv_slice.get_mapped_range());

        let _ = y_slice;
        let _ = uv_slice;
        y_staging.unmap();
        uv_staging.unmap();

        Ok(JsFrameData {
            width,
            height,
            format: "nv12".to_string(),
            data: nv12_data.into(),
            timestamp: frame.timestamp,
            is_keyframe: frame.is_keyframe,
        })
    }

    // =========================================================================
    // Video Encoding Methods
    // =========================================================================

    /// Encode a single video frame (GPU only)
    ///
    /// Uses hardware encoder. Returns error if encoding fails.
    #[napi]
    pub fn encode_video_frame(
        &self,
        config: JsEncoderConfig,
        frame: JsFrameData,
        pts: i64,
    ) -> Result<Vec<JsEncodedPacket>> {
        let encoder_config = config.to_encoder_config();

        // Always use hardware encoder
        let mut encoder = HwAccelEncoder::new();
        encoder
            .open(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to open hardware encoder: {}", e)))?;

        let packets = encoder
            .encode_frame(&frame.data, pts)
            .map_err(|e| Error::from_reason(format!("Failed to encode frame: {}", e)))?;

        Ok(packets.iter().map(JsEncodedPacket::from).collect())
    }

    /// Create a stateful video encoder session (GPU only)
    ///
    /// Uses hardware encoder. Returns error if encoder creation fails.
    #[napi]
    pub fn create_video_encoder(&self, config: JsEncoderConfig) -> Result<VideoEncoderSession> {
        let encoder_config = config.to_encoder_config();

        // Always use hardware encoder
        let mut encoder = HwAccelEncoder::new();
        encoder
            .open(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to open hardware encoder: {}", e)))?;

        let hw_active = encoder.is_hw_active();
        tracing::info!(
            "Video encoder opened (hw_active={}, type={:?})",
            hw_active,
            encoder_config.hw_encoder
        );

        Ok(VideoEncoderSession {
            encoder: Mutex::new(encoder),
            hw_active,
        })
    }

    // =========================================================================
    // Audio Decoding Methods
    // =========================================================================

    /// Get audio information from a file
    #[napi]
    pub fn get_audio_info(&self, path: String) -> Result<JsAudioInfo> {
        let mut decoder = FfmpegAudioDecoder::new();

        let info = decoder
            .open(&path)
            .map_err(|e| Error::from_reason(format!("Failed to open audio: {}", e)))?;

        Ok(JsAudioInfo::from(&info))
    }

    /// Decode audio frame at specific time
    #[napi]
    pub fn decode_audio_frame(&self, path: String, time_seconds: f64) -> Result<JsAudioFrame> {
        let mut decoder = FfmpegAudioDecoder::new();

        decoder
            .open(&path)
            .map_err(|e| Error::from_reason(format!("Failed to open audio: {}", e)))?;

        let frame = decoder
            .decode_at(time_seconds)
            .map_err(|e| Error::from_reason(format!("Failed to decode audio: {}", e)))?
            .ok_or_else(|| Error::from_reason("No audio frame at specified time"))?;

        Ok(JsAudioFrame::from(&frame))
    }

    /// Decode a range of audio frames
    #[napi]
    pub fn decode_audio_range(
        &self,
        path: String,
        start_time: f64,
        end_time: f64,
    ) -> Result<Vec<JsAudioFrame>> {
        let mut decoder = FfmpegAudioDecoder::new();

        decoder
            .open(&path)
            .map_err(|e| Error::from_reason(format!("Failed to open audio: {}", e)))?;

        decoder
            .seek(start_time)
            .map_err(|e| Error::from_reason(format!("Failed to seek: {}", e)))?;

        let mut frames = Vec::new();

        loop {
            match decoder.decode_next() {
                Ok(Some(frame)) => {
                    if frame.timestamp > end_time {
                        break;
                    }
                    frames.push(JsAudioFrame::from(&frame));
                }
                Ok(None) => break,
                Err(e) => {
                    tracing::warn!("Audio decode error: {}", e);
                    break;
                }
            }
        }

        Ok(frames)
    }

    /// Create a stateful audio decoder session
    #[napi]
    pub fn create_audio_decoder(&self, path: String) -> Result<AudioDecoderSession> {
        let mut decoder = FfmpegAudioDecoder::new();

        let info = decoder
            .open(&path)
            .map_err(|e| Error::from_reason(format!("Failed to open audio: {}", e)))?;

        Ok(AudioDecoderSession {
            decoder: Mutex::new(decoder),
            info: JsAudioInfo::from(&info),
        })
    }

    // =========================================================================
    // Audio Encoding Methods
    // =========================================================================

    /// Create a stateful audio encoder session
    #[napi]
    pub fn create_audio_encoder(&self, config: JsAudioEncoderConfig) -> Result<AudioEncoderSession> {
        let encoder_config = config.to_audio_encoder_config();

        let mut encoder = FfmpegAudioEncoder::new();
        encoder
            .open(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to open audio encoder: {}", e)))?;

        Ok(AudioEncoderSession {
            encoder: Mutex::new(encoder),
        })
    }
}

// =============================================================================
// Stateful Session Classes
// =============================================================================

/// Stateful video encoder session (GPU only)
#[napi]
pub struct VideoEncoderSession {
    encoder: Mutex<HwAccelEncoder>,
    /// Whether hardware encoding is active
    hw_active: bool,
}

#[napi]
impl VideoEncoderSession {
    /// Check if hardware encoding is active
    #[napi]
    pub fn is_hw_active(&self) -> bool {
        self.hw_active
    }

    /// Encode a frame
    #[napi]
    pub fn encode_frame(&self, frame: JsFrameData, pts: i64) -> Result<Vec<JsEncodedPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .encode_frame(&frame.data, pts)
            .map_err(|e| Error::from_reason(format!("Failed to encode frame: {}", e)))?;

        Ok(packets.iter().map(JsEncodedPacket::from).collect())
    }

    /// Flush encoder and get remaining packets
    #[napi]
    pub fn flush(&self) -> Result<Vec<JsEncodedPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .flush()
            .map_err(|e| Error::from_reason(format!("Failed to flush encoder: {}", e)))?;

        Ok(packets.iter().map(JsEncodedPacket::from).collect())
    }

    /// Close the encoder
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        encoder.close();
        Ok(())
    }
}

/// Stateful audio decoder session
#[napi]
pub struct AudioDecoderSession {
    decoder: Mutex<FfmpegAudioDecoder>,
    info: JsAudioInfo,
}

#[napi]
impl AudioDecoderSession {
    /// Get audio info
    #[napi]
    pub fn get_info(&self) -> JsAudioInfo {
        self.info.clone()
    }

    /// Seek to time position
    #[napi]
    pub fn seek(&self, time_seconds: f64) -> Result<()> {
        let mut decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        decoder
            .seek(time_seconds)
            .map_err(|e| Error::from_reason(format!("Failed to seek: {}", e)))
    }

    /// Decode next frame
    #[napi]
    pub fn decode_next(&self) -> Result<Option<JsAudioFrame>> {
        let mut decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        match decoder.decode_next() {
            Ok(Some(frame)) => Ok(Some(JsAudioFrame::from(&frame))),
            Ok(None) => Ok(None),
            Err(e) => Err(Error::from_reason(format!("Failed to decode: {}", e))),
        }
    }

    /// Get current position
    #[napi]
    pub fn position(&self) -> Result<f64> {
        let decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        Ok(decoder.position())
    }

    /// Close the decoder
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut decoder = self
            .decoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock decoder"))?;

        decoder.close();
        Ok(())
    }
}

/// Stateful audio encoder session
#[napi]
pub struct AudioEncoderSession {
    encoder: Mutex<FfmpegAudioEncoder>,
}

#[napi]
impl AudioEncoderSession {
    /// Encode audio samples
    #[napi]
    pub fn encode_frame(&self, data: Buffer, samples: u32) -> Result<Vec<JsEncodedAudioPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .encode_frame(&data, samples as usize)
            .map_err(|e| Error::from_reason(format!("Failed to encode audio: {}", e)))?;

        Ok(packets.iter().map(JsEncodedAudioPacket::from).collect())
    }

    /// Flush encoder and get remaining packets
    #[napi]
    pub fn flush(&self) -> Result<Vec<JsEncodedAudioPacket>> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        let packets = encoder
            .flush()
            .map_err(|e| Error::from_reason(format!("Failed to flush encoder: {}", e)))?;

        Ok(packets.iter().map(JsEncodedAudioPacket::from).collect())
    }

    /// Close the encoder
    #[napi]
    pub fn close(&self) -> Result<()> {
        let mut encoder = self
            .encoder
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock encoder"))?;

        encoder.close();
        Ok(())
    }
}

// =============================================================================
// Muxer Session
// =============================================================================

use super::types::{JsMuxerConfig, JsMuxerPacket, JsStreamInfo};
use neko_native_core::encoder::{FfmpegMuxer, Muxer};

/// Stateful muxer session for container output
#[napi]
pub struct MuxerSession {
    muxer: Mutex<FfmpegMuxer>,
    video_stream_index: Mutex<Option<usize>>,
    audio_stream_index: Mutex<Option<usize>>,
}

#[napi]
impl MuxerSession {
    /// Create a new muxer session
    #[napi(factory)]
    pub fn create(config: JsMuxerConfig) -> Result<Self> {
        let mut muxer = FfmpegMuxer::new();

        muxer
            .open(&config.output_path, config.container_format())
            .map_err(|e| Error::from_reason(format!("Failed to open muxer: {}", e)))?;

        Ok(Self {
            muxer: Mutex::new(muxer),
            video_stream_index: Mutex::new(None),
            audio_stream_index: Mutex::new(None),
        })
    }

    /// Add a video stream to the output
    #[napi]
    pub fn add_video_stream(&self, config: JsEncoderConfig) -> Result<JsStreamInfo> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let encoder_config = config.to_encoder_config();
        let stream_info = muxer
            .add_video_stream(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to add video stream: {}", e)))?;

        // Store stream index
        if let Ok(mut idx) = self.video_stream_index.lock() {
            *idx = Some(stream_info.index);
        }

        Ok(JsStreamInfo::from(&stream_info))
    }

    /// Add an audio stream to the output
    #[napi]
    pub fn add_audio_stream(&self, config: JsAudioEncoderConfig) -> Result<JsStreamInfo> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let encoder_config = config.to_audio_encoder_config();
        let stream_info = muxer
            .add_audio_stream(&encoder_config)
            .map_err(|e| Error::from_reason(format!("Failed to add audio stream: {}", e)))?;

        // Store stream index
        if let Ok(mut idx) = self.audio_stream_index.lock() {
            *idx = Some(stream_info.index);
        }

        Ok(JsStreamInfo::from(&stream_info))
    }

    /// Write the container header (must be called after adding all streams)
    #[napi]
    pub fn write_header(&self) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        muxer
            .write_header()
            .map_err(|e| Error::from_reason(format!("Failed to write header: {}", e)))
    }

    /// Write a video packet
    #[napi]
    pub fn write_video_packet(&self, packet: JsMuxerPacket) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let stream_index = self
            .video_stream_index
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock stream index"))?
            .ok_or_else(|| Error::from_reason("No video stream added"))?;

        let encoded_packet = packet.to_encoded_packet(stream_index);
        muxer
            .write_video_packet(&encoded_packet)
            .map_err(|e| Error::from_reason(format!("Failed to write video packet: {}", e)))
    }

    /// Write an audio packet
    #[napi]
    pub fn write_audio_packet(&self, packet: JsMuxerPacket) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        let stream_index = self
            .audio_stream_index
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock stream index"))?
            .ok_or_else(|| Error::from_reason("No audio stream added"))?;

        let encoded_packet = packet.to_encoded_packet(stream_index);
        muxer
            .write_audio_packet(&encoded_packet)
            .map_err(|e| Error::from_reason(format!("Failed to write audio packet: {}", e)))
    }

    /// Finish muxing and close the file
    #[napi]
    pub fn finish(&self) -> Result<()> {
        let mut muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        muxer
            .finish()
            .map_err(|e| Error::from_reason(format!("Failed to finish muxer: {}", e)))
    }

    /// Check if muxer is open
    #[napi]
    pub fn is_open(&self) -> Result<bool> {
        let muxer = self
            .muxer
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock muxer"))?;

        Ok(muxer.is_open())
    }
}

// =============================================================================
// Compositor Session
// =============================================================================

use super::types::{JsCompositeLayer, JsCompositeResult};
use neko_native_core::gpu::GpuCompositor;

/// GPU compositor session for multi-layer compositing
#[napi]
pub struct CompositorSession {
    compositor: Mutex<GpuCompositor>,
}

#[napi]
impl CompositorSession {
    /// Create a new compositor session
    #[napi(factory)]
    pub async fn create() -> Result<Self> {
        // Initialize GPU context
        let gpu_ctx = GpuContext::new()
            .await
            .map_err(|e| Error::from_reason(format!("GPU initialization failed: {}", e)))?;

        let gpu_ctx = Arc::new(gpu_ctx);

        // Create GPU compositor
        let compositor = GpuCompositor::new(gpu_ctx)
            .map_err(|e| Error::from_reason(format!("Compositor creation failed: {}", e)))?;

        tracing::info!("CompositorSession created");

        Ok(Self {
            compositor: Mutex::new(compositor),
        })
    }

    /// Composite multiple layers into a single output
    #[napi]
    pub fn composite(
        &self,
        layers: Vec<JsCompositeLayer>,
        output_width: u32,
        output_height: u32,
        background_color: Option<Vec<f64>>,
    ) -> Result<JsCompositeResult> {
        let compositor = self
            .compositor
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock compositor"))?;

        // Convert layers
        let rust_layers: Vec<_> = layers.into_iter().map(Into::into).collect();

        // Parse background color
        let bg = background_color.unwrap_or_else(|| vec![0.0, 0.0, 0.0, 1.0]);
        let bg_color = [
            bg.first().copied().unwrap_or(0.0) as f32,
            bg.get(1).copied().unwrap_or(0.0) as f32,
            bg.get(2).copied().unwrap_or(0.0) as f32,
            bg.get(3).copied().unwrap_or(1.0) as f32,
        ];

        // Composite
        let result = compositor
            .composite(&rust_layers, output_width, output_height, bg_color)
            .map_err(|e| Error::from_reason(format!("Compositing failed: {}", e)))?;

        Ok(JsCompositeResult::from(result))
    }

    /// Composite a single layer (convenience method)
    #[napi]
    pub fn composite_single(
        &self,
        layer: JsCompositeLayer,
        output_width: u32,
        output_height: u32,
    ) -> Result<JsCompositeResult> {
        self.composite(vec![layer], output_width, output_height, None)
    }
}

// =============================================================================
// Animation Session
// =============================================================================

use super::types::{JsEvaluatedProperties, JsKeyframeTrack};
use neko_native_core::animation::{AnimationTimeline, KeyframeTrack};

/// Animation timeline session for keyframe animations
#[napi]
pub struct AnimationSession {
    timeline: Mutex<AnimationTimeline>,
}

#[napi]
impl AnimationSession {
    /// Create a new animation session
    #[napi(factory)]
    pub fn create(id: String, target_id: String) -> Result<Self> {
        let timeline = AnimationTimeline::new(id, target_id);
        tracing::info!("AnimationSession created for target: {}", timeline.target_id);

        Ok(Self {
            timeline: Mutex::new(timeline),
        })
    }

    /// Add a keyframe track to the animation
    #[napi]
    pub fn add_track(&self, track: JsKeyframeTrack) -> Result<()> {
        let mut timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        let rust_track: KeyframeTrack = track.into();
        timeline.add_track(rust_track);
        Ok(())
    }

    /// Evaluate all tracks at given time
    #[napi]
    pub fn evaluate(&self, time: f64) -> Result<JsEvaluatedProperties> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        let props = timeline.evaluate(time);
        Ok(JsEvaluatedProperties::from(props))
    }

    /// Get animation duration
    #[napi]
    pub fn duration(&self) -> Result<f64> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.duration())
    }

    /// Set explicit duration
    #[napi]
    pub fn set_duration(&self, duration: f64) -> Result<()> {
        let mut timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        timeline.set_duration(duration);
        Ok(())
    }

    /// Enable/disable looping
    #[napi]
    pub fn set_loop(&self, enabled: bool, count: Option<u32>) -> Result<()> {
        let mut timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        timeline.set_loop(enabled, count);
        Ok(())
    }

    /// Check if animation is complete at given time
    #[napi]
    pub fn is_complete(&self, time: f64) -> Result<bool> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.is_complete(time))
    }

    /// Get number of tracks
    #[napi]
    pub fn track_count(&self) -> Result<u32> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.track_count() as u32)
    }

    /// Get all animated properties
    #[napi]
    pub fn properties(&self) -> Result<Vec<String>> {
        let timeline = self
            .timeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock timeline"))?;

        Ok(timeline.properties().into_iter().map(|s| s.to_string()).collect())
    }
}

// =============================================================================
// Animation Presets
// =============================================================================

use neko_native_core::animation::AnimationPresets;

/// Create preset animations
#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_fade_in_animation(id: String, target_id: String, duration: f64) -> AnimationSession {
    let timeline = AnimationPresets::fade_in(&id, &target_id, duration);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_fade_out_animation(id: String, target_id: String, duration: f64) -> AnimationSession {
    let timeline = AnimationPresets::fade_out(&id, &target_id, duration);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_slide_in_left_animation(
    id: String,
    target_id: String,
    duration: f64,
    distance: f64,
) -> AnimationSession {
    let timeline = AnimationPresets::slide_in_left(&id, &target_id, duration, distance);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_zoom_in_animation(id: String, target_id: String, duration: f64) -> AnimationSession {
    let timeline = AnimationPresets::zoom_in(&id, &target_id, duration);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_bounce_animation(
    id: String,
    target_id: String,
    duration: f64,
    height: f64,
) -> AnimationSession {
    let timeline = AnimationPresets::bounce(&id, &target_id, duration, height);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

#[allow(dead_code)] // Exported via napi
#[napi]
pub fn create_pulse_animation(
    id: String,
    target_id: String,
    duration: f64,
    scale_factor: f64,
) -> AnimationSession {
    let timeline = AnimationPresets::pulse(&id, &target_id, duration, scale_factor);
    AnimationSession {
        timeline: Mutex::new(timeline),
    }
}

// =============================================================================
// Export Pipeline Session
// =============================================================================

use super::types::{JsPipelineConfig, JsPipelineFrame, JsPipelineProgress};
use neko_native_core::encoder::{AsyncExportPipeline, PipelineFrame};

/// Async export pipeline session for high-performance video export
///
/// This implements a three-stage concurrent pipeline:
/// - Compose (GPU): Composites layers into frames
/// - Encode (CPU/HW): Encodes frames to video codec
/// - Mux (IO): Writes encoded packets to container file
///
/// Usage:
/// ```javascript
/// const pipeline = await ExportPipelineSession.create({
///     outputPath: '/path/to/output.mp4',
///     encoderConfig: { width: 1920, height: 1080, fps: 30, codec: 'h264', hwEncoder: 'auto' },
///     totalFrames: 300
/// });
///
/// for (let i = 0; i < 300; i++) {
///     pipeline.submitFrame({ index: i, pts: i * 1001, layers: [...], outputWidth: 1920, outputHeight: 1080 });
///     const progress = pipeline.getProgress();
///     console.log(`Progress: ${progress.progressRatio * 100}%`);
/// }
///
/// await pipeline.finalize();
/// ```
#[napi]
pub struct ExportPipelineSession {
    pipeline: Mutex<Option<AsyncExportPipeline>>,
    #[allow(dead_code)]
    gpu_ctx: Arc<GpuContext>,
}

#[napi]
impl ExportPipelineSession {
    /// Create a new export pipeline session
    #[napi(factory)]
    pub async fn create(config: JsPipelineConfig) -> Result<Self> {
        // Initialize GPU context
        let gpu_ctx = GpuContext::new()
            .await
            .map_err(|e| Error::from_reason(format!("GPU initialization failed: {}", e)))?;

        let gpu_ctx = Arc::new(gpu_ctx);

        // Convert config
        let pipeline_config = config.to_pipeline_config();

        tracing::info!(
            "Creating ExportPipelineSession (output={}, {}x{}@{} fps, hw_encoder={:?})",
            pipeline_config.output_path,
            pipeline_config.encoder_config.width,
            pipeline_config.encoder_config.height,
            pipeline_config.encoder_config.fps,
            pipeline_config.encoder_config.hw_encoder
        );

        // Start the pipeline
        let pipeline = AsyncExportPipeline::start(pipeline_config, Arc::clone(&gpu_ctx))
            .map_err(|e| Error::from_reason(format!("Failed to start pipeline: {}", e)))?;

        Ok(Self {
            pipeline: Mutex::new(Some(pipeline)),
            gpu_ctx,
        })
    }

    /// Submit a frame to the pipeline for processing
    ///
    /// This may block if the compose buffer is full (backpressure).
    /// The frame will be processed asynchronously through the pipeline.
    #[napi]
    pub fn submit_frame(&self, frame: JsPipelineFrame) -> Result<()> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        let pipeline = pipeline_guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Pipeline already finalized"))?;

        let rust_frame: PipelineFrame = frame.into();
        pipeline
            .submit_frame(rust_frame)
            .map_err(|e| Error::from_reason(format!("Failed to submit frame: {}", e)))
    }

    /// Get current pipeline progress
    #[napi]
    pub fn get_progress(&self) -> Result<JsPipelineProgress> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        let pipeline = pipeline_guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Pipeline already finalized"))?;

        Ok(JsPipelineProgress::from(pipeline.progress()))
    }

    /// Check if pipeline is cancelled
    #[napi]
    pub fn is_cancelled(&self) -> Result<bool> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        match pipeline_guard.as_ref() {
            Some(pipeline) => Ok(pipeline.is_cancelled()),
            None => Ok(false),
        }
    }

    /// Cancel the pipeline
    ///
    /// This signals all workers to stop. The output file may be incomplete or corrupted.
    #[napi]
    pub fn cancel(&self) -> Result<()> {
        let pipeline_guard = self
            .pipeline
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

        if let Some(pipeline) = pipeline_guard.as_ref() {
            pipeline.cancel();
        }

        Ok(())
    }

    /// Finalize the pipeline and wait for completion
    ///
    /// This signals that no more frames will be submitted and waits for all
    /// pending frames to be processed and written to the output file.
    ///
    /// After this call, the session cannot be used again.
    #[napi]
    pub async fn finalize(&self) -> Result<()> {
        // Take the pipeline out of the mutex
        let pipeline = {
            let mut pipeline_guard = self
                .pipeline
                .lock()
                .map_err(|_| Error::from_reason("Failed to lock pipeline"))?;

            pipeline_guard.take()
        };

        match pipeline {
            Some(pipeline) => {
                tracing::info!("Finalizing export pipeline...");

                // Wait for pipeline to complete
                // Note: This blocks until all frames are processed
                pipeline
                    .wait()
                    .map_err(|e| Error::from_reason(format!("Pipeline failed: {}", e)))?;

                tracing::info!("Export pipeline finalized successfully");
                Ok(())
            }
            None => Err(Error::from_reason("Pipeline already finalized")),
        }
    }
}

// ============================================================================
// Frame Server N-API Bindings
// ============================================================================

use neko_native_core::frame_server::{FrameServer, FrameServerConfig, FrameServerHandle};
use std::sync::OnceLock;

static TOKIO_RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn get_runtime() -> &'static tokio::runtime::Runtime {
    TOKIO_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

/// Frame server configuration for N-API
#[napi(object)]
pub struct JsFrameServerConfig {
    /// Preferred port (0 for auto-assign)
    pub port: Option<u16>,
    /// Maximum frame buffer size
    pub max_buffer_size: Option<u32>,
    /// JPEG quality (1-100)
    pub jpeg_quality: Option<u8>,
}

/// Frame server statistics
#[napi(object)]
pub struct JsFrameServerStats {
    pub frames_sent: i64,
    pub is_running: bool,
}

/// Frame server session for streaming video frames via HTTP/WebSocket
#[napi]
pub struct FrameServerSession {
    handle: Arc<Mutex<Option<FrameServerHandle>>>,
    port: u16,
}

#[napi]
impl FrameServerSession {
    /// Start a new frame server with export support
    ///
    /// This version includes the export API endpoints for compat mode video export:
    /// - POST /export/start
    /// - POST /export/cancel/:job_id
    /// - GET /export/status/:job_id
    /// - GET /export/progress (WebSocket)
    #[napi(factory)]
    pub fn start(config: Option<JsFrameServerConfig>) -> Result<Self> {
        let rust_config = match config {
            Some(c) => FrameServerConfig {
                port: c.port.unwrap_or(0),
                max_buffer_size: c.max_buffer_size.unwrap_or(3) as usize,
                jpeg_quality: c.jpeg_quality.unwrap_or(85),
            },
            None => FrameServerConfig::default(),
        };

        let runtime = get_runtime();
        let handle = runtime
            .block_on(FrameServer::start_with_export(rust_config))
            .map_err(|e| Error::from_reason(format!("Failed to start frame server: {}", e)))?;

        let port = handle.port();
        tracing::info!("Frame server with export support started on port {}", port);

        Ok(Self {
            handle: Arc::new(Mutex::new(Some(handle))),
            port,
        })
    }

    /// Get the server port
    #[napi]
    pub fn get_port(&self) -> u16 {
        self.port
    }

    /// Get the server URL for MJPEG streaming
    #[napi]
    pub fn get_mjpeg_url(&self) -> String {
        format!("http://127.0.0.1:{}/mjpeg", self.port)
    }

    /// Get the server URL for WebSocket streaming
    #[napi]
    pub fn get_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws", self.port)
    }

    /// Get the server URL for single frame
    #[napi]
    pub fn get_frame_url(&self) -> String {
        format!("http://127.0.0.1:{}/frame", self.port)
    }

    /// Get the server URL for H.264 WebSocket streaming
    #[napi]
    pub fn get_h264_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws/h264", self.port)
    }

    /// Push a JPEG frame to all connected clients
    #[napi]
    pub fn push_frame(
        &self,
        jpeg_data: Buffer,
        timestamp_us: i64,
        width: u32,
        height: u32,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_frame(jpeg_data.to_vec(), timestamp_us as u64, width, height);
        Ok(())
    }

    /// Push an H.264 packet to all connected clients via WebSocket
    #[napi]
    pub fn push_h264_packet(
        &self,
        data: Buffer,
        pts: i64,
        dts: i64,
        is_keyframe: bool,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_h264_packet(data.to_vec(), pts, dts, is_keyframe);
        Ok(())
    }

    /// Get server statistics
    #[napi]
    pub fn get_stats(&self) -> Result<JsFrameServerStats> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        let stats = handle.stats();
        Ok(JsFrameServerStats {
            frames_sent: stats.frames_sent as i64,
            is_running: stats.is_running,
        })
    }

    /// Stop the server
    #[napi]
    pub fn stop(&self) -> Result<()> {
        let mut guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        if let Some(handle) = guard.take() {
            handle.shutdown();
            tracing::info!("Frame server stopped");
        }

        Ok(())
    }
}

/// Frame server session with export support
///
/// This server includes export API endpoints for compat mode video export:
/// - POST /export/start - Start an export job
/// - POST /export/cancel/:job_id - Cancel an export job
/// - GET /export/status/:job_id - Get export status
/// - GET /export/progress - WebSocket for real-time progress updates
#[napi]
pub struct FrameServerWithExportSession {
    handle: Arc<Mutex<Option<FrameServerHandle>>>,
    port: u16,
}

#[napi]
impl FrameServerWithExportSession {
    /// Start a new frame server with export support
    #[napi(factory)]
    pub fn start(config: Option<JsFrameServerConfig>) -> Result<Self> {
        let rust_config = match config {
            Some(c) => FrameServerConfig {
                port: c.port.unwrap_or(0),
                max_buffer_size: c.max_buffer_size.unwrap_or(3) as usize,
                jpeg_quality: c.jpeg_quality.unwrap_or(85),
            },
            None => FrameServerConfig::default(),
        };

        let runtime = get_runtime();
        let handle = runtime
            .block_on(FrameServer::start_with_export(rust_config))
            .map_err(|e| Error::from_reason(format!("Failed to start frame server: {}", e)))?;

        let port = handle.port();
        tracing::info!("Frame server with export support started on port {}", port);

        Ok(Self {
            handle: Arc::new(Mutex::new(Some(handle))),
            port,
        })
    }

    /// Get the server port
    #[napi]
    pub fn get_port(&self) -> u16 {
        self.port
    }

    /// Get the base URL for the server
    #[napi]
    pub fn get_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Get the server URL for MJPEG streaming
    #[napi]
    pub fn get_mjpeg_url(&self) -> String {
        format!("http://127.0.0.1:{}/mjpeg", self.port)
    }

    /// Get the server URL for WebSocket streaming
    #[napi]
    pub fn get_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws", self.port)
    }

    /// Get the export API base URL
    #[napi]
    pub fn get_export_url(&self) -> String {
        format!("http://127.0.0.1:{}/export", self.port)
    }

    /// Get the server URL for H.264 WebSocket streaming
    #[napi]
    pub fn get_h264_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws/h264", self.port)
    }

    /// Push a JPEG frame to all connected clients
    #[napi]
    pub fn push_frame(
        &self,
        jpeg_data: Buffer,
        timestamp_us: i64,
        width: u32,
        height: u32,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_frame(jpeg_data.to_vec(), timestamp_us as u64, width, height);
        Ok(())
    }

    /// Push an H.264 packet to all connected clients via WebSocket
    #[napi]
    pub fn push_h264_packet(
        &self,
        data: Buffer,
        pts: i64,
        dts: i64,
        is_keyframe: bool,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_h264_packet(data.to_vec(), pts, dts, is_keyframe);
        Ok(())
    }

    /// Get server statistics
    #[napi]
    pub fn get_stats(&self) -> Result<JsFrameServerStats> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        let stats = handle.stats();
        Ok(JsFrameServerStats {
            frames_sent: stats.frames_sent as i64,
            is_running: stats.is_running,
        })
    }

    /// Stop the server
    #[napi]
    pub fn stop(&self) -> Result<()> {
        let mut guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        if let Some(handle) = guard.take() {
            handle.shutdown();
            tracing::info!("Frame server with export stopped");
        }

        Ok(())
    }
}

// ============================================================================
// Media Service Functions (standalone N-API functions)
// ============================================================================

use super::types::{JsExtractedSubtitleTrack, JsProbeMediaInfo};
use neko_native_core::media_service::{extract_subtitles, probe_media_info};

/// Probe media file and extract metadata
#[napi]
pub fn probe_media(path: String) -> Result<JsProbeMediaInfo> {
    probe_media_info(&path)
        .map(Into::into)
        .map_err(|e| Error::from_reason(format!("Failed to probe media: {}", e)))
}

// NOTE: extract_frame and extract_frames have been removed.
// Use MediaProcessor.decodeFrame() + encodeJpeg() instead for GPU-accelerated frame extraction.

/// Extracted frame with JPEG data for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsExtractedFrameWithData {
    /// Frame timestamp in seconds
    pub time: f64,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// JPEG image data
    pub data: Buffer,
}

/// Extract all subtitle tracks from a media file
#[napi]
pub fn extract_all_subtitles(path: String) -> Result<Vec<JsExtractedSubtitleTrack>> {
    extract_subtitles(&path)
        .map(|tracks| tracks.into_iter().map(Into::into).collect())
        .map_err(|e| Error::from_reason(format!("Failed to extract subtitles: {}", e)))
}

/// Encode RGBA buffer to JPEG using FFmpeg's MJPEG encoder
///
/// This provides a zero-copy alternative to sharp for JPEG encoding.
/// The input must be RGBA format (4 bytes per pixel).
///
/// # Arguments
/// * `rgba_data` - RGBA pixel data buffer
/// * `width` - Image width in pixels
/// * `height` - Image height in pixels
/// * `quality` - JPEG quality (1-100, higher is better quality, default 85)
///
/// # Returns
/// * JPEG image data as Buffer
#[napi]
pub fn encode_jpeg(
    rgba_data: Buffer,
    width: u32,
    height: u32,
    quality: Option<u32>,
) -> Result<Buffer> {
    use neko_native_core::media_service::encode_rgba_to_jpeg;

    let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality.unwrap_or(85))
        .map_err(|e| Error::from_reason(format!("Failed to encode JPEG: {}", e)))?;

    Ok(Buffer::from(jpeg_data))
}

// =============================================================================
// Frame Extraction NAPI Functions
// =============================================================================

/// Output format for frame extraction
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum FrameFormat {
    /// JPEG image (default) - universal compatibility
    Jpeg,
    /// H.264 I-frame - hardware accelerated, smaller size, requires WebCodecs to decode
    H264,
}

/// Extract a single frame from video
///
/// Uses hardware-accelerated decoding (VideoToolbox/VAAPI/D3D11VA).
/// Default output is JPEG for universal compatibility.
/// Use format="h264" for H.264 I-frame output (requires WebCodecs to decode).
///
/// # Arguments
/// * `source` - Video file path
/// * `time` - Time in seconds to extract frame
/// * `quality` - Quality (1-100, default 85)
/// * `format` - Output format: "jpeg" (default) or "h264"
///
/// # Returns
/// * Encoded frame data as Buffer (JPEG or H.264 NAL units)
#[napi]
pub fn extract_frame(
    source: String,
    time: f64,
    quality: Option<u32>,
    format: Option<FrameFormat>,
) -> Result<Buffer> {
    let format = format.unwrap_or(FrameFormat::Jpeg);
    let quality = quality.unwrap_or(85);

    match format {
        FrameFormat::Jpeg => extract_frame_jpeg(&source, time, quality),
        FrameFormat::H264 => extract_frame_h264(&source, time, quality),
    }
}

/// Extract frame as H.264 I-frame (hardware accelerated)
fn extract_frame_h264(source: &str, time: f64, quality: u32) -> Result<Buffer> {
    use neko_native_core::decoder::{Decoder, HwAccelType, ZeroCopyDecoder};
    use neko_native_core::encoder::{encode_nv12_to_h264_iframe, IFrameConfig};
    use neko_native_core::gpu::{GpuContext, Nv12TextureImporter};

    // Create decoder with hardware acceleration
    let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);

    // Open video file
    let media_info = decoder
        .open(source)
        .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

    // Seek and decode frame
    let gpu_texture = decoder
        .decode_gpu_at(time)
        .map_err(|e| Error::from_reason(format!("Failed to decode frame: {}", e)))?
        .ok_or_else(|| Error::from_reason(format!("Frame not found at time: {}", time)))?;

    let width = media_info.width;
    let height = media_info.height;

    // Read NV12 data from IOSurface for H.264 encoding
    // Note: VideoToolbox decoder outputs NV12 in IOSurface
    #[cfg(target_os = "macos")]
    {
        use neko_native_core::decoder::GpuTextureHandle;

        match gpu_texture.handle {
            GpuTextureHandle::VideoToolbox { io_surface, .. } => {
                // Read NV12 data from IOSurface
                let nv12_data = unsafe { read_iosurface_nv12(io_surface, width, height) }
                    .map_err(|e| Error::from_reason(format!("Failed to read IOSurface: {}", e)))?;

                // Encode to H.264 I-frame
                let h264_data = encode_nv12_to_h264_iframe(&nv12_data, width, height, quality)
                    .map_err(|e| Error::from_reason(format!("Failed to encode H.264: {}", e)))?;

                return Ok(Buffer::from(h264_data));
            }
            _ => {}
        }
    }

    // Fallback: Use GPU context to read NV12 data
    let gpu_ctx = pollster::block_on(GpuContext::new())
        .map_err(|e| Error::from_reason(format!("Failed to create GPU context: {}", e)))?;
    let gpu_ctx = std::sync::Arc::new(gpu_ctx);

    let importer = Nv12TextureImporter::new(std::sync::Arc::clone(&gpu_ctx));
    let nv12_texture = importer
        .import(&gpu_texture)
        .map_err(|e| Error::from_reason(format!("Failed to import texture: {}", e)))?;

    // Read NV12 data from wgpu textures
    let nv12_data = read_nv12_texture_to_cpu(&gpu_ctx, &nv12_texture)
        .map_err(|e| Error::from_reason(format!("Failed to read NV12 texture: {}", e)))?;

    // Encode to H.264 I-frame
    let h264_data = encode_nv12_to_h264_iframe(&nv12_data, width, height, quality)
        .map_err(|e| Error::from_reason(format!("Failed to encode H.264: {}", e)))?;

    Ok(Buffer::from(h264_data))
}

/// Extract frame as JPEG (CPU encoding)
fn extract_frame_jpeg(source: &str, time: f64, quality: u32) -> Result<Buffer> {
    use neko_native_core::decoder::{Decoder, HwAccelType, ZeroCopyDecoder};
    use neko_native_core::gpu::{ColorSpace, GpuContext, Nv12Renderer, Nv12TextureImporter};
    use neko_native_core::media_service::encode_rgba_to_jpeg;

    // Create GPU context
    let gpu_ctx = pollster::block_on(GpuContext::new())
        .map_err(|e| Error::from_reason(format!("Failed to create GPU context: {}", e)))?;
    let gpu_ctx = std::sync::Arc::new(gpu_ctx);

    // Create decoder with hardware acceleration
    let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);

    // Open video file
    let media_info = decoder
        .open(source)
        .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

    // Seek and decode frame
    let gpu_texture = decoder
        .decode_gpu_at(time)
        .map_err(|e| Error::from_reason(format!("Failed to decode frame: {}", e)))?
        .ok_or_else(|| Error::from_reason(format!("Frame not found at time: {}", time)))?;

    let width = media_info.width;
    let height = media_info.height;

    // Import NV12 texture to wgpu
    let importer = Nv12TextureImporter::new(std::sync::Arc::clone(&gpu_ctx));
    let nv12_texture = importer
        .import(&gpu_texture)
        .map_err(|e| Error::from_reason(format!("Failed to import texture: {}", e)))?;

    // Convert NV12 to RGBA using GPU
    let renderer = Nv12Renderer::new(std::sync::Arc::clone(&gpu_ctx))
        .map_err(|e| Error::from_reason(format!("Failed to create renderer: {}", e)))?;
    let output_texture = renderer.create_output_texture(width, height);
    let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
    renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

    // Read RGBA data from GPU
    let rgba_data = read_texture_to_cpu(&gpu_ctx, &output_texture, width, height)
        .map_err(|e| Error::from_reason(format!("Failed to read texture: {}", e)))?;

    // Encode to JPEG
    let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)
        .map_err(|e| Error::from_reason(format!("Failed to encode JPEG: {}", e)))?;

    Ok(Buffer::from(jpeg_data))
}

/// Read NV12 data from IOSurface (macOS only)
#[cfg(target_os = "macos")]
unsafe fn read_iosurface_nv12(
    io_surface: usize,
    width: u32,
    height: u32,
) -> std::result::Result<Vec<u8>, String> {
    // IOSurface functions
    #[link(name = "IOSurface", kind = "framework")]
    extern "C" {
        fn IOSurfaceLock(
            buffer: *const std::ffi::c_void,
            options: u32,
            seed: *mut u32,
        ) -> i32;
        fn IOSurfaceUnlock(
            buffer: *const std::ffi::c_void,
            options: u32,
            seed: *mut u32,
        ) -> i32;
        fn IOSurfaceGetBaseAddressOfPlane(
            buffer: *const std::ffi::c_void,
            plane_index: usize,
        ) -> *const u8;
        fn IOSurfaceGetBytesPerRowOfPlane(
            buffer: *const std::ffi::c_void,
            plane_index: usize,
        ) -> usize;
        fn IOSurfaceGetHeightOfPlane(
            buffer: *const std::ffi::c_void,
            plane_index: usize,
        ) -> usize;
    }

    let io_surface_ptr = io_surface as *const std::ffi::c_void;

    // Lock IOSurface for reading
    let lock_result = IOSurfaceLock(io_surface_ptr, 0x00000001, std::ptr::null_mut()); // kIOSurfaceLockReadOnly
    if lock_result != 0 {
        return Err(format!("Failed to lock IOSurface: {}", lock_result));
    }

    // Calculate sizes
    let y_size = (width * height) as usize;
    let uv_size = (width * height / 2) as usize;
    let total_size = y_size + uv_size;

    let mut nv12_data = Vec::with_capacity(total_size);

    // Read Y plane
    let y_base = IOSurfaceGetBaseAddressOfPlane(io_surface_ptr, 0);
    let y_bytes_per_row = IOSurfaceGetBytesPerRowOfPlane(io_surface_ptr, 0);
    let y_height = IOSurfaceGetHeightOfPlane(io_surface_ptr, 0);

    if y_bytes_per_row == width as usize {
        // No padding, direct copy
        let y_slice = std::slice::from_raw_parts(y_base, y_size);
        nv12_data.extend_from_slice(y_slice);
    } else {
        // Has padding, copy row by row
        for row in 0..y_height {
            let row_ptr = y_base.add(row * y_bytes_per_row);
            let row_slice = std::slice::from_raw_parts(row_ptr, width as usize);
            nv12_data.extend_from_slice(row_slice);
        }
    }

    // Read UV plane
    let uv_base = IOSurfaceGetBaseAddressOfPlane(io_surface_ptr, 1);
    let uv_bytes_per_row = IOSurfaceGetBytesPerRowOfPlane(io_surface_ptr, 1);
    let uv_height = IOSurfaceGetHeightOfPlane(io_surface_ptr, 1);

    if uv_bytes_per_row == width as usize {
        // No padding, direct copy
        let uv_slice = std::slice::from_raw_parts(uv_base, uv_size);
        nv12_data.extend_from_slice(uv_slice);
    } else {
        // Has padding, copy row by row
        for row in 0..uv_height {
            let row_ptr = uv_base.add(row * uv_bytes_per_row);
            let row_slice = std::slice::from_raw_parts(row_ptr, width as usize);
            nv12_data.extend_from_slice(row_slice);
        }
    }

    // Unlock IOSurface
    IOSurfaceUnlock(io_surface_ptr, 0x00000001, std::ptr::null_mut());

    Ok(nv12_data)
}

/// Read NV12 data from wgpu textures
fn read_nv12_texture_to_cpu(
    ctx: &GpuContext,
    nv12_texture: &neko_native_core::gpu::ImportedNv12Texture,
) -> std::result::Result<Vec<u8>, String> {
    let device = ctx.device();
    let queue = ctx.queue();

    let width = nv12_texture.width;
    let height = nv12_texture.height;

    // Calculate sizes
    let y_size = (width * height) as usize;
    let uv_width = width / 2;
    let uv_height = height / 2;
    let uv_size = (uv_width * uv_height * 2) as usize; // RG8 = 2 bytes per pixel

    let mut nv12_data = Vec::with_capacity(y_size + uv_size);

    // Read Y plane
    let y_padded_bytes_per_row = (width + 255) & !255;
    let y_buffer_size = (y_padded_bytes_per_row * height) as u64;

    let y_staging = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Y Plane Staging"),
        size: y_buffer_size,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("NV12 Readback Encoder"),
    });

    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture: &nv12_texture.y_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer: &y_staging,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(y_padded_bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );

    // Read UV plane
    let uv_bytes_per_row = uv_width * 2; // RG8
    let uv_padded_bytes_per_row = (uv_bytes_per_row + 255) & !255;
    let uv_buffer_size = (uv_padded_bytes_per_row * uv_height) as u64;

    let uv_staging = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("UV Plane Staging"),
        size: uv_buffer_size,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture: &nv12_texture.uv_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer: &uv_staging,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(uv_padded_bytes_per_row),
                rows_per_image: Some(uv_height),
            },
        },
        wgpu::Extent3d {
            width: uv_width,
            height: uv_height,
            depth_or_array_layers: 1,
        },
    );

    queue.submit(std::iter::once(encoder.finish()));

    // Map and read Y plane
    {
        let y_slice = y_staging.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        y_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });
        device.poll(wgpu::Maintain::Wait);
        rx.recv()
            .map_err(|e| format!("Y plane map failed: {}", e))?
            .map_err(|e| format!("Y plane map error: {:?}", e))?;

        let y_data = y_slice.get_mapped_range();
        // Remove padding
        for row in 0..height {
            let start = (row * y_padded_bytes_per_row) as usize;
            let end = start + width as usize;
            nv12_data.extend_from_slice(&y_data[start..end]);
        }
    }
    y_staging.unmap();

    // Map and read UV plane
    {
        let uv_slice = uv_staging.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        uv_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });
        device.poll(wgpu::Maintain::Wait);
        rx.recv()
            .map_err(|e| format!("UV plane map failed: {}", e))?
            .map_err(|e| format!("UV plane map error: {:?}", e))?;

        let uv_data = uv_slice.get_mapped_range();
        // Remove padding
        for row in 0..uv_height {
            let start = (row * uv_padded_bytes_per_row) as usize;
            let end = start + uv_bytes_per_row as usize;
            nv12_data.extend_from_slice(&uv_data[start..end]);
        }
    }
    uv_staging.unmap();

    Ok(nv12_data)
}

/// Composite layer input for frame extraction NAPI
#[napi(object)]
#[derive(Clone)]
pub struct JsExtractCompositeLayer {
    /// Source video file path
    pub source: String,
    /// Time in seconds to extract frame
    pub time: f64,
    /// Layer opacity (0.0-1.0, default 1.0)
    pub opacity: Option<f64>,
    /// Blend mode (default "normal")
    pub blend_mode: Option<String>,
    /// X position
    pub x: Option<f64>,
    /// Y position
    pub y: Option<f64>,
    /// Scale X (default 1.0)
    pub scale_x: Option<f64>,
    /// Scale Y (default 1.0)
    pub scale_y: Option<f64>,
    /// Rotation in degrees
    pub rotation: Option<f64>,
}

/// Composite request for frame extraction NAPI
#[napi(object)]
#[derive(Clone)]
pub struct JsCompositeFrameRequest {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Layers to composite (bottom to top)
    pub layers: Vec<JsExtractCompositeLayer>,
    /// Background color [r, g, b, a] (0.0-1.0)
    pub background: Option<Vec<f64>>,
    /// JPEG quality (1-100, default 85)
    pub quality: Option<u32>,
}

/// Composite multiple video frames into a single JPEG image
///
/// Uses GPU-accelerated decoding and compositing for optimal performance.
/// Supports multiple blend modes and 2D transforms.
///
/// # Arguments
/// * `request` - Composite request with layers and output settings
///
/// # Returns
/// * JPEG image data as Buffer
#[napi]
pub fn composite_frame(request: JsCompositeFrameRequest) -> Result<Buffer> {
    use neko_native_core::decoder::{Decoder, HwAccelType, ZeroCopyDecoder};
    use neko_native_core::gpu::{
        BlendMode, ColorSpace, CompositeLayer, GpuCompositor, GpuContext, LayerPixelFormat,
        Nv12Renderer, Nv12TextureImporter, Transform2D,
    };
    use neko_native_core::media_service::encode_rgba_to_jpeg;

    // Create GPU context
    let gpu_ctx = pollster::block_on(GpuContext::new())
        .map_err(|e| Error::from_reason(format!("Failed to create GPU context: {}", e)))?;
    let gpu_ctx = std::sync::Arc::new(gpu_ctx);

    // Create renderer and compositor
    let renderer = Nv12Renderer::new(std::sync::Arc::clone(&gpu_ctx))
        .map_err(|e| Error::from_reason(format!("Failed to create renderer: {}", e)))?;
    let compositor = GpuCompositor::new(std::sync::Arc::clone(&gpu_ctx))
        .map_err(|e| Error::from_reason(format!("Failed to create compositor: {}", e)))?;

    let mut composite_layers = Vec::with_capacity(request.layers.len());

    // Decode each layer
    for layer_req in &request.layers {
        // Create decoder
        let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);
        let media_info = decoder
            .open(&layer_req.source)
            .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

        // Decode frame
        let gpu_texture = decoder
            .decode_gpu_at(layer_req.time)
            .map_err(|e| Error::from_reason(format!("Failed to decode frame: {}", e)))?
            .ok_or_else(|| {
                Error::from_reason(format!("Frame not found at time: {}", layer_req.time))
            })?;

        let width = media_info.width;
        let height = media_info.height;

        // Import and convert NV12 to RGBA
        let importer = Nv12TextureImporter::new(std::sync::Arc::clone(&gpu_ctx));
        let nv12_texture = importer
            .import(&gpu_texture)
            .map_err(|e| Error::from_reason(format!("Failed to import texture: {}", e)))?;

        let output_texture = renderer.create_output_texture(width, height);
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
        renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

        // Read RGBA data
        let rgba_data = read_texture_to_cpu(&gpu_ctx, &output_texture, width, height)
            .map_err(|e| Error::from_reason(format!("Failed to read texture: {}", e)))?;

        // Create composite layer
        let layer = CompositeLayer {
            data: rgba_data,
            width,
            height,
            pixel_format: LayerPixelFormat::Rgba,
            opacity: layer_req.opacity.unwrap_or(1.0) as f32,
            blend_mode: BlendMode::from_str(layer_req.blend_mode.as_deref().unwrap_or("normal")),
            transform: Transform2D {
                x: layer_req.x.unwrap_or(0.0) as f32,
                y: layer_req.y.unwrap_or(0.0) as f32,
                scale_x: layer_req.scale_x.unwrap_or(1.0) as f32,
                scale_y: layer_req.scale_y.unwrap_or(1.0) as f32,
                rotation: layer_req.rotation.unwrap_or(0.0) as f32,
                anchor_x: 0.5,
                anchor_y: 0.5,
                _padding: 0.0,
            },
            z_index: 0,
            mask: None,
            mask_inverted: false,
        };

        composite_layers.push(layer);
    }

    // Parse background color
    let background = if let Some(bg) = &request.background {
        if bg.len() >= 4 {
            [bg[0] as f32, bg[1] as f32, bg[2] as f32, bg[3] as f32]
        } else {
            [0.0, 0.0, 0.0, 1.0]
        }
    } else {
        [0.0, 0.0, 0.0, 1.0]
    };

    // Composite all layers
    let result = compositor
        .composite(&composite_layers, request.width, request.height, background)
        .map_err(|e| Error::from_reason(format!("Failed to composite: {}", e)))?;

    // Encode to JPEG (quality is now 1-100, higher is better)
    let jpeg_quality = request.quality.unwrap_or(85);
    let jpeg_data = encode_rgba_to_jpeg(&result.data, result.width, result.height, jpeg_quality)
        .map_err(|e| Error::from_reason(format!("Failed to encode JPEG: {}", e)))?;

    Ok(Buffer::from(jpeg_data))
}

/// Helper function to read texture data back to CPU
fn read_texture_to_cpu(
    ctx: &GpuContext,
    texture: &wgpu::Texture,
    width: u32,
    height: u32,
) -> std::result::Result<Vec<u8>, String> {
    let device = ctx.device();
    let queue = ctx.queue();

    let bytes_per_row = width * 4;
    let padded_bytes_per_row = (bytes_per_row + 255) & !255;

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
        .map_err(|_| "Buffer map channel closed".to_string())?
        .map_err(|e| format!("Buffer map error: {:?}", e))?;

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
