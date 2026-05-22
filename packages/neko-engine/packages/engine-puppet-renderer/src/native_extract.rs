//! Native puppet deformation render-extract DTOs and CPU fallback math.

use std::sync::Arc;

use neko_engine_gpu::error::{Error, Result};
use neko_engine_gpu::GpuContext;

/// Data extracted from native runtime for optional GPU deformation.
#[derive(Debug, Clone, PartialEq)]
pub struct NativePuppetRenderExtract {
    pub mesh_id: String,
    pub bind_vertices: Vec<[f32; 2]>,
    pub joint_indices: Vec<[u16; 4]>,
    pub joint_weights: Vec<[f32; 4]>,
    pub bone_matrices: Vec<[[f32; 3]; 3]>,
    pub blendshape_deltas: Vec<NativeBlendShapeDelta>,
    pub blendshape_weights: Vec<f32>,
}

/// One BlendShape delta stream for one mesh.
#[derive(Debug, Clone, PartialEq)]
pub struct NativeBlendShapeDelta {
    pub name: String,
    pub vertex_deltas: Vec<[f32; 2]>,
    pub post_skin: bool,
}

/// Runtime selection for native deformation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeDeformationPath {
    CpuFallback,
    Gpu,
}

/// Selection result with explicit diagnostics for unsupported GPU paths.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeDeformationSelection {
    pub path: NativeDeformationPath,
    pub diagnostics: Vec<String>,
}

/// Select native deformation path. GPU is opt-in until shader support lands.
pub fn select_native_deformation_path(
    prefer_gpu: bool,
    gpu_supported: bool,
) -> NativeDeformationSelection {
    if prefer_gpu && gpu_supported {
        NativeDeformationSelection {
            path: NativeDeformationPath::Gpu,
            diagnostics: Vec::new(),
        }
    } else {
        let mut diagnostics = Vec::new();
        if prefer_gpu {
            diagnostics.push(
                "GPU native deformation unavailable; using CPU DeformedVertices fallback"
                    .to_string(),
            );
        }
        NativeDeformationSelection {
            path: NativeDeformationPath::CpuFallback,
            diagnostics,
        }
    }
}

/// CPU reference implementation for BlendShape + skinning.
pub fn deform_native_cpu(extract: &NativePuppetRenderExtract) -> Result<Vec<[f32; 2]>> {
    validate_extract(extract)?;

    let mut vertices = extract.bind_vertices.clone();
    for (shape_index, shape) in extract.blendshape_deltas.iter().enumerate() {
        if shape.post_skin {
            continue;
        }
        let weight = extract
            .blendshape_weights
            .get(shape_index)
            .copied()
            .unwrap_or(0.0);
        apply_delta(&mut vertices, &shape.vertex_deltas, weight);
    }

    let mut skinned = Vec::with_capacity(vertices.len());
    for (vertex_index, vertex) in vertices.iter().enumerate() {
        let mut output = [0.0, 0.0];
        for influence in 0..4 {
            let joint_index = extract.joint_indices[vertex_index][influence] as usize;
            let weight = extract.joint_weights[vertex_index][influence];
            if weight <= 0.0 {
                continue;
            }
            let matrix = extract
                .bone_matrices
                .get(joint_index)
                .copied()
                .unwrap_or(identity3());
            let transformed = transform_point(matrix, *vertex);
            output[0] += transformed[0] * weight;
            output[1] += transformed[1] * weight;
        }
        skinned.push(output);
    }

    for (shape_index, shape) in extract.blendshape_deltas.iter().enumerate() {
        if !shape.post_skin {
            continue;
        }
        let weight = extract
            .blendshape_weights
            .get(shape_index)
            .copied()
            .unwrap_or(0.0);
        apply_delta(&mut skinned, &shape.vertex_deltas, weight);
    }

    Ok(skinned)
}

/// Optional GPU implementation for BlendShape + skinning.
///
/// The renderer owns this compute path so runtime-puppet can keep its pure CPU
/// ECS/runtime boundary and avoid a wgpu dependency.
pub fn deform_native_gpu(
    ctx: &Arc<GpuContext>,
    extract: &NativePuppetRenderExtract,
) -> Result<Vec<[f32; 2]>> {
    validate_extract(extract)?;
    if extract.bind_vertices.is_empty() {
        return Ok(Vec::new());
    }
    if extract.blendshape_deltas.len() > u32::MAX as usize
        || extract.bone_matrices.len() > u32::MAX as usize
    {
        return Err(Error::InvalidParameter(
            "native extract exceeds GPU deformation index limits".to_string(),
        ));
    }

    use wgpu::util::DeviceExt;

    let device = ctx.device();
    device.push_error_scope(wgpu::ErrorFilter::Validation);
    let vertex_count = extract.bind_vertices.len() as u32;
    let shape_count = extract.blendshape_deltas.len() as u32;
    let bone_count = extract.bone_matrices.len().max(1) as u32;
    let bind_vertices = extract
        .bind_vertices
        .iter()
        .map(|vertex| GpuVec2 {
            value: *vertex,
            _padding: [0.0, 0.0],
        })
        .collect::<Vec<_>>();
    let joint_indices = extract
        .joint_indices
        .iter()
        .map(|indices| GpuJointIndices {
            value: [
                indices[0] as u32,
                indices[1] as u32,
                indices[2] as u32,
                indices[3] as u32,
            ],
        })
        .collect::<Vec<_>>();
    let joint_weights = extract
        .joint_weights
        .iter()
        .map(|weights| GpuVec4 { value: *weights })
        .collect::<Vec<_>>();
    let bone_matrices = if extract.bone_matrices.is_empty() {
        vec![GpuMat3 {
            rows: mat3_to_gpu(identity3()),
        }]
    } else {
        extract
            .bone_matrices
            .iter()
            .map(|matrix| GpuMat3 {
                rows: mat3_to_gpu(*matrix),
            })
            .collect::<Vec<_>>()
    };
    let deltas = flatten_deltas(extract);
    let shape_metadata = extract
        .blendshape_deltas
        .iter()
        .zip(
            extract
                .blendshape_weights
                .iter()
                .copied()
                .chain(std::iter::repeat(0.0)),
        )
        .map(|(shape, weight)| GpuShapeMeta {
            weight,
            post_skin: u32::from(shape.post_skin),
            _padding: [0, 0],
        })
        .collect::<Vec<_>>();
    let uniforms = GpuNativeDeformUniforms {
        vertex_count,
        shape_count,
        bone_count,
        _padding: 0,
    };

    let bind_vertices_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_bind_vertices"),
        contents: bytemuck::cast_slice(&bind_vertices),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let joint_indices_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_joint_indices"),
        contents: bytemuck::cast_slice(&joint_indices),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let joint_weights_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_joint_weights"),
        contents: bytemuck::cast_slice(&joint_weights),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let bone_matrices_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_bone_matrices"),
        contents: bytemuck::cast_slice(&bone_matrices),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let deltas_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_blendshape_deltas"),
        contents: bytemuck::cast_slice(&deltas),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let shape_metadata_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_blendshape_metadata"),
        contents: bytemuck::cast_slice(&shape_metadata),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("native_deform_uniforms"),
        contents: bytemuck::bytes_of(&uniforms),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("native_deformed_vertices"),
        size: (std::mem::size_of::<GpuVec2>() * extract.bind_vertices.len()) as u64,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });

    let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("native_deform_bind_group_layout"),
        entries: &[
            storage_entry(0, true),
            storage_entry(1, true),
            storage_entry(2, true),
            storage_entry(3, true),
            storage_entry(4, true),
            storage_entry(5, true),
            uniform_entry(6),
            storage_entry(7, false),
        ],
    });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("native_deform_shader"),
        source: wgpu::ShaderSource::Wgsl(NATIVE_DEFORM_WGSL.into()),
    });
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("native_deform_pipeline_layout"),
        bind_group_layouts: &[&bind_group_layout],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("native_deform_pipeline"),
        layout: Some(&pipeline_layout),
        module: &shader,
        entry_point: "main",
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("native_deform_bind_group"),
        layout: &bind_group_layout,
        entries: &[
            buffer_entry(0, &bind_vertices_buffer),
            buffer_entry(1, &joint_indices_buffer),
            buffer_entry(2, &joint_weights_buffer),
            buffer_entry(3, &bone_matrices_buffer),
            buffer_entry(4, &deltas_buffer),
            buffer_entry(5, &shape_metadata_buffer),
            buffer_entry(6, &uniform_buffer),
            buffer_entry(7, &output_buffer),
        ],
    });

    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("native_deform_encoder"),
    });
    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("native_deform_pass"),
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
            "GPU native deformation validation failed: {error}"
        )));
    }

    let bytes = ctx.read_buffer_sync(&output_buffer)?;
    let vertices = bytemuck::cast_slice::<u8, GpuVec2>(&bytes)
        .iter()
        .take(extract.bind_vertices.len())
        .map(|vertex| vertex.value)
        .collect();
    Ok(vertices)
}

fn validate_extract(extract: &NativePuppetRenderExtract) -> Result<()> {
    let vertex_count = extract.bind_vertices.len();
    if extract.joint_indices.len() != vertex_count || extract.joint_weights.len() != vertex_count {
        return Err(Error::InvalidParameter(format!(
            "native extract '{}' has mismatched vertex and skin weight counts",
            extract.mesh_id
        )));
    }
    for shape in &extract.blendshape_deltas {
        if shape.vertex_deltas.len() != vertex_count {
            return Err(Error::InvalidParameter(format!(
                "native extract '{}' BlendShape '{}' delta count does not match vertex count",
                extract.mesh_id, shape.name
            )));
        }
    }
    Ok(())
}

fn apply_delta(vertices: &mut [[f32; 2]], deltas: &[[f32; 2]], weight: f32) {
    if weight.abs() <= f32::EPSILON {
        return;
    }
    for (vertex, delta) in vertices.iter_mut().zip(deltas.iter()) {
        vertex[0] += delta[0] * weight;
        vertex[1] += delta[1] * weight;
    }
}

fn transform_point(matrix: [[f32; 3]; 3], vertex: [f32; 2]) -> [f32; 2] {
    [
        matrix[0][0] * vertex[0] + matrix[1][0] * vertex[1] + matrix[2][0],
        matrix[0][1] * vertex[0] + matrix[1][1] * vertex[1] + matrix[2][1],
    ]
}

fn identity3() -> [[f32; 3]; 3] {
    [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
}

fn flatten_deltas(extract: &NativePuppetRenderExtract) -> Vec<GpuVec2> {
    if extract.blendshape_deltas.is_empty() {
        return vec![GpuVec2 {
            value: [0.0, 0.0],
            _padding: [0.0, 0.0],
        }];
    }

    extract
        .blendshape_deltas
        .iter()
        .flat_map(|shape| {
            shape.vertex_deltas.iter().map(|delta| GpuVec2 {
                value: *delta,
                _padding: [0.0, 0.0],
            })
        })
        .collect()
}

fn mat3_to_gpu(matrix: [[f32; 3]; 3]) -> [[f32; 4]; 3] {
    [
        [matrix[0][0], matrix[0][1], matrix[0][2], 0.0],
        [matrix[1][0], matrix[1][1], matrix[1][2], 0.0],
        [matrix[2][0], matrix[2][1], matrix[2][2], 0.0],
    ]
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
struct GpuVec4 {
    value: [f32; 4],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuJointIndices {
    value: [u32; 4],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuMat3 {
    rows: [[f32; 4]; 3],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuShapeMeta {
    weight: f32,
    post_skin: u32,
    _padding: [u32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct GpuNativeDeformUniforms {
    vertex_count: u32,
    shape_count: u32,
    bone_count: u32,
    _padding: u32,
}

const NATIVE_DEFORM_WGSL: &str = r#"
struct Vec2Buffer {
    data: array<vec4<f32>>,
};

struct JointIndexBuffer {
    data: array<vec4<u32>>,
};

struct Vec4Buffer {
    data: array<vec4<f32>>,
};

struct Mat3 {
    row0: vec4<f32>,
    row1: vec4<f32>,
    row2: vec4<f32>,
};

struct Mat3Buffer {
    data: array<Mat3>,
};

struct ShapeMeta {
    weight: f32,
    post_skin: u32,
    _padding0: u32,
    _padding1: u32,
};

struct ShapeMetaBuffer {
    data: array<ShapeMeta>,
};

struct Uniforms {
    vertex_count: u32,
    shape_count: u32,
    bone_count: u32,
    _padding: u32,
};

@group(0) @binding(0) var<storage, read> bind_vertices: Vec2Buffer;
@group(0) @binding(1) var<storage, read> joint_indices: JointIndexBuffer;
@group(0) @binding(2) var<storage, read> joint_weights: Vec4Buffer;
@group(0) @binding(3) var<storage, read> bone_matrices: Mat3Buffer;
@group(0) @binding(4) var<storage, read> blendshape_deltas: Vec2Buffer;
@group(0) @binding(5) var<storage, read> shape_metadata: ShapeMetaBuffer;
@group(0) @binding(6) var<uniform> uniforms: Uniforms;
@group(0) @binding(7) var<storage, read_write> output_vertices: Vec2Buffer;

fn transform_point(matrix: Mat3, vertex: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        matrix.row0.x * vertex.x + matrix.row1.x * vertex.y + matrix.row2.x,
        matrix.row0.y * vertex.x + matrix.row1.y * vertex.y + matrix.row2.y,
    );
}

fn delta_for(shape_index: u32, vertex_index: u32) -> vec2<f32> {
    let offset = shape_index * uniforms.vertex_count + vertex_index;
    return blendshape_deltas.data[offset].xy;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let vertex_index = id.x;
    if (vertex_index >= uniforms.vertex_count) {
        return;
    }

    var vertex = bind_vertices.data[vertex_index].xy;
    for (var shape_index = 0u; shape_index < uniforms.shape_count; shape_index = shape_index + 1u) {
        let shape_info = shape_metadata.data[shape_index];
        if (shape_info.post_skin == 0u && abs(shape_info.weight) > 0.000001) {
            vertex = vertex + delta_for(shape_index, vertex_index) * shape_info.weight;
        }
    }

    let indices = joint_indices.data[vertex_index];
    let weights = joint_weights.data[vertex_index];
    var skinned = vec2<f32>(0.0, 0.0);
    for (var influence = 0u; influence < 4u; influence = influence + 1u) {
        let weight = weights[influence];
        if (weight > 0.0) {
            let joint_index = min(indices[influence], uniforms.bone_count - 1u);
            skinned = skinned + transform_point(bone_matrices.data[joint_index], vertex) * weight;
        }
    }

    for (var shape_index = 0u; shape_index < uniforms.shape_count; shape_index = shape_index + 1u) {
        let shape_info = shape_metadata.data[shape_index];
        if (shape_info.post_skin != 0u && abs(shape_info.weight) > 0.000001) {
            skinned = skinned + delta_for(shape_index, vertex_index) * shape_info.weight;
        }
    }

    output_vertices.data[vertex_index] = vec4<f32>(skinned, 0.0, 0.0);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_reference_applies_blendshape_then_skinning() {
        let extract = NativePuppetRenderExtract {
            mesh_id: "mesh".to_string(),
            bind_vertices: vec![[0.0, 0.0], [1.0, 0.0]],
            joint_indices: vec![[0, 0, 0, 0], [0, 0, 0, 0]],
            joint_weights: vec![[1.0, 0.0, 0.0, 0.0], [1.0, 0.0, 0.0, 0.0]],
            bone_matrices: vec![[[0.0, 1.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 0.0, 1.0]]],
            blendshape_deltas: vec![NativeBlendShapeDelta {
                name: "jawOpen".to_string(),
                vertex_deltas: vec![[0.0, 0.0], [0.0, 1.0]],
                post_skin: false,
            }],
            blendshape_weights: vec![1.0],
        };

        let vertices = deform_native_cpu(&extract).unwrap();

        assert_eq!(vertices[1], [-1.0, 1.0]);
    }

    #[test]
    fn cpu_reference_applies_post_skin_corrective_after_skinning() {
        let extract = NativePuppetRenderExtract {
            mesh_id: "mesh".to_string(),
            bind_vertices: vec![[1.0, 0.0]],
            joint_indices: vec![[0, 0, 0, 0]],
            joint_weights: vec![[1.0, 0.0, 0.0, 0.0]],
            bone_matrices: vec![identity3()],
            blendshape_deltas: vec![NativeBlendShapeDelta {
                name: "corrective".to_string(),
                vertex_deltas: vec![[0.0, 2.0]],
                post_skin: true,
            }],
            blendshape_weights: vec![0.5],
        };

        let vertices = deform_native_cpu(&extract).unwrap();

        assert_eq!(vertices[0], [1.0, 1.0]);
    }

    #[test]
    fn extract_validation_rejects_mismatched_delta_count() {
        let extract = NativePuppetRenderExtract {
            mesh_id: "mesh".to_string(),
            bind_vertices: vec![[0.0, 0.0]],
            joint_indices: vec![[0, 0, 0, 0]],
            joint_weights: vec![[1.0, 0.0, 0.0, 0.0]],
            bone_matrices: vec![identity3()],
            blendshape_deltas: vec![NativeBlendShapeDelta {
                name: "bad".to_string(),
                vertex_deltas: vec![],
                post_skin: false,
            }],
            blendshape_weights: vec![1.0],
        };

        let err = deform_native_cpu(&extract).unwrap_err();
        assert!(err.to_string().contains("delta count"));
    }

    #[test]
    fn gpu_selection_falls_back_with_diagnostic() {
        let selection = select_native_deformation_path(true, false);

        assert_eq!(selection.path, NativeDeformationPath::CpuFallback);
        assert_eq!(selection.diagnostics.len(), 1);
    }

    #[test]
    fn gpu_deformation_matches_cpu_reference_for_synthetic_mesh() {
        let ctx = match pollster::block_on(GpuContext::new()) {
            Ok(ctx) => Arc::new(ctx),
            Err(err) => {
                eprintln!("Skipping GPU deformation test: {err}");
                return;
            }
        };
        let extract = NativePuppetRenderExtract {
            mesh_id: "mesh".to_string(),
            bind_vertices: vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
            joint_indices: vec![[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
            joint_weights: vec![
                [0.5, 0.5, 0.0, 0.0],
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
            ],
            bone_matrices: vec![
                identity3(),
                [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [2.0, -1.0, 1.0]],
            ],
            blendshape_deltas: vec![
                NativeBlendShapeDelta {
                    name: "jawOpen".to_string(),
                    vertex_deltas: vec![[0.0, 0.5], [0.0, 0.25], [0.25, 0.0]],
                    post_skin: false,
                },
                NativeBlendShapeDelta {
                    name: "corrective".to_string(),
                    vertex_deltas: vec![[0.1, 0.0], [0.0, 0.2], [-0.1, 0.0]],
                    post_skin: true,
                },
            ],
            blendshape_weights: vec![0.75, 0.5],
        };

        let cpu = deform_native_cpu(&extract).unwrap();
        let gpu = deform_native_gpu(&ctx, &extract).unwrap();

        assert_eq!(gpu.len(), cpu.len());
        for (cpu_vertex, gpu_vertex) in cpu.iter().zip(gpu.iter()) {
            assert!(
                (cpu_vertex[0] - gpu_vertex[0]).abs() <= 0.0001
                    && (cpu_vertex[1] - gpu_vertex[1]).abs() <= 0.0001,
                "cpu={cpu_vertex:?} gpu={gpu_vertex:?}"
            );
        }
    }
}
