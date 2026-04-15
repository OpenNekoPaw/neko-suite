//! Rotation deformer — pivot-based rotation
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Rotates child vertices around a pivot point by an angle.

use glam::Vec2;

/// Apply rotation deformation to child vertices.
///
/// Rotates all vertices around the `pivot` by `angle_degrees`.
///
/// # Arguments
/// * `pivot` - Center of rotation
/// * `angle_degrees` - Rotation angle in degrees
/// * `child_vertices` - Vertices to rotate
///
/// # Returns
/// Rotated child vertices
pub fn apply_rotation(pivot: Vec2, angle_degrees: f32, child_vertices: &[Vec2]) -> Vec<Vec2> {
    let angle_rad = angle_degrees.to_radians();
    let cos = angle_rad.cos();
    let sin = angle_rad.sin();

    child_vertices
        .iter()
        .map(|v| {
            let relative = *v - pivot;
            let rotated = Vec2::new(
                relative.x * cos - relative.y * sin,
                relative.x * sin + relative.y * cos,
            );
            rotated + pivot
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rotation_zero() {
        let pivot = Vec2::new(5.0, 5.0);
        let vertices = vec![Vec2::new(10.0, 5.0)];
        let result = apply_rotation(pivot, 0.0, &vertices);
        assert!((result[0].x - 10.0).abs() < 1e-5);
        assert!((result[0].y - 5.0).abs() < 1e-5);
    }

    #[test]
    fn test_rotation_90_degrees() {
        let pivot = Vec2::new(0.0, 0.0);
        let vertices = vec![Vec2::new(1.0, 0.0)];
        let result = apply_rotation(pivot, 90.0, &vertices);
        assert!(result[0].x.abs() < 1e-5);
        assert!((result[0].y - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_rotation_180_degrees() {
        let pivot = Vec2::new(0.0, 0.0);
        let vertices = vec![Vec2::new(1.0, 0.0)];
        let result = apply_rotation(pivot, 180.0, &vertices);
        assert!((result[0].x + 1.0).abs() < 1e-5);
        assert!(result[0].y.abs() < 1e-5);
    }

    #[test]
    fn test_rotation_with_pivot() {
        let pivot = Vec2::new(5.0, 5.0);
        let vertices = vec![Vec2::new(10.0, 5.0)]; // 5 units right of pivot
        let result = apply_rotation(pivot, 90.0, &vertices);
        // Should be 5 units above pivot
        assert!((result[0].x - 5.0).abs() < 1e-4);
        assert!((result[0].y - 10.0).abs() < 1e-4);
    }

    #[test]
    fn test_rotation_multiple_vertices() {
        let pivot = Vec2::ZERO;
        let vertices = vec![
            Vec2::new(1.0, 0.0),
            Vec2::new(0.0, 1.0),
            Vec2::new(-1.0, 0.0),
        ];
        let result = apply_rotation(pivot, 90.0, &vertices);
        // (1,0) → (0,1)
        assert!(result[0].x.abs() < 1e-5);
        assert!((result[0].y - 1.0).abs() < 1e-5);
        // (0,1) → (-1,0)
        assert!((result[1].x + 1.0).abs() < 1e-5);
        assert!(result[1].y.abs() < 1e-5);
    }

    #[test]
    fn test_rotation_negative_angle() {
        let pivot = Vec2::ZERO;
        let vertices = vec![Vec2::new(1.0, 0.0)];
        let result = apply_rotation(pivot, -90.0, &vertices);
        assert!(result[0].x.abs() < 1e-5);
        assert!((result[0].y + 1.0).abs() < 1e-5);
    }
}
