//! GPU puppet renderer foundation.
//!
//! The renderer consumes runtime-puppet render data and produces a GPU-resident
//! output texture. Output routing remains owned by PipelineSink users.

#[cfg(test)]
mod architecture_tests;

mod atlas_cache;
mod native_extract;
mod shader;
mod sprite_batch;

use std::sync::{Arc, Mutex};

use neko_engine_gpu::error::{Error, Result};
use neko_engine_gpu::{BlendMode, GpuContext, GpuLayer, GpuReadbackTarget, Transform2D};
use neko_engine_types::{GpuFrameLease, GpuOutputHandle, VideoGpuFrame, VideoOutput};

pub use atlas_cache::{PuppetAtlasCache, PuppetTextureAtlas, PuppetTextureAtlasInput};
pub use native_extract::{
    deform_native_cpu, deform_native_gpu, select_native_deformation_path, NativeBlendShapeDelta,
    NativeDeformationPath, NativeDeformationSelection, NativePuppetRenderExtract,
};
pub use shader::{create_shader_module, PUPPET_TEXTURED_MESH_WGSL};
pub use sprite_batch::{PuppetVertex, SpriteBatch, SpriteDraw};

/// Output texture format for puppet rendering.
pub const PUPPET_RENDER_TARGET_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8UnormSrgb;

/// Blend mode for puppet mesh drawing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PuppetBlendMode {
    /// Standard source-over alpha.
    Normal,
    /// Multiply blend.
    Multiply,
    /// Screen blend.
    Screen,
    /// Overlay blend.
    Overlay,
    /// Additive blend.
    Add,
}

impl PuppetBlendMode {
    /// Parse runtime-puppet blend mode strings.
    pub fn from_runtime(value: &str) -> Self {
        match value {
            "multiply" => Self::Multiply,
            "screen" => Self::Screen,
            "overlay" => Self::Overlay,
            "add" => Self::Add,
            _ => Self::Normal,
        }
    }
}

/// Renderer mesh input extracted from runtime-puppet.
#[derive(Debug, Clone, PartialEq)]
pub struct PuppetMeshInput {
    /// Stable node id.
    pub node_id: String,
    /// Texture atlas id.
    pub atlas_id: String,
    /// Deformed world-space vertices.
    pub vertices: Vec<[f32; 2]>,
    /// Mesh UVs in atlas space.
    pub uvs: Vec<[f32; 2]>,
    /// Mesh indices.
    pub indices: Vec<u16>,
    /// Mesh opacity.
    pub opacity: f32,
    /// Z ordering.
    pub z_order: f32,
    /// Blend mode.
    pub blend_mode: PuppetBlendMode,
}

/// Puppet render request.
#[derive(Debug, Clone, PartialEq)]
pub struct PuppetRenderRequest {
    /// Output width.
    pub width: u32,
    /// Output height.
    pub height: u32,
    /// Presentation timestamp in microseconds.
    pub pts: i64,
    /// Frame duration in microseconds.
    pub duration: i64,
    /// Monotonic frame index.
    pub frame_index: u64,
    /// Clear color.
    pub clear_color: [f64; 4],
    /// Mesh data.
    pub meshes: Vec<PuppetMeshInput>,
    /// Texture atlases.
    pub atlases: Vec<PuppetTextureAtlasInput>,
}

impl PuppetRenderRequest {
    /// Create a request with transparent background.
    pub fn new(width: u32, height: u32, meshes: Vec<PuppetMeshInput>) -> Self {
        Self {
            width,
            height,
            pts: 0,
            duration: 0,
            frame_index: 0,
            clear_color: [0.0, 0.0, 0.0, 0.0],
            meshes,
            atlases: Vec::new(),
        }
    }
}

/// GPU render output.
pub struct PuppetRenderOutput {
    /// Rendered texture.
    pub color_texture: wgpu::Texture,
    /// Rendered texture view.
    pub color_view: wgpu::TextureView,
    /// Output width.
    pub width: u32,
    /// Output height.
    pub height: u32,
    /// Frame index.
    pub frame_index: u64,
    /// Presentation timestamp.
    pub pts: i64,
    /// Frame duration.
    pub duration: i64,
    /// Drawn mesh count.
    pub mesh_count: usize,
    /// Batched vertex count.
    pub vertex_count: usize,
    /// Batched index count.
    pub index_count: usize,
}

impl PuppetRenderOutput {
    /// Convert puppet render output into a 2D compositing layer (zero-copy).
    pub fn into_gpu_layer(
        self,
        transform: Transform2D,
        opacity: f32,
        blend_mode: BlendMode,
        z_index: i32,
    ) -> GpuLayer {
        GpuLayer::from_rgba(
            self.color_texture,
            self.width,
            self.height,
            transform,
            opacity,
            blend_mode,
            z_index,
        )
    }

    /// Convert to a PipelineSink-compatible GPU video output.
    pub fn into_video_output(self, ctx: Arc<GpuContext>) -> VideoOutput {
        let readback = GpuReadbackTarget::new(ctx, self.color_texture, self.width, self.height);
        VideoOutput::gpu_frame(VideoGpuFrame {
            lease: GpuFrameLease::with_readback(
                unsupported_output_handle(),
                Some(Arc::new(readback)),
            ),
            pts: self.pts,
            duration: self.duration,
            frame_index: self.frame_index,
            width: self.width,
            height: self.height,
            force_keyframe: false,
            diagnostics: None,
            meta: None,
        })
    }
}

/// GPU puppet renderer.
pub struct PuppetRenderer {
    ctx: Arc<GpuContext>,
    state: Mutex<PuppetRendererState>,
}

struct PuppetRendererState {
    atlas_cache: PuppetAtlasCache,
    view_bind_group_layout: wgpu::BindGroupLayout,
    render_pipeline: wgpu::RenderPipeline,
}

impl PuppetRenderer {
    /// Create a renderer using the shared GPU context.
    pub fn new(ctx: Arc<GpuContext>) -> Self {
        let device = ctx.device();
        let view_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("puppet_view_bind_group_layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let atlas_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("puppet_atlas_bind_group_layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
        let shader = shader::create_shader_module(device);
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("puppet_renderer_pipeline_layout"),
            bind_group_layouts: &[&view_bind_group_layout, &atlas_bind_group_layout],
            push_constant_ranges: &[],
        });
        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("puppet_renderer_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[PuppetVertex::buffer_layout()],
            },
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
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: PUPPET_RENDER_TARGET_FORMAT,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview: None,
        });
        let atlas_cache = PuppetAtlasCache::new(
            Arc::clone(device),
            Arc::clone(ctx.queue()),
            atlas_bind_group_layout,
        );

        Self {
            ctx,
            state: Mutex::new(PuppetRendererState {
                atlas_cache,
                view_bind_group_layout,
                render_pipeline,
            }),
        }
    }

    /// Render one puppet frame.
    pub fn render(&self, request: PuppetRenderRequest) -> Result<PuppetRenderOutput> {
        validate_request(&request)?;

        let batch = SpriteBatch::from_meshes(&request.meshes)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| Error::Other("PuppetRenderer state lock poisoned".to_string()))?;
        state.atlas_cache.sync(&request.atlases)?;

        let texture = self.create_render_target(request.width, request.height);
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder =
            self.ctx
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("puppet_renderer_encoder"),
                });

        if batch.is_empty() {
            clear_render_target(&mut encoder, &view, request.clear_color);
        } else {
            self.render_batch(&mut encoder, &view, &state, &batch, &request)?;
        }

        self.ctx.queue().submit(Some(encoder.finish()));

        Ok(PuppetRenderOutput {
            color_texture: texture,
            color_view: view,
            width: request.width,
            height: request.height,
            frame_index: request.frame_index,
            pts: request.pts,
            duration: request.duration,
            mesh_count: request.meshes.len(),
            vertex_count: batch.vertex_count(),
            index_count: batch.index_count(),
        })
    }

    /// Number of cached texture atlases.
    pub fn atlas_count(&self) -> Result<usize> {
        let state = self
            .state
            .lock()
            .map_err(|_| Error::Other("PuppetRenderer state lock poisoned".to_string()))?;
        Ok(state.atlas_cache.len())
    }

    fn create_render_target(&self, width: u32, height: u32) -> wgpu::Texture {
        self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("puppet_render_target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: PUPPET_RENDER_TARGET_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        })
    }

    fn render_batch(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        state: &PuppetRendererState,
        batch: &SpriteBatch,
        request: &PuppetRenderRequest,
    ) -> Result<()> {
        use wgpu::util::DeviceExt;

        let device = self.ctx.device();
        let view_uniforms = ViewUniforms {
            viewport: [request.width as f32, request.height as f32],
            _padding: [0.0, 0.0],
        };
        let view_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("puppet_view_uniforms"),
            contents: bytemuck::bytes_of(&view_uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let view_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("puppet_view_bind_group"),
            layout: &state.view_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: view_buffer.as_entire_binding(),
            }],
        });
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("puppet_vertex_buffer"),
            contents: bytemuck::cast_slice(&batch.vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("puppet_index_buffer"),
            contents: bytemuck::cast_slice(&batch.indices),
            usage: wgpu::BufferUsages::INDEX,
        });

        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("puppet_render_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color {
                        r: request.clear_color[0],
                        g: request.clear_color[1],
                        b: request.clear_color[2],
                        a: request.clear_color[3],
                    }),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            occlusion_query_set: None,
            timestamp_writes: None,
        });
        pass.set_pipeline(&state.render_pipeline);
        pass.set_bind_group(0, &view_bind_group, &[]);
        pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        pass.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint32);

        for draw in &batch.draws {
            let atlas = state.atlas_cache.get(&draw.atlas_id).ok_or_else(|| {
                Error::InvalidParameter(format!(
                    "puppet mesh '{}' references missing atlas '{}'",
                    draw.node_id, draw.atlas_id
                ))
            })?;
            pass.set_bind_group(1, &atlas.bind_group, &[]);
            pass.draw_indexed(
                draw.index_start..draw.index_start + draw.index_count,
                0,
                0..1,
            );
        }

        Ok(())
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ViewUniforms {
    viewport: [f32; 2],
    _padding: [f32; 2],
}

fn clear_render_target(
    encoder: &mut wgpu::CommandEncoder,
    view: &wgpu::TextureView,
    clear_color: [f64; 4],
) {
    let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("puppet_clear_pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color {
                    r: clear_color[0],
                    g: clear_color[1],
                    b: clear_color[2],
                    a: clear_color[3],
                }),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        occlusion_query_set: None,
        timestamp_writes: None,
    });
}

fn validate_request(request: &PuppetRenderRequest) -> Result<()> {
    if request.width == 0 || request.height == 0 {
        return Err(Error::InvalidParameter(format!(
            "puppet render target size must be non-zero, got {}x{}",
            request.width, request.height
        )));
    }
    Ok(())
}

fn unsupported_output_handle() -> GpuOutputHandle {
    GpuOutputHandle::Unsupported {
        platform: std::env::consts::OS,
        reason: "puppet renderer exposes terminal readback until native zero-copy interop is implemented"
            .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::PipelineOutput;

    #[test]
    fn blend_mode_parses_runtime_strings() {
        assert_eq!(
            PuppetBlendMode::from_runtime("multiply"),
            PuppetBlendMode::Multiply
        );
        assert_eq!(
            PuppetBlendMode::from_runtime("screen"),
            PuppetBlendMode::Screen
        );
        assert_eq!(
            PuppetBlendMode::from_runtime("unknown"),
            PuppetBlendMode::Normal
        );
    }

    #[test]
    fn render_request_rejects_zero_size() {
        let request = PuppetRenderRequest::new(0, 1080, Vec::new());
        let err = validate_request(&request).unwrap_err();
        assert!(err.to_string().contains("non-zero"));
    }

    #[test]
    fn puppet_gpu_frame_has_pipeline_output_shape() {
        let frame = VideoOutput::gpu_frame(VideoGpuFrame {
            lease: GpuFrameLease::new(unsupported_output_handle()),
            pts: 0,
            duration: 16_667,
            frame_index: 1,
            width: 640,
            height: 480,
            force_keyframe: false,
            diagnostics: None,
            meta: None,
        });
        let output = PipelineOutput::video(frame);

        assert!(matches!(output.as_video(), Some(VideoOutput::GpuFrame(_))));
    }
}
