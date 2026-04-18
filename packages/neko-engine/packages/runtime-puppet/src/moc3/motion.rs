//! Motion support — .motion3.json parsing
//!
//! Based on OpenL2D MOC3 Spec v1.0, not derived from Cubism SDK.
//! Parses Live2D motion files (.motion3.json) and converts them into
//! the format-agnostic AnimationClip used by the existing animation system.
//!
//! Bezier curve segments are sampled at 30fps into linear keyframes
//! to avoid modifying the existing EasingType system.

use crate::animation::{AnimationClip, Keyframe, ParameterCurve};
use neko_engine_types::easing::EasingType;
use serde::{Deserialize, Serialize};

// ─── .motion3.json format ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct Motion3Json {
    #[serde(rename = "Meta")]
    meta: Motion3Meta,
    #[serde(rename = "Curves", default)]
    curves: Vec<Motion3Curve>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Motion3Meta {
    #[serde(rename = "Duration")]
    duration: f32,
    #[serde(rename = "Fps", default = "default_fps")]
    fps: f32,
    #[serde(rename = "Loop", default)]
    r#loop: bool,
    #[serde(rename = "FadeInTime", default)]
    fade_in_time: f32,
    #[serde(rename = "FadeOutTime", default)]
    fade_out_time: f32,
}

#[derive(Debug, Serialize, Deserialize)]
struct Motion3Curve {
    #[serde(rename = "Target")]
    target: String,
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Segments")]
    segments: Vec<f32>,
    #[serde(rename = "FadeInTime", default)]
    fade_in_time: f32,
    #[serde(rename = "FadeOutTime", default)]
    fade_out_time: f32,
}

fn default_fps() -> f32 {
    30.0
}

// ─── Segment types ───────────────────────────────────────────────────────────
// Segment format: [start_value, type, ...type-specific data]
// Type 0: Linear — next point is (time, value)
// Type 1: Bezier — next points are (cx1, cy1, cx2, cy2, x, y)
// Type 2: Stepped — value holds until next point (time, value)
// Type 3: Inverse Stepped — jump immediately to next value

const SEGMENT_LINEAR: i32 = 0;
const SEGMENT_BEZIER: i32 = 1;
const SEGMENT_STEPPED: i32 = 2;
const SEGMENT_INVERSE_STEPPED: i32 = 3;

/// Parse a .motion3.json string into an AnimationClip.
pub fn parse_motion(name: &str, json_str: &str) -> Result<AnimationClip, String> {
    let raw: Motion3Json = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse motion3.json: {}", e))?;

    let duration_ms = raw.meta.duration * 1000.0;
    let mut clip = AnimationClip::create(name, duration_ms);

    for curve in &raw.curves {
        // Only handle "Parameter" target curves (skip "PartOpacity" etc.)
        if curve.target != "Parameter" {
            continue;
        }

        let keyframes = parse_segments(&curve.segments, raw.meta.fps)?;
        if keyframes.is_empty() {
            continue;
        }

        let param_curve = ParameterCurve {
            param_name: curve.id.clone(),
            keyframes,
        };
        clip.curves.push(param_curve);
    }

    Ok(clip)
}

/// Serialize an AnimationClip back to .motion3.json format.
///
/// Non-linear easings are mapped to Bezier segments (type 1) using standard
/// CSS cubic-bezier control points. Linear easing uses type 0 segments.
pub fn serialize_motion3(clip: &AnimationClip) -> Result<String, String> {
    let duration = clip.duration_ms / 1000.0;

    let curves: Vec<Motion3Curve> = clip
        .curves
        .iter()
        .filter(|c| !c.keyframes.is_empty())
        .map(|curve| {
            let mut segments = Vec::new();
            // First point: [time, value]
            let first = &curve.keyframes[0];
            segments.push(first.time_ms / 1000.0);
            segments.push(first.value);

            // Build segments from consecutive keyframe pairs
            for pair in curve.keyframes.windows(2) {
                let prev = &pair[0];
                let next = &pair[1];
                let t0 = prev.time_ms / 1000.0;
                let v0 = prev.value;
                let t1 = next.time_ms / 1000.0;
                let v1 = next.value;

                if let Some((cx1, cy1, cx2, cy2)) = easing_to_bezier(&prev.easing) {
                    // Bezier segment: [type, cx1, cy1, cx2, cy2, end_time, end_value]
                    // Control points in time-value domain
                    let dt = t1 - t0;
                    let dv = v1 - v0;
                    segments.push(SEGMENT_BEZIER as f32);
                    segments.push(t0 + dt * cx1);
                    segments.push(v0 + dv * cy1);
                    segments.push(t0 + dt * cx2);
                    segments.push(v0 + dv * cy2);
                    segments.push(t1);
                    segments.push(v1);
                } else {
                    // Linear segment: [type, end_time, end_value]
                    segments.push(SEGMENT_LINEAR as f32);
                    segments.push(t1);
                    segments.push(v1);
                }
            }

            Motion3Curve {
                target: "Parameter".to_string(),
                id: curve.param_name.clone(),
                segments,
                fade_in_time: 0.0,
                fade_out_time: 0.0,
            }
        })
        .collect();

    let motion = Motion3Json {
        meta: Motion3Meta {
            duration,
            fps: 30.0,
            r#loop: clip.loop_default,
            fade_in_time: 0.0,
            fade_out_time: 0.0,
        },
        curves,
    };

    serde_json::to_string_pretty(&motion).map_err(|e| format!("Failed to serialize motion3: {e}"))
}

/// Map an EasingType to cubic-bezier control points (cx1, cy1, cx2, cy2).
/// Returns None for Linear (use type 0 segment instead).
fn easing_to_bezier(easing: &EasingType) -> Option<(f32, f32, f32, f32)> {
    match easing {
        EasingType::Linear => None,
        // Standard CSS cubic-bezier values
        EasingType::EaseInQuad => Some((0.55, 0.085, 0.68, 0.53)),
        EasingType::EaseOutQuad => Some((0.25, 0.46, 0.45, 0.94)),
        EasingType::EaseInOutQuad => Some((0.455, 0.03, 0.515, 0.955)),
        EasingType::EaseInCubic => Some((0.55, 0.055, 0.675, 0.19)),
        EasingType::EaseOutCubic => Some((0.215, 0.61, 0.355, 1.0)),
        EasingType::EaseInOutCubic => Some((0.645, 0.045, 0.355, 1.0)),
        EasingType::EaseInQuart => Some((0.895, 0.03, 0.685, 0.22)),
        EasingType::EaseOutQuart => Some((0.165, 0.84, 0.44, 1.0)),
        EasingType::EaseInOutQuart => Some((0.77, 0.0, 0.175, 1.0)),
        EasingType::EaseInQuint => Some((0.755, 0.05, 0.855, 0.06)),
        EasingType::EaseOutQuint => Some((0.23, 1.0, 0.32, 1.0)),
        EasingType::EaseInOutQuint => Some((0.86, 0.0, 0.07, 1.0)),
        EasingType::EaseInSine => Some((0.47, 0.0, 0.745, 0.715)),
        EasingType::EaseOutSine => Some((0.39, 0.575, 0.565, 1.0)),
        EasingType::EaseInOutSine => Some((0.445, 0.05, 0.55, 0.95)),
        EasingType::EaseInExpo => Some((0.95, 0.05, 0.795, 0.035)),
        EasingType::EaseOutExpo => Some((0.19, 1.0, 0.22, 1.0)),
        EasingType::EaseInOutExpo => Some((1.0, 0.0, 0.0, 1.0)),
        EasingType::EaseInCirc => Some((0.6, 0.04, 0.98, 0.335)),
        EasingType::EaseOutCirc => Some((0.075, 0.82, 0.165, 1.0)),
        EasingType::EaseInOutCirc => Some((0.785, 0.135, 0.15, 0.86)),
        EasingType::EaseInBack => Some((0.6, -0.28, 0.735, 0.045)),
        EasingType::EaseOutBack => Some((0.175, 0.885, 0.32, 1.275)),
        EasingType::EaseInOutBack => Some((0.68, -0.55, 0.265, 1.55)),
        EasingType::CubicBezier(x1, y1, x2, y2) => {
            Some((*x1 as f32, *y1 as f32, *x2 as f32, *y2 as f32))
        }
        // Elastic and Bounce are multi-segment curves that can't be represented
        // as a single cubic-bezier. Fall back to linear — acceptable approximation
        // for motion3 format. If precise fidelity is needed, the caller should
        // pre-sample these keyframes at a higher rate before export.
        EasingType::EaseInElastic
        | EasingType::EaseOutElastic
        | EasingType::EaseInOutElastic
        | EasingType::EaseInBounce
        | EasingType::EaseOutBounce
        | EasingType::EaseInOutBounce => None,
    }
}

/// Parse the flat segments array into keyframes.
///
/// The segments array starts with the initial value, followed by
/// (segment_type, ...data) pairs.
fn parse_segments(segments: &[f32], fps: f32) -> Result<Vec<Keyframe>, String> {
    if segments.len() < 2 {
        return Ok(Vec::new());
    }

    let mut keyframes = Vec::new();
    // First point: (time, value)
    let start_time = segments[0];
    let start_value = segments[1];
    keyframes.push(Keyframe::new(start_time * 1000.0, start_value));
    let mut i = 2;

    let mut prev_time = start_time;
    let mut prev_value = start_value;

    while i < segments.len() {
        let seg_type = segments[i] as i32;
        i += 1;

        match seg_type {
            SEGMENT_LINEAR => {
                if i + 1 >= segments.len() {
                    break;
                }
                let time = segments[i];
                let value = segments[i + 1];
                keyframes.push(Keyframe::new(time * 1000.0, value));
                prev_time = time;
                prev_value = value;
                i += 2;
            }
            SEGMENT_BEZIER => {
                if i + 5 >= segments.len() {
                    break;
                }
                let cx1 = segments[i];
                let cy1 = segments[i + 1];
                let cx2 = segments[i + 2];
                let cy2 = segments[i + 3];
                let end_time = segments[i + 4];
                let end_value = segments[i + 5];

                // Sample bezier at ~30fps intervals
                let duration = end_time - prev_time;
                let sample_interval = 1.0 / fps;
                let num_samples = (duration / sample_interval).ceil() as usize;

                for s in 1..=num_samples {
                    let t = (s as f32 / num_samples as f32).min(1.0);
                    let (sample_time, sample_value) = cubic_bezier(
                        prev_time, prev_value, cx1, cy1, cx2, cy2, end_time, end_value, t,
                    );
                    keyframes.push(Keyframe::new(sample_time * 1000.0, sample_value));
                }

                prev_time = end_time;
                prev_value = end_value;
                i += 6;
            }
            SEGMENT_STEPPED => {
                if i + 1 >= segments.len() {
                    break;
                }
                let time = segments[i];
                let value = segments[i + 1];
                // Hold previous value until just before the new time
                if time > prev_time {
                    keyframes.push(Keyframe::new(time * 1000.0 - 0.001, prev_value));
                }
                keyframes.push(Keyframe::new(time * 1000.0, value));
                prev_time = time;
                prev_value = value;
                i += 2;
            }
            SEGMENT_INVERSE_STEPPED => {
                if i + 1 >= segments.len() {
                    break;
                }
                let time = segments[i];
                let value = segments[i + 1];
                // Jump to new value immediately at previous time
                keyframes.push(Keyframe::new(prev_time * 1000.0 + 0.001, value));
                keyframes.push(Keyframe::new(time * 1000.0, value));
                prev_time = time;
                prev_value = value;
                i += 2;
            }
            _ => {
                // Unknown segment type, skip
                break;
            }
        }
    }

    Ok(keyframes)
}

/// Evaluate a cubic bezier curve at parameter t.
///
/// Control points: P0=(x0,y0), P1=(cx1,cy1), P2=(cx2,cy2), P3=(x3,y3)
#[allow(clippy::too_many_arguments)]
fn cubic_bezier(
    x0: f32,
    y0: f32,
    cx1: f32,
    cy1: f32,
    cx2: f32,
    cy2: f32,
    x3: f32,
    y3: f32,
    t: f32,
) -> (f32, f32) {
    let inv_t = 1.0 - t;
    let inv_t2 = inv_t * inv_t;
    let inv_t3 = inv_t2 * inv_t;
    let t2 = t * t;
    let t3 = t2 * t;

    let x = inv_t3 * x0 + 3.0 * inv_t2 * t * cx1 + 3.0 * inv_t * t2 * cx2 + t3 * x3;
    let y = inv_t3 * y0 + 3.0 * inv_t2 * t * cy1 + 3.0 * inv_t * t2 * cy2 + t3 * y3;
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_motion_basic() {
        let json = r#"{
            "Meta": {
                "Duration": 2.0,
                "Fps": 30,
                "Loop": true
            },
            "Curves": [
                {
                    "Target": "Parameter",
                    "Id": "ParamAngleX",
                    "Segments": [0.0, 0.0, 0, 1.0, 30.0, 0, 2.0, 0.0],
                    "FadeInTime": 0.5,
                    "FadeOutTime": 0.5
                }
            ]
        }"#;
        let clip = parse_motion("wave", json).unwrap();
        assert_eq!(clip.name, "wave");
        assert!((clip.duration_ms - 2000.0).abs() < 1e-3);
        assert_eq!(clip.curves.len(), 1);
        assert_eq!(clip.curves[0].param_name, "ParamAngleX");
        assert!(clip.curves[0].keyframes.len() >= 3);
    }

    #[test]
    fn test_parse_motion_bezier() {
        let json = r#"{
            "Meta": { "Duration": 1.0, "Fps": 30 },
            "Curves": [
                {
                    "Target": "Parameter",
                    "Id": "Param1",
                    "Segments": [0.0, 0.0, 1, 0.25, 0.0, 0.75, 1.0, 1.0, 1.0],
                    "FadeInTime": 0,
                    "FadeOutTime": 0
                }
            ]
        }"#;
        let clip = parse_motion("bezier", json).unwrap();
        assert_eq!(clip.curves.len(), 1);
        // Bezier should produce multiple sampled keyframes
        assert!(clip.curves[0].keyframes.len() > 2);
    }

    #[test]
    fn test_parse_motion_skip_non_parameter() {
        let json = r#"{
            "Meta": { "Duration": 1.0 },
            "Curves": [
                {
                    "Target": "PartOpacity",
                    "Id": "Part1",
                    "Segments": [0.0, 1.0, 0, 1.0, 0.0],
                    "FadeInTime": 0,
                    "FadeOutTime": 0
                }
            ]
        }"#;
        let clip = parse_motion("test", json).unwrap();
        assert_eq!(clip.curves.len(), 0);
    }

    #[test]
    fn test_cubic_bezier_endpoints() {
        let (x, y) = cubic_bezier(0.0, 0.0, 0.25, 0.5, 0.75, 0.5, 1.0, 1.0, 0.0);
        assert!((x - 0.0).abs() < 1e-6);
        assert!((y - 0.0).abs() < 1e-6);

        let (x, y) = cubic_bezier(0.0, 0.0, 0.25, 0.5, 0.75, 0.5, 1.0, 1.0, 1.0);
        assert!((x - 1.0).abs() < 1e-6);
        assert!((y - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_parse_motion_invalid() {
        assert!(parse_motion("bad", "not json").is_err());
    }

    #[test]
    fn test_serialize_motion3_round_trip_linear() {
        let json = r#"{
            "Meta": { "Duration": 2.0, "Fps": 30, "Loop": true },
            "Curves": [{
                "Target": "Parameter",
                "Id": "ParamAngleX",
                "Segments": [0.0, 0.0, 0, 1.0, 30.0, 0, 2.0, 0.0],
                "FadeInTime": 0, "FadeOutTime": 0
            }]
        }"#;
        let clip = parse_motion("wave", json).unwrap();
        let exported = serialize_motion3(&clip).unwrap();
        let re_parsed = parse_motion("wave", &exported).unwrap();

        assert_eq!(re_parsed.name, "wave");
        assert!((re_parsed.duration_ms - clip.duration_ms).abs() < 1.0);
        assert_eq!(re_parsed.curves.len(), clip.curves.len());
        assert_eq!(re_parsed.curves[0].param_name, "ParamAngleX");
        // First and last keyframe values should match
        let orig = &clip.curves[0].keyframes;
        let re = &re_parsed.curves[0].keyframes;
        assert!((orig[0].value - re[0].value).abs() < 1e-3);
        assert!((orig.last().unwrap().value - re.last().unwrap().value).abs() < 1e-3);
    }

    #[test]
    fn test_serialize_motion3_preserves_easing_as_bezier() {
        use crate::animation::{AnimationClip, Keyframe, ParameterCurve};
        use neko_engine_types::easing::EasingType;

        let mut clip = AnimationClip::create("eased", 1000.0);
        let mut kf0 = Keyframe::new(0.0, 0.0);
        kf0.easing = EasingType::EaseInOutCubic;
        let kf1 = Keyframe::new(1000.0, 1.0);
        clip.curves.push(ParameterCurve {
            param_name: "ParamTest".to_string(),
            keyframes: vec![kf0, kf1],
        });

        let exported = serialize_motion3(&clip).unwrap();
        // Should contain a Bezier segment (type 1)
        assert!(exported.contains("1.0,"), "Expected Bezier segment type");
        // Verify the exported JSON can be re-parsed
        let re_parsed = parse_motion("eased", &exported).unwrap();
        assert_eq!(re_parsed.curves.len(), 1);
        // Bezier curve will be sampled to multiple points
        assert!(re_parsed.curves[0].keyframes.len() > 2);
        // Endpoints should match
        let kfs = &re_parsed.curves[0].keyframes;
        assert!((kfs[0].value - 0.0).abs() < 1e-3);
        assert!((kfs.last().unwrap().value - 1.0).abs() < 1e-3);
    }

    #[test]
    fn test_serialize_motion3_empty_clip() {
        let clip = AnimationClip::create("empty", 1000.0);
        let exported = serialize_motion3(&clip).unwrap();
        let re_parsed = parse_motion("empty", &exported).unwrap();
        assert_eq!(re_parsed.curves.len(), 0);
        assert!((re_parsed.duration_ms - 1000.0).abs() < 1.0);
    }

    #[test]
    fn test_parse_segments_empty() {
        let result = parse_segments(&[], 30.0).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_segments_linear() {
        // [start_time, start_value, LINEAR, end_time, end_value]
        let segments = vec![0.0, 0.0, 0.0, 1.0, 10.0];
        let kfs = parse_segments(&segments, 30.0).unwrap();
        assert_eq!(kfs.len(), 2);
        assert!((kfs[0].value - 0.0).abs() < 1e-6);
        assert!((kfs[1].value - 10.0).abs() < 1e-6);
    }

    #[test]
    fn test_parse_segments_stepped() {
        // [start_time, start_value, STEPPED, end_time, end_value]
        let segments = vec![0.0, 5.0, 2.0, 1.0, 10.0];
        let kfs = parse_segments(&segments, 30.0).unwrap();
        // Should have: initial, hold at prev_value just before, then new value
        assert!(kfs.len() >= 2);
        // Last keyframe should be the stepped value
        let last = kfs.last().unwrap();
        assert!((last.value - 10.0).abs() < 1e-6);
    }
}
