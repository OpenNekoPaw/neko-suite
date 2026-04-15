//! Key form interpolation engine for MOC3 models
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Provides 1D linear interpolation between discrete key forms driven
//! by a single parameter axis.

use crate::components::KeyFormData;
use glam::Vec2;

/// Interpolate vertex positions between key forms for a given parameter value.
///
/// Key forms must be sorted by `param_value` (ascending).
/// Returns the base mesh vertices if no key forms exist.
///
/// Algorithm:
///   1. If value <= first key form, return first key form's vertices
///   2. If value >= last key form, return last key form's vertices
///   3. Otherwise, find the two surrounding key forms and linearly interpolate
pub fn interpolate_1d(key_forms: &[KeyFormData], param_value: f32) -> Option<Vec<Vec2>> {
    if key_forms.is_empty() {
        return None;
    }

    if key_forms.len() == 1 {
        return Some(key_forms[0].vertices.clone());
    }

    // Clamp to range
    let first = &key_forms[0];
    if param_value <= first.param_value {
        return Some(first.vertices.clone());
    }

    let last = &key_forms[key_forms.len() - 1];
    if param_value >= last.param_value {
        return Some(last.vertices.clone());
    }

    // Find surrounding key forms
    for i in 0..key_forms.len() - 1 {
        let kf0 = &key_forms[i];
        let kf1 = &key_forms[i + 1];

        if param_value >= kf0.param_value && param_value <= kf1.param_value {
            let range = kf1.param_value - kf0.param_value;
            if range.abs() < 1e-10 {
                return Some(kf0.vertices.clone());
            }
            let t = (param_value - kf0.param_value) / range;
            return Some(lerp_vertices(&kf0.vertices, &kf1.vertices, t));
        }
    }

    Some(last.vertices.clone())
}

/// Interpolate a single f32 value between key forms (for rotation deformers).
///
/// Key forms store a single value per vertex entry (angle or position component).
/// Returns the first component of the first vertex as the interpolated scalar.
pub fn interpolate_1d_scalar(key_forms: &[KeyFormData], param_value: f32) -> Option<f32> {
    interpolate_1d(key_forms, param_value).and_then(|verts| verts.first().map(|v| v.x))
}

/// Linearly interpolate between two vertex arrays
fn lerp_vertices(a: &[Vec2], b: &[Vec2], t: f32) -> Vec<Vec2> {
    a.iter()
        .zip(b.iter())
        .map(|(va, vb)| va.lerp(*vb, t))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_key_forms(values: &[(f32, Vec<Vec2>)]) -> Vec<KeyFormData> {
        values
            .iter()
            .map(|(v, verts)| KeyFormData {
                param_value: *v,
                vertices: verts.clone(),
            })
            .collect()
    }

    #[test]
    fn test_interpolate_empty() {
        assert!(interpolate_1d(&[], 0.5).is_none());
    }

    #[test]
    fn test_interpolate_single() {
        let kfs = make_key_forms(&[(0.0, vec![Vec2::new(1.0, 2.0)])]);
        let result = interpolate_1d(&kfs, 0.5).unwrap();
        assert_eq!(result, vec![Vec2::new(1.0, 2.0)]);
    }

    #[test]
    fn test_interpolate_below_min() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0)]),
            (1.0, vec![Vec2::new(10.0, 10.0)]),
        ]);
        let result = interpolate_1d(&kfs, -1.0).unwrap();
        assert_eq!(result, vec![Vec2::new(0.0, 0.0)]);
    }

    #[test]
    fn test_interpolate_above_max() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0)]),
            (1.0, vec![Vec2::new(10.0, 10.0)]),
        ]);
        let result = interpolate_1d(&kfs, 2.0).unwrap();
        assert_eq!(result, vec![Vec2::new(10.0, 10.0)]);
    }

    #[test]
    fn test_interpolate_midpoint() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0)]),
            (1.0, vec![Vec2::new(10.0, 20.0)]),
        ]);
        let result = interpolate_1d(&kfs, 0.5).unwrap();
        assert!((result[0].x - 5.0).abs() < 1e-6);
        assert!((result[0].y - 10.0).abs() < 1e-6);
    }

    #[test]
    fn test_interpolate_quarter() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0)]),
            (1.0, vec![Vec2::new(10.0, 0.0)]),
        ]);
        let result = interpolate_1d(&kfs, 0.25).unwrap();
        assert!((result[0].x - 2.5).abs() < 1e-6);
    }

    #[test]
    fn test_interpolate_three_keyforms() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0)]),
            (0.5, vec![Vec2::new(5.0, 10.0)]),
            (1.0, vec![Vec2::new(0.0, 0.0)]),
        ]);
        // At 0.25: between kf[0] and kf[1], t = 0.5
        let result = interpolate_1d(&kfs, 0.25).unwrap();
        assert!((result[0].x - 2.5).abs() < 1e-6);
        assert!((result[0].y - 5.0).abs() < 1e-6);

        // At 0.75: between kf[1] and kf[2], t = 0.5
        let result = interpolate_1d(&kfs, 0.75).unwrap();
        assert!((result[0].x - 2.5).abs() < 1e-6);
        assert!((result[0].y - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_interpolate_at_exact_keyform() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0)]),
            (0.5, vec![Vec2::new(5.0, 10.0)]),
            (1.0, vec![Vec2::new(10.0, 20.0)]),
        ]);
        let result = interpolate_1d(&kfs, 0.5).unwrap();
        assert!((result[0].x - 5.0).abs() < 1e-6);
        assert!((result[0].y - 10.0).abs() < 1e-6);
    }

    #[test]
    fn test_interpolate_multiple_vertices() {
        let kfs = make_key_forms(&[
            (0.0, vec![Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0)]),
            (1.0, vec![Vec2::new(0.0, 10.0), Vec2::new(10.0, 10.0)]),
        ]);
        let result = interpolate_1d(&kfs, 0.5).unwrap();
        assert_eq!(result.len(), 2);
        assert!((result[0].y - 5.0).abs() < 1e-6);
        assert!((result[1].x - 10.0).abs() < 1e-6);
        assert!((result[1].y - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_lerp_vertices() {
        let a = vec![Vec2::ZERO, Vec2::new(10.0, 0.0)];
        let b = vec![Vec2::new(0.0, 10.0), Vec2::new(10.0, 10.0)];
        let result = lerp_vertices(&a, &b, 0.5);
        assert!((result[0].y - 5.0).abs() < 1e-6);
        assert!((result[1].x - 10.0).abs() < 1e-6);
    }
}
