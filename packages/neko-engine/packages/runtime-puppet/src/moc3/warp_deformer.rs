//! Warp deformer — grid-based mesh distortion
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Implements bilinear interpolation within a control point grid to
//! distort child vertices.

use glam::Vec2;

/// Apply warp deformation to child vertices using the control point grid.
///
/// The control point grid has (rows+1) × (columns+1) points.
/// Each child vertex is mapped to a grid cell via its normalized position
/// in the bounding box of the original (rest-state) control points,
/// then bilinearly interpolated within the deformed cell.
///
/// # Arguments
/// * `rest_control_points` - Original control points at rest state
/// * `deformed_control_points` - Current deformed control points
/// * `rows` - Number of grid rows
/// * `columns` - Number of grid columns
/// * `child_vertices` - Vertices to deform
///
/// # Returns
/// Deformed child vertices
pub fn apply_warp(
    rest_control_points: &[Vec2],
    deformed_control_points: &[Vec2],
    rows: u32,
    columns: u32,
    child_vertices: &[Vec2],
) -> Vec<Vec2> {
    let grid_w = (columns + 1) as usize;
    let grid_h = (rows + 1) as usize;
    let expected = grid_w * grid_h;

    if rest_control_points.len() < expected || deformed_control_points.len() < expected {
        return child_vertices.to_vec();
    }

    // Compute bounding box of rest control points
    let (min_bound, max_bound) = bounding_box(rest_control_points);
    let extent = max_bound - min_bound;
    if extent.x.abs() < 1e-10 || extent.y.abs() < 1e-10 {
        return child_vertices.to_vec();
    }

    child_vertices
        .iter()
        .map(|v| {
            // Normalize vertex position to [0, 1] within the bounding box
            let norm_x = ((v.x - min_bound.x) / extent.x).clamp(0.0, 1.0);
            let norm_y = ((v.y - min_bound.y) / extent.y).clamp(0.0, 1.0);

            // Map to grid cell
            let gx = norm_x * columns as f32;
            let gy = norm_y * rows as f32;

            let col = (gx as usize).min(columns as usize - 1);
            let row = (gy as usize).min(rows as usize - 1);

            // Local interpolation within the cell [0, 1]
            let tx = gx - col as f32;
            let ty = gy - row as f32;

            // Four corners of the deformed grid cell
            let p00 = deformed_control_points[row * grid_w + col];
            let p10 = deformed_control_points[row * grid_w + col + 1];
            let p01 = deformed_control_points[(row + 1) * grid_w + col];
            let p11 = deformed_control_points[(row + 1) * grid_w + col + 1];

            // Bilinear interpolation
            bilinear(p00, p10, p01, p11, tx, ty)
        })
        .collect()
}

/// Bilinear interpolation of four corner values
fn bilinear(p00: Vec2, p10: Vec2, p01: Vec2, p11: Vec2, tx: f32, ty: f32) -> Vec2 {
    let top = p00.lerp(p10, tx);
    let bottom = p01.lerp(p11, tx);
    top.lerp(bottom, ty)
}

/// Compute axis-aligned bounding box
fn bounding_box(points: &[Vec2]) -> (Vec2, Vec2) {
    let mut min = Vec2::splat(f32::MAX);
    let mut max = Vec2::splat(f32::MIN);
    for p in points {
        min = min.min(*p);
        max = max.max(*p);
    }
    (min, max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bilinear_corners() {
        let p00 = Vec2::new(0.0, 0.0);
        let p10 = Vec2::new(10.0, 0.0);
        let p01 = Vec2::new(0.0, 10.0);
        let p11 = Vec2::new(10.0, 10.0);

        assert_eq!(bilinear(p00, p10, p01, p11, 0.0, 0.0), p00);
        assert_eq!(bilinear(p00, p10, p01, p11, 1.0, 0.0), p10);
        assert_eq!(bilinear(p00, p10, p01, p11, 0.0, 1.0), p01);
        assert_eq!(bilinear(p00, p10, p01, p11, 1.0, 1.0), p11);
    }

    #[test]
    fn test_bilinear_center() {
        let p00 = Vec2::new(0.0, 0.0);
        let p10 = Vec2::new(10.0, 0.0);
        let p01 = Vec2::new(0.0, 10.0);
        let p11 = Vec2::new(10.0, 10.0);

        let center = bilinear(p00, p10, p01, p11, 0.5, 0.5);
        assert!((center.x - 5.0).abs() < 1e-6);
        assert!((center.y - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_apply_warp_identity() {
        // 2x2 grid (1 row, 1 col) → 4 control points
        let rest = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(0.0, 10.0),
            Vec2::new(10.0, 10.0),
        ];
        // Deformed = same as rest → no deformation
        let deformed = rest.clone();
        let child = vec![Vec2::new(5.0, 5.0)];

        let result = apply_warp(&rest, &deformed, 1, 1, &child);
        assert!((result[0].x - 5.0).abs() < 1e-5);
        assert!((result[0].y - 5.0).abs() < 1e-5);
    }

    #[test]
    fn test_apply_warp_shift() {
        // 1x1 grid (2x2 control points)
        let rest = vec![
            Vec2::new(0.0, 0.0),
            Vec2::new(10.0, 0.0),
            Vec2::new(0.0, 10.0),
            Vec2::new(10.0, 10.0),
        ];
        // Shift entire grid by (5, 0)
        let deformed = vec![
            Vec2::new(5.0, 0.0),
            Vec2::new(15.0, 0.0),
            Vec2::new(5.0, 10.0),
            Vec2::new(15.0, 10.0),
        ];
        let child = vec![Vec2::new(5.0, 5.0)];

        let result = apply_warp(&rest, &deformed, 1, 1, &child);
        assert!((result[0].x - 10.0).abs() < 1e-5);
        assert!((result[0].y - 5.0).abs() < 1e-5);
    }

    #[test]
    fn test_apply_warp_2x2_grid() {
        // 2x2 grid = 3x3 control points
        let rest = vec![
            Vec2::new(0.0, 0.0), Vec2::new(5.0, 0.0), Vec2::new(10.0, 0.0),
            Vec2::new(0.0, 5.0), Vec2::new(5.0, 5.0), Vec2::new(10.0, 5.0),
            Vec2::new(0.0, 10.0), Vec2::new(5.0, 10.0), Vec2::new(10.0, 10.0),
        ];
        // Move center control point
        let mut deformed = rest.clone();
        deformed[4] = Vec2::new(7.0, 7.0); // center moves from (5,5) to (7,7)

        let child = vec![Vec2::new(5.0, 5.0)]; // at center
        let result = apply_warp(&rest, &deformed, 2, 2, &child);
        // Center vertex should move toward the new center control point
        assert!(result[0].x > 5.0);
        assert!(result[0].y > 5.0);
    }

    #[test]
    fn test_apply_warp_insufficient_points() {
        let rest = vec![Vec2::ZERO];
        let deformed = vec![Vec2::ZERO];
        let child = vec![Vec2::new(5.0, 5.0)];
        let result = apply_warp(&rest, &deformed, 1, 1, &child);
        assert_eq!(result, child); // passthrough
    }

    #[test]
    fn test_bounding_box() {
        let points = vec![
            Vec2::new(-5.0, 3.0),
            Vec2::new(10.0, -2.0),
            Vec2::new(0.0, 8.0),
        ];
        let (min, max) = bounding_box(&points);
        assert_eq!(min, Vec2::new(-5.0, -2.0));
        assert_eq!(max, Vec2::new(10.0, 8.0));
    }
}
