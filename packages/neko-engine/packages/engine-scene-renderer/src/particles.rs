//! GPU particle system
//!
//! Compute shader-based particle simulation with billboard rendering.
//! Supports presets: fire, smoke, magic, debris, sparkle.
//!
//! Architecture:
//! - Compute pass: update particle positions, velocities, lifetimes
//! - Render pass: billboard quads facing camera, sorted by distance

use bytemuck::{Pod, Zeroable};
use neko_engine_gpu::GpuContext;
use std::sync::Arc;
use wgpu::util::DeviceExt;

/// Maximum particles per emitter
const MAX_PARTICLES: u32 = 4096;

/// Particle emitter configuration
#[derive(Debug, Clone)]
pub struct ParticleEmitterConfig {
    /// Emission position (world space)
    pub position: glam::Vec3,
    /// Emission direction
    pub direction: glam::Vec3,
    /// Direction spread angle (radians, 0 = focused beam, PI = hemisphere)
    pub spread: f32,
    /// Particles emitted per second
    pub emission_rate: f32,
    /// Particle lifetime range (min, max) in seconds
    pub lifetime: (f32, f32),
    /// Initial speed range (min, max)
    pub speed: (f32, f32),
    /// Particle size range (min, max) in world units
    pub size: (f32, f32),
    /// Start color (RGBA)
    pub color_start: [f32; 4],
    /// End color (RGBA, fades to this over lifetime)
    pub color_end: [f32; 4],
    /// Gravity influence (-Y direction)
    pub gravity: f32,
    /// Drag coefficient (0 = no drag, 1 = heavy drag)
    pub drag: f32,
}

impl Default for ParticleEmitterConfig {
    fn default() -> Self {
        Self {
            position: glam::Vec3::ZERO,
            direction: glam::Vec3::Y,
            spread: 0.5,
            emission_rate: 100.0,
            lifetime: (1.0, 3.0),
            speed: (1.0, 3.0),
            size: (0.05, 0.15),
            color_start: [1.0, 1.0, 1.0, 1.0],
            color_end: [1.0, 1.0, 1.0, 0.0],
            gravity: -9.8,
            drag: 0.1,
        }
    }
}

impl ParticleEmitterConfig {
    /// Fire preset
    pub fn fire() -> Self {
        Self {
            direction: glam::Vec3::Y,
            spread: 0.3,
            emission_rate: 200.0,
            lifetime: (0.5, 1.5),
            speed: (1.0, 3.0),
            size: (0.1, 0.3),
            color_start: [1.0, 0.6, 0.1, 1.0],
            color_end: [0.8, 0.1, 0.0, 0.0],
            gravity: 2.0, // Upward for fire
            drag: 0.3,
            ..Default::default()
        }
    }

    /// Smoke preset
    pub fn smoke() -> Self {
        Self {
            direction: glam::Vec3::Y,
            spread: 0.5,
            emission_rate: 50.0,
            lifetime: (2.0, 5.0),
            speed: (0.3, 1.0),
            size: (0.2, 0.6),
            color_start: [0.5, 0.5, 0.5, 0.6],
            color_end: [0.3, 0.3, 0.3, 0.0],
            gravity: 0.5,
            drag: 0.5,
            ..Default::default()
        }
    }

    /// Magic sparkle preset
    pub fn magic() -> Self {
        Self {
            direction: glam::Vec3::Y,
            spread: std::f32::consts::PI,
            emission_rate: 150.0,
            lifetime: (0.5, 2.0),
            speed: (0.5, 2.0),
            size: (0.02, 0.08),
            color_start: [0.3, 0.5, 1.0, 1.0],
            color_end: [0.8, 0.3, 1.0, 0.0],
            gravity: -0.5,
            drag: 0.2,
            ..Default::default()
        }
    }

    /// Debris/explosion preset
    pub fn debris() -> Self {
        Self {
            direction: glam::Vec3::Y,
            spread: std::f32::consts::PI,
            emission_rate: 500.0,
            lifetime: (0.3, 1.5),
            speed: (3.0, 8.0),
            size: (0.05, 0.15),
            color_start: [0.8, 0.6, 0.3, 1.0],
            color_end: [0.4, 0.3, 0.2, 0.0],
            gravity: -9.8,
            drag: 0.05,
            ..Default::default()
        }
    }
}

/// GPU particle data (SoA layout)
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct ParticleGpu {
    position: [f32; 3],
    lifetime: f32, // remaining lifetime (0 = dead)
    velocity: [f32; 3],
    max_lifetime: f32, // initial lifetime
    color: [f32; 4],
    size: f32,
    _padding: [f32; 3],
}

/// Emitter uniforms passed to compute shader
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EmitterUniformsGpu {
    position: [f32; 3],
    emission_rate: f32,
    direction: [f32; 3],
    spread: f32,
    lifetime_min: f32,
    lifetime_max: f32,
    speed_min: f32,
    speed_max: f32,
    size_min: f32,
    size_max: f32,
    gravity: f32,
    drag: f32,
    color_start: [f32; 4],
    color_end: [f32; 4],
    delta_time: f32,
    time: f32,
    particle_count: u32,
    _padding: u32,
}

/// GPU particle system
pub struct GpuParticleSystem {
    /// Compute pipeline for particle update
    update_pipeline: wgpu::ComputePipeline,
    /// Render pipeline for billboard particles
    render_pipeline: wgpu::RenderPipeline,
    /// Particle storage buffer (compute read/write)
    particle_buffer: wgpu::Buffer,
    /// Emitter uniform buffer
    emitter_buffer: wgpu::Buffer,
    /// Compute bind group
    compute_bind_group: wgpu::BindGroup,
    /// Render bind group layout
    render_bgl: wgpu::BindGroupLayout,
    /// Emitter configuration
    pub config: ParticleEmitterConfig,
    /// Current particle count
    particle_count: u32,
    /// Accumulated emission debt
    emission_accumulator: f32,
    ctx: Arc<GpuContext>,
}

impl GpuParticleSystem {
    /// Create a new GPU particle system
    pub fn new(ctx: Arc<GpuContext>, config: ParticleEmitterConfig) -> Self {
        let device = ctx.device();

        // Particle storage buffer
        let particles = vec![ParticleGpu::zeroed(); MAX_PARTICLES as usize];
        let particle_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("particle_buffer"),
            contents: bytemuck::cast_slice(&particles),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::VERTEX,
        });

        let emitter_uniforms = EmitterUniformsGpu::zeroed();
        let emitter_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("emitter_uniforms"),
            contents: bytemuck::bytes_of(&emitter_uniforms),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        // Compute bind group layout
        let compute_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("particle_compute_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let compute_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("particle_compute_bg"),
            layout: &compute_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: particle_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: emitter_buffer.as_entire_binding(),
                },
            ],
        });

        // Compute pipeline
        let compute_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("particle_update_shader"),
            source: wgpu::ShaderSource::Wgsl(
                include_str!("../shaders/particle_update.wgsl").into(),
            ),
        });

        let compute_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("particle_compute_layout"),
                bind_group_layouts: &[&compute_bgl],
                push_constant_ranges: &[],
            });

        let update_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("particle_update_pipeline"),
            layout: Some(&compute_pipeline_layout),
            module: &compute_shader,
            entry_point: "update_particles",
        });

        // Render bind group layout
        let render_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("particle_render_bgl"),
            entries: &[
                // binding 0: camera uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 1: particle buffer (read-only in vertex shader)
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        // Render pipeline
        let render_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("particle_render_shader"),
            source: wgpu::ShaderSource::Wgsl(
                include_str!("../shaders/particle_render.wgsl").into(),
            ),
        });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("particle_render_layout"),
                bind_group_layouts: &[&render_bgl],
                push_constant_ranges: &[],
            });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("particle_render_pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &render_shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &render_shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
                            dst_factor: wgpu::BlendFactor::One, // Additive blending
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false, // Particles don't write depth
                depth_compare: wgpu::CompareFunction::Less,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        Self {
            update_pipeline,
            render_pipeline,
            particle_buffer,
            emitter_buffer,
            compute_bind_group,
            render_bgl,
            config,
            particle_count: 0,
            emission_accumulator: 0.0,
            ctx,
        }
    }

    /// Update particle simulation (compute pass)
    pub fn update(&mut self, delta_time: f32, time: f32) {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Calculate new particles to emit
        self.emission_accumulator += self.config.emission_rate * delta_time;
        let new_particles = self.emission_accumulator as u32;
        self.emission_accumulator -= new_particles as f32;
        self.particle_count = (self.particle_count + new_particles).min(MAX_PARTICLES);

        let uniforms = EmitterUniformsGpu {
            position: self.config.position.to_array(),
            emission_rate: self.config.emission_rate,
            direction: self.config.direction.normalize().to_array(),
            spread: self.config.spread,
            lifetime_min: self.config.lifetime.0,
            lifetime_max: self.config.lifetime.1,
            speed_min: self.config.speed.0,
            speed_max: self.config.speed.1,
            size_min: self.config.size.0,
            size_max: self.config.size.1,
            gravity: self.config.gravity,
            drag: self.config.drag,
            color_start: self.config.color_start,
            color_end: self.config.color_end,
            delta_time,
            time,
            particle_count: self.particle_count,
            _padding: 0,
        };

        queue.write_buffer(&self.emitter_buffer, 0, bytemuck::bytes_of(&uniforms));

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("particle_update_encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("particle_update_pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.update_pipeline);
            pass.set_bind_group(0, &self.compute_bind_group, &[]);
            let workgroups = self.particle_count.div_ceil(64);
            pass.dispatch_workgroups(workgroups, 1, 1);
        }

        queue.submit(std::iter::once(encoder.finish()));
    }

    /// Get active particle count
    pub fn particle_count(&self) -> u32 {
        self.particle_count
    }

    /// Get the render pipeline
    pub fn render_pipeline(&self) -> &wgpu::RenderPipeline {
        &self.render_pipeline
    }

    /// Get the render bind group layout
    pub fn render_bind_group_layout(&self) -> &wgpu::BindGroupLayout {
        &self.render_bgl
    }

    /// Get the particle buffer for rendering
    pub fn particle_buffer(&self) -> &wgpu::Buffer {
        &self.particle_buffer
    }
}
