//! Value Interpolation
//!
//! Interpolation functions for different animatable value types.

use super::easing::{Easing, EasingType};

/// Interpolation mode
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum InterpolationMode {
    /// Linear interpolation (default for most properties)
    #[default]
    Linear,
    /// Step interpolation (hold value until next keyframe)
    Step,
    /// Smooth interpolation with automatic tangents
    Smooth,
}

/// Animatable value types
#[derive(Debug, Clone, PartialEq)]
pub enum AnimatableValue {
    /// Single number (opacity, rotation, etc.)
    Number(f64),
    /// 2D point (position, scale, anchor)
    Point2D { x: f64, y: f64 },
    /// 3D point (3D position, rotation)
    Point3D { x: f64, y: f64, z: f64 },
    /// RGBA color
    Color { r: f64, g: f64, b: f64, a: f64 },
    /// Boolean (for discrete properties)
    Bool(bool),
}

impl AnimatableValue {
    /// Create a number value
    pub fn number(v: f64) -> Self {
        AnimatableValue::Number(v)
    }

    /// Create a 2D point value
    pub fn point2d(x: f64, y: f64) -> Self {
        AnimatableValue::Point2D { x, y }
    }

    /// Create a 3D point value
    pub fn point3d(x: f64, y: f64, z: f64) -> Self {
        AnimatableValue::Point3D { x, y, z }
    }

    /// Create a color value
    pub fn color(r: f64, g: f64, b: f64, a: f64) -> Self {
        AnimatableValue::Color { r, g, b, a }
    }

    /// Get as number if applicable
    pub fn as_number(&self) -> Option<f64> {
        match self {
            AnimatableValue::Number(v) => Some(*v),
            _ => None,
        }
    }

    /// Get as point2d if applicable
    pub fn as_point2d(&self) -> Option<(f64, f64)> {
        match self {
            AnimatableValue::Point2D { x, y } => Some((*x, *y)),
            _ => None,
        }
    }

    /// Get as point3d if applicable
    pub fn as_point3d(&self) -> Option<(f64, f64, f64)> {
        match self {
            AnimatableValue::Point3D { x, y, z } => Some((*x, *y, *z)),
            _ => None,
        }
    }

    /// Get as color if applicable
    pub fn as_color(&self) -> Option<(f64, f64, f64, f64)> {
        match self {
            AnimatableValue::Color { r, g, b, a } => Some((*r, *g, *b, *a)),
            _ => None,
        }
    }
}

/// Interpolate between two values
pub fn interpolate_value(
    from: &AnimatableValue,
    to: &AnimatableValue,
    t: f64,
    easing: EasingType,
    mode: InterpolationMode,
) -> AnimatableValue {
    // Handle step interpolation
    if mode == InterpolationMode::Step {
        return if t < 1.0 { from.clone() } else { to.clone() };
    }

    // Apply easing
    let t_eased = Easing::evaluate(easing, t);

    match (from, to) {
        (AnimatableValue::Number(a), AnimatableValue::Number(b)) => {
            AnimatableValue::Number(lerp(*a, *b, t_eased))
        }

        (AnimatableValue::Point2D { x: ax, y: ay }, AnimatableValue::Point2D { x: bx, y: by }) => {
            AnimatableValue::Point2D {
                x: lerp(*ax, *bx, t_eased),
                y: lerp(*ay, *by, t_eased),
            }
        }

        (
            AnimatableValue::Point3D {
                x: ax,
                y: ay,
                z: az,
            },
            AnimatableValue::Point3D {
                x: bx,
                y: by,
                z: bz,
            },
        ) => AnimatableValue::Point3D {
            x: lerp(*ax, *bx, t_eased),
            y: lerp(*ay, *by, t_eased),
            z: lerp(*az, *bz, t_eased),
        },

        (
            AnimatableValue::Color {
                r: ar,
                g: ag,
                b: ab,
                a: aa,
            },
            AnimatableValue::Color {
                r: br,
                g: bg,
                b: bb,
                a: ba,
            },
        ) => AnimatableValue::Color {
            r: lerp(*ar, *br, t_eased),
            g: lerp(*ag, *bg, t_eased),
            b: lerp(*ab, *bb, t_eased),
            a: lerp(*aa, *ba, t_eased),
        },

        (AnimatableValue::Bool(a), AnimatableValue::Bool(b)) => {
            AnimatableValue::Bool(if t_eased < 0.5 { *a } else { *b })
        }

        // Type mismatch - return target value
        _ => to.clone(),
    }
}

/// Linear interpolation
#[inline]
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Interpolate multiple tracks and return a map of property values
#[allow(dead_code)]
pub fn interpolate_tracks(
    tracks: &[super::keyframe::KeyframeTrack],
    time: f64,
) -> std::collections::HashMap<String, AnimatableValue> {
    let mut result = std::collections::HashMap::new();

    for track in tracks {
        if let Some(value) = track.evaluate(time) {
            result.insert(track.property.clone(), value);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lerp_number() {
        let from = AnimatableValue::Number(0.0);
        let to = AnimatableValue::Number(100.0);

        let result = interpolate_value(
            &from,
            &to,
            0.5,
            EasingType::Linear,
            InterpolationMode::Linear,
        );
        assert_eq!(result, AnimatableValue::Number(50.0));
    }

    #[test]
    fn test_lerp_point2d() {
        let from = AnimatableValue::Point2D { x: 0.0, y: 0.0 };
        let to = AnimatableValue::Point2D { x: 100.0, y: 200.0 };

        let result = interpolate_value(
            &from,
            &to,
            0.5,
            EasingType::Linear,
            InterpolationMode::Linear,
        );
        assert_eq!(result, AnimatableValue::Point2D { x: 50.0, y: 100.0 });
    }

    #[test]
    fn test_step_interpolation() {
        let from = AnimatableValue::Number(0.0);
        let to = AnimatableValue::Number(100.0);

        // Before 1.0, should return from value
        let result =
            interpolate_value(&from, &to, 0.5, EasingType::Linear, InterpolationMode::Step);
        assert_eq!(result, AnimatableValue::Number(0.0));

        // At 1.0, should return to value
        let result =
            interpolate_value(&from, &to, 1.0, EasingType::Linear, InterpolationMode::Step);
        assert_eq!(result, AnimatableValue::Number(100.0));
    }

    #[test]
    fn test_eased_interpolation() {
        let from = AnimatableValue::Number(0.0);
        let to = AnimatableValue::Number(100.0);

        let linear = interpolate_value(
            &from,
            &to,
            0.5,
            EasingType::Linear,
            InterpolationMode::Linear,
        );
        let ease_in = interpolate_value(
            &from,
            &to,
            0.5,
            EasingType::EaseInQuad,
            InterpolationMode::Linear,
        );

        // EaseInQuad at 0.5 should be slower (smaller value) than linear
        let linear_val = linear.as_number().unwrap();
        let ease_in_val = ease_in.as_number().unwrap();
        assert!(ease_in_val < linear_val);
    }

    #[test]
    fn test_color_interpolation() {
        let from = AnimatableValue::Color {
            r: 1.0,
            g: 0.0,
            b: 0.0,
            a: 1.0,
        };
        let to = AnimatableValue::Color {
            r: 0.0,
            g: 0.0,
            b: 1.0,
            a: 1.0,
        };

        let result = interpolate_value(
            &from,
            &to,
            0.5,
            EasingType::Linear,
            InterpolationMode::Linear,
        );
        if let AnimatableValue::Color { r, g, b, a } = result {
            assert!((r - 0.5).abs() < 1e-6);
            assert!((g - 0.0).abs() < 1e-6);
            assert!((b - 0.5).abs() < 1e-6);
            assert!((a - 1.0).abs() < 1e-6);
        } else {
            panic!("Expected Color result");
        }
    }
}
