//! Constructive Solid Geometry (CSG) boolean operations on triangle meshes.
//!
//! Implements union, difference, and intersection using the BSP tree approach.
//! Operates entirely on CPU — no GPU dependencies.
//!
//! # Algorithm
//!
//! 1. Convert `ProceduralMesh` to polygon lists
//! 2. Build BSP trees from each mesh
//! 3. Clip polygons against the opposing BSP tree
//! 4. Combine results based on the requested operation
//!
//! # References
//!
//! Based on the CSG algorithm described by Evan Wallace (csg.js).

use glam::Vec3;
use serde::{Deserialize, Serialize};

use crate::procedural_mesh::{ProceduralMesh, ProceduralVertex};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EPSILON: f32 = 1e-5;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Boolean operation to perform on two meshes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CsgOp {
    /// A ∪ B — combine both volumes.
    Union,
    /// A \ B — subtract B from A.
    Difference,
    /// A ∩ B — keep only the overlapping volume.
    Intersection,
}

// ---------------------------------------------------------------------------
// Internal geometry types
// ---------------------------------------------------------------------------

/// Half-space defined by a normal and signed distance from origin.
#[derive(Debug, Clone, Copy)]
struct Plane {
    normal: Vec3,
    w: f32,
}

/// Vertex with position, normal, and UV used during CSG computation.
#[derive(Debug, Clone, Copy)]
struct CsgVertex {
    pos: Vec3,
    normal: Vec3,
    uv: [f32; 2],
}

/// Convex polygon (≥ 3 vertices) lying on a `Plane`.
#[derive(Debug, Clone)]
struct CsgPolygon {
    vertices: Vec<CsgVertex>,
    plane: Plane,
}

/// Classification of a vertex or polygon relative to a plane.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PolySide {
    Coplanar = 0,
    Front = 1,
    Back = 2,
    Spanning = 3, // only for polygons
}

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

impl Plane {
    /// Build a plane from three non-collinear points (CCW winding).
    /// Returns `None` if the triangle is degenerate (zero-area).
    fn from_points(a: Vec3, b: Vec3, c: Vec3) -> Option<Self> {
        let n = (b - a).cross(c - a);
        let len = n.length();
        if len < EPSILON {
            return None;
        }
        let normal = n / len;
        Some(Self {
            normal,
            w: normal.dot(a),
        })
    }

    /// Signed distance from a point to this plane.
    #[inline]
    fn distance(&self, point: Vec3) -> f32 {
        self.normal.dot(point) - self.w
    }

    /// Classify a single point relative to this plane.
    #[inline]
    fn classify_point(&self, point: Vec3) -> PolySide {
        let d = self.distance(point);
        if d > EPSILON {
            PolySide::Front
        } else if d < -EPSILON {
            PolySide::Back
        } else {
            PolySide::Coplanar
        }
    }

    /// Return a negated (flipped) copy.
    fn flip(&self) -> Self {
        Self {
            normal: -self.normal,
            w: -self.w,
        }
    }
}

// ---------------------------------------------------------------------------
// CsgVertex
// ---------------------------------------------------------------------------

impl CsgVertex {
    /// Linearly interpolate between `self` and `other` by parameter `t`.
    fn lerp(&self, other: &Self, t: f32) -> Self {
        Self {
            pos: self.pos.lerp(other.pos, t),
            normal: self.normal.lerp(other.normal, t),
            uv: [
                self.uv[0] + (other.uv[0] - self.uv[0]) * t,
                self.uv[1] + (other.uv[1] - self.uv[1]) * t,
            ],
        }
    }

    /// Return a copy with the normal negated.
    #[allow(dead_code)]
    fn flip(&self) -> Self {
        Self {
            pos: self.pos,
            normal: -self.normal,
            uv: self.uv,
        }
    }
}

// ---------------------------------------------------------------------------
// CsgPolygon
// ---------------------------------------------------------------------------

impl CsgPolygon {
    /// Create a polygon from vertices, computing the plane automatically.
    /// Returns `None` if the polygon is degenerate.
    fn new(vertices: Vec<CsgVertex>) -> Option<Self> {
        if vertices.len() < 3 {
            return None;
        }
        let plane = Plane::from_points(vertices[0].pos, vertices[1].pos, vertices[2].pos)?;
        Some(Self { vertices, plane })
    }

    /// Reverse winding order and negate the plane.
    fn flip(&mut self) {
        self.vertices.reverse();
        for v in &mut self.vertices {
            v.normal = -v.normal;
        }
        self.plane = self.plane.flip();
    }

    /// Split this polygon by `plane`, distributing fragments into the provided
    /// output vectors.
    fn split_by_plane(
        &self,
        plane: &Plane,
        coplanar_front: &mut Vec<CsgPolygon>,
        coplanar_back: &mut Vec<CsgPolygon>,
        front: &mut Vec<CsgPolygon>,
        back: &mut Vec<CsgPolygon>,
    ) {
        // Classify every vertex.
        let mut poly_type = PolySide::Coplanar;
        let types: Vec<PolySide> = self
            .vertices
            .iter()
            .map(|v| {
                let side = plane.classify_point(v.pos);
                // Accumulate polygon-level classification via bitwise OR.
                poly_type = match (poly_type, side) {
                    (PolySide::Coplanar, s) => s,
                    (s, PolySide::Coplanar) => s,
                    (PolySide::Front, PolySide::Front) => PolySide::Front,
                    (PolySide::Back, PolySide::Back) => PolySide::Back,
                    _ => PolySide::Spanning,
                };
                side
            })
            .collect();

        match poly_type {
            PolySide::Coplanar => {
                if plane.normal.dot(self.plane.normal) > 0.0 {
                    coplanar_front.push(self.clone());
                } else {
                    coplanar_back.push(self.clone());
                }
            }
            PolySide::Front => {
                front.push(self.clone());
            }
            PolySide::Back => {
                back.push(self.clone());
            }
            PolySide::Spanning => {
                let mut f_verts: Vec<CsgVertex> = Vec::new();
                let mut b_verts: Vec<CsgVertex> = Vec::new();
                let n = self.vertices.len();

                for i in 0..n {
                    let j = (i + 1) % n;
                    let ti = types[i];
                    let tj = types[j];
                    let vi = &self.vertices[i];
                    let vj = &self.vertices[j];

                    if ti != PolySide::Back {
                        f_verts.push(*vi);
                    }
                    if ti != PolySide::Front {
                        b_verts.push(*vi);
                    }

                    // Edge crosses the plane — compute intersection.
                    if (ti == PolySide::Front && tj == PolySide::Back)
                        || (ti == PolySide::Back && tj == PolySide::Front)
                    {
                        let di = plane.distance(vi.pos);
                        let dj = plane.distance(vj.pos);
                        let t = di / (di - dj);
                        let mid = vi.lerp(vj, t);
                        f_verts.push(mid);
                        b_verts.push(mid);
                    }
                }

                if f_verts.len() >= 3 {
                    if let Some(p) = CsgPolygon::new(f_verts) {
                        front.push(p);
                    }
                }
                if b_verts.len() >= 3 {
                    if let Some(p) = CsgPolygon::new(b_verts) {
                        back.push(p);
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// CsgNode — BSP tree
// ---------------------------------------------------------------------------

/// BSP tree node used to clip polygon sets against each other.
struct CsgNode {
    plane: Option<Plane>,
    front: Option<Box<CsgNode>>,
    back: Option<Box<CsgNode>>,
    polygons: Vec<CsgPolygon>,
}

impl CsgNode {
    /// Create an empty node.
    fn new() -> Self {
        Self {
            plane: None,
            front: None,
            back: None,
            polygons: Vec::new(),
        }
    }

    /// Build a BSP tree from a polygon list.
    fn from_polygons(polygons: Vec<CsgPolygon>) -> Self {
        let mut node = Self::new();
        if !polygons.is_empty() {
            node.build(polygons);
        }
        node
    }

    /// Invert the entire BSP tree (inside ↔ outside).
    fn invert(&mut self) {
        for poly in &mut self.polygons {
            poly.flip();
        }
        if let Some(ref mut plane) = self.plane {
            *plane = plane.flip();
        }
        if let Some(ref mut front) = self.front {
            front.invert();
        }
        if let Some(ref mut back) = self.back {
            back.invert();
        }
        std::mem::swap(&mut self.front, &mut self.back);
    }

    /// Recursively remove all polygons in `polygons` that are inside this BSP tree.
    fn clip_polygons(&self, polygons: &[CsgPolygon]) -> Vec<CsgPolygon> {
        let plane = match &self.plane {
            Some(p) => p,
            None => return polygons.to_vec(),
        };

        let mut front_list: Vec<CsgPolygon> = Vec::new();
        let mut back_list: Vec<CsgPolygon> = Vec::new();

        for poly in polygons {
            let mut cf = Vec::new();
            let mut cb = Vec::new();
            let mut f = Vec::new();
            let mut b = Vec::new();
            poly.split_by_plane(plane, &mut cf, &mut cb, &mut f, &mut b);
            // Coplanar-front and front both go to front_list.
            front_list.extend(cf);
            front_list.extend(f);
            // Coplanar-back and back both go to back_list.
            back_list.extend(cb);
            back_list.extend(b);
        }

        front_list = match &self.front {
            Some(ref f) => f.clip_polygons(&front_list),
            None => front_list,
        };

        back_list = match &self.back {
            Some(ref b) => b.clip_polygons(&back_list),
            // No back node — discard everything behind the plane.
            None => Vec::new(),
        };

        front_list.extend(back_list);
        front_list
    }

    /// Remove all polygons in this tree that are inside `other`.
    fn clip_to(&mut self, other: &CsgNode) {
        self.polygons = other.clip_polygons(&self.polygons);
        if let Some(ref mut front) = self.front {
            front.clip_to(other);
        }
        if let Some(ref mut back) = self.back {
            back.clip_to(other);
        }
    }

    /// Collect all polygons in this tree (flattened).
    fn all_polygons(&self) -> Vec<CsgPolygon> {
        let mut result = self.polygons.clone();
        if let Some(ref front) = self.front {
            result.extend(front.all_polygons());
        }
        if let Some(ref back) = self.back {
            result.extend(back.all_polygons());
        }
        result
    }

    /// Insert polygons into this BSP tree, splitting as needed.
    fn build(&mut self, polygons: Vec<CsgPolygon>) {
        if polygons.is_empty() {
            return;
        }

        // Pick a splitting plane from the first polygon if we don't have one yet.
        if self.plane.is_none() {
            self.plane = Some(polygons[0].plane);
        }
        let plane = self.plane.unwrap();

        let mut front_list: Vec<CsgPolygon> = Vec::new();
        let mut back_list: Vec<CsgPolygon> = Vec::new();

        for poly in &polygons {
            let mut cf = Vec::new();
            let mut cb = Vec::new();
            let mut f = Vec::new();
            let mut b = Vec::new();
            poly.split_by_plane(&plane, &mut cf, &mut cb, &mut f, &mut b);
            self.polygons.extend(cf);
            self.polygons.extend(cb);
            front_list.extend(f);
            back_list.extend(b);
        }

        if !front_list.is_empty() {
            if self.front.is_none() {
                self.front = Some(Box::new(CsgNode::new()));
            }
            self.front.as_mut().unwrap().build(front_list);
        }

        if !back_list.is_empty() {
            if self.back.is_none() {
                self.back = Some(Box::new(CsgNode::new()));
            }
            self.back.as_mut().unwrap().build(back_list);
        }
    }
}

// ---------------------------------------------------------------------------
// Mesh ↔ polygon conversion
// ---------------------------------------------------------------------------

/// Convert a `ProceduralMesh` into a list of `CsgPolygon`s (one per triangle).
fn mesh_to_polygons(mesh: &ProceduralMesh) -> Vec<CsgPolygon> {
    let mut polygons = Vec::with_capacity(mesh.triangle_count());

    for tri in mesh.indices.chunks_exact(3) {
        let verts: Vec<CsgVertex> = tri
            .iter()
            .map(|&idx| {
                let v = &mesh.vertices[idx as usize];
                CsgVertex {
                    pos: Vec3::from(v.position),
                    normal: Vec3::from(v.normal),
                    uv: v.uv,
                }
            })
            .collect();

        // Skip degenerate triangles.
        if let Some(poly) = CsgPolygon::new(verts) {
            polygons.push(poly);
        }
    }

    polygons
}

/// Convert a list of `CsgPolygon`s back into a `ProceduralMesh`.
///
/// Vertices are deduplicated within `EPSILON` distance to produce a compact
/// index buffer.
fn polygons_to_mesh(polygons: Vec<CsgPolygon>) -> ProceduralMesh {
    let mut vertices: Vec<ProceduralVertex> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    // Simple spatial deduplication. For production workloads a hash map with
    // quantized keys would be faster, but correctness-first here.
    let dedup_eps = EPSILON;

    let mut find_or_insert = |v: &CsgVertex| -> u32 {
        // Linear scan — O(n) per vertex. Acceptable for moderate mesh sizes
        // typical of CSG results.
        for (i, existing) in vertices.iter().enumerate() {
            let ep = Vec3::from(existing.position);
            let en = Vec3::from(existing.normal);
            if (ep - v.pos).length_squared() < dedup_eps * dedup_eps
                && (en - v.normal).length_squared() < dedup_eps * dedup_eps
                && (existing.uv[0] - v.uv[0]).abs() < dedup_eps
                && (existing.uv[1] - v.uv[1]).abs() < dedup_eps
            {
                return i as u32;
            }
        }
        let idx = vertices.len() as u32;
        vertices.push(ProceduralVertex {
            position: v.pos.into(),
            normal: v.normal.into(),
            uv: v.uv,
        });
        idx
    };

    for poly in &polygons {
        if poly.vertices.len() < 3 {
            continue;
        }
        // Fan-triangulate convex polygon (vertex 0 is the pivot).
        let i0 = find_or_insert(&poly.vertices[0]);
        for j in 1..poly.vertices.len() - 1 {
            let i1 = find_or_insert(&poly.vertices[j]);
            let i2 = find_or_insert(&poly.vertices[j + 1]);
            indices.push(i0);
            indices.push(i1);
            indices.push(i2);
        }
    }

    ProceduralMesh { vertices, indices }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Perform a CSG boolean operation on two triangle meshes.
///
/// Both meshes should represent closed (watertight) manifold surfaces for
/// correct results. Non-manifold input may produce visual artefacts but will
/// not panic.
///
/// # Example
///
/// ```ignore
/// let result = boolean_op(&cube_a, &cube_b, CsgOp::Union);
/// ```
pub fn boolean_op(mesh_a: &ProceduralMesh, mesh_b: &ProceduralMesh, op: CsgOp) -> ProceduralMesh {
    let polys_a = mesh_to_polygons(mesh_a);
    let polys_b = mesh_to_polygons(mesh_b);

    if polys_a.is_empty() && polys_b.is_empty() {
        return ProceduralMesh::default();
    }
    if polys_a.is_empty() {
        return match op {
            CsgOp::Union => mesh_b.clone(),
            CsgOp::Difference => ProceduralMesh::default(),
            CsgOp::Intersection => ProceduralMesh::default(),
        };
    }
    if polys_b.is_empty() {
        return match op {
            CsgOp::Union => mesh_a.clone(),
            CsgOp::Difference => mesh_a.clone(),
            CsgOp::Intersection => ProceduralMesh::default(),
        };
    }

    let mut a = CsgNode::from_polygons(polys_a);
    let mut b = CsgNode::from_polygons(polys_b);

    let result_polys = match op {
        CsgOp::Union => {
            a.clip_to(&b);
            b.clip_to(&a);
            b.invert();
            b.clip_to(&a);
            b.invert();
            let mut all = a.all_polygons();
            all.extend(b.all_polygons());
            all
        }
        CsgOp::Difference => {
            a.invert();
            a.clip_to(&b);
            b.clip_to(&a);
            b.invert();
            b.clip_to(&a);
            b.invert();
            let mut all = a.all_polygons();
            all.extend(b.all_polygons());
            // Flip the result since we inverted A at the start.
            for poly in &mut all {
                poly.flip();
            }
            all
        }
        CsgOp::Intersection => {
            a.invert();
            b.clip_to(&a);
            b.invert();
            a.clip_to(&b);
            b.clip_to(&a);
            let mut all = a.all_polygons();
            all.extend(b.all_polygons());
            for poly in &mut all {
                poly.flip();
            }
            all
        }
    };

    polygons_to_mesh(result_polys)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Build an axis-aligned unit cube centered at `center`.
    fn make_cube(center: Vec3) -> ProceduralMesh {
        let h = 0.5_f32;
        let cx = center.x;
        let cy = center.y;
        let cz = center.z;

        // 8 corner positions
        let corners = [
            [cx - h, cy - h, cz + h], // 0: left  bottom front
            [cx + h, cy - h, cz + h], // 1: right bottom front
            [cx + h, cy + h, cz + h], // 2: right top    front
            [cx - h, cy + h, cz + h], // 3: left  top    front
            [cx - h, cy - h, cz - h], // 4: left  bottom back
            [cx + h, cy - h, cz - h], // 5: right bottom back
            [cx + h, cy + h, cz - h], // 6: right top    back
            [cx - h, cy + h, cz - h], // 7: left  top    back
        ];

        // 6 faces × 4 vertices each (unshared for flat normals)
        #[rustfmt::skip]
        let face_defs: &[([usize; 4], [f32; 3])] = &[
            ([0, 1, 2, 3], [ 0.0,  0.0,  1.0]), // front  (+Z)
            ([5, 4, 7, 6], [ 0.0,  0.0, -1.0]), // back   (-Z)
            ([3, 2, 6, 7], [ 0.0,  1.0,  0.0]), // top    (+Y)
            ([4, 5, 1, 0], [ 0.0, -1.0,  0.0]), // bottom (-Y)
            ([1, 5, 6, 2], [ 1.0,  0.0,  0.0]), // right  (+X)
            ([4, 0, 3, 7], [-1.0,  0.0,  0.0]), // left   (-X)
        ];

        let mut vertices = Vec::with_capacity(24);
        let mut indices = Vec::with_capacity(36);

        for (ci, normal) in face_defs {
            let base = vertices.len() as u32;
            for &c in ci {
                vertices.push(ProceduralVertex {
                    position: corners[c],
                    normal: *normal,
                    uv: [0.0, 0.0],
                });
            }
            // Two triangles per quad.
            indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
        }

        ProceduralMesh { vertices, indices }
    }

    // -- Plane tests --------------------------------------------------------

    #[test]
    fn plane_from_points_normal_direction() {
        let a = Vec3::ZERO;
        let b = Vec3::X;
        let c = Vec3::Y;
        let plane = Plane::from_points(a, b, c).expect("should produce a valid plane");
        // Cross product of X × Y = Z
        assert!((plane.normal - Vec3::Z).length() < EPSILON);
        assert!((plane.w - 0.0).abs() < EPSILON);
    }

    #[test]
    fn plane_from_degenerate_returns_none() {
        let a = Vec3::ZERO;
        let b = Vec3::X;
        // Collinear point
        let c = Vec3::X * 2.0;
        assert!(Plane::from_points(a, b, c).is_none());
    }

    // -- Polygon flip -------------------------------------------------------

    #[test]
    fn polygon_flip_negates_plane() {
        let verts = vec![
            CsgVertex { pos: Vec3::ZERO, normal: Vec3::Z, uv: [0.0, 0.0] },
            CsgVertex { pos: Vec3::X, normal: Vec3::Z, uv: [1.0, 0.0] },
            CsgVertex { pos: Vec3::Y, normal: Vec3::Z, uv: [0.0, 1.0] },
        ];
        let mut poly = CsgPolygon::new(verts).unwrap();
        let original_normal = poly.plane.normal;
        poly.flip();
        assert!((poly.plane.normal + original_normal).length() < EPSILON);
        // Normals on vertices should also be negated.
        for v in &poly.vertices {
            assert!((v.normal + Vec3::Z).length() < EPSILON);
        }
    }

    // -- Boolean operation tests --------------------------------------------

    #[test]
    fn union_of_overlapping_cubes() {
        let a = make_cube(Vec3::ZERO);
        let b = make_cube(Vec3::new(0.5, 0.0, 0.0));
        let result = boolean_op(&a, &b, CsgOp::Union);

        assert!(!result.is_empty(), "union should not be empty");
        assert!(
            result.triangle_count() > a.triangle_count(),
            "union should have more triangles than a single cube ({} vs {})",
            result.triangle_count(),
            a.triangle_count(),
        );
    }

    #[test]
    fn difference_of_overlapping_cubes() {
        let a = make_cube(Vec3::ZERO);
        let b = make_cube(Vec3::new(0.5, 0.0, 0.0));
        let union_result = boolean_op(&a, &b, CsgOp::Union);
        let diff_result = boolean_op(&a, &b, CsgOp::Difference);

        assert!(!diff_result.is_empty(), "difference should not be empty");
        assert!(
            diff_result.vertex_count() < union_result.vertex_count(),
            "difference should have fewer vertices than union ({} vs {})",
            diff_result.vertex_count(),
            union_result.vertex_count(),
        );
    }

    #[test]
    fn intersection_of_overlapping_cubes() {
        let a = make_cube(Vec3::ZERO);
        let b = make_cube(Vec3::new(0.5, 0.0, 0.0));
        let result = boolean_op(&a, &b, CsgOp::Intersection);

        assert!(!result.is_empty(), "intersection should not be empty");
        assert!(
            result.triangle_count() > 0,
            "intersection should produce triangles",
        );
    }

    #[test]
    fn union_with_empty_mesh() {
        let a = make_cube(Vec3::ZERO);
        let empty = ProceduralMesh::default();

        let r1 = boolean_op(&a, &empty, CsgOp::Union);
        assert_eq!(r1.vertex_count(), a.vertex_count());

        let r2 = boolean_op(&empty, &a, CsgOp::Union);
        assert_eq!(r2.vertex_count(), a.vertex_count());
    }

    #[test]
    fn difference_with_empty_mesh() {
        let a = make_cube(Vec3::ZERO);
        let empty = ProceduralMesh::default();

        let r1 = boolean_op(&a, &empty, CsgOp::Difference);
        assert_eq!(r1.vertex_count(), a.vertex_count());

        let r2 = boolean_op(&empty, &a, CsgOp::Difference);
        assert!(r2.is_empty());
    }

    #[test]
    fn intersection_with_empty_mesh() {
        let a = make_cube(Vec3::ZERO);
        let empty = ProceduralMesh::default();

        let r1 = boolean_op(&a, &empty, CsgOp::Intersection);
        assert!(r1.is_empty());

        let r2 = boolean_op(&empty, &a, CsgOp::Intersection);
        assert!(r2.is_empty());
    }

    #[test]
    fn non_overlapping_cubes_intersection_is_empty() {
        let a = make_cube(Vec3::ZERO);
        let b = make_cube(Vec3::new(5.0, 0.0, 0.0)); // far apart
        let result = boolean_op(&a, &b, CsgOp::Intersection);
        assert!(
            result.is_empty(),
            "intersection of non-overlapping cubes should be empty",
        );
    }

    #[test]
    fn vertex_lerp_midpoint() {
        let v0 = CsgVertex {
            pos: Vec3::ZERO,
            normal: Vec3::Y,
            uv: [0.0, 0.0],
        };
        let v1 = CsgVertex {
            pos: Vec3::X,
            normal: Vec3::Z,
            uv: [1.0, 1.0],
        };
        let mid = v0.lerp(&v1, 0.5);
        assert!((mid.pos - Vec3::new(0.5, 0.0, 0.0)).length() < EPSILON);
        assert!((mid.uv[0] - 0.5).abs() < EPSILON);
        assert!((mid.uv[1] - 0.5).abs() < EPSILON);
    }
}
