//! RGBA to NV12 Texture Conversion - GPU compute shader for zero-copy encoding
//!
//! This module provides GPU-accelerated RGBA to NV12 conversion that outputs
//! directly to IOSurface-backed textures for zero-copy hardware encoding.
//!
//! Unlike `rgba_to_nv12.rs` which outputs to storage buffers (requiring CPU readback),
//! this module outputs to textures that can be shared directly with VideoToolbox.

use crate::error::Result;
use crate::gpu::GpuContext;
use std::sync::Arc;

#[cfg(not(target_os = "macos"))]
use crate::error::Error;

#[cfg(target_os = "macos")]
use super::macos_export::{IOSurfaceNv12Texture, MacOsTextureExporter};

/// RGBA to NV12 texture conversion shader
///
/// Outputs to texture2d_storage instead of storage buffer for zero-copy export.
pub const RGBA_TO_NV12_TEXTURE_SHADER: &str = r#"
// RGBA to NV12 Texture Conversion Compute Shader
// Outputs to texture storage for zero-copy encoding pipeline

struct Uniforms {
    width: u32,
    height: u32,
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var y_output: texture_storage_2d<r8unorm, write>;
@group(0) @binding(3) var uv_output: texture_storage_2d<rg8unorm, write>;

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

    let uv_width = uniforms.width / 2u;
    let uv_height = uniforms.height / 2u;

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
            let px = min(x0 + dx, uniforms.width - 1u);
            let py = min(y0 + dy, uniforms.height - 1u);

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

/// Uniform buffer for RGBA to NV12 texture conversion
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct RgbaToNv12TextureUniforms {
    pub width: u32,
    pub height: u32,
    pub color_space: u32,
    pub _padding: u32,
}

/// GPU RGBA to NV12 texture converter for zero-copy encoding
///
/// This converter outputs to IOSurface-backed textures that can be
/// shared directly with VideoToolbox for hardware encoding.
#[cfg(target_os = "macos")]
pub struct RgbaToNv12TextureConverter {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    exporter: MacOsTextureExporter,
    /// Cached output texture (reused across frames)
    output_cache: Option<IOSurfaceNv12Texture>,
    /// Cached dimensions
    cached_size: (u32, u32),
}

#[cfg(target_os = "macos")]
impl RgbaToNv12TextureConverter {
    /// Create a new RGBA to NV12 texture converter
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("RGBA to NV12 Texture Shader"),
            source: wgpu::ShaderSource::Wgsl(RGBA_TO_NV12_TEXTURE_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("RGBA to NV12 Texture Bind Group Layout"),
            entries: &[
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
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
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Y plane output texture (storage)
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::R8Unorm,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                // UV plane output texture (storage)
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rg8Unorm,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("RGBA to NV12 Texture Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create compute pipeline
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("RGBA to NV12 Texture Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "convert_rgba_to_nv12",
        });

        // Create uniform buffer
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("RGBA to NV12 Texture Uniforms"),
            size: std::mem::size_of::<RgbaToNv12TextureUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create exporter
        let exporter = MacOsTextureExporter::new(ctx.clone())?;

        tracing::info!("RGBA to NV12 texture converter initialized (zero-copy mode)");

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
            uniform_buffer,
            exporter,
            output_cache: None,
            cached_size: (0, 0),
        })
    }

    /// Convert RGBA texture to NV12 and return IOSurface handle
    ///
    /// This is the main entry point for zero-copy encoding.
    /// Returns the IOSurface handle that can be passed directly to VideoToolbox.
    pub fn convert_to_iosurface(
        &mut self,
        input_texture: &wgpu::TextureView,
        width: u32,
        height: u32,
        color_space: u32,
    ) -> Result<usize> {
        // Ensure output texture exists and has correct dimensions
        if self.cached_size != (width, height) || self.output_cache.is_none() {
            self.output_cache = Some(self.exporter.create_nv12_texture(width, height)?);
            self.cached_size = (width, height);
            tracing::debug!("Created new IOSurface-backed NV12 texture: {}x{}", width, height);
        }

        let output = self.output_cache.as_ref().unwrap();

        // Update uniforms
        let uniforms = RgbaToNv12TextureUniforms {
            width,
            height,
            color_space,
            _padding: 0,
        };
        self.ctx.queue().write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        // Create texture views for output
        let (y_view, uv_view) = output.create_views();

        // Create bind group
        let bind_group = self.ctx.device().create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("RGBA to NV12 Texture Bind Group"),
            layout: &self.bind_group_layout,
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
                    resource: wgpu::BindingResource::TextureView(&y_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&uv_view),
                },
            ],
        });

        // Create command encoder
        let mut encoder = self.ctx.device().create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("RGBA to NV12 Texture Encoder"),
        });

        // Dispatch compute shader
        // Each thread processes a 2x2 block, so we need (width/2) x (height/2) threads
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("RGBA to NV12 Texture Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            let workgroups_x = ((width / 2) + 15) / 16;
            let workgroups_y = ((height / 2) + 15) / 16;
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        // Submit and wait for completion
        self.ctx.queue().submit(std::iter::once(encoder.finish()));
        self.ctx.device().poll(wgpu::Maintain::Wait);

        // Return IOSurface handle
        Ok(output.io_surface_handle())
    }

    /// Get the cached output texture dimensions
    #[allow(dead_code)]
    pub fn cached_dimensions(&self) -> Option<(u32, u32)> {
        self.output_cache.as_ref().map(|t| (t.width, t.height))
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
