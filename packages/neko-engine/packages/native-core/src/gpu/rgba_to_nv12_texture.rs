//! RGBA to NV12 Texture Conversion - Dual Render Pass Pipeline for zero-copy encoding
//!
//! This module provides GPU-accelerated RGBA to NV12 conversion using two separate
//! render passes for Y and UV planes (due to wgpu MRT size limitations).
//!
//! Architecture (Dual Render Pass Pipeline):
//! - Pass 1: RGBA → Y plane (R8Unorm, full resolution)
//! - Pass 2: RGBA → UV plane (RG8Unorm, half resolution with 2x2 averaging)
//! - Hardware ROP handles f32 → u8 quantization automatically
//! - IOSurface is shared directly with VideoToolbox for encoding
//!
//! Pipeline:
//! 1. Input: RGBA texture from compositor
//! 2. Render Pass 1: RGBA → Y (R8Unorm) at full resolution
//! 3. Render Pass 2: RGBA → UV (RG8Unorm) at half resolution
//! 4. Metal Blit: staging textures → IOSurface
//! 5. Output: IOSurface textures ready for VideoToolbox
//!
//! Note: wgpu doesn't support different-sized MRT attachments, so we use two passes.
//! This is still efficient as both passes share the same input texture binding.

use crate::error::Result;
use crate::gpu::GpuContext;
use std::sync::Arc;

#[cfg(not(target_os = "macos"))]
use crate::error::Error;

#[cfg(target_os = "macos")]
use super::macos_export::{IOSurfaceBackingStore, MacOsTextureExporter};

/// Y Plane Render Shader - outputs luminance at full resolution
pub const RGBA_TO_Y_SHADER: &str = r#"
// Y Plane Render Shader
// Converts RGBA to Y (luminance) at full resolution

struct Uniforms {
    output_width: f32,
    output_height: f32,
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertex shader
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 2 - 1);
    let y = f32(i32(vertex_index >> 1u) * 2 - 1);
    out.position = vec4<f32>(x, -y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (y + 1.0) * 0.5);
    return out;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var input_sampler: sampler;

// BT.601 RGB to Y (SD video)
fn rgb_to_y_bt601(rgb: vec3<f32>) -> f32 {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

// BT.709 RGB to Y (HD video)
fn rgb_to_y_bt709(rgb: vec3<f32>) -> f32 {
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// BT.2020 RGB to Y (UHD video)
fn rgb_to_y_bt2020(rgb: vec3<f32>) -> f32 {
    return 0.2627 * rgb.r + 0.6780 * rgb.g + 0.0593 * rgb.b;
}

fn rgb_to_y(rgb: vec3<f32>, color_space: u32) -> f32 {
    switch color_space {
        case 0u: { return rgb_to_y_bt601(rgb); }
        case 2u: { return rgb_to_y_bt2020(rgb); }
        default: { return rgb_to_y_bt709(rgb); }
    }
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) f32 {
    let rgba = textureSample(input_texture, input_sampler, in.uv);
    return rgb_to_y(rgba.rgb, uniforms.color_space);
}
"#;

/// UV Plane Render Shader - outputs chrominance at half resolution with 2x2 averaging
pub const RGBA_TO_UV_SHADER: &str = r#"
// UV Plane Render Shader
// Converts RGBA to UV (chrominance) at half resolution
// Each output pixel averages a 2x2 block from the input

struct Uniforms {
    output_width: f32,   // Full resolution width
    output_height: f32,  // Full resolution height
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertex shader
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 2 - 1);
    let y = f32(i32(vertex_index >> 1u) * 2 - 1);
    out.position = vec4<f32>(x, -y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (y + 1.0) * 0.5);
    return out;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var input_sampler: sampler;

// BT.601 RGB to UV (SD video)
fn rgb_to_uv_bt601(rgb: vec3<f32>) -> vec2<f32> {
    let u = -0.169 * rgb.r - 0.331 * rgb.g + 0.500 * rgb.b + 0.5;
    let v = 0.500 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5;
    return vec2<f32>(u, v);
}

// BT.709 RGB to UV (HD video)
fn rgb_to_uv_bt709(rgb: vec3<f32>) -> vec2<f32> {
    let u = -0.1146 * rgb.r - 0.3854 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4542 * rgb.g - 0.0458 * rgb.b + 0.5;
    return vec2<f32>(u, v);
}

// BT.2020 RGB to UV (UHD video)
fn rgb_to_uv_bt2020(rgb: vec3<f32>) -> vec2<f32> {
    let u = -0.1396 * rgb.r - 0.3604 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4598 * rgb.g - 0.0402 * rgb.b + 0.5;
    return vec2<f32>(u, v);
}

fn rgb_to_uv(rgb: vec3<f32>, color_space: u32) -> vec2<f32> {
    switch color_space {
        case 0u: { return rgb_to_uv_bt601(rgb); }
        case 2u: { return rgb_to_uv_bt2020(rgb); }
        default: { return rgb_to_uv_bt709(rgb); }
    }
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec2<f32> {
    // Calculate texel size for 2x2 sampling
    let texel_x = 1.0 / uniforms.output_width;
    let texel_y = 1.0 / uniforms.output_height;

    // Sample 2x2 block and average UV values
    // The UV texture is half resolution, so each UV pixel corresponds to a 2x2 block
    let base_uv = in.uv;

    // Sample 4 pixels in the 2x2 block
    let rgba00 = textureSample(input_texture, input_sampler, base_uv);
    let rgba10 = textureSample(input_texture, input_sampler, base_uv + vec2<f32>(texel_x, 0.0));
    let rgba01 = textureSample(input_texture, input_sampler, base_uv + vec2<f32>(0.0, texel_y));
    let rgba11 = textureSample(input_texture, input_sampler, base_uv + vec2<f32>(texel_x, texel_y));

    // Convert each to UV and average
    let uv00 = rgb_to_uv(rgba00.rgb, uniforms.color_space);
    let uv10 = rgb_to_uv(rgba10.rgb, uniforms.color_space);
    let uv01 = rgb_to_uv(rgba01.rgb, uniforms.color_space);
    let uv11 = rgb_to_uv(rgba11.rgb, uniforms.color_space);

    return (uv00 + uv10 + uv01 + uv11) * 0.25;
}
"#;

/// Legacy MRT shader (kept for reference, not used due to wgpu limitations)
#[allow(dead_code)]
pub const RGBA_TO_NV12_RENDER_SHADER: &str = r#"
// RGBA to NV12 Full Render Pipeline Shader (MRT version - not used)
// Single pass with MRT for optimal performance
// Note: wgpu doesn't support different-sized MRT attachments

struct Uniforms {
    output_width: f32,
    output_height: f32,
    color_space: u32,
    _padding: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 2 - 1);
    let y = f32(i32(vertex_index >> 1u) * 2 - 1);
    out.position = vec4<f32>(x, -y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (y + 1.0) * 0.5);
    return out;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var input_sampler: sampler;

fn rgb_to_yuv_bt709(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    let u = -0.1146 * rgb.r - 0.3854 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4542 * rgb.g - 0.0458 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

struct FragmentOutput {
    @location(0) y: f32,
    @location(1) uv: vec2<f32>,
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
    let rgba = textureSample(input_texture, input_sampler, in.uv);
    let yuv = rgb_to_yuv_bt709(rgba.rgb);
    var out: FragmentOutput;
    out.y = yuv.x;
    out.uv = yuv.yz;
    return out;
}
"#;

/// Legacy compute shader for RGBA to NV12 conversion (Compute + Blit approach)
///
/// This shader is used in the current implementation which uses:
/// 1. Compute shader: RGBA → R16Float/RG16Float intermediate textures
/// 2. Blit render pass: intermediate → staging textures
/// 3. Metal blit: staging → IOSurface
///
/// TODO: Migrate to full render pipeline (RGBA_TO_NV12_RENDER_SHADER) for optimal performance
pub const RGBA_TO_NV12_TEXTURE_SHADER: &str = r#"
// RGBA to NV12 Texture Conversion Compute Shader
// Outputs to texture storage for zero-copy encoding pipeline

struct Uniforms {
    output_width: f32,
    output_height: f32,
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
// Use r16float/rg16float instead of r8unorm/rg8unorm because Metal doesn't support
// 8-bit formats as storage textures. The values will be clamped to [0,1] range.
@group(0) @binding(2) var y_output: texture_storage_2d<r16float, write>;
@group(0) @binding(3) var uv_output: texture_storage_2d<rg16float, write>;

// BT.601 RGB to YUV (SD video)
fn rgb_to_yuv_bt601(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    let u = -0.169 * rgb.r - 0.331 * rgb.g + 0.500 * rgb.b + 0.5;
    let v = 0.500 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

// BT.709 RGB to YUV (HD video)
fn rgb_to_yuv_bt709(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    let u = -0.1146 * rgb.r - 0.3854 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4542 * rgb.g - 0.0458 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

// BT.2020 RGB to YUV (UHD video)
fn rgb_to_yuv_bt2020(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.2627 * rgb.r + 0.6780 * rgb.g + 0.0593 * rgb.b;
    let u = -0.1396 * rgb.r - 0.3604 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4598 * rgb.g - 0.0402 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

fn rgb_to_yuv(rgb: vec3<f32>, color_space: u32) -> vec3<f32> {
    switch color_space {
        case 0u: { return rgb_to_yuv_bt601(rgb); }
        case 2u: { return rgb_to_yuv_bt2020(rgb); }
        default: { return rgb_to_yuv_bt709(rgb); }
    }
}

// Combined Y and UV kernel: processes 2x2 blocks
// Each thread handles one 2x2 block, writing 4 Y values and 1 UV pair
@compute @workgroup_size(16, 16)
fn convert_rgba_to_nv12(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let block_x = global_id.x;
    let block_y = global_id.y;

    let width = u32(uniforms.output_width);
    let height = u32(uniforms.output_height);
    let uv_width = width / 2u;
    let uv_height = height / 2u;

    if (block_x >= uv_width || block_y >= uv_height) {
        return;
    }

    // Process 2x2 block
    let x0 = block_x * 2u;
    let y0 = block_y * 2u;

    var u_sum: f32 = 0.0;
    var v_sum: f32 = 0.0;

    // Process each pixel in the 2x2 block
    for (var dy: u32 = 0u; dy < 2u; dy = dy + 1u) {
        for (var dx: u32 = 0u; dx < 2u; dx = dx + 1u) {
            let px = min(x0 + dx, width - 1u);
            let py = min(y0 + dy, height - 1u);

            let rgba = textureLoad(input_texture, vec2<i32>(i32(px), i32(py)), 0);
            let yuv = rgb_to_yuv(rgba.rgb, uniforms.color_space);

            // Write Y value to Y plane texture
            textureStore(y_output, vec2<i32>(i32(px), i32(py)), vec4<f32>(yuv.x, 0.0, 0.0, 1.0));

            // Accumulate UV for averaging
            u_sum = u_sum + yuv.y;
            v_sum = v_sum + yuv.z;
        }
    }

    // Average UV values and write to UV plane texture
    let u_avg = u_sum / 4.0;
    let v_avg = v_sum / 4.0;

    textureStore(uv_output, vec2<i32>(i32(block_x), i32(block_y)), vec4<f32>(u_avg, v_avg, 0.0, 1.0));
}
"#;

/// Blit shader for copying intermediate textures to staging/IOSurface textures
pub const BLIT_SHADER: &str = r#"
// Fullscreen triangle vertex shader
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Generate fullscreen triangle vertices
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 2 - 1);
    let y = f32(i32(vertex_index >> 1u) * 2 - 1);
    out.position = vec4<f32>(x, -y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, (y + 1.0) * 0.5);
    return out;
}

// Y plane blit (R16Float -> R8Unorm)
@group(0) @binding(0) var y_sampler: sampler;
@group(0) @binding(1) var y_texture: texture_2d<f32>;

@fragment
fn fs_y_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let y = textureSample(y_texture, y_sampler, in.uv).r;
    return vec4<f32>(y, 0.0, 0.0, 1.0);
}

// UV plane blit (RG16Float -> RG8Unorm)
@group(0) @binding(0) var uv_sampler: sampler;
@group(0) @binding(1) var uv_texture: texture_2d<f32>;

@fragment
fn fs_uv_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = textureSample(uv_texture, uv_sampler, in.uv).rg;
    return vec4<f32>(uv.r, uv.g, 0.0, 1.0);
}
"#;

/// Uniform buffer for RGBA to NV12 render pipeline
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct RgbaToNv12RenderUniforms {
    pub output_width: f32,
    pub output_height: f32,
    pub color_space: u32,
    pub _padding: u32,
}

// Legacy alias for backward compatibility
pub type RgbaToNv12TextureUniforms = RgbaToNv12RenderUniforms;

/// GPU RGBA to NV12 texture converter for zero-copy encoding
///
/// This converter uses a **Dual Render Pass Pipeline** for Y and UV planes
/// (due to wgpu not supporting different-sized MRT attachments).
///
/// Architecture (Dual Render Pass Pipeline):
/// - Pass 1: RGBA → Y plane (R8Unorm, full resolution)
/// - Pass 2: RGBA → UV plane (RG8Unorm, half resolution with 2x2 averaging)
/// - Hardware ROP handles f32 → u8 quantization automatically
/// - Staging textures → Metal blit → IOSurface (avoids wgpu HAL issues)
///
/// Pipeline:
/// 1. Render Pass 1: RGBA → Y (R8Unorm) at full resolution
/// 2. Render Pass 2: RGBA → UV (RG8Unorm) at half resolution
/// 3. Metal blit: staging textures → IOSurface textures (GPU-to-GPU copy)
/// 4. IOSurface ready for VideoToolbox encoding
#[cfg(target_os = "macos")]
pub struct RgbaToNv12TextureConverter {
    ctx: Arc<GpuContext>,
    /// Y plane render pipeline (RGBA → Y at full resolution)
    y_render_pipeline: wgpu::RenderPipeline,
    /// UV plane render pipeline (RGBA → UV at half resolution)
    uv_render_pipeline: wgpu::RenderPipeline,
    /// Shared bind group layout for both pipelines
    render_bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// Staging textures (R8Unorm/RG8Unorm, standard wgpu textures)
    staging_y_texture: Option<wgpu::Texture>,
    staging_uv_texture: Option<wgpu::Texture>,
    /// Cached texture dimensions
    texture_size: (u32, u32),
    /// IOSurface exporter
    exporter: MacOsTextureExporter,
    /// Persistent IOSurface backing store (reused across frames)
    output_backing: Option<IOSurfaceBackingStore>,
}

#[cfg(target_os = "macos")]
impl RgbaToNv12TextureConverter {
    /// Create a new RGBA to NV12 texture converter using dual render pass pipeline
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // ========== Shared Bind Group Layout ==========
        let render_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("RGBA to NV12 Render Bind Group Layout"),
                entries: &[
                    // Uniforms
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Input RGBA texture
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    // Sampler
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("RGBA to NV12 Render Pipeline Layout"),
                bind_group_layouts: &[&render_bind_group_layout],
                push_constant_ranges: &[],
            });

        // ========== Y Plane Render Pipeline ==========
        let y_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("RGBA to Y Shader"),
            source: wgpu::ShaderSource::Wgsl(RGBA_TO_Y_SHADER.into()),
        });

        let y_render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("RGBA to Y Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &y_shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &y_shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::R8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        // ========== UV Plane Render Pipeline ==========
        let uv_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("RGBA to UV Shader"),
            source: wgpu::ShaderSource::Wgsl(RGBA_TO_UV_SHADER.into()),
        });

        let uv_render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("RGBA to UV Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &uv_shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &uv_shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rg8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        // ========== Shared Resources ==========
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("RGBA to NV12 Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("RGBA to NV12 Uniforms"),
            size: std::mem::size_of::<RgbaToNv12RenderUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // IOSurface exporter
        let exporter = MacOsTextureExporter::new(ctx.clone())?;

        tracing::info!(
            "RGBA to NV12 texture converter initialized (Dual Render Pass Pipeline)"
        );

        Ok(Self {
            ctx,
            y_render_pipeline,
            uv_render_pipeline,
            render_bind_group_layout,
            uniform_buffer,
            sampler,
            staging_y_texture: None,
            staging_uv_texture: None,
            texture_size: (0, 0),
            exporter,
            output_backing: None,
        })
    }

    /// Ensure staging textures exist with correct dimensions
    fn ensure_staging_textures(&mut self, width: u32, height: u32) {
        if self.texture_size == (width, height)
            && self.staging_y_texture.is_some()
            && self.staging_uv_texture.is_some()
        {
            return;
        }

        let device = self.ctx.device();

        // Y plane staging texture (R8Unorm, full resolution)
        self.staging_y_texture = Some(device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Staging Y Texture (R8Unorm)"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        }));

        // UV plane staging texture (RG8Unorm, half resolution)
        self.staging_uv_texture = Some(device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Staging UV Texture (RG8Unorm)"),
            size: wgpu::Extent3d {
                width: width / 2,
                height: height / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        }));

        self.texture_size = (width, height);

        tracing::debug!(
            "Created staging textures: Y={}x{} (R8Unorm), UV={}x{} (RG8Unorm)",
            width, height, width / 2, height / 2
        );
    }

    /// Convert RGBA texture to NV12 and return IOSurface handle
    ///
    /// This is the main entry point for zero-copy encoding.
    /// Returns the IOSurface handle that can be passed directly to VideoToolbox.
    ///
    /// Pipeline (Dual Render Pass):
    /// 1. Render Pass 1: RGBA → Y staging texture (full resolution)
    /// 2. Render Pass 2: RGBA → UV staging texture (half resolution)
    /// 3. Metal blit: staging textures → IOSurface textures (GPU-to-GPU copy)
    pub fn convert_to_iosurface(
        &mut self,
        input_texture: &wgpu::TextureView,
        width: u32,
        height: u32,
        color_space: u32,
    ) -> Result<usize> {
        // Ensure staging textures exist
        self.ensure_staging_textures(width, height);

        // Ensure IOSurface backing store exists (persistent, reused across frames)
        if self.output_backing.is_none() || self.output_backing.as_ref().unwrap().width != width {
            self.output_backing = Some(self.exporter.create_backing_store(width, height)?);
            tracing::debug!("Created new IOSurface backing store: {}x{}", width, height);
        }

        let backing = self.output_backing.as_ref().unwrap();
        let staging_y = self.staging_y_texture.as_ref().unwrap();
        let staging_uv = self.staging_uv_texture.as_ref().unwrap();

        // Update uniforms
        let uniforms = RgbaToNv12RenderUniforms {
            output_width: width as f32,
            output_height: height as f32,
            color_space,
            _padding: 0,
        };
        self.ctx
            .queue()
            .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        // Create staging texture views
        let staging_y_view = staging_y.create_view(&wgpu::TextureViewDescriptor::default());
        let staging_uv_view = staging_uv.create_view(&wgpu::TextureViewDescriptor::default());

        // Create bind group (shared by both passes)
        let bind_group = self.ctx.device().create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("RGBA to NV12 Render Bind Group"),
            layout: &self.render_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(input_texture),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        let mut encoder = self
            .ctx
            .device()
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("RGBA to NV12 Encoder"),
            });

        // ========== Dual Render Pass Pipeline ==========
        // Pass 1: Y plane (full resolution)
        // Pass 2: UV plane (half resolution with 2x2 averaging)

        // Y plane render pass (full resolution)
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("RGBA to Y Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &staging_y_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.y_render_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1); // Fullscreen triangle
        }

        // UV plane render pass (half resolution)
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("RGBA to UV Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &staging_uv_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.5,
                            g: 0.5,
                            b: 0.0,
                            a: 1.0,
                        }), // Neutral UV (128, 128)
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.uv_render_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1); // Fullscreen triangle
        }

        // Submit wgpu commands and wait
        self.ctx.queue().submit(std::iter::once(encoder.finish()));
        self.ctx.device().poll(wgpu::Maintain::Wait);

        // ========== Metal Blit (Staging → IOSurface) ==========
        self.blit_staging_to_iosurface(staging_y, staging_uv, backing, width, height)?;

        Ok(backing.io_surface_handle())
    }

    /// Blit staging textures to IOSurface using Metal
    fn blit_staging_to_iosurface(
        &self,
        staging_y: &wgpu::Texture,
        staging_uv: &wgpu::Texture,
        backing: &IOSurfaceBackingStore,
        width: u32,
        height: u32,
    ) -> Result<()> {
        tracing::debug!("blit_staging_to_iosurface: starting, {}x{}", width, height);

        unsafe {
            let metal_device = self.exporter.metal_device();
            tracing::debug!("blit_staging_to_iosurface: got metal device");

            let command_queue = metal_device.new_command_queue();
            let command_buffer = command_queue.new_command_buffer();
            let blit_encoder = command_buffer.new_blit_command_encoder();
            tracing::debug!("blit_staging_to_iosurface: created blit encoder");

            // Get the IOSurface Metal textures
            let (y_iosurface_tex, uv_iosurface_tex) = backing.metal_textures();
            tracing::debug!("blit_staging_to_iosurface: got IOSurface textures");

            // Get the staging Metal textures from wgpu
            tracing::debug!("blit_staging_to_iosurface: getting Y staging metal texture");
            let y_staging_metal = self.get_metal_texture_from_wgpu(staging_y)?;
            tracing::debug!("blit_staging_to_iosurface: got Y staging metal texture");

            tracing::debug!("blit_staging_to_iosurface: getting UV staging metal texture");
            let uv_staging_metal = self.get_metal_texture_from_wgpu(staging_uv)?;
            tracing::debug!("blit_staging_to_iosurface: got UV staging metal texture");

            // Blit Y plane: staging → IOSurface
            tracing::debug!("blit_staging_to_iosurface: blitting Y plane");
            blit_encoder.copy_from_texture(
                &y_staging_metal,
                0, // slice
                0, // level
                metal::MTLOrigin { x: 0, y: 0, z: 0 },
                metal::MTLSize {
                    width: width as u64,
                    height: height as u64,
                    depth: 1,
                },
                y_iosurface_tex,
                0, // slice
                0, // level
                metal::MTLOrigin { x: 0, y: 0, z: 0 },
            );

            // Blit UV plane: staging → IOSurface
            tracing::debug!("blit_staging_to_iosurface: blitting UV plane");
            blit_encoder.copy_from_texture(
                &uv_staging_metal,
                0,
                0,
                metal::MTLOrigin { x: 0, y: 0, z: 0 },
                metal::MTLSize {
                    width: (width / 2) as u64,
                    height: (height / 2) as u64,
                    depth: 1,
                },
                uv_iosurface_tex,
                0,
                0,
                metal::MTLOrigin { x: 0, y: 0, z: 0 },
            );

            tracing::debug!("blit_staging_to_iosurface: ending encoding");
            blit_encoder.end_encoding();
            tracing::debug!("blit_staging_to_iosurface: committing");
            command_buffer.commit();
            tracing::debug!("blit_staging_to_iosurface: waiting for completion");
            command_buffer.wait_until_completed();
            tracing::debug!("blit_staging_to_iosurface: done");
        }

        Ok(())
    }

    /// Get the underlying Metal texture from a wgpu texture
    ///
    /// NOTE: This is a workaround since wgpu-hal's Texture.raw field is private.
    /// We use unsafe pointer casting to access the raw Metal texture.
    unsafe fn get_metal_texture_from_wgpu(&self, texture: &wgpu::Texture) -> Result<metal::Texture> {
        // Use wgpu's as_hal to get the underlying Metal texture
        let mut result: Option<metal::Texture> = None;

        texture.as_hal::<wgpu_hal::api::Metal, _>(|hal_texture| {
            if let Some(t) = hal_texture {
                // The wgpu_hal::metal::Texture struct has `raw: metal::Texture` as its first field
                // We can use unsafe pointer casting to access it
                let ptr = t as *const wgpu_hal::metal::Texture;
                let raw_ptr = ptr as *const metal::Texture;
                result = Some((*raw_ptr).clone());
            }
        });

        result.ok_or_else(|| crate::error::Error::Other("Failed to get Metal texture from wgpu".to_string()))
    }

    /// Get the cached output texture dimensions
    #[allow(dead_code)]
    pub fn cached_dimensions(&self) -> Option<(u32, u32)> {
        self.output_backing.as_ref().map(|b| (b.width, b.height))
    }
}

/// Stub implementation for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub struct RgbaToNv12TextureConverter {
    _ctx: Arc<GpuContext>,
}

#[cfg(not(target_os = "macos"))]
impl RgbaToNv12TextureConverter {
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Err(Error::Other(
            "Zero-copy texture conversion only supported on macOS".to_string(),
        ))
    }

    pub fn convert_to_iosurface(
        &mut self,
        _input_texture: &wgpu::TextureView,
        _width: u32,
        _height: u32,
        _color_space: u32,
    ) -> Result<usize> {
        Err(Error::Other(
            "Zero-copy texture conversion only supported on macOS".to_string(),
        ))
    }

    pub fn cached_dimensions(&self) -> Option<(u32, u32)> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uniforms_size() {
        assert_eq!(std::mem::size_of::<RgbaToNv12TextureUniforms>(), 16);
    }
}
