//! Frame extraction endpoints for on-demand video frame retrieval
//!
//! ## Endpoints
//!
//! - `GET /frame/extract` - Extract single frame from video as JPEG
//! - `POST /frame/composite` - Composite multiple layers and return as JPEG
//!
//! ## Architecture
//!
//! ```text
//! /frame/extract:
//!   Video File → FFmpeg HW Decode → NV12 → GPU Convert → RGBA → JPEG
//!
//! /frame/composite:
//!   Multiple Sources → GPU Decode → NV12 → wgpu Composite → RGBA → JPEG
//! ```

use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::decoder::{Decoder, HwAccelType, ZeroCopyDecoder};
use crate::error::Result;
use crate::gpu::{
    BlendMode, ColorSpace, CompositeLayer, GpuCompositor, GpuContext, LayerPixelFormat,
    Nv12Renderer, Nv12TextureImporter, Transform2D,
};
use crate::media_service::encode_rgba_to_jpeg;

// =============================================================================
// Types
// =============================================================================

/// State for frame extraction endpoints
pub struct ExtractState {
    gpu_ctx: Arc<GpuContext>,
    renderer: Mutex<Nv12Renderer>,
    compositor: Mutex<GpuCompositor>,
}

impl ExtractState {
    /// Create new extract state with GPU context
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Result<Self> {
        let renderer = Nv12Renderer::new(Arc::clone(&gpu_ctx))?;
        let compositor = GpuCompositor::new(Arc::clone(&gpu_ctx))?;

        Ok(Self {
            gpu_ctx,
            renderer: Mutex::new(renderer),
            compositor: Mutex::new(compositor),
        })
    }
}

/// Query parameters for /frame/extract
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractQuery {
    /// Source video file path
    pub source: String,
    /// Time in seconds to extract frame
    pub time: f64,
    /// JPEG quality (1-100, default 85)
    #[serde(default = "default_quality")]
    pub quality: u32,
    /// Optional output width (for scaling)
    pub width: Option<u32>,
    /// Optional output height (for scaling)
    pub height: Option<u32>,
}

fn default_quality() -> u32 {
    85
}

/// Request body for /frame/composite
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositeRequest {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Layers to composite (bottom to top)
    pub layers: Vec<CompositeLayerRequest>,
    /// Background color [r, g, b, a] (0.0-1.0)
    #[serde(default = "default_background")]
    pub background: [f32; 4],
    /// JPEG quality (1-100, default 85)
    #[serde(default = "default_quality")]
    pub quality: u32,
}

fn default_background() -> [f32; 4] {
    [0.0, 0.0, 0.0, 1.0]
}

/// Single layer in composite request
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositeLayerRequest {
    /// Source video file path
    pub source: String,
    /// Time in seconds to extract frame
    pub time: f64,
    /// Layer opacity (0.0-1.0, default 1.0)
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    /// Blend mode (default "normal")
    #[serde(default = "default_blend_mode")]
    pub blend_mode: String,
    /// 2D transform
    #[serde(default)]
    pub transform: TransformRequest,
}

fn default_opacity() -> f32 {
    1.0
}

fn default_blend_mode() -> String {
    "normal".to_string()
}

/// 2D transform for a layer
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformRequest {
    /// X position (default 0.0)
    #[serde(default)]
    pub x: f32,
    /// Y position (default 0.0)
    #[serde(default)]
    pub y: f32,
    /// Scale X (default 1.0)
    #[serde(default = "default_scale")]
    pub scale_x: f32,
    /// Scale Y (default 1.0)
    #[serde(default = "default_scale")]
    pub scale_y: f32,
    /// Rotation in degrees (default 0.0)
    #[serde(default)]
    pub rotation: f32,
    /// Anchor X (0.0-1.0, default 0.5)
    #[serde(default = "default_anchor")]
    pub anchor_x: f32,
    /// Anchor Y (0.0-1.0, default 0.5)
    #[serde(default = "default_anchor")]
    pub anchor_y: f32,
}

fn default_scale() -> f32 {
    1.0
}

fn default_anchor() -> f32 {
    0.5
}

/// Error response
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: u16,
}

// =============================================================================
// Routes
// =============================================================================

/// Create router for frame extraction endpoints
pub fn extract_routes(state: Arc<ExtractState>) -> Router {
    Router::new()
        .route("/frame/extract", get(extract_frame_handler))
        .route("/frame/composite", post(composite_frame_handler))
        .with_state(state)
}

// =============================================================================
// Handlers
// =============================================================================

/// GET /frame/extract - Extract single frame from video as JPEG
///
/// Query parameters:
/// - source: Video file path (required)
/// - time: Time in seconds (required)
/// - quality: JPEG quality 1-100 (optional, default 85)
/// - width: Output width (optional)
/// - height: Output height (optional)
async fn extract_frame_handler(
    State(state): State<Arc<ExtractState>>,
    Query(query): Query<ExtractQuery>,
) -> impl IntoResponse {
    match extract_frame_impl(&state, &query).await {
        Ok(jpeg_data) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::CACHE_CONTROL, "max-age=3600")
            .header("X-Frame-Time", query.time.to_string())
            .body(Body::from(jpeg_data))
            .unwrap(),
        Err(e) => {
            let error = ErrorResponse {
                error: e.to_string(),
                code: 500,
            };
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&error).unwrap()))
                .unwrap()
        }
    }
}

/// POST /frame/composite - Composite multiple layers and return as JPEG
///
/// Request body: CompositeRequest JSON
async fn composite_frame_handler(
    State(state): State<Arc<ExtractState>>,
    Json(request): Json<CompositeRequest>,
) -> impl IntoResponse {
    match composite_frame_impl(&state, &request).await {
        Ok(jpeg_data) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::CACHE_CONTROL, "no-cache")
            .header("X-Layer-Count", request.layers.len().to_string())
            .body(Body::from(jpeg_data))
            .unwrap(),
        Err(e) => {
            let error = ErrorResponse {
                error: e.to_string(),
                code: 500,
            };
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_string(&error).unwrap()))
                .unwrap()
        }
    }
}

// =============================================================================
// Implementation
// =============================================================================

/// Extract a single frame from video and encode to JPEG
async fn extract_frame_impl(state: &ExtractState, query: &ExtractQuery) -> Result<Vec<u8>> {
    // Create decoder with hardware acceleration
    let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);

    // Open video file
    let media_info = decoder.open(&query.source)?;

    // Seek and decode frame
    let gpu_texture = decoder
        .decode_gpu_at(query.time)?
        .ok_or_else(|| crate::error::Error::FrameNotFound(query.time))?;

    let width = media_info.width;
    let height = media_info.height;

    // Import NV12 texture to wgpu
    let importer = Nv12TextureImporter::new(Arc::clone(&state.gpu_ctx));
    let nv12_texture = importer.import(&gpu_texture)?;

    // Convert NV12 to RGBA using GPU
    let renderer = state.renderer.lock().await;
    let output_texture = renderer.create_output_texture(width, height);
    let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
    renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

    // Read RGBA data from GPU
    let rgba_data = read_texture_to_buffer(&state.gpu_ctx, &output_texture, width, height)?;

    // Encode to JPEG
    // Convert quality from 1-100 to FFmpeg scale (2-31, lower is better)
    let ffmpeg_quality = ((100 - query.quality.clamp(1, 100)) * 29 / 99 + 2) as u32;
    let jpeg_data = encode_rgba_to_jpeg(&rgba_data, width, height, ffmpeg_quality)?;

    Ok(jpeg_data)
}

/// Composite multiple layers and encode to JPEG
async fn composite_frame_impl(state: &ExtractState, request: &CompositeRequest) -> Result<Vec<u8>> {
    let mut composite_layers = Vec::with_capacity(request.layers.len());

    // Decode each layer
    for layer_req in &request.layers {
        // Create decoder
        let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);
        let media_info = decoder.open(&layer_req.source)?;

        // Decode frame
        let gpu_texture = decoder
            .decode_gpu_at(layer_req.time)?
            .ok_or_else(|| crate::error::Error::FrameNotFound(layer_req.time))?;

        let width = media_info.width;
        let height = media_info.height;

        // Import and convert NV12 to RGBA
        let importer = Nv12TextureImporter::new(Arc::clone(&state.gpu_ctx));
        let nv12_texture = importer.import(&gpu_texture)?;

        let renderer = state.renderer.lock().await;
        let output_texture = renderer.create_output_texture(width, height);
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
        renderer.render(&nv12_texture, &output_view, ColorSpace::Bt709);

        // Read RGBA data
        let rgba_data = read_texture_to_buffer(&state.gpu_ctx, &output_texture, width, height)?;

        // Create composite layer
        let layer = CompositeLayer {
            data: rgba_data,
            width,
            height,
            pixel_format: LayerPixelFormat::Rgba,
            opacity: layer_req.opacity,
            blend_mode: BlendMode::from_str(&layer_req.blend_mode),
            transform: Transform2D {
                x: layer_req.transform.x,
                y: layer_req.transform.y,
                scale_x: layer_req.transform.scale_x,
                scale_y: layer_req.transform.scale_y,
                rotation: layer_req.transform.rotation,
                anchor_x: layer_req.transform.anchor_x,
                anchor_y: layer_req.transform.anchor_y,
                _padding: 0.0,
            },
            z_index: 0,
            mask: None,
            mask_inverted: false,
        };

        composite_layers.push(layer);
    }

    // Composite all layers
    let compositor = state.compositor.lock().await;
    let result = compositor.composite(
        &composite_layers,
        request.width,
        request.height,
        request.background,
    )?;

    // Encode to JPEG
    let ffmpeg_quality = ((100 - request.quality.clamp(1, 100)) * 29 / 99 + 2) as u32;
    let jpeg_data = encode_rgba_to_jpeg(
        &result.data,
        result.width,
        result.height,
        ffmpeg_quality,
    )?;

    Ok(jpeg_data)
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
        .map_err(|_| crate::error::Error::GpuError("Buffer map failed".to_string()))?
        .map_err(|e| crate::error::Error::GpuError(format!("Buffer map error: {:?}", e)))?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_query_defaults() {
        let json = r#"{"source": "/test.mp4", "time": 1.5}"#;
        let query: ExtractQuery = serde_json::from_str(json).unwrap();
        assert_eq!(query.quality, 85);
    }

    #[test]
    fn test_composite_request_defaults() {
        let json = r#"{
            "width": 1920,
            "height": 1080,
            "layers": []
        }"#;
        let request: CompositeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.quality, 85);
        assert_eq!(request.background, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn test_transform_defaults() {
        let json = r#"{}"#;
        let transform: TransformRequest = serde_json::from_str(json).unwrap();
        assert_eq!(transform.scale_x, 1.0);
        assert_eq!(transform.scale_y, 1.0);
        assert_eq!(transform.anchor_x, 0.5);
        assert_eq!(transform.anchor_y, 0.5);
    }
}
