//! Post-processing chain for 3D scene rendering
//!
//! Provides:
//! - Tone mapping (Reinhard, ACES, Filmic)
//! - Bloom (threshold + blur + composite)
//! - Vignette
//! - Color grading (exposure, contrast, saturation)
//!
//! Uses ping-pong texture approach: each pass reads from one texture
//! and writes to another, alternating between two render targets.

use neko_engine_gpu::GpuContext;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// Tone mapping algorithm
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum ToneMapping {
    /// No tone mapping (linear HDR -> LDR clamp)
    None,
    /// Reinhard global operator
    Reinhard,
    /// ACES filmic approximation (Narkowicz 2015)
    #[default]
    AcesFilmic,
    /// Uncharted 2 filmic curve
    Uncharted2,
}

/// Post-processing settings
#[derive(Debug, Clone)]
pub struct PostProcessSettings {
    /// Tone mapping algorithm
    pub tone_mapping: ToneMapping,
    /// Exposure adjustment (EV stops, default: 0.0)
    pub exposure: f32,
    /// Bloom intensity (0.0 = off, default: 0.0)
    pub bloom_intensity: f32,
    /// Bloom threshold (HDR values above this glow, default: 1.0)
    pub bloom_threshold: f32,
    /// Vignette intensity (0.0 = off, default: 0.0)
    pub vignette_intensity: f32,
    /// Contrast adjustment (-1.0 to 1.0, default: 0.0)
    pub contrast: f32,
    /// Saturation adjustment (-1.0 to 1.0, default: 0.0)
    pub saturation: f32,
    /// Gamma correction (default: 2.2)
    pub gamma: f32,
    /// Single-frame edge anti-aliasing strength. This is currently driven by
    /// the viewport TAA flag until the renderer grows temporal history.
    pub anti_aliasing_strength: f32,
}

impl Default for PostProcessSettings {
    fn default() -> Self {
        Self {
            tone_mapping: ToneMapping::AcesFilmic,
            exposure: 0.0,
            bloom_intensity: 0.0,
            bloom_threshold: 1.0,
            vignette_intensity: 0.0,
            contrast: 0.0,
            saturation: 0.0,
            gamma: 2.2,
            anti_aliasing_strength: 0.0,
        }
    }
}

/// Post-processing chain
///
/// Applies configurable post-processing passes to a rendered scene.
/// Uses a fullscreen triangle approach for each pass.
pub struct PostProcessChain {
    /// Tone mapping + color grading pipeline
    tonemap_pipeline: wgpu::RenderPipeline,
    tonemap_bgl: wgpu::BindGroupLayout,
    /// Ping-pong textures for multi-pass processing
    _ping: Option<PingPongTexture>,
    _pong: Option<PingPongTexture>,
    ctx: Arc<GpuContext>,
}

struct PingPongTexture {
    _texture: wgpu::Texture,
    _view: wgpu::TextureView,
    _width: u32,
    _height: u32,
}

impl PostProcessChain {
    /// Create a new post-processing chain
    pub fn new(ctx: Arc<GpuContext>) -> Self {
        let device = ctx.device();

        let tonemap_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("tonemap_bgl"),
            entries: &[
                // binding 0: input texture
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                // binding 1: sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                // binding 2: settings uniform
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("tonemap_pipeline_layout"),
            bind_group_layouts: &[&tonemap_bgl],
            push_constant_ranges: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("post_process_shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/post_process.wgsl").into()),
        });

        let tonemap_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("tonemap_pipeline"),
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
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        Self {
            tonemap_pipeline,
            tonemap_bgl,
            _ping: None,
            _pong: None,
            ctx,
        }
    }

    /// Apply post-processing to a scene render output
    ///
    /// Returns the processed texture view. The input texture is consumed.
    pub fn process(
        &self,
        input_view: &wgpu::TextureView,
        output_view: &wgpu::TextureView,
        _width: u32,
        height: u32,
        settings: &PostProcessSettings,
    ) {
        let device = self.ctx.device();
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("post_process_encoder"),
        });

        self.record_process(
            input_view,
            output_view,
            _width,
            height,
            settings,
            &mut encoder,
        );

        self.ctx.queue().submit(std::iter::once(encoder.finish()));
    }

    /// Record post-processing work into an existing RenderGraph encoder.
    pub fn record_process(
        &self,
        input_view: &wgpu::TextureView,
        output_view: &wgpu::TextureView,
        _width: u32,
        height: u32,
        settings: &PostProcessSettings,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        let device = self.ctx.device();

        // Pack settings into uniform buffer
        let uniforms = PostProcessUniformsGpu {
            exposure: 2.0f32.powf(settings.exposure), // EV to linear
            bloom_intensity: settings.bloom_intensity,
            bloom_threshold: settings.bloom_threshold,
            vignette_intensity: settings.vignette_intensity,
            contrast: settings.contrast,
            saturation: settings.saturation,
            gamma: settings.gamma,
            tone_mapping_mode: match settings.tone_mapping {
                ToneMapping::None => 0,
                ToneMapping::Reinhard => 1,
                ToneMapping::AcesFilmic => 2,
                ToneMapping::Uncharted2 => 3,
            },
            resolution: [_width as f32, height as f32],
            anti_aliasing_strength: settings.anti_aliasing_strength.clamp(0.0, 1.0),
            _padding: 0.0,
        };

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("post_process_uniforms"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("post_process_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("tonemap_bind_group"),
            layout: &self.tonemap_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(input_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("tonemap_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: output_view,
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

            pass.set_pipeline(&self.tonemap_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1); // Fullscreen triangle
        }
    }
}

/// GPU uniform struct for post-processing settings
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PostProcessUniformsGpu {
    exposure: f32,
    bloom_intensity: f32,
    bloom_threshold: f32,
    vignette_intensity: f32,
    contrast: f32,
    saturation: f32,
    gamma: f32,
    tone_mapping_mode: u32,
    resolution: [f32; 2],
    anti_aliasing_strength: f32,
    _padding: f32,
}
