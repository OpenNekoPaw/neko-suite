//! CPU-side mesh data shared by all procedural generators (CSG, text, parametric shapes).
//!
//! `ProceduralMesh` is intentionally GPU-agnostic — conversion to `PbrVertex`
//! (48-byte GPU layout) happens in `AssetCache` at upload time.

use glam::Vec3;

/// CPU-side vertex with position, normal, and UV.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ProceduralVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
}

/// CPU-side indexed triangle mesh produced by procedural generators.
#[derive(Debug, Clone, Default)]
pub struct ProceduralMesh {
    pub vertices: Vec<ProceduralVertex>,
    pub indices: Vec<u32>,
}

impl ProceduralMesh {
    /// Recompute flat (face) normals from triangle indices.
    ///
    /// Each triangle's geometric normal is accumulated into its three vertices,
    /// then all normals are normalized. This produces smooth normals where
    /// vertices are shared and flat normals where they are duplicated per-face.
    pub fn recompute_normals(&mut self) {
        // Zero out existing normals
        for v in &mut self.vertices {
            v.normal = [0.0, 0.0, 0.0];
        }

        // Accumulate face normals
        for tri in self.indices.chunks_exact(3) {
            let (i0, i1, i2) = (tri[0] as usize, tri[1] as usize, tri[2] as usize);

            let p0 = Vec3::from(self.vertices[i0].position);
            let p1 = Vec3::from(self.vertices[i1].position);
            let p2 = Vec3::from(self.vertices[i2].position);

            let face_normal = (p1 - p0).cross(p2 - p0);

            // Accumulate (unnormalized — area-weighted)
            for &idx in &[i0, i1, i2] {
                let n = &mut self.vertices[idx].normal;
                n[0] += face_normal.x;
                n[1] += face_normal.y;
                n[2] += face_normal.z;
            }
        }

        // Normalize
        for v in &mut self.vertices {
            let n = Vec3::from(v.normal);
            let len = n.length();
            if len > 1e-10 {
                let normalized = n / len;
                v.normal = normalized.into();
            }
        }
    }

    /// Returns `true` if the mesh has no vertices.
    pub fn is_empty(&self) -> bool {
        self.vertices.is_empty()
    }

    /// Number of vertices in the mesh.
    pub fn vertex_count(&self) -> usize {
        self.vertices.len()
    }

    /// Number of triangles (index count / 3).
    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_mesh() {
        let mesh = ProceduralMesh::default();
        assert!(mesh.is_empty());
        assert_eq!(mesh.vertex_count(), 0);
        assert_eq!(mesh.triangle_count(), 0);
    }

    #[test]
    fn recompute_normals_single_triangle() {
        // Triangle in XY plane: (0,0,0), (1,0,0), (0,1,0)
        // Expected normal: +Z
        let mut mesh = ProceduralMesh {
            vertices: vec![
                ProceduralVertex {
                    position: [0.0, 0.0, 0.0],
                    normal: [0.0, 0.0, 0.0],
                    uv: [0.0, 0.0],
                },
                ProceduralVertex {
                    position: [1.0, 0.0, 0.0],
                    normal: [0.0, 0.0, 0.0],
                    uv: [1.0, 0.0],
                },
                ProceduralVertex {
                    position: [0.0, 1.0, 0.0],
                    normal: [0.0, 0.0, 0.0],
                    uv: [0.0, 1.0],
                },
            ],
            indices: vec![0, 1, 2],
        };

        mesh.recompute_normals();

        for v in &mesh.vertices {
            assert!((v.normal[0]).abs() < 1e-6, "nx should be 0");
            assert!((v.normal[1]).abs() < 1e-6, "ny should be 0");
            assert!((v.normal[2] - 1.0).abs() < 1e-6, "nz should be 1");
        }
    }

    #[test]
    fn vertex_and_triangle_counts() {
        let mesh = ProceduralMesh {
            vertices: vec![
                ProceduralVertex {
                    position: [0.0; 3],
                    normal: [0.0; 3],
                    uv: [0.0; 2],
                };
                6
            ],
            indices: vec![0, 1, 2, 3, 4, 5],
        };
        assert!(!mesh.is_empty());
        assert_eq!(mesh.vertex_count(), 6);
        assert_eq!(mesh.triangle_count(), 2);
    }
}
