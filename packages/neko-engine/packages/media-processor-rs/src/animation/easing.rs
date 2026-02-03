//! Easing Functions
//!
//! Implementation of standard easing curves for animations.
//! Compatible with CSS easing and After Effects style curves.

use std::f64::consts::PI;

/// Easing function types
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub enum EasingType {
    // Linear
    #[default]
    Linear,
    // Quad
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    // Cubic
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    // Quart
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    // Quint
    EaseInQuint,
    EaseOutQuint,
    EaseInOutQuint,
    // Sine
    EaseInSine,
    EaseOutSine,
    EaseInOutSine,
    // Expo
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    // Circ
    EaseInCirc,
    EaseOutCirc,
    EaseInOutCirc,
    // Back
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    // Elastic
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    // Bounce
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
    // Custom cubic bezier
    CubicBezier(f64, f64, f64, f64), // x1, y1, x2, y2
}

impl EasingType {
    /// Parse easing type from string
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "linear" => EasingType::Linear,
            "easeinquad" | "ease_in_quad" => EasingType::EaseInQuad,
            "easeoutquad" | "ease_out_quad" => EasingType::EaseOutQuad,
            "easeinoutquad" | "ease_in_out_quad" => EasingType::EaseInOutQuad,
            "easeincubic" | "ease_in_cubic" => EasingType::EaseInCubic,
            "easeoutcubic" | "ease_out_cubic" => EasingType::EaseOutCubic,
            "easeinoutcubic" | "ease_in_out_cubic" => EasingType::EaseInOutCubic,
            "easeinquart" | "ease_in_quart" => EasingType::EaseInQuart,
            "easeoutquart" | "ease_out_quart" => EasingType::EaseOutQuart,
            "easeinoutquart" | "ease_in_out_quart" => EasingType::EaseInOutQuart,
            "easeinquint" | "ease_in_quint" => EasingType::EaseInQuint,
            "easeoutquint" | "ease_out_quint" => EasingType::EaseOutQuint,
            "easeinoutquint" | "ease_in_out_quint" => EasingType::EaseInOutQuint,
            "easeinsine" | "ease_in_sine" => EasingType::EaseInSine,
            "easeoutsine" | "ease_out_sine" => EasingType::EaseOutSine,
            "easeinoutsine" | "ease_in_out_sine" => EasingType::EaseInOutSine,
            "easeinexpo" | "ease_in_expo" => EasingType::EaseInExpo,
            "easeoutexpo" | "ease_out_expo" => EasingType::EaseOutExpo,
            "easeinoutexpo" | "ease_in_out_expo" => EasingType::EaseInOutExpo,
            "easeincirc" | "ease_in_circ" => EasingType::EaseInCirc,
            "easeoutcirc" | "ease_out_circ" => EasingType::EaseOutCirc,
            "easeinoutcirc" | "ease_in_out_circ" => EasingType::EaseInOutCirc,
            "easeinback" | "ease_in_back" => EasingType::EaseInBack,
            "easeoutback" | "ease_out_back" => EasingType::EaseOutBack,
            "easeinoutback" | "ease_in_out_back" => EasingType::EaseInOutBack,
            "easeinelastic" | "ease_in_elastic" => EasingType::EaseInElastic,
            "easeoutelastic" | "ease_out_elastic" => EasingType::EaseOutElastic,
            "easeinoutelastic" | "ease_in_out_elastic" => EasingType::EaseInOutElastic,
            "easeinbounce" | "ease_in_bounce" => EasingType::EaseInBounce,
            "easeoutbounce" | "ease_out_bounce" => EasingType::EaseOutBounce,
            "easeinoutbounce" | "ease_in_out_bounce" => EasingType::EaseInOutBounce,
            _ => EasingType::Linear,
        }
    }
}

/// Easing function evaluation
pub struct Easing;

impl Easing {
    /// Evaluate easing function at time t (0.0 - 1.0)
    pub fn evaluate(easing: EasingType, t: f64) -> f64 {
        let t = t.clamp(0.0, 1.0);

        match easing {
            EasingType::Linear => t,

            // Quad
            EasingType::EaseInQuad => t * t,
            EasingType::EaseOutQuad => t * (2.0 - t),
            EasingType::EaseInOutQuad => {
                if t < 0.5 {
                    2.0 * t * t
                } else {
                    -1.0 + (4.0 - 2.0 * t) * t
                }
            }

            // Cubic
            EasingType::EaseInCubic => t * t * t,
            EasingType::EaseOutCubic => {
                let t1 = t - 1.0;
                t1 * t1 * t1 + 1.0
            }
            EasingType::EaseInOutCubic => {
                if t < 0.5 {
                    4.0 * t * t * t
                } else {
                    let t1 = 2.0 * t - 2.0;
                    (t1 * t1 * t1 + 2.0) / 2.0
                }
            }

            // Quart
            EasingType::EaseInQuart => t * t * t * t,
            EasingType::EaseOutQuart => {
                let t1 = t - 1.0;
                1.0 - t1 * t1 * t1 * t1
            }
            EasingType::EaseInOutQuart => {
                if t < 0.5 {
                    8.0 * t * t * t * t
                } else {
                    let t1 = t - 1.0;
                    1.0 - 8.0 * t1 * t1 * t1 * t1
                }
            }

            // Quint
            EasingType::EaseInQuint => t * t * t * t * t,
            EasingType::EaseOutQuint => {
                let t1 = t - 1.0;
                t1 * t1 * t1 * t1 * t1 + 1.0
            }
            EasingType::EaseInOutQuint => {
                if t < 0.5 {
                    16.0 * t * t * t * t * t
                } else {
                    let t1 = 2.0 * t - 2.0;
                    (t1 * t1 * t1 * t1 * t1 + 2.0) / 2.0
                }
            }

            // Sine
            EasingType::EaseInSine => 1.0 - (t * PI / 2.0).cos(),
            EasingType::EaseOutSine => (t * PI / 2.0).sin(),
            EasingType::EaseInOutSine => -(PI * t).cos() / 2.0 + 0.5,

            // Expo
            EasingType::EaseInExpo => {
                if t == 0.0 {
                    0.0
                } else {
                    (2.0_f64).powf(10.0 * (t - 1.0))
                }
            }
            EasingType::EaseOutExpo => {
                if t == 1.0 {
                    1.0
                } else {
                    1.0 - (2.0_f64).powf(-10.0 * t)
                }
            }
            EasingType::EaseInOutExpo => {
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else if t < 0.5 {
                    (2.0_f64).powf(20.0 * t - 10.0) / 2.0
                } else {
                    (2.0 - (2.0_f64).powf(-20.0 * t + 10.0)) / 2.0
                }
            }

            // Circ
            EasingType::EaseInCirc => 1.0 - (1.0 - t * t).sqrt(),
            EasingType::EaseOutCirc => (1.0 - (t - 1.0) * (t - 1.0)).sqrt(),
            EasingType::EaseInOutCirc => {
                if t < 0.5 {
                    (1.0 - (1.0 - 4.0 * t * t).sqrt()) / 2.0
                } else {
                    let t1 = -2.0 * t + 2.0;
                    ((1.0 - t1 * t1).sqrt() + 1.0) / 2.0
                }
            }

            // Back
            EasingType::EaseInBack => {
                let c1 = 1.70158;
                let c3 = c1 + 1.0;
                c3 * t * t * t - c1 * t * t
            }
            EasingType::EaseOutBack => {
                let c1 = 1.70158;
                let c3 = c1 + 1.0;
                let t1 = t - 1.0;
                1.0 + c3 * t1 * t1 * t1 + c1 * t1 * t1
            }
            EasingType::EaseInOutBack => {
                let c1 = 1.70158;
                let c2 = c1 * 1.525;
                if t < 0.5 {
                    (4.0 * t * t * ((c2 + 1.0) * 2.0 * t - c2)) / 2.0
                } else {
                    let t1 = 2.0 * t - 2.0;
                    (t1 * t1 * ((c2 + 1.0) * t1 + c2) + 2.0) / 2.0
                }
            }

            // Elastic
            EasingType::EaseInElastic => {
                let c4 = 2.0 * PI / 3.0;
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else {
                    -(2.0_f64).powf(10.0 * t - 10.0) * ((t * 10.0 - 10.75) * c4).sin()
                }
            }
            EasingType::EaseOutElastic => {
                let c4 = 2.0 * PI / 3.0;
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else {
                    (2.0_f64).powf(-10.0 * t) * ((t * 10.0 - 0.75) * c4).sin() + 1.0
                }
            }
            EasingType::EaseInOutElastic => {
                let c5 = 2.0 * PI / 4.5;
                if t == 0.0 {
                    0.0
                } else if t == 1.0 {
                    1.0
                } else if t < 0.5 {
                    -(2.0_f64).powf(20.0 * t - 10.0) * ((20.0 * t - 11.125) * c5).sin() / 2.0
                } else {
                    (2.0_f64).powf(-20.0 * t + 10.0) * ((20.0 * t - 11.125) * c5).sin() / 2.0 + 1.0
                }
            }

            // Bounce
            EasingType::EaseInBounce => 1.0 - Self::bounce_out(1.0 - t),
            EasingType::EaseOutBounce => Self::bounce_out(t),
            EasingType::EaseInOutBounce => {
                if t < 0.5 {
                    (1.0 - Self::bounce_out(1.0 - 2.0 * t)) / 2.0
                } else {
                    (1.0 + Self::bounce_out(2.0 * t - 1.0)) / 2.0
                }
            }

            // Cubic Bezier
            EasingType::CubicBezier(x1, y1, x2, y2) => {
                Self::cubic_bezier(t, x1, y1, x2, y2)
            }
        }
    }

    /// Bounce easing out helper
    fn bounce_out(t: f64) -> f64 {
        let n1 = 7.5625;
        let d1 = 2.75;

        if t < 1.0 / d1 {
            n1 * t * t
        } else if t < 2.0 / d1 {
            let t = t - 1.5 / d1;
            n1 * t * t + 0.75
        } else if t < 2.5 / d1 {
            let t = t - 2.25 / d1;
            n1 * t * t + 0.9375
        } else {
            let t = t - 2.625 / d1;
            n1 * t * t + 0.984375
        }
    }

    /// Cubic bezier easing
    fn cubic_bezier(t: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
        // Newton-Raphson iteration to find t for x
        let mut t_approx = t;
        for _ in 0..8 {
            let x = Self::bezier_calc(t_approx, x1, x2) - t;
            if x.abs() < 1e-6 {
                break;
            }
            let dx = Self::bezier_derivative(t_approx, x1, x2);
            if dx.abs() < 1e-6 {
                break;
            }
            t_approx -= x / dx;
        }

        Self::bezier_calc(t_approx, y1, y2)
    }

    /// Calculate bezier value at t
    fn bezier_calc(t: f64, p1: f64, p2: f64) -> f64 {
        let t2 = t * t;
        let t3 = t2 * t;
        let mt = 1.0 - t;
        let mt2 = mt * mt;

        3.0 * mt2 * t * p1 + 3.0 * mt * t2 * p2 + t3
    }

    /// Calculate bezier derivative at t
    fn bezier_derivative(t: f64, p1: f64, p2: f64) -> f64 {
        let t2 = t * t;
        let mt = 1.0 - t;

        3.0 * mt * mt * p1 + 6.0 * mt * t * (p2 - p1) + 3.0 * t2 * (1.0 - p2)
    }
}

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
    fn test_ease_out_quad() {
        assert!((Easing::evaluate(EasingType::EaseOutQuad, 0.0) - 0.0).abs() < 1e-6);
        assert!((Easing::evaluate(EasingType::EaseOutQuad, 0.5) - 0.75).abs() < 1e-6);
        assert!((Easing::evaluate(EasingType::EaseOutQuad, 1.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_easing_from_str() {
        assert_eq!(EasingType::from_str("linear"), EasingType::Linear);
        assert_eq!(EasingType::from_str("easeInQuad"), EasingType::EaseInQuad);
        assert_eq!(EasingType::from_str("ease_out_cubic"), EasingType::EaseOutCubic);
        assert_eq!(EasingType::from_str("unknown"), EasingType::Linear);
    }

    #[test]
    fn test_cubic_bezier() {
        // CSS ease: cubic-bezier(0.25, 0.1, 0.25, 1)
        let result = Easing::evaluate(EasingType::CubicBezier(0.25, 0.1, 0.25, 1.0), 0.5);
        assert!(result > 0.5, "CSS ease should be faster than linear at 0.5");
    }

    #[test]
    fn test_bounce() {
        let result = Easing::evaluate(EasingType::EaseOutBounce, 0.9);
        // Should bounce near the end
        assert!(result > 0.9);
    }
}
