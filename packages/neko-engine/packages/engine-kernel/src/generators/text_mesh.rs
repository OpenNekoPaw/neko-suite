//! 3D text mesh extrusion via `cosmic-text` glyph outlines.
//!
//! Pipeline:
//! ```text
//! TextMeshParams
//!   → [cosmic-text layout] → glyph runs
//!   → [swash outline]      → bezier contours per glyph
//!   → [flatten + triangulate + extrude] → ProceduralMesh
//! ```

use std::collections::HashMap;

use glam::Vec2;
use neko_runtime_scene::procedural_mesh::{ProceduralMesh, ProceduralVertex};
use serde::{Deserialize, Serialize};

use cosmic_text::{
    Attrs, Buffer as CosmicBuffer, CacheKeyFlags, Family, FontSystem, Metrics, Shaping, SwashCache,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Parameters for 3D text mesh generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextMeshParams {
    /// The text string to extrude.
    pub text: String,
    /// Font size in pixels (default 48.0).
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Extrusion depth along +Z (default 0.5).
    #[serde(default = "default_extrusion_depth")]
    pub extrusion_depth: f32,
    /// Optional line-height multiplier (defaults to 1.2).
    pub line_height: Option<f32>,
    /// Bezier flattening tolerance in font units (default 0.5).
    #[serde(default = "default_tolerance")]
    pub tolerance: f32,
}

fn default_font_size() -> f32 {
    48.0
}
fn default_extrusion_depth() -> f32 {
    0.5
}
fn default_tolerance() -> f32 {
    0.5
}

impl Default for TextMeshParams {
    fn default() -> Self {
        Self {
            text: String::new(),
            font_size: default_font_size(),
            extrusion_depth: default_extrusion_depth(),
            line_height: None,
            tolerance: default_tolerance(),
        }
    }
}

/// Errors that can occur during text mesh generation.
#[derive(Debug, thiserror::Error)]
pub enum TextMeshError {
    #[error("Empty text")]
    EmptyText,
    #[error("No glyphs produced from layout")]
    NoGlyphs,
    #[error("Triangulation failed: {0}")]
    TriangulationFailed(String),
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Generate a 3D [`ProceduralMesh`] from text parameters.
///
/// Creates its own `FontSystem` internally. For repeated calls consider
/// [`generate_text_mesh_with`] which accepts a shared font system.
pub fn generate_text_mesh(params: &TextMeshParams) -> Result<ProceduralMesh, TextMeshError> {
    let mut font_system = FontSystem::new();
    let mut swash_cache = SwashCache::new();
    generate_text_mesh_with(params, &mut font_system, &mut swash_cache)
}

/// Generate a 3D [`ProceduralMesh`] from text, reusing an existing font system.
pub fn generate_text_mesh_with(
    params: &TextMeshParams,
    font_system: &mut FontSystem,
    swash_cache: &mut SwashCache,
) -> Result<ProceduralMesh, TextMeshError> {
    if params.text.is_empty() {
        return Err(TextMeshError::EmptyText);
    }

    let line_height = params.font_size * params.line_height.unwrap_or(1.2);
    let metrics = Metrics::new(params.font_size, line_height);

    // Layout the text
    let mut buffer = CosmicBuffer::new(font_system, metrics);
    buffer.set_size(font_system, None, None);
    buffer.set_text(
        font_system,
        &params.text,
        Attrs::new().family(Family::SansSerif),
        Shaping::Advanced,
    );
    buffer.shape_until_scroll(font_system, false);

    // Collect glyph outlines as contours
    let mut all_contours: Vec<Vec<Vec2>> = Vec::new();
    let mut glyph_count = 0u32;

    // De-duplicate: same (font_id, glyph_id, font_size) should reuse the
    // same outline, only translated. Use CacheKey (with zero subpixel bins)
    // to avoid a direct fontdb dependency.
    let mut outline_cache: HashMap<cosmic_text::CacheKey, Vec<Vec<Vec2>>> = HashMap::new();

    for run in buffer.layout_runs() {
        for glyph in run.glyphs {
            glyph_count += 1;

            // Glyph position in layout space (pixels, Y-down)
            let gx = glyph.x + glyph.x_offset * glyph.font_size;
            let gy = run.line_y + glyph.y_offset * glyph.font_size;

            // Build a CacheKey for outline extraction (no subpixel binning needed)
            let ck = cosmic_text::CacheKey {
                font_id: glyph.font_id,
                glyph_id: glyph.glyph_id,
                font_size_bits: glyph.font_size.to_bits(),
                x_bin: cosmic_text::SubpixelBin::Zero,
                y_bin: cosmic_text::SubpixelBin::Zero,
                flags: CacheKeyFlags::empty(),
            };

            let base_contours = if let Some(cached) = outline_cache.get(&ck) {
                cached.clone()
            } else {
                let contours = match swash_cache.get_outline_commands(font_system, ck) {
                    Some(commands) => commands_to_contours(commands, params.tolerance),
                    None => Vec::new(),
                };
                outline_cache.insert(ck, contours.clone());
                contours
            };

            // Translate contours to glyph position and flip Y (font Y-up → mesh Y-up)
            for contour in &base_contours {
                if contour.len() < 3 {
                    continue;
                }
                let translated: Vec<Vec2> = contour
                    .iter()
                    .map(|p| Vec2::new(p.x + gx, -(p.y + gy)))
                    .collect();
                all_contours.push(translated);
            }
        }
    }

    if glyph_count == 0 {
        return Err(TextMeshError::NoGlyphs);
    }

    // Build the mesh from contours
    let mut mesh = ProceduralMesh::default();
    let half_depth = params.extrusion_depth * 0.5;

    for contour in &all_contours {
        // Triangulate front face
        let face_indices = match ear_clip_triangulate(contour) {
            Ok(indices) => indices,
            Err(_) => continue, // Skip degenerate contours
        };

        let base = mesh.vertices.len() as u32;
        let n = contour.len() as u32;

        // --- Front face (z = +half_depth, normal = +Z) ---
        for p in contour {
            mesh.vertices.push(ProceduralVertex {
                position: [p.x, p.y, half_depth],
                normal: [0.0, 0.0, 1.0],
                uv: [0.0, 0.0], // UV computed below
            });
        }

        // --- Back face (z = -half_depth, normal = -Z) ---
        for p in contour {
            mesh.vertices.push(ProceduralVertex {
                position: [p.x, p.y, -half_depth],
                normal: [0.0, 0.0, -1.0],
                uv: [0.0, 0.0],
            });
        }

        // Front face indices (CCW when viewed from +Z)
        for tri in face_indices.chunks_exact(3) {
            mesh.indices.push(base + tri[0]);
            mesh.indices.push(base + tri[1]);
            mesh.indices.push(base + tri[2]);
        }

        // Back face indices (reversed winding)
        let back_base = base + n;
        for tri in face_indices.chunks_exact(3) {
            mesh.indices.push(back_base + tri[0]);
            mesh.indices.push(back_base + tri[2]);
            mesh.indices.push(back_base + tri[1]);
        }

        // --- Side walls ---
        let _wall_base = mesh.vertices.len() as u32;
        let len = contour.len();
        for i in 0..len {
            let j = (i + 1) % len;
            let p0 = contour[i];
            let p1 = contour[j];

            // Edge direction and outward normal (2D, then extend to 3D)
            let edge = p1 - p0;
            let normal_2d = Vec2::new(edge.y, -edge.x).normalize_or_zero();
            let normal = [normal_2d.x, normal_2d.y, 0.0];

            let wi = mesh.vertices.len() as u32;

            // Four vertices per edge quad: front-left, front-right, back-right, back-left
            mesh.vertices.push(ProceduralVertex {
                position: [p0.x, p0.y, half_depth],
                normal,
                uv: [0.0, 0.0],
            });
            mesh.vertices.push(ProceduralVertex {
                position: [p1.x, p1.y, half_depth],
                normal,
                uv: [1.0, 0.0],
            });
            mesh.vertices.push(ProceduralVertex {
                position: [p1.x, p1.y, -half_depth],
                normal,
                uv: [1.0, 1.0],
            });
            mesh.vertices.push(ProceduralVertex {
                position: [p0.x, p0.y, -half_depth],
                normal,
                uv: [0.0, 1.0],
            });

            // Two triangles per quad
            mesh.indices
                .extend_from_slice(&[wi, wi + 1, wi + 2, wi, wi + 2, wi + 3]);
        }
    }

    // Compute UVs for front/back faces based on bounding box
    if !all_contours.is_empty() {
        compute_planar_uvs(&mut mesh);
    }

    // Recompute smooth normals for side walls would blur the sharp edges,
    // so we keep per-face normals as-is.

    Ok(mesh)
}

// ---------------------------------------------------------------------------
// Outline → contours
// ---------------------------------------------------------------------------

/// Convert swash outline commands to closed polyline contours.
fn commands_to_contours(commands: &[cosmic_text::Command], tolerance: f32) -> Vec<Vec<Vec2>> {
    let mut contours: Vec<Vec<Vec2>> = Vec::new();
    let mut current: Vec<Vec2> = Vec::new();
    let mut cursor = Vec2::ZERO;

    for cmd in commands {
        match *cmd {
            cosmic_text::Command::MoveTo(p) => {
                // Close previous contour if non-empty
                if current.len() >= 3 {
                    contours.push(std::mem::take(&mut current));
                } else {
                    current.clear();
                }
                cursor = Vec2::new(p.x, p.y);
                current.push(cursor);
            }
            cosmic_text::Command::LineTo(p) => {
                cursor = Vec2::new(p.x, p.y);
                current.push(cursor);
            }
            cosmic_text::Command::QuadTo(ctrl, end) => {
                let p0 = cursor;
                let p1 = Vec2::new(ctrl.x, ctrl.y);
                let p2 = Vec2::new(end.x, end.y);
                flatten_quad(p0, p1, p2, tolerance, &mut current);
                cursor = p2;
            }
            cosmic_text::Command::CurveTo(c1, c2, end) => {
                let p0 = cursor;
                let p1 = Vec2::new(c1.x, c1.y);
                let p2 = Vec2::new(c2.x, c2.y);
                let p3 = Vec2::new(end.x, end.y);
                flatten_cubic(p0, p1, p2, p3, tolerance, &mut current);
                cursor = p3;
            }
            cosmic_text::Command::Close => {
                if current.len() >= 3 {
                    contours.push(std::mem::take(&mut current));
                } else {
                    current.clear();
                }
            }
        }
    }

    // Handle unclosed contour
    if current.len() >= 3 {
        contours.push(current);
    }

    contours
}

// ---------------------------------------------------------------------------
// Bezier flattening
// ---------------------------------------------------------------------------

/// Flatten a quadratic bezier curve by adaptive subdivision.
fn flatten_quad(p0: Vec2, p1: Vec2, p2: Vec2, tolerance: f32, out: &mut Vec<Vec2>) {
    flatten_quad_recursive(p0, p1, p2, tolerance * tolerance, 0, out);
}

fn flatten_quad_recursive(
    p0: Vec2,
    p1: Vec2,
    p2: Vec2,
    tol_sq: f32,
    depth: u32,
    out: &mut Vec<Vec2>,
) {
    const MAX_DEPTH: u32 = 16;
    if depth >= MAX_DEPTH {
        out.push(p2);
        return;
    }

    // Check if the control point is close enough to the midpoint of p0-p2
    let mid = (p0 + p2) * 0.5;
    let deviation = p1 - mid;
    if deviation.length_squared() <= tol_sq {
        out.push(p2);
        return;
    }

    // De Casteljau subdivision at t=0.5
    let p01 = (p0 + p1) * 0.5;
    let p12 = (p1 + p2) * 0.5;
    let p012 = (p01 + p12) * 0.5;

    flatten_quad_recursive(p0, p01, p012, tol_sq, depth + 1, out);
    flatten_quad_recursive(p012, p12, p2, tol_sq, depth + 1, out);
}

/// Flatten a cubic bezier curve by adaptive subdivision.
fn flatten_cubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: f32, out: &mut Vec<Vec2>) {
    flatten_cubic_recursive(p0, p1, p2, p3, tolerance * tolerance, 0, out);
}

fn flatten_cubic_recursive(
    p0: Vec2,
    p1: Vec2,
    p2: Vec2,
    p3: Vec2,
    tol_sq: f32,
    depth: u32,
    out: &mut Vec<Vec2>,
) {
    const MAX_DEPTH: u32 = 16;
    if depth >= MAX_DEPTH {
        out.push(p3);
        return;
    }

    // Check flatness: distance of control points from the chord p0→p3
    let d1 = point_line_dist_sq(p1, p0, p3);
    let d2 = point_line_dist_sq(p2, p0, p3);
    if d1 <= tol_sq && d2 <= tol_sq {
        out.push(p3);
        return;
    }

    // De Casteljau subdivision at t=0.5
    let p01 = (p0 + p1) * 0.5;
    let p12 = (p1 + p2) * 0.5;
    let p23 = (p2 + p3) * 0.5;
    let p012 = (p01 + p12) * 0.5;
    let p123 = (p12 + p23) * 0.5;
    let p0123 = (p012 + p123) * 0.5;

    flatten_cubic_recursive(p0, p01, p012, p0123, tol_sq, depth + 1, out);
    flatten_cubic_recursive(p0123, p123, p23, p3, tol_sq, depth + 1, out);
}

/// Squared distance from point `p` to the line through `a` and `b`.
fn point_line_dist_sq(p: Vec2, a: Vec2, b: Vec2) -> f32 {
    let ab = b - a;
    let ap = p - a;
    let len_sq = ab.length_squared();
    if len_sq < 1e-12 {
        return ap.length_squared();
    }
    let cross = ab.x * ap.y - ab.y * ap.x;
    (cross * cross) / len_sq
}

// ---------------------------------------------------------------------------
// Ear-clipping triangulation
// ---------------------------------------------------------------------------

/// Simple ear-clipping triangulation for a 2D polygon.
///
/// Returns triangle indices into the contour array.
/// The contour must be a simple polygon (no self-intersection).
/// Handles both CW and CCW winding.
pub fn ear_clip_triangulate(contour: &[Vec2]) -> Result<Vec<u32>, TextMeshError> {
    let n = contour.len();
    if n < 3 {
        return Err(TextMeshError::TriangulationFailed(
            "Contour has fewer than 3 vertices".into(),
        ));
    }

    // Determine winding (positive area = CCW in standard math coords)
    let area = signed_area(contour);
    if area.abs() < 1e-10 {
        return Err(TextMeshError::TriangulationFailed(
            "Degenerate contour (zero area)".into(),
        ));
    }

    if n == 3 {
        return Ok(vec![0, 1, 2]);
    }

    let ccw = area > 0.0;

    let mut indices: Vec<u32> = Vec::with_capacity((n - 2) * 3);
    let mut remaining: Vec<usize> = (0..n).collect();

    let mut iterations = 0u32;
    let max_iterations = (n * n) as u32; // Safety bound

    while remaining.len() > 3 {
        let len = remaining.len();
        let mut ear_found = false;

        for i in 0..len {
            let prev = if i == 0 { len - 1 } else { i - 1 };
            let next = if i == len - 1 { 0 } else { i + 1 };

            let a = contour[remaining[prev]];
            let b = contour[remaining[i]];
            let c = contour[remaining[next]];

            // Check if this is a convex vertex (an "ear tip")
            let cross = (b - a).perp_dot(c - b);
            let is_convex = if ccw { cross > 0.0 } else { cross < 0.0 };
            if !is_convex {
                continue;
            }

            // Check that no other remaining vertex lies inside the triangle
            let mut any_inside = false;
            for j in 0..len {
                if j == prev || j == i || j == next {
                    continue;
                }
                if point_in_triangle(contour[remaining[j]], a, b, c) {
                    any_inside = true;
                    break;
                }
            }

            if !any_inside {
                // Clip this ear
                indices.push(remaining[prev] as u32);
                indices.push(remaining[i] as u32);
                indices.push(remaining[next] as u32);
                remaining.remove(i);
                ear_found = true;
                break;
            }
        }

        if !ear_found {
            // Fallback: unable to find an ear (self-intersecting polygon?)
            return Err(TextMeshError::TriangulationFailed(
                "No ear found — polygon may be self-intersecting".into(),
            ));
        }

        iterations += 1;
        if iterations > max_iterations {
            return Err(TextMeshError::TriangulationFailed(
                "Exceeded iteration limit".into(),
            ));
        }
    }

    // Last triangle
    if remaining.len() == 3 {
        indices.push(remaining[0] as u32);
        indices.push(remaining[1] as u32);
        indices.push(remaining[2] as u32);
    }

    Ok(indices)
}

/// Signed area of a 2D polygon (positive = CCW in standard math coords).
fn signed_area(contour: &[Vec2]) -> f32 {
    let n = contour.len();
    let mut area = 0.0f32;
    for i in 0..n {
        let j = (i + 1) % n;
        area += contour[i].x * contour[j].y;
        area -= contour[j].x * contour[i].y;
    }
    area * 0.5
}

/// Check if point `p` is inside triangle `(a, b, c)` using barycentric coordinates.
fn point_in_triangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2) -> bool {
    let v0 = c - a;
    let v1 = b - a;
    let v2 = p - a;

    let dot00 = v0.dot(v0);
    let dot01 = v0.dot(v1);
    let dot02 = v0.dot(v2);
    let dot11 = v1.dot(v1);
    let dot12 = v1.dot(v2);

    let inv_denom = 1.0 / (dot00 * dot11 - dot01 * dot01);
    let u = (dot11 * dot02 - dot01 * dot12) * inv_denom;
    let v = (dot00 * dot12 - dot01 * dot02) * inv_denom;

    // Strictly inside (not on edge) to avoid false positives on shared edges
    u > 0.0 && v > 0.0 && (u + v) < 1.0
}

// ---------------------------------------------------------------------------
// UV computation
// ---------------------------------------------------------------------------

/// Compute planar UV mapping for front/back face vertices based on bounding box.
fn compute_planar_uvs(mesh: &mut ProceduralMesh) {
    if mesh.vertices.is_empty() {
        return;
    }

    // Find XY bounding box
    let mut min_x = f32::MAX;
    let mut min_y = f32::MAX;
    let mut max_x = f32::MIN;
    let mut max_y = f32::MIN;

    for v in &mesh.vertices {
        min_x = min_x.min(v.position[0]);
        min_y = min_y.min(v.position[1]);
        max_x = max_x.max(v.position[0]);
        max_y = max_y.max(v.position[1]);
    }

    let range_x = max_x - min_x;
    let range_y = max_y - min_y;

    if range_x < 1e-10 || range_y < 1e-10 {
        return;
    }

    // Only apply to front/back face vertices (normal.z != 0)
    for v in &mut mesh.vertices {
        if v.normal[2].abs() > 0.5 {
            v.uv[0] = (v.position[0] - min_x) / range_x;
            v.uv[1] = (v.position[1] - min_y) / range_y;
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_returns_error() {
        let params = TextMeshParams {
            text: String::new(),
            ..Default::default()
        };
        let result = generate_text_mesh(&params);
        assert!(matches!(result, Err(TextMeshError::EmptyText)));
    }

    #[test]
    fn ear_clip_triangle() {
        // A simple triangle should produce exactly 1 triangle (3 indices)
        let tri = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(0.5, 1.0),
        ];
        let indices = ear_clip_triangulate(&tri).unwrap();
        assert_eq!(indices.len(), 3, "triangle should produce 3 indices");
    }

    #[test]
    fn ear_clip_square() {
        // A CCW square should produce 2 triangles (6 indices)
        let square = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(0.0, 1.0),
        ];
        let indices = ear_clip_triangulate(&square).unwrap();
        assert_eq!(indices.len(), 6, "square should produce 6 indices (2 tris)");
    }

    #[test]
    fn ear_clip_cw_square() {
        // CW winding should also work
        let square = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(0.0, 1.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(1.0, 0.0),
        ];
        let indices = ear_clip_triangulate(&square).unwrap();
        assert_eq!(indices.len(), 6);
    }

    #[test]
    fn ear_clip_pentagon() {
        // Regular pentagon: 5 vertices → 3 triangles → 9 indices
        let pentagon: Vec<Vec2> = (0..5)
            .map(|i| {
                let angle = std::f32::consts::TAU * i as f32 / 5.0;
                Vec2::new(angle.cos(), angle.sin())
            })
            .collect();
        let indices = ear_clip_triangulate(&pentagon).unwrap();
        assert_eq!(
            indices.len(),
            9,
            "pentagon should produce 9 indices (3 tris)"
        );
    }

    #[test]
    fn ear_clip_too_few_vertices() {
        let pts = vec![Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
        assert!(ear_clip_triangulate(&pts).is_err());
    }

    #[test]
    fn ear_clip_degenerate_collinear() {
        // All points on a line → zero area → error
        let pts = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(2.0, 0.0),
        ];
        assert!(ear_clip_triangulate(&pts).is_err());
    }

    #[test]
    fn flatten_quad_produces_points() {
        let p0 = Vec2::new(0.0, 0.0);
        let p1 = Vec2::new(0.5, 1.0);
        let p2 = Vec2::new(1.0, 0.0);
        let mut out = Vec::new();
        flatten_quad(p0, p1, p2, 0.1, &mut out);
        assert!(!out.is_empty(), "flattened quad should have points");
        // Last point should be close to p2
        let last = out.last().unwrap();
        assert!((last.x - p2.x).abs() < 1e-5);
        assert!((last.y - p2.y).abs() < 1e-5);
    }

    #[test]
    fn flatten_cubic_produces_points() {
        let p0 = Vec2::new(0.0, 0.0);
        let p1 = Vec2::new(0.25, 1.0);
        let p2 = Vec2::new(0.75, 1.0);
        let p3 = Vec2::new(1.0, 0.0);
        let mut out = Vec::new();
        flatten_cubic(p0, p1, p2, p3, 0.1, &mut out);
        assert!(!out.is_empty(), "flattened cubic should have points");
        let last = out.last().unwrap();
        assert!((last.x - p3.x).abs() < 1e-5);
        assert!((last.y - p3.y).abs() < 1e-5);
    }

    #[test]
    fn generate_letter_a_produces_mesh() {
        // This test requires system fonts — skip on headless CI if no fonts available.
        let params = TextMeshParams {
            text: "A".into(),
            font_size: 48.0,
            extrusion_depth: 0.5,
            ..Default::default()
        };
        match generate_text_mesh(&params) {
            Ok(mesh) => {
                assert!(!mesh.is_empty(), "mesh for 'A' should not be empty");
                assert!(mesh.triangle_count() > 0, "mesh should have triangles");
                // Validate all indices
                let vc = mesh.vertex_count() as u32;
                for &idx in &mesh.indices {
                    assert!(idx < vc, "index {idx} out of bounds (vc={vc})");
                }
            }
            Err(TextMeshError::NoGlyphs) => {
                // Acceptable on systems without SansSerif fonts
            }
            Err(e) => panic!("unexpected error: {e}"),
        }
    }

    #[test]
    fn signed_area_ccw_square() {
        let square = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(0.0, 1.0),
        ];
        let area = signed_area(&square);
        assert!(
            (area - 1.0).abs() < 1e-6,
            "CCW unit square area should be 1.0"
        );
    }

    #[test]
    fn signed_area_cw_square() {
        let square = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(0.0, 1.0),
            Vec2::new(1.0, 1.0),
            Vec2::new(1.0, 0.0),
        ];
        let area = signed_area(&square);
        assert!(
            (area + 1.0).abs() < 1e-6,
            "CW unit square area should be -1.0"
        );
    }

    #[test]
    fn params_serde_roundtrip() {
        let params = TextMeshParams {
            text: "Hello".into(),
            font_size: 36.0,
            extrusion_depth: 1.0,
            line_height: Some(1.5),
            tolerance: 0.25,
        };
        let json = serde_json::to_string(&params).unwrap();
        let parsed: TextMeshParams = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.text, "Hello");
        assert!((parsed.font_size - 36.0).abs() < 1e-6);
        assert!((parsed.extrusion_depth - 1.0).abs() < 1e-6);
        assert_eq!(parsed.line_height, Some(1.5));
    }

    #[test]
    fn params_default_serde() {
        // Only providing text — other fields should get defaults
        let json = r#"{"text":"Hi"}"#;
        let parsed: TextMeshParams = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.text, "Hi");
        assert!((parsed.font_size - 48.0).abs() < 1e-6);
        assert!((parsed.extrusion_depth - 0.5).abs() < 1e-6);
        assert_eq!(parsed.line_height, None);
    }
}
