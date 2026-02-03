//! GPU Blur Processor
//!
//! Provides GPU-accelerated blur effects including:
//! - Box blur
//! - Gaussian blur
//! - Directional/Motion blur
//! - Radial blur
//! - Zoom blur
//! - Sharpen

use super::buffer_pool::BufferPool;
use super::context::GpuContext;
use super::shaders;
use crate::error::{Error, Result};

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

/// Blur type enumeration
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BlurType {
    /// Box blur - simple averaging
    #[default]
    Box = 0,
    /// Gaussian blur - weighted averaging with bell curve
    Gaussian = 1,
    /// Directional/Motion blur - blur along a direction
    Directional = 2,
    /// Radial blur - blur radiating from center
    Radial = 3,
    /// Zoom blur - blur zooming from center
    Zoom = 4,
}

impl From<u32> for BlurType {
    fn from(value: u32) -> Self {
        match value {
            0 => BlurType::Box,
            1 => BlurType::Gaussian,
            2 => BlurType::Directional,
            3 => BlurType::Radial,
            4 => BlurType::Zoom,
            _ => BlurType::Box,
        }
    }
}

/// Blur effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct BlurParams {
    /// Blur type (0=box, 1=gaussian, 2=directional, 3=radial, 4=zoom)
    pub blur_type: u32,
    /// Blur radius in pixels (1-100)
    pub radius: f32,
    /// Direction X component for directional blur (-1.0 to 1.0)
    pub direction_x: f32,
    /// Direction Y component for directional blur (-1.0 to 1.0)
    pub direction_y: f32,
    /// Center X for radial/zoom blur (0.0 to 1.0, normalized)
    pub center_x: f32,
    /// Center Y for radial/zoom blur (0.0 to 1.0, normalized)
    pub center_y: f32,
    /// Blur strength/intensity (0.0 to 1.0)
    pub strength: f32,
    /// Number of samples for quality (8-64)
    pub samples: u32,
}

impl Default for BlurParams {
    fn default() -> Self {
        Self {
            blur_type: 0,
            radius: 5.0,
            direction_x: 1.0,
            direction_y: 0.0,
            center_x: 0.5,
            center_y: 0.5,
            strength: 1.0,
            samples: 16,
        }
    }
}

#[allow(dead_code)]
impl BlurParams {
    /// Create box blur params
    pub fn box_blur(radius: f32) -> Self {
        Self {
            blur_type: BlurType::Box as u32,
            radius: radius.clamp(1.0, 100.0),
            ..Default::default()
        }
    }

    /// Create gaussian blur params
    pub fn gaussian(radius: f32) -> Self {
        Self {
            blur_type: BlurType::Gaussian as u32,
            radius: radius.clamp(1.0, 100.0),
            ..Default::default()
        }
    }

    /// Create directional/motion blur params
    pub fn directional(radius: f32, angle_degrees: f32) -> Self {
        let angle_rad = angle_degrees.to_radians();
        Self {
            blur_type: BlurType::Directional as u32,
            radius: radius.clamp(1.0, 100.0),
            direction_x: angle_rad.cos(),
            direction_y: angle_rad.sin(),
            ..Default::default()
        }
    }

    /// Create radial blur params
    pub fn radial(strength: f32, center_x: f32, center_y: f32) -> Self {
        Self {
            blur_type: BlurType::Radial as u32,
            strength: strength.clamp(0.0, 1.0),
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
            samples: 32,
            ..Default::default()
        }
    }

    /// Create zoom blur params
    pub fn zoom(strength: f32, center_x: f32, center_y: f32) -> Self {
        Self {
            blur_type: BlurType::Zoom as u32,
            strength: strength.clamp(0.0, 1.0),
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
            samples: 32,
            ..Default::default()
        }
    }

    /// Check if blur is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.radius < 1.0 && self.strength < 0.001
    }
}

/// Sharpen effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct SharpenParams {
    /// Sharpen amount (0.0 to 5.0)
    pub amount: f32,
    /// Radius for unsharp mask (0.5 to 5.0)
    pub radius: f32,
    /// Threshold to avoid sharpening noise (0.0 to 1.0)
    pub threshold: f32,
    /// Padding for alignment
    pub _padding: f32,
}

impl Default for SharpenParams {
    fn default() -> Self {
        Self {
            amount: 1.0,
            radius: 1.0,
            threshold: 0.0,
            _padding: 0.0,
        }
    }
}

#[allow(dead_code)]
impl SharpenParams {
    /// Create sharpen params
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 5.0),
            ..Default::default()
        }
    }

    /// Create sharpen params with all options
    pub fn with_options(amount: f32, radius: f32, threshold: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 5.0),
            radius: radius.clamp(0.5, 5.0),
            threshold: threshold.clamp(0.0, 1.0),
            _padding: 0.0,
        }
    }

    /// Check if sharpen is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.amount < 0.001
    }
}

/// Uniform buffer for blur shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct BlurUniforms {
    width: u32,
    height: u32,
    blur_type: u32,
    samples: u32,
    radius: f32,
    direction_x: f32,
    direction_y: f32,
    center_x: f32,
    center_y: f32,
    strength: f32,
    _padding: [f32; 2],
}

/// Uniform buffer for sharpen shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct SharpenUniforms {
    width: u32,
    height: u32,
    amount: f32,
    radius: f32,
    threshold: f32,
    _padding: [f32; 3],
}

/// GPU blur processor using compute shaders
pub struct GpuBlurProcessor {
    ctx: Arc<GpuContext>,
    blur_pipeline: wgpu::ComputePipeline,
    sharpen_pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    buffer_pool: BufferPool,
}

impl GpuBlurProcessor {
    /// Create a new GPU blur processor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create blur shader module
        let blur_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Blur Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::BLUR_COMPUTE_SHADER.into()),
        });

        // Create sharpen shader module
        let sharpen_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Sharpen Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::SHARPEN_COMPUTE_SHADER.into()),
        });

        // Create bind group layout (same for both)
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Blur/Sharpen Bind Group Layout"),
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

        // Create blur pipeline
        let blur_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Blur Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let blur_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Blur Pipeline"),
            layout: Some(&blur_pipeline_layout),
            module: &blur_shader,
            entry_point: "main",
        });

        // Create sharpen pipeline
        let sharpen_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Sharpen Pipeline Layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });

        let sharpen_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Sharpen Pipeline"),
            layout: Some(&sharpen_pipeline_layout),
            module: &sharpen_shader,
            entry_point: "main",
        });

        // Create buffer pool
        let buffer_pool = BufferPool::new(ctx.device().clone(), wgpu::BufferUsages::STORAGE, 8);

        Ok(Self {
            ctx,
            blur_pipeline,
            sharpen_pipeline,
            bind_group_layout,
            buffer_pool,
        })
    }

    /// Apply blur effect to a frame
    ///
    /// Input: RGBA pixel data
    /// Output: Blurred RGBA pixel data
    pub fn apply_blur(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &BlurParams,
    ) -> Result<Vec<u8>> {
        let expected_size = (width * height * 4) as usize;
        if input.len() != expected_size {
            return Err(Error::InvalidParameter(format!(
                "Input size mismatch: expected {}, got {}",
                expected_size,
                input.len()
            )));
        }

        // If params are identity, return input unchanged
        if params.is_identity() {
            return Ok(input.to_vec());
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

        // Create uniforms
        let uniforms = BlurUniforms {
            width,
            height,
            blur_type: params.blur_type,
            samples: params.samples.clamp(8, 64),
            radius: params.radius,
            direction_x: params.direction_x,
            direction_y: params.direction_y,
            center_x: params.center_x,
            center_y: params.center_y,
            strength: params.strength,
            _padding: [0.0; 2],
        };
        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(&uniforms), wgpu::BufferUsages::UNIFORM);

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Blur Bind Group"),
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
            label: Some("Blur Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Blur Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.blur_pipeline);
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

    /// Apply sharpen effect to a frame
    ///
    /// Input: RGBA pixel data
    /// Output: Sharpened RGBA pixel data
    pub fn apply_sharpen(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &SharpenParams,
    ) -> Result<Vec<u8>> {
        let expected_size = (width * height * 4) as usize;
        if input.len() != expected_size {
            return Err(Error::InvalidParameter(format!(
                "Input size mismatch: expected {}, got {}",
                expected_size,
                input.len()
            )));
        }

        // If params are identity, return input unchanged
        if params.is_identity() {
            return Ok(input.to_vec());
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

        // Create uniforms
        let uniforms = SharpenUniforms {
            width,
            height,
            amount: params.amount,
            radius: params.radius,
            threshold: params.threshold,
            _padding: [0.0; 3],
        };
        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(&uniforms), wgpu::BufferUsages::UNIFORM);

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Sharpen Bind Group"),
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
            label: Some("Sharpen Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Sharpen Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.sharpen_pipeline);
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
    #[allow(dead_code)]
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blur_params_default() {
        let params = BlurParams::default();
        assert_eq!(params.blur_type, 0);
        assert_eq!(params.radius, 5.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_blur_params_box() {
        let params = BlurParams::box_blur(10.0);
        assert_eq!(params.blur_type, BlurType::Box as u32);
        assert_eq!(params.radius, 10.0);
    }

    #[test]
    fn test_blur_params_gaussian() {
        let params = BlurParams::gaussian(15.0);
        assert_eq!(params.blur_type, BlurType::Gaussian as u32);
        assert_eq!(params.radius, 15.0);
    }

    #[test]
    fn test_blur_params_directional() {
        let params = BlurParams::directional(20.0, 45.0);
        assert_eq!(params.blur_type, BlurType::Directional as u32);
        assert_eq!(params.radius, 20.0);
        // cos(45°) ≈ 0.707
        assert!((params.direction_x - 0.707).abs() < 0.01);
        assert!((params.direction_y - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_blur_params_radial() {
        let params = BlurParams::radial(0.5, 0.3, 0.7);
        assert_eq!(params.blur_type, BlurType::Radial as u32);
        assert_eq!(params.strength, 0.5);
        assert_eq!(params.center_x, 0.3);
        assert_eq!(params.center_y, 0.7);
    }

    #[test]
    fn test_blur_params_zoom() {
        let params = BlurParams::zoom(0.8, 0.5, 0.5);
        assert_eq!(params.blur_type, BlurType::Zoom as u32);
        assert_eq!(params.strength, 0.8);
    }

    #[test]
    fn test_blur_params_clamping() {
        let params = BlurParams::box_blur(200.0);
        assert_eq!(params.radius, 100.0); // Clamped to max

        let params = BlurParams::radial(5.0, 2.0, -1.0);
        assert_eq!(params.strength, 1.0); // Clamped to max
        assert_eq!(params.center_x, 1.0); // Clamped to max
        assert_eq!(params.center_y, 0.0); // Clamped to min
    }

    #[test]
    fn test_blur_params_identity() {
        let mut params = BlurParams::default();
        params.radius = 0.5;
        params.strength = 0.0;
        assert!(params.is_identity());
    }

    #[test]
    fn test_sharpen_params_default() {
        let params = SharpenParams::default();
        assert_eq!(params.amount, 1.0);
        assert_eq!(params.radius, 1.0);
        assert_eq!(params.threshold, 0.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_sharpen_params_new() {
        let params = SharpenParams::new(2.5);
        assert_eq!(params.amount, 2.5);
    }

    #[test]
    fn test_sharpen_params_with_options() {
        let params = SharpenParams::with_options(1.5, 2.0, 0.1);
        assert_eq!(params.amount, 1.5);
        assert_eq!(params.radius, 2.0);
        assert_eq!(params.threshold, 0.1);
    }

    #[test]
    fn test_sharpen_params_clamping() {
        let params = SharpenParams::with_options(10.0, 10.0, 2.0);
        assert_eq!(params.amount, 5.0); // Clamped
        assert_eq!(params.radius, 5.0); // Clamped
        assert_eq!(params.threshold, 1.0); // Clamped
    }

    #[test]
    fn test_sharpen_params_identity() {
        let params = SharpenParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_blur_type_from_u32() {
        assert_eq!(BlurType::from(0), BlurType::Box);
        assert_eq!(BlurType::from(1), BlurType::Gaussian);
        assert_eq!(BlurType::from(2), BlurType::Directional);
        assert_eq!(BlurType::from(3), BlurType::Radial);
        assert_eq!(BlurType::from(4), BlurType::Zoom);
        assert_eq!(BlurType::from(99), BlurType::Box); // Default fallback
    }
}
