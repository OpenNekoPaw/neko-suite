//! GPU Effects Processor

use super::buffer_pool::BufferPool;
use super::context::GpuContext;
use super::shaders;
use crate::error::{Error, Result};

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

/// Effect parameters for GPU processing
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct EffectParams {
    // Basic adjustments
    /// Brightness adjustment (-1.0 to 1.0)
    pub brightness: f32,
    /// Contrast adjustment (0.0 to 2.0, 1.0 = no change)
    pub contrast: f32,
    /// Saturation adjustment (0.0 to 2.0, 1.0 = no change)
    pub saturation: f32,
    /// Exposure adjustment in stops (-3.0 to 3.0)
    pub exposure: f32,

    // Tone adjustments
    /// Gamma adjustment (0.1 to 3.0, 1.0 = no change)
    pub gamma: f32,
    /// Hue shift in degrees (-180 to 180)
    pub hue_shift: f32,
    /// Vibrance adjustment (-1.0 to 1.0)
    pub vibrance: f32,

    // White balance
    /// Temperature adjustment (-100 to 100)
    pub temperature: f32,
    /// Tint adjustment (-100 to 100)
    pub tint: f32,

    // Highlights/Shadows
    /// Highlights adjustment (-1.0 to 1.0)
    pub highlights: f32,
    /// Shadows adjustment (-1.0 to 1.0)
    pub shadows: f32,
    /// Whites adjustment (-1.0 to 1.0)
    pub whites: f32,
    /// Blacks adjustment (-1.0 to 1.0)
    pub blacks: f32,

    /// Padding for 64-byte alignment
    pub _padding: [f32; 3],
}

impl Default for EffectParams {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            exposure: 0.0,
            gamma: 1.0,
            hue_shift: 0.0,
            vibrance: 0.0,
            temperature: 0.0,
            tint: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            _padding: [0.0; 3],
        }
    }
}

impl EffectParams {
    /// Create new effect params with basic color correction
    pub fn new(brightness: f32, contrast: f32, saturation: f32) -> Self {
        Self {
            brightness: brightness.clamp(-1.0, 1.0),
            contrast: contrast.clamp(0.0, 2.0),
            saturation: saturation.clamp(0.0, 2.0),
            ..Default::default()
        }
    }

    /// Create effect params with all parameters
    #[allow(clippy::too_many_arguments)]
    pub fn with_all(
        brightness: f32,
        contrast: f32,
        saturation: f32,
        exposure: f32,
        gamma: f32,
        hue_shift: f32,
        vibrance: f32,
        temperature: f32,
        tint: f32,
        highlights: f32,
        shadows: f32,
        whites: f32,
        blacks: f32,
    ) -> Self {
        Self {
            brightness: brightness.clamp(-1.0, 1.0),
            contrast: contrast.clamp(0.0, 2.0),
            saturation: saturation.clamp(0.0, 2.0),
            exposure: exposure.clamp(-3.0, 3.0),
            gamma: gamma.clamp(0.1, 3.0),
            hue_shift: hue_shift.clamp(-180.0, 180.0),
            vibrance: vibrance.clamp(-1.0, 1.0),
            temperature: temperature.clamp(-100.0, 100.0),
            tint: tint.clamp(-100.0, 100.0),
            highlights: highlights.clamp(-1.0, 1.0),
            shadows: shadows.clamp(-1.0, 1.0),
            whites: whites.clamp(-1.0, 1.0),
            blacks: blacks.clamp(-1.0, 1.0),
            _padding: [0.0; 3],
        }
    }

    /// Check if params are default (no effect)
    pub fn is_identity(&self) -> bool {
        (self.brightness.abs() < 0.001)
            && ((self.contrast - 1.0).abs() < 0.001)
            && ((self.saturation - 1.0).abs() < 0.001)
            && (self.exposure.abs() < 0.001)
            && ((self.gamma - 1.0).abs() < 0.001)
            && (self.hue_shift.abs() < 0.001)
            && (self.vibrance.abs() < 0.001)
            && (self.temperature.abs() < 0.001)
            && (self.tint.abs() < 0.001)
            && (self.highlights.abs() < 0.001)
            && (self.shadows.abs() < 0.001)
            && (self.whites.abs() < 0.001)
            && (self.blacks.abs() < 0.001)
    }
}

/// Uniform buffer for shader parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct ShaderUniforms {
    width: u32,
    height: u32,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    exposure: f32,
    gamma: f32,
    hue_shift: f32,
    vibrance: f32,
    temperature: f32,
    tint: f32,
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
    _padding: f32,
}

/// GPU effects processor using compute shaders
pub struct GpuProcessor {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    buffer_pool: BufferPool,
}

impl GpuProcessor {
    /// Create a new GPU processor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Color Correction Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::COLOR_CORRECTION_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Effect Bind Group Layout"),
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
            label: Some("Effect Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create compute pipeline
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Color Correction Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "main",
        });

        // Create buffer pool for frame data
        let buffer_pool = BufferPool::new(
            ctx.device().clone(),
            wgpu::BufferUsages::STORAGE,
            8, // Max 8 pooled buffers
        );

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
            buffer_pool,
        })
    }

    /// Process a frame with effects
    ///
    /// Input: RGBA pixel data
    /// Output: Processed RGBA pixel data
    pub fn process_frame(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        params: &EffectParams,
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

        // Create input buffer with data
        let input_buffer = self.ctx.create_buffer_with_data(input, wgpu::BufferUsages::STORAGE);

        // Acquire output buffer from pool
        let output_pooled = self.buffer_pool.acquire(input.len() as u64);
        let output_buffer = output_pooled.buffer();

        // Create uniforms
        let uniforms = ShaderUniforms {
            width,
            height,
            brightness: params.brightness,
            contrast: params.contrast,
            saturation: params.saturation,
            exposure: params.exposure,
            gamma: params.gamma,
            hue_shift: params.hue_shift,
            vibrance: params.vibrance,
            temperature: params.temperature,
            tint: params.tint,
            highlights: params.highlights,
            shadows: params.shadows,
            whites: params.whites,
            blacks: params.blacks,
            _padding: 0.0,
        };
        let uniform_buffer =
            self.ctx
                .create_buffer_with_data(bytemuck::bytes_of(&uniforms), wgpu::BufferUsages::UNIFORM);

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Effect Bind Group"),
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

        // Create command encoder
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Effect Encoder"),
        });

        // Dispatch compute shader
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Effect Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            // Workgroup size is 16x16, calculate dispatch size
            let workgroups_x = (width + 15) / 16;
            let workgroups_y = (height + 15) / 16;
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        // Submit commands
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
    fn test_effect_params_default() {
        let params = EffectParams::default();
        assert!(params.is_identity());
    }

    #[test]
    fn test_effect_params_clamping() {
        let params = EffectParams::new(2.0, -1.0, 5.0);
        assert_eq!(params.brightness, 1.0);
        assert_eq!(params.contrast, 0.0);
        assert_eq!(params.saturation, 2.0);
    }

    #[test]
    fn test_effect_params_not_identity() {
        let params = EffectParams::new(0.1, 1.0, 1.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_effect_params_with_all() {
        let params = EffectParams::with_all(
            0.1, 1.2, 1.1, 0.5, 1.2, 10.0, 0.3, 20.0, -10.0, 0.2, -0.1, 0.1, -0.05,
        );
        assert!(!params.is_identity());
        assert_eq!(params.exposure, 0.5);
        assert_eq!(params.gamma, 1.2);
        assert_eq!(params.hue_shift, 10.0);
        assert_eq!(params.temperature, 20.0);
    }

    #[test]
    fn test_effect_params_with_all_clamping() {
        let params = EffectParams::with_all(
            2.0, 5.0, 5.0, 10.0, 10.0, 360.0, 5.0, 200.0, 200.0, 5.0, 5.0, 5.0, 5.0,
        );
        assert_eq!(params.brightness, 1.0);
        assert_eq!(params.contrast, 2.0);
        assert_eq!(params.saturation, 2.0);
        assert_eq!(params.exposure, 3.0);
        assert_eq!(params.gamma, 3.0);
        assert_eq!(params.hue_shift, 180.0);
        assert_eq!(params.vibrance, 1.0);
        assert_eq!(params.temperature, 100.0);
        assert_eq!(params.tint, 100.0);
        assert_eq!(params.highlights, 1.0);
        assert_eq!(params.shadows, 1.0);
        assert_eq!(params.whites, 1.0);
        assert_eq!(params.blacks, 1.0);
    }

    #[test]
    fn test_effect_params_identity_with_new_params() {
        let mut params = EffectParams::default();
        assert!(params.is_identity());

        params.exposure = 0.1;
        assert!(!params.is_identity());

        params.exposure = 0.0;
        params.hue_shift = 5.0;
        assert!(!params.is_identity());
    }
}
