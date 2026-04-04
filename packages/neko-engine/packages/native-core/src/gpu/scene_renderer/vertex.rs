//! Standardized PBR vertex layout for scene rendering
//!
//! All glTF mesh variants are normalized to this layout before GPU upload.

use bytemuck::{Pod, Zeroable};

/// Standard PBR vertex — all glTF primitives normalized to this layout.
///
/// Layout: position(3) + normal(3) + uv(2) + tangent(4) = 12 floats = 48 bytes
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct PbrVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
    pub tangent: [f32; 4],
}

impl PbrVertex {
    /// wgpu vertex buffer layout descriptor
    pub fn buffer_layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<PbrVertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBUTES,
        }
    }

    const ATTRIBUTES: [wgpu::VertexAttribute; 4] = [
        // position: location 0
        wgpu::VertexAttribute {
            offset: 0,
            shader_location: 0,
            format: wgpu::VertexFormat::Float32x3,
        },
        // normal: location 1
        wgpu::VertexAttribute {
            offset: 12,
            shader_location: 1,
            format: wgpu::VertexFormat::Float32x3,
        },
        // uv: location 2
        wgpu::VertexAttribute {
            offset: 24,
            shader_location: 2,
            format: wgpu::VertexFormat::Float32x2,
        },
        // tangent: location 3
        wgpu::VertexAttribute {
            offset: 32,
            shader_location: 3,
            format: wgpu::VertexFormat::Float32x4,
        },
    ];
}

/// Skinned PBR vertex — extends PbrVertex with joint indices and weights.
///
/// Layout: position(3) + normal(3) + uv(2) + tangent(4) + joints(4) + weights(4) = 20 floats = 80 bytes
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct SkinnedPbrVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
    pub tangent: [f32; 4],
    pub joint_indices: [u32; 4],
    pub joint_weights: [f32; 4],
}

impl SkinnedPbrVertex {
    /// wgpu vertex buffer layout descriptor
    pub fn buffer_layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<SkinnedPbrVertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBUTES,
        }
    }

    const ATTRIBUTES: [wgpu::VertexAttribute; 6] = [
        // position: location 0
        wgpu::VertexAttribute {
            offset: 0,
            shader_location: 0,
            format: wgpu::VertexFormat::Float32x3,
        },
        // normal: location 1
        wgpu::VertexAttribute {
            offset: 12,
            shader_location: 1,
            format: wgpu::VertexFormat::Float32x3,
        },
        // uv: location 2
        wgpu::VertexAttribute {
            offset: 24,
            shader_location: 2,
            format: wgpu::VertexFormat::Float32x2,
        },
        // tangent: location 3
        wgpu::VertexAttribute {
            offset: 32,
            shader_location: 3,
            format: wgpu::VertexFormat::Float32x4,
        },
        // joint_indices: location 4
        wgpu::VertexAttribute {
            offset: 48,
            shader_location: 4,
            format: wgpu::VertexFormat::Uint32x4,
        },
        // joint_weights: location 5
        wgpu::VertexAttribute {
            offset: 64,
            shader_location: 5,
            format: wgpu::VertexFormat::Float32x4,
        },
    ];
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vertex_size_is_48_bytes() {
        assert_eq!(std::mem::size_of::<PbrVertex>(), 48);
    }

    #[test]
    fn skinned_vertex_size_is_80_bytes() {
        assert_eq!(std::mem::size_of::<SkinnedPbrVertex>(), 80);
    }

    #[test]
    fn vertex_is_pod() {
        // Compile-time check: PbrVertex implements Pod + Zeroable
        let v = PbrVertex::zeroed();
        assert_eq!(v.position, [0.0; 3]);
    }

    #[test]
    fn skinned_vertex_is_pod() {
        let v = SkinnedPbrVertex::zeroed();
        assert_eq!(v.joint_indices, [0; 4]);
        assert_eq!(v.joint_weights, [0.0; 4]);
    }
}
