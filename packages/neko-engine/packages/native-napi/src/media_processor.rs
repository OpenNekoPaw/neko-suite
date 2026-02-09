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
use neko_native_core::decoder::{Decoder, HwAccelType, HwAccelDecoder};
use neko_native_core::encoder::{Encoder, HwAccelEncoder, HwEncoderType};
use neko_native_core::gpu::{
    BlurParams, ChromaticAberrationParams, EffectParams, FilmGrainParams, GlowParams,
    GpuBlurProcessor, GpuContext, GpuProcessor, GpuStyleProcessor, GpuTransitionProcessor,
    SharpenParams, TextureFormat, TexturePool, TransitionParams, VignetteParams,
};

// Import session types from the sessions module
use crate::sessions::{AudioDecoderSession, AudioEncoderSession, VideoEncoderSession};

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
    #[deprecated(note = "Use bridge_gpu_info() or NativeEngine.dispatch() instead")]
    #[napi]
    pub fn get_gpu_info(&self) -> JsGpuInfo {
        JsGpuInfo::from(self.gpu_ctx.info())
    }

    /// Detect available hardware acceleration
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
                HwEncoderType::Amf => Some("amf".to_string()),
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
        let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::VideoToolbox);

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

        // Render NV12 to RGBA (GPU) using the correct color space from the video
        renderer.render(&nv12_texture, &output_view, nv12_texture.color_space);

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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    /// Uses HwAccelDecoder for hardware decoding with GPU texture output.
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
        let mut decoder = HwAccelDecoder::with_hw_accel(hw_accel_type);

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

        // Render NV12 to RGBA using the correct color space from the video
        renderer.render(&nv12_texture, &output_view, nv12_texture.color_space);

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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
        let mut decoder = HwAccelDecoder::with_hw_accel(hw_accel_type);

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

                        // Render NV12 to RGBA using the correct color space from the video
                        renderer.render(&nv12_texture, &output_view, nv12_texture.color_space);

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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
    #[napi]
    pub fn texture_pool_size(&self) -> Result<u32> {
        let pool = self
            .texture_pool
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock texture pool"))?;

        Ok(pool.len() as u32)
    }

    /// Release all resources
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use bridge_audio_info() or NativeEngine.dispatch() instead")]
    #[napi]
    pub fn get_audio_info(&self, path: String) -> Result<JsAudioInfo> {
        let mut decoder = FfmpegAudioDecoder::new();

        let info = decoder
            .open(&path)
            .map_err(|e| Error::from_reason(format!("Failed to open audio: {}", e)))?;

        Ok(JsAudioInfo::from(&info))
    }

    /// Decode audio frame at specific time
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
    #[deprecated(note = "Use NativeEngine.dispatch() instead")]
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
