//! Standalone N-API functions extracted from media_processor.rs
//!
//! These are stateless functions that don't require a MediaProcessor instance.
//! New code should prefer using `NativeEngine.dispatch()` or bridge functions.

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::types::{JsExtractedSubtitleTrack, JsProbeMediaInfo};
use neko_native_core::gpu::GpuContext;
use neko_native_core::media_service::{extract_subtitles, probe_media_info};

// ============================================================================
// Media Service Functions
// ============================================================================

/// Probe media file and extract metadata
#[deprecated(note = "Use bridge_probe_media() or NativeEngine.dispatch() instead")]
#[napi]
pub fn probe_media(path: String) -> Result<JsProbeMediaInfo> {
    probe_media_info(&path)
        .map(Into::into)
        .map_err(|e| Error::from_reason(format!("Failed to probe media: {}", e)))
}

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
#[deprecated(note = "Use bridge_extract_subtitles() or NativeEngine.dispatch() instead")]
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
#[deprecated(note = "Use bridge_encode_jpeg() or NativeEngine.dispatch() instead")]
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
#[deprecated(note = "Use bridge_extract_frame() or NativeEngine.dispatch() instead")]
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
    use neko_native_core::decoder::{Decoder, HwAccelType, HwAccelDecoder};
    use neko_native_core::encoder::encode_nv12_to_h264_iframe;
    use neko_native_core::gpu::{GpuContext, Nv12TextureImporter};

    // Create decoder with hardware acceleration
    let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);

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
    use neko_native_core::decoder::{Decoder, HwAccelType, HwAccelDecoder};
    use neko_native_core::gpu::{ColorSpace, GpuContext, Nv12Renderer, Nv12TextureImporter};
    use neko_native_core::media_service::encode_rgba_to_jpeg;

    // Create GPU context
    let gpu_ctx = pollster::block_on(GpuContext::new())
        .map_err(|e| Error::from_reason(format!("Failed to create GPU context: {}", e)))?;
    let gpu_ctx = std::sync::Arc::new(gpu_ctx);

    // Create decoder with hardware acceleration
    let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);

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

    // Convert NV12 to RGBA using GPU with the correct color space
    let renderer = Nv12Renderer::new(std::sync::Arc::clone(&gpu_ctx))
        .map_err(|e| Error::from_reason(format!("Failed to create renderer: {}", e)))?;
    let output_texture = renderer.create_output_texture(width, height);
    let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
    renderer.render(&nv12_texture, &output_view, nv12_texture.color_space);

    // Read RGBA data from GPU
    let rgba_data = read_texture_to_cpu(&gpu_ctx, &output_texture, width, height)
        .map_err(|e| Error::from_reason(format!("Failed to read texture: {}", e)))?;

    // Encode to JPEG
    let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, quality)
        .map_err(|e| Error::from_reason(format!("Failed to encode JPEG: {}", e)))?;

    Ok(Buffer::from(jpeg_data))
}

// =============================================================================
// IOSurface Helper (macOS only)
// =============================================================================

/// Read NV12 data from IOSurface (macOS only)
#[cfg(target_os = "macos")]
unsafe fn read_iosurface_nv12(
    io_surface: usize,
    width: u32,
    height: u32,
) -> std::result::Result<Vec<u8>, String> {
    #[link(name = "IOSurface", kind = "framework")]
    extern "C" {
        fn IOSurfaceLock(buffer: *const std::ffi::c_void, options: u32, seed: *mut u32) -> i32;
        fn IOSurfaceUnlock(buffer: *const std::ffi::c_void, options: u32, seed: *mut u32) -> i32;
        fn IOSurfaceGetBaseAddressOfPlane(buffer: *const std::ffi::c_void, plane_index: usize) -> *const u8;
        fn IOSurfaceGetBytesPerRowOfPlane(buffer: *const std::ffi::c_void, plane_index: usize) -> usize;
        fn IOSurfaceGetHeightOfPlane(buffer: *const std::ffi::c_void, plane_index: usize) -> usize;
    }

    let io_surface_ptr = io_surface as *const std::ffi::c_void;
    let lock_result = IOSurfaceLock(io_surface_ptr, 0x00000001, std::ptr::null_mut());
    if lock_result != 0 {
        return Err(format!("Failed to lock IOSurface: {}", lock_result));
    }

    let y_size = (width * height) as usize;
    let uv_size = (width * height / 2) as usize;
    let mut nv12_data = Vec::with_capacity(y_size + uv_size);

    // Read Y plane
    let y_base = IOSurfaceGetBaseAddressOfPlane(io_surface_ptr, 0);
    let y_bytes_per_row = IOSurfaceGetBytesPerRowOfPlane(io_surface_ptr, 0);
    let y_height = IOSurfaceGetHeightOfPlane(io_surface_ptr, 0);
    if y_bytes_per_row == width as usize {
        let y_slice = std::slice::from_raw_parts(y_base, y_size);
        nv12_data.extend_from_slice(y_slice);
    } else {
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
        let uv_slice = std::slice::from_raw_parts(uv_base, uv_size);
        nv12_data.extend_from_slice(uv_slice);
    } else {
        for row in 0..uv_height {
            let row_ptr = uv_base.add(row * uv_bytes_per_row);
            let row_slice = std::slice::from_raw_parts(row_ptr, width as usize);
            nv12_data.extend_from_slice(row_slice);
        }
    }

    IOSurfaceUnlock(io_surface_ptr, 0x00000001, std::ptr::null_mut());
    Ok(nv12_data)
}

// =============================================================================
// NV12 Texture Reader
// =============================================================================

/// Read NV12 data from wgpu textures
fn read_nv12_texture_to_cpu(
    ctx: &GpuContext,
    nv12_texture: &neko_native_core::gpu::ImportedNv12Texture,
) -> std::result::Result<Vec<u8>, String> {
    let device = ctx.device();
    let queue = ctx.queue();
    let width = nv12_texture.width;
    let height = nv12_texture.height;

    let y_size = (width * height) as usize;
    let uv_width = width / 2;
    let uv_height = height / 2;
    let uv_size = (uv_width * uv_height * 2) as usize;
    let mut nv12_data = Vec::with_capacity(y_size + uv_size);

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
        wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
    );

    let uv_bytes_per_row = uv_width * 2;
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
        wgpu::Extent3d { width: uv_width, height: uv_height, depth_or_array_layers: 1 },
    );
    queue.submit(std::iter::once(encoder.finish()));

    // Map and read Y plane
    {
        let y_slice = y_staging.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        y_slice.map_async(wgpu::MapMode::Read, move |result| { tx.send(result).unwrap(); });
        device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|e| format!("Y plane map failed: {}", e))?
            .map_err(|e| format!("Y plane map error: {:?}", e))?;
        let y_data = y_slice.get_mapped_range();
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
        uv_slice.map_async(wgpu::MapMode::Read, move |result| { tx.send(result).unwrap(); });
        device.poll(wgpu::Maintain::Wait);
        rx.recv().map_err(|e| format!("UV plane map failed: {}", e))?
            .map_err(|e| format!("UV plane map error: {:?}", e))?;
        let uv_data = uv_slice.get_mapped_range();
        for row in 0..uv_height {
            let start = (row * uv_padded_bytes_per_row) as usize;
            let end = start + uv_bytes_per_row as usize;
            nv12_data.extend_from_slice(&uv_data[start..end]);
        }
    }
    uv_staging.unmap();

    Ok(nv12_data)
}

// =============================================================================
// Texture Readback Helper
// =============================================================================

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
        wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
    );
    queue.submit(std::iter::once(encoder.finish()));

    let buffer_slice = staging_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |result| { tx.send(result).unwrap(); });
    device.poll(wgpu::Maintain::Wait);
    rx.recv().map_err(|_| "Buffer map channel closed".to_string())?
        .map_err(|e| format!("Buffer map error: {:?}", e))?;

    let data = buffer_slice.get_mapped_range();
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

// =============================================================================
// Composite Frame Types and Function
// =============================================================================

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
#[napi]
pub fn composite_frame(request: JsCompositeFrameRequest) -> Result<Buffer> {
    use neko_native_core::decoder::{Decoder, HwAccelType, HwAccelDecoder};
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
        let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
        let media_info = decoder
            .open(&layer_req.source)
            .map_err(|e| Error::from_reason(format!("Failed to open video: {}", e)))?;

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
        renderer.render(&nv12_texture, &output_view, nv12_texture.color_space);

        let rgba_data = read_texture_to_cpu(&gpu_ctx, &output_texture, width, height)
            .map_err(|e| Error::from_reason(format!("Failed to read texture: {}", e)))?;

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

    // Encode to JPEG
    let jpeg_quality = request.quality.unwrap_or(85);
    let jpeg_data = encode_rgba_to_jpeg(&result.data, result.width, result.height, jpeg_quality)
        .map_err(|e| Error::from_reason(format!("Failed to encode JPEG: {}", e)))?;

    Ok(Buffer::from(jpeg_data))
}
