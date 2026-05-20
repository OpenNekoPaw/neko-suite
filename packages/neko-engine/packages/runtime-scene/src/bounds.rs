//! Shared 3D bounds primitives for scene authoring contracts.

use glam::{Mat4, Vec3};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct SceneBounds3 {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

impl SceneBounds3 {
    pub fn new(min: [f32; 3], max: [f32; 3]) -> Self {
        let min_vec = Vec3::from(min);
        let max_vec = Vec3::from(max);
        Self::from_vec3(min_vec.min(max_vec), min_vec.max(max_vec))
    }

    pub fn from_vec3(min: Vec3, max: Vec3) -> Self {
        Self {
            min: min.to_array(),
            max: max.to_array(),
        }
    }

    pub fn union(self, other: Self) -> Self {
        Self::from_vec3(
            Vec3::from(self.min).min(Vec3::from(other.min)),
            Vec3::from(self.max).max(Vec3::from(other.max)),
        )
    }

    pub fn transform(self, matrix: Mat4) -> Self {
        let min = Vec3::from(self.min);
        let max = Vec3::from(self.max);
        let corners = [
            Vec3::new(min.x, min.y, min.z),
            Vec3::new(min.x, min.y, max.z),
            Vec3::new(min.x, max.y, min.z),
            Vec3::new(min.x, max.y, max.z),
            Vec3::new(max.x, min.y, min.z),
            Vec3::new(max.x, min.y, max.z),
            Vec3::new(max.x, max.y, min.z),
            Vec3::new(max.x, max.y, max.z),
        ];

        let mut transformed_min = Vec3::splat(f32::INFINITY);
        let mut transformed_max = Vec3::splat(f32::NEG_INFINITY);
        for corner in corners {
            let transformed = matrix.transform_point3(corner);
            transformed_min = transformed_min.min(transformed);
            transformed_max = transformed_max.max(transformed);
        }

        Self::from_vec3(transformed_min, transformed_max)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transform_bounds_includes_all_corners_after_rotation() {
        let bounds = SceneBounds3::new([-1.0, 0.0, -2.0], [1.0, 2.0, 2.0]);
        let matrix = Mat4::from_rotation_y(std::f32::consts::FRAC_PI_2);

        let transformed = bounds.transform(matrix);

        assert!((transformed.min[0] + 2.0).abs() < 1e-5);
        assert!((transformed.max[0] - 2.0).abs() < 1e-5);
        assert_eq!(transformed.min[1], 0.0);
        assert_eq!(transformed.max[1], 2.0);
        assert!((transformed.min[2] + 1.0).abs() < 1e-5);
        assert!((transformed.max[2] - 1.0).abs() < 1e-5);
    }
}
