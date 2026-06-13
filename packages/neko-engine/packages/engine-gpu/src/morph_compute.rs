//! Domain-neutral Morph/BlendShape weighted-delta compute primitive.

use std::sync::Arc;

use crate::error::{Error, Result};
use crate::GpuContext;

/// Vertex attributes supported by the shared morph primitive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MorphAttribute {
    Position2,
    Position3,
    Normal3,
    Tangent4,
}

/// Numeric tolerance used by morph parity tests.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MorphComputeTolerance {
    pub max_abs_error: f32,
}

impl Default for MorphComputeTolerance {
    fn default() -> Self {
        Self {
            max_abs_error: 0.0001,
        }
    }
}

/// One weighted delta stream.
#[derive(Debug, Clone, PartialEq)]
pub struct MorphDeltaSet {
    pub id: String,
    pub deltas: Vec<Vec<f32>>,
    pub weight: f32,
}

/// CPU-side input contract for weighted delta accumulation.
#[derive(Debug, Clone, PartialEq)]
pub struct MorphComputeInput {
    pub attribute: MorphAttribute,
    pub base_vertices: Vec<Vec<f32>>,
    pub delta_sets: Vec<MorphDeltaSet>,
    pub tolerance: MorphComputeTolerance,
}

impl MorphComputeInput {
    pub fn position2(base_vertices: Vec<[f32; 2]>, delta_sets: Vec<MorphDeltaSet>) -> Self {
        Self {
            attribute: MorphAttribute::Position2,
            base_vertices: base_vertices
                .into_iter()
                .map(|vertex| vertex.to_vec())
                .collect(),
            delta_sets,
            tolerance: MorphComputeTolerance::default(),
        }
    }

    pub fn position3(base_vertices: Vec<[f32; 3]>, delta_sets: Vec<MorphDeltaSet>) -> Self {
        Self {
            attribute: MorphAttribute::Position3,
            base_vertices: base_vertices
                .into_iter()
                .map(|vertex| vertex.to_vec())
                .collect(),
            delta_sets,
            tolerance: MorphComputeTolerance::default(),
        }
    }

    pub fn stride(&self) -> Result<usize> {
        match self.attribute {
            MorphAttribute::Position2 => Ok(2),
            MorphAttribute::Position3 | MorphAttribute::Normal3 => Ok(3),
            MorphAttribute::Tangent4 => Ok(4),
        }
    }
}

/// GPU buffer-oriented input contract for position2 weighted-delta accumulation.
pub struct MorphComputeGpuPosition2Input<'a> {
    pub base_vertices: &'a [[f32; 2]],
    pub delta_sets: Vec<MorphGpuDeltaSet2<'a>>,
}

/// One GPU delta stream for position2 data.
pub struct MorphGpuDeltaSet2<'a> {
    pub id: &'a str,
    pub deltas: &'a [[f32; 2]],
    pub weight: f32,
}

/// GPU buffer-oriented input contract for position3 weighted-delta accumulation.
pub struct MorphComputeGpuPosition3Input<'a> {
    pub base_vertices: &'a [[f32; 3]],
    pub delta_sets: Vec<MorphGpuDeltaSet3<'a>>,
}

/// One GPU delta stream for position3 data.
pub struct MorphGpuDeltaSet3<'a> {
    pub id: &'a str,
    pub deltas: &'a [[f32; 3]],
    pub weight: f32,
}

/// Evaluate weighted-delta accumulation on CPU for reference tests and fallback.
pub fn compute_morph_cpu(input: &MorphComputeInput) -> Result<Vec<Vec<f32>>> {
    validate_morph_input(input)?;

    let mut output = input.base_vertices.clone();
    for delta_set in &input.delta_sets {
        if delta_set.weight.abs() <= f32::EPSILON {
            continue;
        }
        for (vertex, delta) in output.iter_mut().zip(delta_set.deltas.iter()) {
            for (component, delta_component) in vertex.iter_mut().zip(delta.iter()) {
                *component += *delta_component * delta_set.weight;
            }
        }
    }
    Ok(output)
}

/// Evaluate position2 weighted-delta accumulation through a shared GPU shader.
pub fn compute_morph_position2_gpu(
    ctx: &Arc<GpuContext>,
    input: &MorphComputeGpuPosition2Input<'_>,
) -> Result<Vec<[f32; 2]>> {
    validate_gpu_position2_input(input)?;
    if input.base_vertices.is_empty() {
        return Ok(Vec::new());
    }
    if input.delta_sets.len() > u32::MAX as usize {
        return Err(Error::InvalidParameter(
            "morph delta set count exceeds GPU index limits".to_string(),
        ));
    }

    use wgpu::util::DeviceExt;

    let device = ctx.device();
    device.push_error_scope(wgpu::ErrorFilter::Validation);

    let vertex_count = input.base_vertices.len() as u32;
    let shape_count = input.delta_sets.len() as u32;
    let base_vertices = input
        .base_vertices
        .iter()
        .map(|vertex| GpuVec2 {
            value: *vertex,
            _padding: [0.0, 0.0],
        })
        .collect::<Vec<_>>();
    let deltas = flatten_gpu_position2_deltas(input);
    let metadata = input
        .delta_sets
        .iter()
        .map(|set| GpuMorphMeta {
            weight: set.weight,
            _padding: [0, 0, 0],
        })
        .collect::<Vec<_>>();
    let uniforms = GpuMorphUniforms {
        vertex_count,
        shape_count,
        _padding: [0, 0],
    };

    let base_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_base_position2"),
        contents: bytemuck::cast_slice(&base_vertices),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let delta_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_deltas_position2"),
        contents: bytemuck::cast_slice(&deltas),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let metadata_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_metadata"),
        contents: bytemuck::cast_slice(&metadata),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_uniforms"),
        contents: bytemuck::bytes_of(&uniforms),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("morph_output_position2"),
        size: (std::mem::size_of::<GpuVec2>() * input.base_vertices.len()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("morph_compute_bind_group_layout"),
        entries: &[
            storage_entry(0, true),
            storage_entry(1, true),
            storage_entry(2, true),
            uniform_entry(3),
            storage_entry(4, false),
        ],
    });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("morph_compute_position2_shader"),
        source: wgpu::ShaderSource::Wgsl(MORPH_POSITION2_WGSL.into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("morph_compute_pipeline_layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("morph_compute_position2_pipeline"),
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: "main",
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("morph_compute_bind_group"),
        layout: &bind_group_layout,
        entries: &[
            buffer_entry(0, &base_buffer),
            buffer_entry(1, &delta_buffer),
            buffer_entry(2, &metadata_buffer),
            buffer_entry(3, &uniform_buffer),
            buffer_entry(4, &output_buffer),
        ],
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("morph_compute_encoder"),
    });
    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("morph_compute_pass"),
            timestamp_writes: None,
        });
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.dispatch_workgroups(vertex_count.div_ceil(64), 1, 1);
    }
    let submission = ctx.queue().submit(Some(encoder.finish()));
    device.poll(wgpu::Maintain::wait_for(submission));
    if let Some(error) = pollster::block_on(device.pop_error_scope()) {
        return Err(Error::Other(format!(
            "GPU morph compute validation failed: {error}"
        )));
    }

    let bytes = ctx.read_buffer_sync(&output_buffer)?;
    Ok(bytemuck::cast_slice::<u8, GpuVec2>(&bytes)
        .iter()
        .take(input.base_vertices.len())
        .map(|vertex| vertex.value)
        .collect())
}

/// Evaluate position3 weighted-delta accumulation through a shared GPU shader.
pub fn compute_morph_position3_gpu(
    ctx: &Arc<GpuContext>,
    input: &MorphComputeGpuPosition3Input<'_>,
) -> Result<Vec<[f32; 3]>> {
    validate_gpu_position3_input(input)?;
    if input.base_vertices.is_empty() {
        return Ok(Vec::new());
    }
    if input.delta_sets.len() > u32::MAX as usize {
        return Err(Error::InvalidParameter(
            "morph delta set count exceeds GPU index limits".to_string(),
        ));
    }

    use wgpu::util::DeviceExt;

    let device = ctx.device();
    device.push_error_scope(wgpu::ErrorFilter::Validation);

    let vertex_count = input.base_vertices.len() as u32;
    let shape_count = input.delta_sets.len() as u32;
    let base_vertices = input
        .base_vertices
        .iter()
        .map(|vertex| GpuVec3 {
            value: *vertex,
            _padding: 0.0,
        })
        .collect::<Vec<_>>();
    let deltas = flatten_gpu_position3_deltas(input);
    let metadata = input
        .delta_sets
        .iter()
        .map(|set| GpuMorphMeta {
            weight: set.weight,
            _padding: [0, 0, 0],
        })
        .collect::<Vec<_>>();
    let uniforms = GpuMorphUniforms {
        vertex_count,
        shape_count,
        _padding: [0, 0],
    };

    let base_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_base_position3"),
        contents: bytemuck::cast_slice(&base_vertices),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let delta_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_deltas_position3"),
        contents: bytemuck::cast_slice(&deltas),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let metadata_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_metadata"),
        contents: bytemuck::cast_slice(&metadata),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("morph_uniforms"),
        contents: bytemuck::bytes_of(&uniforms),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("morph_output_position3"),
        size: (std::mem::size_of::<GpuVec3>() * input.base_vertices.len()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("morph_compute_bind_group_layout"),
        entries: &[
            storage_entry(0, true),
            storage_entry(1, true),
            storage_entry(2, true),
            uniform_entry(3),
            storage_entry(4, false),
        ],
    });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("morph_compute_position3_shader"),
        source: wgpu::ShaderSource::Wgsl(MORPH_POSITION3_WGSL.into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("morph_compute_pipeline_layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("morph_compute_position3_pipeline"),
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: "main",
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("morph_compute_bind_group"),
        layout: &bind_group_layout,
        entries: &[
            buffer_entry(0, &base_buffer),
            buffer_entry(1, &delta_buffer),
            buffer_entry(2, &metadata_buffer),
            buffer_entry(3, &uniform_buffer),
            buffer_entry(4, &output_buffer),
        ],
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("morph_compute_encoder"),
    });
    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("morph_compute_pass"),
            timestamp_writes: None,
        });
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, &bind_group, &[]);
        pass.dispatch_workgroups(vertex_count.div_ceil(64), 1, 1);
    }
    let submission = ctx.queue().submit(Some(encoder.finish()));
    device.poll(wgpu::Maintain::wait_for(submission));
    if let Some(error) = pollster::block_on(device.pop_error_scope()) {
        return Err(Error::Other(format!(
            "GPU morph compute validation failed: {error}"
        )));
    }

    let bytes = ctx.read_buffer_sync(&output_buffer)?;
    Ok(bytemuck::cast_slice::<u8, GpuVec3>(&bytes)
        .iter()
        .take(input.base_vertices.len())
        .map(|vertex| vertex.value)
        .collect())
}

fn validate_morph_input(input: &MorphComputeInput) -> Result<()> {
    let stride = input.stride()?;
    for (vertex_index, vertex) in input.base_vertices.iter().enumerate() {
        if vertex.len() != stride {
            return Err(Error::InvalidParameter(format!(
                "morph base vertex {vertex_index} has {} components, expected {stride}",
                vertex.len()
            )));
        }
    }
    for delta_set in &input.delta_sets {
        if delta_set.deltas.len() != input.base_vertices.len() {
            return Err(Error::InvalidParameter(format!(
                "morph delta set '{}' count {} does not match vertex count {}",
                delta_set.id,
                delta_set.deltas.len(),
                input.base_vertices.len()
            )));
        }
        for (vertex_index, delta) in delta_set.deltas.iter().enumerate() {
            if delta.len() != stride {
                return Err(Error::InvalidParameter(format!(
                    "morph delta set '{}' vertex {vertex_index} has {} components, expected {stride}",
                    delta_set.id,
                    delta.len()
                )));
            }
        }
    }
    Ok(())
}

fn validate_gpu_position2_input(input: &MorphComputeGpuPosition2Input<'_>) -> Result<()> {
    for delta_set in &input.delta_sets {
        if delta_set.deltas.len() != input.base_vertices.len() {
            return Err(Error::InvalidParameter(format!(
                "morph delta set '{}' count {} does not match vertex count {}",
                delta_set.id,
                delta_set.deltas.len(),
                input.base_vertices.len()
            )));
        }
    }
    Ok(())
}

fn validate_gpu_position3_input(input: &MorphComputeGpuPosition3Input<'_>) -> Result<()> {
    for delta_set in &input.delta_sets {
        if delta_set.deltas.len() != input.base_vertices.len() {
            return Err(Error::InvalidParameter(format!(
                "morph delta set '{}' count {} does not match vertex count {}",
                delta_set.id,
                delta_set.deltas.len(),
                input.base_vertices.len()
            )));
        }
    }
    Ok(())
}

fn flatten_gpu_position2_deltas(input: &MorphComputeGpuPosition2Input<'_>) -> Vec<GpuVec2> {
    if input.delta_sets.is_empty() {
        return vec![GpuVec2 {
            value: [0.0, 0.0],
            _padding: [0.0, 0.0],
        }];
    }

    input
        .delta_sets
        .iter()
        .flat_map(|set| {
            set.deltas.iter().map(|delta| GpuVec2 {
                value: *delta,
                _padding: [0.0, 0.0],
            })
        })
        .collect()
}

fn flatten_gpu_position3_deltas(input: &MorphComputeGpuPosition3Input<'_>) -> Vec<GpuVec3> {
    if input.delta_sets.is_empty() {
        return vec![GpuVec3 {
            value: [0.0, 0.0, 0.0],
            _padding: 0.0,
        }];
    }

    input
        .delta_sets
        .iter()
        .flat_map(|set| {
            set.deltas.iter().map(|delta| GpuVec3 {
                value: *delta,
                _padding: 0.0,
            })
        })
        .collect()
}

fn storage_entry(binding: u32, read_only: bool) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Storage { read_only },
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn uniform_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn buffer_entry(binding: u32, buffer: &wgpu::Buffer) -> wgpu::BindGroupEntry<'_> {
    wgpu::BindGroupEntry {
        binding,
        resource: buffer.as_entire_binding(),
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuVec2 {
    value: [f32; 2],
    _padding: [f32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuVec3 {
    value: [f32; 3],
    _padding: f32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuMorphMeta {
    weight: f32,
    _padding: [u32; 3],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuMorphUniforms {
    vertex_count: u32,
    shape_count: u32,
    _padding: [u32; 2],
}

const MORPH_POSITION2_WGSL: &str = r#"
struct Vec2Buffer {
    data: array<vec4<f32>>,
};

struct ShapeMeta {
    weight: f32,
    _padding0: u32,
    _padding1: u32,
    _padding2: u32,
};

struct ShapeMetaBuffer {
    data: array<ShapeMeta>,
};

struct Uniforms {
    vertex_count: u32,
    shape_count: u32,
    _padding0: u32,
    _padding1: u32,
};

@group(0) @binding(0) var<storage, read> base_vertices: Vec2Buffer;
@group(0) @binding(1) var<storage, read> morph_deltas: Vec2Buffer;
@group(0) @binding(2) var<storage, read> shape_metadata: ShapeMetaBuffer;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var<storage, read_write> output_vertices: Vec2Buffer;

fn delta_for(shape_index: u32, vertex_index: u32) -> vec2<f32> {
    let offset = shape_index * uniforms.vertex_count + vertex_index;
    return morph_deltas.data[offset].xy;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let vertex_index = id.x;
    if (vertex_index >= uniforms.vertex_count) {
        return;
    }

    var vertex = base_vertices.data[vertex_index].xy;
    for (var shape_index = 0u; shape_index < uniforms.shape_count; shape_index = shape_index + 1u) {
        let shape_info = shape_metadata.data[shape_index];
        if (abs(shape_info.weight) > 0.000001) {
            vertex = vertex + delta_for(shape_index, vertex_index) * shape_info.weight;
        }
    }
    output_vertices.data[vertex_index] = vec4<f32>(vertex, 0.0, 0.0);
}
"#;

const MORPH_POSITION3_WGSL: &str = r#"
struct Vec3Buffer {
    data: array<vec4<f32>>,
};

struct ShapeMeta {
    weight: f32,
    _padding0: u32,
    _padding1: u32,
    _padding2: u32,
};

struct ShapeMetaBuffer {
    data: array<ShapeMeta>,
};

struct Uniforms {
    vertex_count: u32,
    shape_count: u32,
    _padding0: u32,
    _padding1: u32,
};

@group(0) @binding(0) var<storage, read> base_vertices: Vec3Buffer;
@group(0) @binding(1) var<storage, read> morph_deltas: Vec3Buffer;
@group(0) @binding(2) var<storage, read> shape_metadata: ShapeMetaBuffer;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;
@group(0) @binding(4) var<storage, read_write> output_vertices: Vec3Buffer;

fn delta_for(shape_index: u32, vertex_index: u32) -> vec3<f32> {
    let offset = shape_index * uniforms.vertex_count + vertex_index;
    return morph_deltas.data[offset].xyz;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let vertex_index = id.x;
    if (vertex_index >= uniforms.vertex_count) {
        return;
    }

    var vertex = base_vertices.data[vertex_index].xyz;
    for (var shape_index = 0u; shape_index < uniforms.shape_count; shape_index = shape_index + 1u) {
        let shape_info = shape_metadata.data[shape_index];
        if (abs(shape_info.weight) > 0.000001) {
            vertex = vertex + delta_for(shape_index, vertex_index) * shape_info.weight;
        }
    }
    output_vertices.data[vertex_index] = vec4<f32>(vertex, 0.0);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_position2_fixture_accumulates_weighted_deltas() {
        let input = MorphComputeInput::position2(
            vec![[0.0, 0.0], [1.0, 0.0]],
            vec![
                MorphDeltaSet {
                    id: "jawOpen".to_string(),
                    deltas: vec![vec![0.0, 0.5], vec![0.0, 1.0]],
                    weight: 0.5,
                },
                MorphDeltaSet {
                    id: "smile".to_string(),
                    deltas: vec![vec![0.25, 0.0], vec![0.5, 0.0]],
                    weight: 0.25,
                },
            ],
        );

        let output = compute_morph_cpu(&input).unwrap();

        assert_eq!(output[0], vec![0.0625, 0.25]);
        assert_eq!(output[1], vec![1.125, 0.5]);
    }

    #[test]
    fn cpu_position3_fixture_accumulates_3d_morph_targets() {
        let input = MorphComputeInput::position3(
            vec![[0.0, 0.0, 0.0], [1.0, 0.0, 1.0]],
            vec![MorphDeltaSet {
                id: "morphA".to_string(),
                deltas: vec![vec![0.0, 1.0, 0.5], vec![0.5, 0.0, -0.5]],
                weight: 0.5,
            }],
        );

        let output = compute_morph_cpu(&input).unwrap();

        assert_eq!(output[0], vec![0.0, 0.5, 0.25]);
        assert_eq!(output[1], vec![1.25, 0.0, 0.75]);
    }

    #[test]
    fn cpu_extreme_many_shapes_large_delta_fixture_stays_finite() {
        let vertex_count = 8;
        let delta_sets = (0..24)
            .map(|shape_index| MorphDeltaSet {
                id: format!("shape_{shape_index}"),
                deltas: (0..vertex_count)
                    .map(|vertex_index| {
                        vec![
                            shape_index as f32 * 100.0 + vertex_index as f32,
                            -(shape_index as f32) * 50.0,
                        ]
                    })
                    .collect(),
                weight: if shape_index % 2 == 0 { 1.0 } else { -0.25 },
            })
            .collect();
        let input = MorphComputeInput::position2(vec![[0.0, 0.0]; 8], delta_sets);

        let output = compute_morph_cpu(&input).unwrap();

        assert_eq!(output.len(), vertex_count);
        assert!(output.iter().flatten().all(|value| value.is_finite()));
    }

    #[test]
    fn gpu_position2_matches_cpu_reference_for_fixture() {
        let ctx = match pollster::block_on(GpuContext::new()) {
            Ok(ctx) => Arc::new(ctx),
            Err(err) => {
                eprintln!("Skipping GPU morph compute test: {err}");
                return;
            }
        };
        let base = vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]];
        let jaw = vec![[0.0, 0.5], [0.0, 0.25], [0.25, 0.0]];
        let corrective = vec![[0.1, 0.0], [0.0, 0.2], [-0.1, 0.0]];
        let cpu = compute_morph_cpu(&MorphComputeInput::position2(
            base.clone(),
            vec![
                MorphDeltaSet {
                    id: "jawOpen".to_string(),
                    deltas: jaw.iter().map(|delta| delta.to_vec()).collect(),
                    weight: 0.75,
                },
                MorphDeltaSet {
                    id: "corrective".to_string(),
                    deltas: corrective.iter().map(|delta| delta.to_vec()).collect(),
                    weight: 0.5,
                },
            ],
        ))
        .unwrap();
        let gpu = compute_morph_position2_gpu(
            &ctx,
            &MorphComputeGpuPosition2Input {
                base_vertices: &base,
                delta_sets: vec![
                    MorphGpuDeltaSet2 {
                        id: "jawOpen",
                        deltas: &jaw,
                        weight: 0.75,
                    },
                    MorphGpuDeltaSet2 {
                        id: "corrective",
                        deltas: &corrective,
                        weight: 0.5,
                    },
                ],
            },
        )
        .unwrap();

        for (cpu_vertex, gpu_vertex) in cpu.iter().zip(gpu.iter()) {
            assert!(
                (cpu_vertex[0] - gpu_vertex[0]).abs() <= 0.0001
                    && (cpu_vertex[1] - gpu_vertex[1]).abs() <= 0.0001,
                "cpu={cpu_vertex:?} gpu={gpu_vertex:?}"
            );
        }
    }

    #[test]
    fn gpu_position3_matches_cpu_reference_for_fixture() {
        let ctx = match pollster::block_on(GpuContext::new()) {
            Ok(ctx) => Arc::new(ctx),
            Err(err) => {
                eprintln!("Skipping GPU morph compute test: {err}");
                return;
            }
        };
        let base = vec![[0.0, 0.0, 0.0], [1.0, 0.0, 1.0], [-1.0, 2.0, 0.5]];
        let brow = vec![[0.0, 0.5, 0.25], [0.25, 0.0, -0.5], [0.5, -0.25, 0.0]];
        let squash = vec![[0.1, -0.1, 0.0], [-0.2, 0.2, 0.1], [0.0, 0.25, -0.2]];
        let cpu = compute_morph_cpu(&MorphComputeInput::position3(
            base.clone(),
            vec![
                MorphDeltaSet {
                    id: "brow".to_string(),
                    deltas: brow.iter().map(|delta| delta.to_vec()).collect(),
                    weight: 0.5,
                },
                MorphDeltaSet {
                    id: "squash".to_string(),
                    deltas: squash.iter().map(|delta| delta.to_vec()).collect(),
                    weight: -0.25,
                },
            ],
        ))
        .unwrap();
        let gpu = compute_morph_position3_gpu(
            &ctx,
            &MorphComputeGpuPosition3Input {
                base_vertices: &base,
                delta_sets: vec![
                    MorphGpuDeltaSet3 {
                        id: "brow",
                        deltas: &brow,
                        weight: 0.5,
                    },
                    MorphGpuDeltaSet3 {
                        id: "squash",
                        deltas: &squash,
                        weight: -0.25,
                    },
                ],
            },
        )
        .unwrap();

        for (cpu_vertex, gpu_vertex) in cpu.iter().zip(gpu.iter()) {
            assert!(
                (cpu_vertex[0] - gpu_vertex[0]).abs() <= 0.0001
                    && (cpu_vertex[1] - gpu_vertex[1]).abs() <= 0.0001
                    && (cpu_vertex[2] - gpu_vertex[2]).abs() <= 0.0001,
                "cpu={cpu_vertex:?} gpu={gpu_vertex:?}"
            );
        }
    }
}
