//! SpriteBatch mesh staging for puppet rendering.

use bytemuck::{Pod, Zeroable};

use neko_engine_gpu::error::{Error, Result};

use super::{PuppetBlendMode, PuppetMeshInput};

/// GPU vertex layout for textured puppet meshes.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Pod, Zeroable)]
pub struct PuppetVertex {
    /// Pixel-space position.
    pub position: [f32; 2],
    /// Atlas UV.
    pub uv: [f32; 2],
    /// Premultiplied vertex color/opacity.
    pub color: [f32; 4],
}

impl PuppetVertex {
    /// Vertex buffer layout consumed by puppet WGSL.
    pub fn buffer_layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<PuppetVertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x2,
                },
                wgpu::VertexAttribute {
                    offset: std::mem::size_of::<[f32; 2]>() as wgpu::BufferAddress,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x2,
                },
                wgpu::VertexAttribute {
                    offset: (std::mem::size_of::<[f32; 2]>() * 2) as wgpu::BufferAddress,
                    shader_location: 2,
                    format: wgpu::VertexFormat::Float32x4,
                },
            ],
        }
    }
}

/// Draw range for one sorted puppet mesh.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpriteDraw {
    /// Node id represented by this draw.
    pub node_id: String,
    /// Texture atlas id.
    pub atlas_id: String,
    /// Index start in the batched index buffer.
    pub index_start: u32,
    /// Index count for the draw.
    pub index_count: u32,
    /// Blend mode.
    pub blend_mode: PuppetBlendMode,
}

/// CPU-side SpriteBatch staging data.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SpriteBatch {
    /// Batched vertices.
    pub vertices: Vec<PuppetVertex>,
    /// Batched indices.
    pub indices: Vec<u32>,
    /// Draw ranges.
    pub draws: Vec<SpriteDraw>,
}

impl SpriteBatch {
    /// Build a sorted batch from renderer input meshes.
    pub fn from_meshes(meshes: &[PuppetMeshInput]) -> Result<Self> {
        let mut sorted = meshes.to_vec();
        sorted.sort_by(|left, right| left.z_order.total_cmp(&right.z_order));

        let mut batch = Self::default();
        for mesh in sorted {
            batch.push_mesh(&mesh)?;
        }
        Ok(batch)
    }

    /// Whether the batch has no drawable indices.
    pub fn is_empty(&self) -> bool {
        self.indices.is_empty()
    }

    /// Number of vertices in the batch.
    pub fn vertex_count(&self) -> usize {
        self.vertices.len()
    }

    /// Number of indices in the batch.
    pub fn index_count(&self) -> usize {
        self.indices.len()
    }

    fn push_mesh(&mut self, mesh: &PuppetMeshInput) -> Result<()> {
        if mesh.vertices.len() != mesh.uvs.len() {
            return Err(Error::InvalidParameter(format!(
                "puppet mesh '{}' has {} vertices but {} uvs",
                mesh.node_id,
                mesh.vertices.len(),
                mesh.uvs.len()
            )));
        }
        if mesh
            .indices
            .iter()
            .any(|index| usize::from(*index) >= mesh.vertices.len())
        {
            return Err(Error::InvalidParameter(format!(
                "puppet mesh '{}' has an out-of-range index",
                mesh.node_id
            )));
        }

        let vertex_offset = self.vertices.len() as u32;
        let index_start = self.indices.len() as u32;
        let opacity = mesh.opacity.clamp(0.0, 1.0);

        self.vertices.extend(
            mesh.vertices
                .iter()
                .zip(mesh.uvs.iter())
                .map(|(position, uv)| PuppetVertex {
                    position: *position,
                    uv: *uv,
                    color: [opacity, opacity, opacity, opacity],
                }),
        );
        self.indices.extend(
            mesh.indices
                .iter()
                .map(|index| vertex_offset + u32::from(*index)),
        );

        self.draws.push(SpriteDraw {
            node_id: mesh.node_id.clone(),
            atlas_id: mesh.atlas_id.clone(),
            index_start,
            index_count: mesh.indices.len() as u32,
            blend_mode: mesh.blend_mode,
        });

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{PuppetBlendMode, PuppetMeshInput};
    use std::time::Duration;
    use std::time::Instant;

    fn mesh(node_id: &str, z_order: f32) -> PuppetMeshInput {
        PuppetMeshInput {
            node_id: node_id.to_string(),
            atlas_id: "atlas".to_string(),
            vertices: vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            uvs: vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0]],
            indices: vec![0, 1, 2],
            opacity: 0.5,
            z_order,
            blend_mode: PuppetBlendMode::Normal,
        }
    }

    #[test]
    fn batch_sorts_by_z_order_and_offsets_indices() {
        let batch = SpriteBatch::from_meshes(&[mesh("top", 2.0), mesh("bottom", 1.0)]).unwrap();

        assert_eq!(batch.draws[0].node_id, "bottom");
        assert_eq!(batch.draws[1].node_id, "top");
        assert_eq!(batch.indices, vec![0, 1, 2, 3, 4, 5]);
        assert_eq!(batch.vertex_count(), 6);
        assert_eq!(batch.index_count(), 6);
    }

    #[test]
    fn batch_rejects_invalid_indices() {
        let mut invalid = mesh("bad", 0.0);
        invalid.indices = vec![0, 3, 1];

        let err = SpriteBatch::from_meshes(&[invalid]).unwrap_err();
        assert!(err.to_string().contains("out-of-range"));
    }

    #[test]
    fn standard_pose_batch_matches_canvas2d_reference_order() {
        let batch =
            SpriteBatch::from_meshes(&[mesh("hair", 30.0), mesh("face", 10.0), mesh("eyes", 20.0)])
                .unwrap();

        let draw_order: Vec<&str> = batch
            .draws
            .iter()
            .map(|draw| draw.node_id.as_str())
            .collect();
        assert_eq!(draw_order, vec!["face", "eyes", "hair"]);
    }

    #[test]
    fn representative_vertex_count_stays_under_batch_budget() {
        let mut meshes = Vec::new();
        for index in 0..128 {
            let mut mesh = mesh(&format!("node-{index}"), index as f32);
            mesh.vertices = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
            mesh.uvs = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
            mesh.indices = vec![0, 1, 2, 0, 2, 3];
            meshes.push(mesh);
        }

        let started = Instant::now();
        let batch = SpriteBatch::from_meshes(&meshes).unwrap();

        assert_eq!(batch.vertex_count(), 512);
        assert_eq!(batch.index_count(), 768);
        assert!(
            started.elapsed() < Duration::from_millis(16),
            "representative puppet batching exceeded one 60fps frame"
        );
    }
}
