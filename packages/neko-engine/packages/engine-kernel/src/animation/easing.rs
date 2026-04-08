//! Easing Functions — re-exported from neko-types shared crate
//!
//! The canonical implementation lives in `neko_types::easing`.
//! This module re-exports for backward compatibility.

pub use neko_types::easing::{Easing, EasingType};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear() {
        assert!((Easing::evaluate(EasingType::Linear, 0.0) - 0.0).abs() < 1e-6);
        assert!((Easing::evaluate(EasingType::Linear, 0.5) - 0.5).abs() < 1e-6);
        assert!((Easing::evaluate(EasingType::Linear, 1.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_ease_in_quad() {
        assert!((Easing::evaluate(EasingType::EaseInQuad, 0.0) - 0.0).abs() < 1e-6);
        assert!((Easing::evaluate(EasingType::EaseInQuad, 0.5) - 0.25).abs() < 1e-6);
        assert!((Easing::evaluate(EasingType::EaseInQuad, 1.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_easing_from_str() {
        assert_eq!(EasingType::from_name("linear"), EasingType::Linear);
        assert_eq!(EasingType::from_name("easeInQuad"), EasingType::EaseInQuad);
        assert_eq!(
            EasingType::from_name("ease_out_cubic"),
            EasingType::EaseOutCubic
        );
        assert_eq!(EasingType::from_name("unknown"), EasingType::Linear);
    }

    #[test]
    fn test_cubic_bezier() {
        let result = Easing::evaluate(EasingType::CubicBezier(0.25, 0.1, 0.25, 1.0), 0.5);
        assert!(result > 0.5, "CSS ease should be faster than linear at 0.5");
    }

    #[test]
    fn test_bounce() {
        let result = Easing::evaluate(EasingType::EaseOutBounce, 0.9);
        assert!(result > 0.9);
    }
}
