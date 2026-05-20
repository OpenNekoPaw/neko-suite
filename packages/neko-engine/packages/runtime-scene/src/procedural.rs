//! Parametric geometry generators for standard 3D primitives.
//!
//! Each shape is fully described by [`ShapeParams`] (serde-tagged enum)
//! and produced as a [`ProceduralMesh`] via [`generate_shape`].

use std::f32::consts::PI;

use serde::{Deserialize, Serialize};

use crate::procedural_mesh::{ProceduralMesh, ProceduralVertex};

// ---------------------------------------------------------------------------
// Shape parameters
// ---------------------------------------------------------------------------

/// Parametric description of a 3D primitive.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ShapeParams {
    Cube {
        width: f32,
        height: f32,
        depth: f32,
    },
    Sphere {
        radius: f32,
        segments: u32,
        rings: u32,
    },
    Cylinder {
        radius_top: f32,
        radius_bottom: f32,
        height: f32,
        segments: u32,
    },
    Cone {
        radius: f32,
        height: f32,
        segments: u32,
    },
    Torus {
        major_radius: f32,
        minor_radius: f32,
        major_segments: u32,
        minor_segments: u32,
    },
    Plane {
        width: f32,
        depth: f32,
        segments_w: u32,
        segments_d: u32,
    },
}

// ---------------------------------------------------------------------------
// Default constructors
// ---------------------------------------------------------------------------

impl ShapeParams {
    pub fn default_cube() -> Self {
        ShapeParams::Cube {
            width: 1.0,
            height: 1.0,
            depth: 1.0,
        }
    }

    pub fn default_sphere() -> Self {
        ShapeParams::Sphere {
            radius: 0.5,
            segments: 32,
            rings: 16,
        }
    }

    pub fn default_cylinder() -> Self {
        ShapeParams::Cylinder {
            radius_top: 0.5,
            radius_bottom: 0.5,
            height: 1.0,
            segments: 32,
        }
    }

    pub fn default_cone() -> Self {
        ShapeParams::Cone {
            radius: 0.5,
            height: 1.0,
            segments: 32,
        }
    }

    pub fn default_torus() -> Self {
        ShapeParams::Torus {
            major_radius: 0.5,
            minor_radius: 0.2,
            major_segments: 32,
            minor_segments: 16,
        }
    }

    pub fn default_plane() -> Self {
        ShapeParams::Plane {
            width: 1.0,
            depth: 1.0,
            segments_w: 1,
            segments_d: 1,
        }
    }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Generate a [`ProceduralMesh`] from parametric shape description.
pub fn generate_shape(params: &ShapeParams) -> ProceduralMesh {
    match params {
        ShapeParams::Cube {
            width,
            height,
            depth,
        } => generate_cube(*width, *height, *depth),
        ShapeParams::Sphere {
            radius,
            segments,
            rings,
        } => generate_sphere(*radius, *segments, *rings),
        ShapeParams::Cylinder {
            radius_top,
            radius_bottom,
            height,
            segments,
        } => generate_cylinder(*radius_top, *radius_bottom, *height, *segments),
        ShapeParams::Cone {
            radius,
            height,
            segments,
        } => generate_cone(*radius, *height, *segments),
        ShapeParams::Torus {
            major_radius,
            minor_radius,
            major_segments,
            minor_segments,
        } => generate_torus(
            *major_radius,
            *minor_radius,
            *major_segments,
            *minor_segments,
        ),
        ShapeParams::Plane {
            width,
            depth,
            segments_w,
            segments_d,
        } => generate_plane(*width, *depth, *segments_w, *segments_d),
    }
}

// ---------------------------------------------------------------------------
// Cube — 24 vertices (4 per face, unique normals), 36 indices
// ---------------------------------------------------------------------------

fn generate_cube(w: f32, h: f32, d: f32) -> ProceduralMesh {
    let hw = w * 0.5;
    let hh = h * 0.5;
    let hd = d * 0.5;

    // (normal, [v0, v1, v2, v3] positions, [uv0..uv3])
    #[rustfmt::skip]
    let faces: [([f32; 3], [[f32; 3]; 4]); 6] = [
        // +X
        ([ 1.0,  0.0,  0.0], [[ hw, -hh, -hd], [ hw,  hh, -hd], [ hw,  hh,  hd], [ hw, -hh,  hd]]),
        // -X
        ([-1.0,  0.0,  0.0], [[-hw, -hh,  hd], [-hw,  hh,  hd], [-hw,  hh, -hd], [-hw, -hh, -hd]]),
        // +Y
        ([ 0.0,  1.0,  0.0], [[-hw,  hh,  hd], [ hw,  hh,  hd], [ hw,  hh, -hd], [-hw,  hh, -hd]]),
        // -Y  (fixed winding: face outward)
        ([ 0.0, -1.0,  0.0], [[-hw, -hh, -hd], [ hw, -hh, -hd], [ hw, -hh,  hd], [-hw, -hh,  hd]]),
        // +Z
        ([ 0.0,  0.0,  1.0], [[-hw, -hh,  hd], [ hw, -hh,  hd], [ hw,  hh,  hd], [-hw,  hh,  hd]]),
        // -Z
        ([ 0.0,  0.0, -1.0], [[ hw, -hh, -hd], [-hw, -hh, -hd], [-hw,  hh, -hd], [ hw,  hh, -hd]]),
    ];

    let uvs: [[f32; 2]; 4] = [[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]];

    let mut vertices = Vec::with_capacity(24);
    let mut indices = Vec::with_capacity(36);

    for (normal, positions) in &faces {
        let base = vertices.len() as u32;
        for (i, pos) in positions.iter().enumerate() {
            vertices.push(ProceduralVertex {
                position: *pos,
                normal: *normal,
                uv: uvs[i],
            });
        }
        // Two triangles per face
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    ProceduralMesh { vertices, indices }
}

// ---------------------------------------------------------------------------
// Sphere — UV sphere: (segments+1)*(rings+1) vertices
// ---------------------------------------------------------------------------

fn generate_sphere(radius: f32, segments: u32, rings: u32) -> ProceduralMesh {
    let seg = segments.max(3);
    let rng = rings.max(2);

    let vert_count = ((seg + 1) * (rng + 1)) as usize;
    let idx_count = (seg * rng * 6) as usize;
    let mut vertices = Vec::with_capacity(vert_count);
    let mut indices = Vec::with_capacity(idx_count);

    for r in 0..=rng {
        let v = r as f32 / rng as f32;
        let phi = v * PI; // 0 → PI (top to bottom)

        for s in 0..=seg {
            let u = s as f32 / seg as f32;
            let theta = u * 2.0 * PI;

            let sin_phi = phi.sin();
            let cos_phi = phi.cos();
            let sin_theta = theta.sin();
            let cos_theta = theta.cos();

            let nx = sin_phi * cos_theta;
            let ny = cos_phi;
            let nz = sin_phi * sin_theta;

            vertices.push(ProceduralVertex {
                position: [radius * nx, radius * ny, radius * nz],
                normal: [nx, ny, nz],
                uv: [u, v],
            });
        }
    }

    // Indices
    for r in 0..rng {
        for s in 0..seg {
            let row_curr = r * (seg + 1);
            let row_next = (r + 1) * (seg + 1);

            let tl = row_curr + s;
            let tr = row_curr + s + 1;
            let bl = row_next + s;
            let br = row_next + s + 1;

            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
    }

    ProceduralMesh { vertices, indices }
}

// ---------------------------------------------------------------------------
// Cylinder — top cap + bottom cap + side wall
// ---------------------------------------------------------------------------

fn generate_cylinder(r_top: f32, r_bot: f32, height: f32, segments: u32) -> ProceduralMesh {
    let seg = segments.max(3);
    let half_h = height * 0.5;

    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // --- Side wall ---
    let side_base = vertices.len() as u32;
    for i in 0..=seg {
        let u = i as f32 / seg as f32;
        let theta = u * 2.0 * PI;
        let cos_t = theta.cos();
        let sin_t = theta.sin();

        // Slope normal for a cone/cylinder
        let dr = r_bot - r_top;
        let slope = glam::Vec3::new(cos_t * height, dr, sin_t * height).normalize();

        // Top ring vertex
        vertices.push(ProceduralVertex {
            position: [r_top * cos_t, half_h, r_top * sin_t],
            normal: slope.into(),
            uv: [u, 0.0],
        });
        // Bottom ring vertex
        vertices.push(ProceduralVertex {
            position: [r_bot * cos_t, -half_h, r_bot * sin_t],
            normal: slope.into(),
            uv: [u, 1.0],
        });
    }
    for i in 0..seg {
        let top0 = side_base + i * 2;
        let bot0 = top0 + 1;
        let top1 = top0 + 2;
        let bot1 = top0 + 3;
        indices.extend_from_slice(&[top0, bot0, top1, top1, bot0, bot1]);
    }

    // --- Top cap ---
    build_cap(&mut vertices, &mut indices, r_top, half_h, seg, true);

    // --- Bottom cap ---
    build_cap(&mut vertices, &mut indices, r_bot, -half_h, seg, false);

    ProceduralMesh { vertices, indices }
}

/// Shared helper for cap generation (cylinder / cone).
fn build_cap(
    vertices: &mut Vec<ProceduralVertex>,
    indices: &mut Vec<u32>,
    radius: f32,
    y: f32,
    segments: u32,
    top: bool,
) {
    let normal = if top {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, -1.0, 0.0]
    };

    // Center vertex
    let center_idx = vertices.len() as u32;
    vertices.push(ProceduralVertex {
        position: [0.0, y, 0.0],
        normal,
        uv: [0.5, 0.5],
    });

    // Ring vertices
    let ring_base = vertices.len() as u32;
    for i in 0..=segments {
        let theta = (i as f32 / segments as f32) * 2.0 * PI;
        let cos_t = theta.cos();
        let sin_t = theta.sin();
        vertices.push(ProceduralVertex {
            position: [radius * cos_t, y, radius * sin_t],
            normal,
            uv: [cos_t * 0.5 + 0.5, sin_t * 0.5 + 0.5],
        });
    }

    for i in 0..segments {
        let c0 = ring_base + i;
        let c1 = ring_base + i + 1;
        if top {
            indices.extend_from_slice(&[center_idx, c0, c1]);
        } else {
            indices.extend_from_slice(&[center_idx, c1, c0]);
        }
    }
}

// ---------------------------------------------------------------------------
// Cone — bottom cap + side wall (apex = shared vertex per segment strip)
// ---------------------------------------------------------------------------

fn generate_cone(radius: f32, height: f32, segments: u32) -> ProceduralMesh {
    let seg = segments.max(3);
    let half_h = height * 0.5;

    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // --- Side wall ---
    // Slope angle for the cone surface normal
    let slope_len = (radius * radius + height * height).sqrt();
    let ny = radius / slope_len;
    let nr = height / slope_len;

    let side_base = vertices.len() as u32;
    for i in 0..=seg {
        let u = i as f32 / seg as f32;
        let theta = u * 2.0 * PI;
        let cos_t = theta.cos();
        let sin_t = theta.sin();

        let normal = [nr * cos_t, ny, nr * sin_t];

        // Apex vertex (duplicated per segment for correct normals/UVs)
        vertices.push(ProceduralVertex {
            position: [0.0, half_h, 0.0],
            normal,
            uv: [u, 0.0],
        });
        // Base ring vertex
        vertices.push(ProceduralVertex {
            position: [radius * cos_t, -half_h, radius * sin_t],
            normal,
            uv: [u, 1.0],
        });
    }
    for i in 0..seg {
        let apex0 = side_base + i * 2;
        let base0 = apex0 + 1;
        let apex1 = apex0 + 2;
        let base1 = apex0 + 3;
        // Triangle from apex to two base vertices, plus degenerate-safe quad
        indices.extend_from_slice(&[apex0, base0, base1, apex0, base1, apex1]);
    }

    // --- Bottom cap ---
    build_cap(&mut vertices, &mut indices, radius, -half_h, seg, false);

    ProceduralMesh { vertices, indices }
}

// ---------------------------------------------------------------------------
// Torus — (major_segments) * (minor_segments) grid wrapped into a torus
// ---------------------------------------------------------------------------

fn generate_torus(major_r: f32, minor_r: f32, major_seg: u32, minor_seg: u32) -> ProceduralMesh {
    let maj = major_seg.max(3);
    let min = minor_seg.max(3);

    let vert_count = ((maj + 1) * (min + 1)) as usize;
    let idx_count = (maj * min * 6) as usize;
    let mut vertices = Vec::with_capacity(vert_count);
    let mut indices = Vec::with_capacity(idx_count);

    for j in 0..=maj {
        let u = j as f32 / maj as f32;
        let theta = u * 2.0 * PI;
        let cos_t = theta.cos();
        let sin_t = theta.sin();

        for i in 0..=min {
            let v = i as f32 / min as f32;
            let phi = v * 2.0 * PI;
            let cos_p = phi.cos();
            let sin_p = phi.sin();

            // Position on the torus surface
            let x = (major_r + minor_r * cos_p) * cos_t;
            let y = minor_r * sin_p;
            let z = (major_r + minor_r * cos_p) * sin_t;

            // Normal = direction from ring center to surface point
            let nx = cos_p * cos_t;
            let ny = sin_p;
            let nz = cos_p * sin_t;

            vertices.push(ProceduralVertex {
                position: [x, y, z],
                normal: [nx, ny, nz],
                uv: [u, v],
            });
        }
    }

    let stride = min + 1;
    for j in 0..maj {
        for i in 0..min {
            let tl = j * stride + i;
            let tr = j * stride + i + 1;
            let bl = (j + 1) * stride + i;
            let br = (j + 1) * stride + i + 1;
            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
    }

    ProceduralMesh { vertices, indices }
}

// ---------------------------------------------------------------------------
// Plane — (segments_w+1) * (segments_d+1) grid in XZ plane, Y=0, normal +Y
// ---------------------------------------------------------------------------

fn generate_plane(width: f32, depth: f32, seg_w: u32, seg_d: u32) -> ProceduralMesh {
    let sw = seg_w.max(1);
    let sd = seg_d.max(1);

    let cols = sw + 1;
    let rows = sd + 1;
    let vert_count = (cols * rows) as usize;
    let idx_count = (sw * sd * 6) as usize;
    let mut vertices = Vec::with_capacity(vert_count);
    let mut indices = Vec::with_capacity(idx_count);

    let hw = width * 0.5;
    let hd = depth * 0.5;

    for r in 0..rows {
        let v = r as f32 / sd as f32;
        let z = -hd + v * depth;
        for c in 0..cols {
            let u = c as f32 / sw as f32;
            let x = -hw + u * width;
            vertices.push(ProceduralVertex {
                position: [x, 0.0, z],
                normal: [0.0, 1.0, 0.0],
                uv: [u, v],
            });
        }
    }

    for r in 0..sd {
        for c in 0..sw {
            let tl = r * cols + c;
            let tr = tl + 1;
            let bl = tl + cols;
            let br = bl + 1;
            indices.extend_from_slice(&[tl, bl, tr, tr, bl, br]);
        }
    }

    ProceduralMesh { vertices, indices }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cube_vertex_and_index_count() {
        let mesh = generate_shape(&ShapeParams::default_cube());
        assert_eq!(mesh.vertex_count(), 24, "cube: 4 vertices * 6 faces");
        assert_eq!(mesh.indices.len(), 36, "cube: 6 indices * 6 faces");
        assert_eq!(mesh.triangle_count(), 12);
    }

    #[test]
    fn cube_triangle_winding_matches_declared_normals() {
        let mesh = generate_shape(&ShapeParams::default_cube());
        for triangle in mesh.indices.chunks_exact(3) {
            let v0 = mesh.vertices[triangle[0] as usize];
            let v1 = mesh.vertices[triangle[1] as usize];
            let v2 = mesh.vertices[triangle[2] as usize];
            let p0 = glam::Vec3::from(v0.position);
            let p1 = glam::Vec3::from(v1.position);
            let p2 = glam::Vec3::from(v2.position);
            let face_normal = (p1 - p0).cross(p2 - p0).normalize();
            let declared_normal = glam::Vec3::from(v0.normal);

            assert!(
                face_normal.dot(declared_normal) > 0.999,
                "cube triangle {:?} winding produced normal {:?}, expected {:?}",
                triangle,
                face_normal,
                declared_normal,
            );
        }
    }

    #[test]
    fn sphere_vertex_count_formula() {
        let segments = 16u32;
        let rings = 8u32;
        let mesh = generate_shape(&ShapeParams::Sphere {
            radius: 1.0,
            segments,
            rings,
        });
        let expected_verts = ((segments + 1) * (rings + 1)) as usize;
        assert_eq!(mesh.vertex_count(), expected_verts);
        assert!(!mesh.is_empty());
    }

    #[test]
    fn cylinder_non_empty() {
        let mesh = generate_shape(&ShapeParams::default_cylinder());
        assert!(!mesh.is_empty());
        assert!(mesh.triangle_count() > 0);
    }

    #[test]
    fn cone_non_empty() {
        let mesh = generate_shape(&ShapeParams::default_cone());
        assert!(!mesh.is_empty());
        assert!(mesh.triangle_count() > 0);
    }

    #[test]
    fn torus_non_empty() {
        let mesh = generate_shape(&ShapeParams::default_torus());
        assert!(!mesh.is_empty());
        assert!(mesh.triangle_count() > 0);
    }

    #[test]
    fn plane_non_empty() {
        let mesh = generate_shape(&ShapeParams::default_plane());
        assert!(!mesh.is_empty());
        assert!(mesh.triangle_count() > 0);
        // 1x1 segments → 4 verts, 2 tris
        assert_eq!(mesh.vertex_count(), 4);
        assert_eq!(mesh.triangle_count(), 2);
    }

    #[test]
    fn all_shapes_have_valid_indices() {
        let shapes = [
            ShapeParams::default_cube(),
            ShapeParams::default_sphere(),
            ShapeParams::default_cylinder(),
            ShapeParams::default_cone(),
            ShapeParams::default_torus(),
            ShapeParams::default_plane(),
        ];
        for params in &shapes {
            let mesh = generate_shape(params);
            let vc = mesh.vertex_count() as u32;
            for &idx in &mesh.indices {
                assert!(idx < vc, "index {idx} out of bounds for {params:?}");
            }
        }
    }

    #[test]
    fn shape_params_serde_roundtrip() {
        let params = ShapeParams::default_cube();
        let json = serde_json::to_string(&params).unwrap();
        let parsed: ShapeParams = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, ShapeParams::Cube { .. }));
    }
}
