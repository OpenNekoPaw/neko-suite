//! GPU Style Effects Processor
//!
//! Provides GPU-accelerated style effects including:
//! - Vignette
//! - Film grain
//! - Glow/Bloom
//! - Chromatic aberration

#![allow(dead_code)]

use super::buffer_pool::BufferPool;
use super::context::GpuContext;
use super::shaders;
use crate::error::{Error, Result};

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

/// Vignette effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct VignetteParams {
    /// Vignette amount/intensity (0.0 to 1.0)
    pub amount: f32,
    /// Radius from center where vignette starts (0.0 to 2.0)
    pub radius: f32,
    /// Softness/feather of the vignette edge (0.0 to 1.0)
    pub softness: f32,
    /// Roundness of the vignette (0.0 = oval, 1.0 = circular)
    pub roundness: f32,
}

impl Default for VignetteParams {
    fn default() -> Self {
        Self {
            amount: 0.5,
            radius: 0.5,
            softness: 0.5,
            roundness: 1.0,
        }
    }
}

impl VignetteParams {
    /// Create vignette params with amount
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            ..Default::default()
        }
    }

    /// Create vignette params with all options
    pub fn with_options(amount: f32, radius: f32, softness: f32, roundness: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            radius: radius.clamp(0.0, 2.0),
            softness: softness.clamp(0.0, 1.0),
            roundness: roundness.clamp(0.0, 1.0),
        }
    }

    /// Check if vignette is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.amount < 0.001
    }
}

/// Film grain effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct FilmGrainParams {
    /// Grain amount/intensity (0.0 to 1.0)
    pub amount: f32,
    /// Grain size multiplier (0.5 to 3.0)
    pub size: f32,
    /// Time value for animation (used as random seed)
    pub time: f32,
    /// Color vs monochrome grain (0.0 = mono, 1.0 = color)
    pub color_amount: f32,
}

impl Default for FilmGrainParams {
    fn default() -> Self {
        Self {
            amount: 0.3,
            size: 1.0,
            time: 0.0,
            color_amount: 0.0,
        }
    }
}

impl FilmGrainParams {
    /// Create film grain params with amount
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            ..Default::default()
        }
    }

    /// Create film grain params with all options
    pub fn with_options(amount: f32, size: f32, time: f32, color_amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            size: size.clamp(0.5, 3.0),
            time,
            color_amount: color_amount.clamp(0.0, 1.0),
        }
    }

    /// Check if film grain is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.amount < 0.001
    }
}

/// Glow/Bloom effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct GlowParams {
    /// Glow intensity (0.0 to 2.0)
    pub intensity: f32,
    /// Brightness threshold for glow (0.0 to 1.0)
    pub threshold: f32,
    /// Blur radius for glow (1.0 to 50.0)
    pub radius: f32,
    /// Padding for alignment
    pub _padding: f32,
}

impl Default for GlowParams {
    fn default() -> Self {
        Self {
            intensity: 1.0,
            threshold: 0.7,
            radius: 10.0,
            _padding: 0.0,
        }
    }
}

impl GlowParams {
    /// Create glow params with intensity
    pub fn new(intensity: f32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 2.0),
            ..Default::default()
        }
    }

    /// Create glow params with all options
    pub fn with_options(intensity: f32, threshold: f32, radius: f32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 2.0),
            threshold: threshold.clamp(0.0, 1.0),
            radius: radius.clamp(1.0, 50.0),
            _padding: 0.0,
        }
    }

    /// Check if glow is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.intensity < 0.001
    }
}

/// Chromatic aberration effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ChromaticAberrationParams {
    /// Aberration amount/offset (0.0 to 0.1)
    pub amount: f32,
    /// Angle of aberration in radians
    pub angle: f32,
    /// Center X (0.0 to 1.0)
    pub center_x: f32,
    /// Center Y (0.0 to 1.0)
    pub center_y: f32,
}

impl Default for ChromaticAberrationParams {
    fn default() -> Self {
        Self {
            amount: 0.01,
            angle: 0.0,
            center_x: 0.5,
            center_y: 0.5,
        }
    }
}

impl ChromaticAberrationParams {
    /// Create chromatic aberration params with amount
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 0.1),
            ..Default::default()
        }
    }

    /// Create chromatic aberration params with all options
    pub fn with_options(amount: f32, angle: f32, center_x: f32, center_y: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 0.1),
            angle,
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
        }
    }

    /// Check if chromatic aberration is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.amount < 0.0001
    }
}

/// Uniform buffer for vignette shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct VignetteUniforms {
    width: u32,
    height: u32,
    amount: f32,
    radius: f32,
    softness: f32,
    roundness: f32,
    _padding: [f32; 2],
}

/// Uniform buffer for film grain shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct FilmGrainUniforms {
    width: u32,
    height: u32,
    amount: f32,
    size: f32,
    time: f32,
    color_amount: f32,
    _padding: [f32; 2],
}

/// Uniform buffer for glow shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct GlowUniforms {
    width: u32,
    height: u32,
    intensity: f32,
    threshold: f32,
    radius: f32,
    _padding: [f32; 3],
}

/// Uniform buffer for chromatic aberration shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct ChromaticAberrationUniforms {
    width: u32,
    height: u32,
    amount: f32,
    angle: f32,
    center_x: f32,
    center_y: f32,
    _padding: [f32; 2],
}

/// GPU style effects processor using compute shaders
pub struct GpuStyleProcessor {
    ctx: Arc<GpuContext>,
    vignette_pipeline: wgpu::ComputePipeline,
    film_grain_pipeline: wgpu::ComputePipeline,
    glow_pipeline: wgpu::ComputePipeline,
    chromatic_aberration_pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    buffer_pool: BufferPool,
}

impl GpuStyleProcessor {
    /// Create a new GPU style processor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader modules
        let vignette_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Vignette Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::VIGNETTE_COMPUTE_SHADER.into()),
        });

        let film_grain_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Film Grain Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::FILM_GRAIN_COMPUTE_SHADER.into()),
        });

        let glow_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Glow Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::GLOW_COMPUTE_SHADER.into()),
        });

        let chromatic_aberration_shader =
            device.create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("Chromatic Aberration Shader"),
                source: wgpu::ShaderSource::Wgsl(
                    shaders::CHROMATIC_ABERRATION_COMPUTE_SHADER.into(),
                ),
            });

        // Create bind group layout (same for all)
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Style Effect Bind Group Layout"),
            entries: &[
                // Input buffer (read-only storage)
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Output buffer (read-write storage)
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
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

        // Create pipeline layout
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Style Effect Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create pipelines
        let vignette_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Vignette Pipeline"),
            layout: Some(&pipeline_layout),
            module: &vignette_shader,
            entry_point: "main",
        });

        let film_grain_pipeline =
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("Film Grain Pipeline"),
                layout: Some(&pipeline_layout),
                module: &film_grain_shader,
                entry_point: "main",
            });

        let glow_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Glow Pipeline"),
            layout: Some(&pipeline_layout),
            module: &glow_shader,
            entry_point: "main",
        });

        let chromatic_aberration_pipeline =
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some("Chromatic Aberration Pipeline"),
                layout: Some(&pipeline_layout),
                module: &chromatic_aberration_shader,
                entry_point: "main",
            });

        // Create buffer pool
        let buffer_pool = BufferPool::new(ctx.device().clone(), wgpu::BufferUsages::STORAGE, 8);

        Ok(Self {
            ctx,
            vignette_pipeline,
            film_grain_pipeline,
            glow_pipeline,
            chromatic_aberration_pipeline,
            bind_group_layout,
            buffer_pool,
        })
    }

    /// Apply vignette effect to a frame
    pub fn apply_vignette(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &VignetteParams,
    ) -> Result<Vec<u8>> {
        if params.is_identity() {
            return Ok(input.to_vec());
        }

        let uniforms = VignetteUniforms {
            width,
            height,
            amount: params.amount,
            radius: params.radius,
            softness: params.softness,
            roundness: params.roundness,
            _padding: [0.0; 2],
        };

        self.run_effect(input, width, height, &self.vignette_pipeline, &uniforms)
    }

    /// Apply film grain effect to a frame
    pub fn apply_film_grain(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &FilmGrainParams,
    ) -> Result<Vec<u8>> {
        if params.is_identity() {
            return Ok(input.to_vec());
        }

        let uniforms = FilmGrainUniforms {
            width,
            height,
            amount: params.amount,
            size: params.size,
            time: params.time,
            color_amount: params.color_amount,
            _padding: [0.0; 2],
        };

        self.run_effect(input, width, height, &self.film_grain_pipeline, &uniforms)
    }

    /// Apply glow/bloom effect to a frame
    pub fn apply_glow(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &GlowParams,
    ) -> Result<Vec<u8>> {
        if params.is_identity() {
            return Ok(input.to_vec());
        }

        let uniforms = GlowUniforms {
            width,
            height,
            intensity: params.intensity,
            threshold: params.threshold,
            radius: params.radius,
            _padding: [0.0; 3],
        };

        self.run_effect(input, width, height, &self.glow_pipeline, &uniforms)
    }

    /// Apply chromatic aberration effect to a frame
    pub fn apply_chromatic_aberration(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &ChromaticAberrationParams,
    ) -> Result<Vec<u8>> {
        if params.is_identity() {
            return Ok(input.to_vec());
        }

        let uniforms = ChromaticAberrationUniforms {
            width,
            height,
            amount: params.amount,
            angle: params.angle,
            center_x: params.center_x,
            center_y: params.center_y,
            _padding: [0.0; 2],
        };

        self.run_effect(
            input,
            width,
            height,
            &self.chromatic_aberration_pipeline,
            &uniforms,
        )
    }

    /// Run a style effect with the given pipeline and uniforms
    fn run_effect<U: Pod>(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        pipeline: &wgpu::ComputePipeline,
        uniforms: &U,
    ) -> Result<Vec<u8>> {
        let expected_size = (width * height * 4) as usize;
        if input.len() != expected_size {
            return Err(Error::InvalidParameter(format!(
                "Input size mismatch: expected {}, got {}",
                expected_size,
                input.len()
            )));
        }

        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Create input buffer
        let input_buffer = self
            .ctx
            .create_buffer_with_data(input, wgpu::BufferUsages::STORAGE);

        // Acquire output buffer from pool
        let output_pooled = self.buffer_pool.acquire(input.len() as u64);
        let output_buffer = output_pooled.buffer();

        // Create uniform buffer
        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(uniforms), wgpu::BufferUsages::UNIFORM);

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Style Effect Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: input_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: output_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        // Create command encoder and dispatch
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Style Effect Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Style Effect Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            // Workgroup size is 16x16
            let workgroups_x = (width + 15) / 16;
            let workgroups_y = (height + 15) / 16;
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        queue.submit(Some(encoder.finish()));

        // Read back results
        self.ctx.read_buffer_sync(output_buffer)
    }

    /// Get GPU context
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vignette_params_default() {
        let params = VignetteParams::default();
        assert_eq!(params.amount, 0.5);
        assert_eq!(params.radius, 0.5);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_vignette_params_identity() {
        let params = VignetteParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_vignette_params_clamping() {
        let params = VignetteParams::with_options(2.0, 5.0, 2.0, 2.0);
        assert_eq!(params.amount, 1.0);
        assert_eq!(params.radius, 2.0);
        assert_eq!(params.softness, 1.0);
        assert_eq!(params.roundness, 1.0);
    }

    #[test]
    fn test_film_grain_params_default() {
        let params = FilmGrainParams::default();
        assert_eq!(params.amount, 0.3);
        assert_eq!(params.size, 1.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_film_grain_params_identity() {
        let params = FilmGrainParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_film_grain_params_clamping() {
        let params = FilmGrainParams::with_options(2.0, 10.0, 0.0, 2.0);
        assert_eq!(params.amount, 1.0);
        assert_eq!(params.size, 3.0);
        assert_eq!(params.color_amount, 1.0);
    }

    #[test]
    fn test_glow_params_default() {
        let params = GlowParams::default();
        assert_eq!(params.intensity, 1.0);
        assert_eq!(params.threshold, 0.7);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_glow_params_identity() {
        let params = GlowParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_glow_params_clamping() {
        let params = GlowParams::with_options(5.0, 2.0, 100.0);
        assert_eq!(params.intensity, 2.0);
        assert_eq!(params.threshold, 1.0);
        assert_eq!(params.radius, 50.0);
    }

    #[test]
    fn test_chromatic_aberration_params_default() {
        let params = ChromaticAberrationParams::default();
        assert_eq!(params.amount, 0.01);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_chromatic_aberration_params_identity() {
        let params = ChromaticAberrationParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_chromatic_aberration_params_clamping() {
        let params = ChromaticAberrationParams::with_options(1.0, 0.0, 2.0, -1.0);
        assert_eq!(params.amount, 0.1);
        assert_eq!(params.center_x, 1.0);
        assert_eq!(params.center_y, 0.0);
    }
}
