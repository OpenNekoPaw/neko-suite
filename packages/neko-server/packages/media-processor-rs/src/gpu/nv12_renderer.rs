//! NV12 Renderer - Convert NV12 textures to RGBA for compositing
//!
//! This module provides a GPU render pipeline that:
//! 1. Takes NV12 Y and UV textures as input
//! 2. Converts to RGBA using the appropriate color space
//! 3. Outputs to an RGBA texture for compositor input
//!
//! This is the bridge between hardware-decoded NV12 frames and the wgpu compositor.

use crate::error::Result;
use crate::gpu::nv12_import::{ColorSpace, ImportedNv12Texture, Nv12Uniforms, NV12_TO_RGB_SHADER};
use crate::gpu::GpuContext;

use std::sync::Arc;

/// NV12 to RGBA render pipeline
pub struct Nv12Renderer {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
}

impl Nv12Renderer {
    /// Create a new NV12 renderer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("NV12 to RGB Shader"),
            source: wgpu::ShaderSource::Wgsl(NV12_TO_RGB_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("NV12 Bind Group Layout"),
            entries: &[
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Y texture
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
                // UV texture
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
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
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("NV12 Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create render pipeline
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("NV12 to RGBA Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
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

        // Create uniform buffer
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("NV12 Uniforms"),
            size: std::mem::size_of::<Nv12Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create linear sampler for UV upscaling
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("NV12 Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
            uniform_buffer,
            sampler,
        })
    }

    /// Create an RGBA output texture
    pub fn create_output_texture(&self, width: u32, height: u32) -> wgpu::Texture {
        self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("NV12 RGBA Output"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        })
    }

    /// Render NV12 texture to RGBA
    ///
    /// Converts the imported NV12 texture to RGBA format using the GPU.
    pub fn render(
        &self,
        nv12: &ImportedNv12Texture,
        output: &wgpu::TextureView,
        color_space: ColorSpace,
    ) {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Update uniforms
        let uniforms = Nv12Uniforms::new(nv12.width, nv12.height, color_space);
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("NV12 Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&nv12.y_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&nv12.uv_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        // Create command encoder
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("NV12 Render Encoder"),
        });

        // Render pass
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("NV12 to RGBA Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: output,
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

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1); // Fullscreen triangle
        }

        // Submit
        queue.submit(std::iter::once(encoder.finish()));
    }

    /// Render NV12 to a new RGBA texture
    ///
    /// Convenience method that creates the output texture and renders to it.
    pub fn render_to_new_texture(&self, nv12: &ImportedNv12Texture) -> wgpu::Texture {
        let output = self.create_output_texture(nv12.width, nv12.height);
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());
        self.render(nv12, &output_view, nv12.color_space);
        output
    }
}

/// Cached NV12 renderer with texture pool
pub struct Nv12RenderCache {
    renderer: Nv12Renderer,
    output_textures: Vec<(u32, u32, wgpu::Texture)>,
}

impl Nv12RenderCache {
    /// Create a new render cache
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self {
            renderer: Nv12Renderer::new(ctx)?,
            output_textures: Vec::new(),
        })
    }

    /// Get or create an output texture of the specified size
    pub fn get_output_texture(&mut self, width: u32, height: u32) -> &wgpu::Texture {
        // Find existing texture with matching size
        if let Some(idx) = self
            .output_textures
            .iter()
            .position(|(w, h, _)| *w == width && *h == height)
        {
            return &self.output_textures[idx].2;
        }

        // Create new texture
        let texture = self.renderer.create_output_texture(width, height);
        self.output_textures.push((width, height, texture));
        &self.output_textures.last().unwrap().2
    }

    /// Render NV12 to RGBA using cached resources
    pub fn render(&mut self, nv12: &ImportedNv12Texture) -> &wgpu::Texture {
        // Get or create output texture
        let width = nv12.width;
        let height = nv12.height;

        // Find or create texture
        let texture_idx = if let Some(idx) = self
            .output_textures
            .iter()
            .position(|(w, h, _)| *w == width && *h == height)
        {
            idx
        } else {
            let texture = self.renderer.create_output_texture(width, height);
            self.output_textures.push((width, height, texture));
            self.output_textures.len() - 1
        };

        // Render
        let output_view = self.output_textures[texture_idx]
            .2
            .create_view(&wgpu::TextureViewDescriptor::default());
        self.renderer.render(nv12, &output_view, nv12.color_space);

        &self.output_textures[texture_idx].2
    }

    /// Get the underlying renderer
    pub fn renderer(&self) -> &Nv12Renderer {
        &self.renderer
    }

    /// Clear cached textures
    pub fn clear(&mut self) {
        self.output_textures.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nv12_uniforms_alignment() {
        // Ensure uniform struct is properly aligned
        assert_eq!(std::mem::size_of::<Nv12Uniforms>(), 16);
    }
}
