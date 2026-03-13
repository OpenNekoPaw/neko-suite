//! Animation bridge — bevy_animation-style ParameterCurves driving inox2d parameters
//!
//! Provides a keyframe animation system that maps named animation clips to
//! inox2d parameter values. Each clip contains a set of ParameterCurves;
//! the animation_tick system evaluates them at the current elapsed time
//! and writes results to PuppetParameters before parameter_update runs.
//!
//! This is the bevy_animation ParameterCurve bridge described in ADR-2D-005.

use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

// ─── Public types (serialized to frontend) ───────────────────────────────────

/// Frontend-facing description of an animation clip (list view / playback UI)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationClipInfo {
    pub name: String,
    pub duration_ms: f32,
    pub loop_default: bool,
}

// ─── Internal animation data ─────────────────────────────────────────────────

/// A single keyframe: time position + parameter value
#[derive(Debug, Clone)]
pub struct Keyframe {
    pub time_ms: f32,
    pub value: f32,
}

/// Animation curve for a single inox2d parameter — a sorted list of keyframes
/// evaluated via linear interpolation.
#[derive(Debug, Clone)]
pub struct ParameterCurve {
    /// Name of the inox2d parameter this curve drives
    pub param_name: String,
    /// Keyframes sorted by time_ms (ascending)
    pub keyframes: Vec<Keyframe>,
}

impl ParameterCurve {
    /// Sample the curve at `time_ms` using linear interpolation.
    pub fn sample(&self, time_ms: f32) -> f32 {
        let kfs = &self.keyframes;
        if kfs.is_empty() {
            return 0.0;
        }
        if kfs.len() == 1 {
            return kfs[0].value;
        }
        let last = kfs.last().unwrap();
        if time_ms >= last.time_ms {
            return last.value;
        }
        let first = &kfs[0];
        if time_ms <= first.time_ms {
            return first.value;
        }
        for i in 0..kfs.len() - 1 {
            let a = &kfs[i];
            let b = &kfs[i + 1];
            if time_ms >= a.time_ms && time_ms <= b.time_ms {
                let t = (time_ms - a.time_ms) / (b.time_ms - a.time_ms);
                return a.value + t * (b.value - a.value);
            }
        }
        last.value
    }
}

/// An animation clip — a named collection of ParameterCurves with a total duration
#[derive(Debug, Clone)]
pub struct AnimationClip {
    pub name: String,
    pub duration_ms: f32,
    pub loop_default: bool,
    pub curves: Vec<ParameterCurve>,
}

impl AnimationClip {
    /// Convert to the frontend-facing info struct
    pub fn info(&self) -> AnimationClipInfo {
        AnimationClipInfo {
            name: self.name.clone(),
            duration_ms: self.duration_ms,
            loop_default: self.loop_default,
        }
    }
}

// ─── ECS Components ───────────────────────────────────────────────────────────

/// ECS component: stores all animation clips on the puppet root entity
#[derive(Debug, Default, Component)]
pub struct AnimationLibrary {
    pub clips: Vec<AnimationClip>,
}

/// ECS component: tracks current animation playback state on the puppet root entity
#[derive(Debug, Default, Component)]
pub struct AnimationPlayback {
    /// Index into AnimationLibrary.clips for the currently active clip
    pub clip_index: Option<usize>,
    /// Elapsed time within the current clip (milliseconds)
    pub elapsed_ms: f32,
    /// Whether playback is active
    pub playing: bool,
    /// Whether the clip should loop when it reaches its end
    pub looping: bool,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_curve(name: &str, keyframes: Vec<(f32, f32)>) -> ParameterCurve {
        ParameterCurve {
            param_name: name.to_string(),
            keyframes: keyframes
                .into_iter()
                .map(|(t, v)| Keyframe { time_ms: t, value: v })
                .collect(),
        }
    }

    #[test]
    fn test_sample_empty() {
        let c = make_curve("x", vec![]);
        assert_eq!(c.sample(0.0), 0.0);
    }

    #[test]
    fn test_sample_single_keyframe() {
        let c = make_curve("x", vec![(0.0, 0.5)]);
        assert_eq!(c.sample(0.0), 0.5);
        assert_eq!(c.sample(100.0), 0.5);
    }

    #[test]
    fn test_sample_before_start() {
        let c = make_curve("x", vec![(100.0, 1.0), (200.0, 2.0)]);
        assert_eq!(c.sample(0.0), 1.0);
    }

    #[test]
    fn test_sample_after_end() {
        let c = make_curve("x", vec![(0.0, 0.0), (100.0, 1.0)]);
        assert_eq!(c.sample(200.0), 1.0);
    }

    #[test]
    fn test_sample_midpoint() {
        let c = make_curve("x", vec![(0.0, 0.0), (100.0, 1.0)]);
        let v = c.sample(50.0);
        assert!((v - 0.5).abs() < 1e-6, "expected 0.5, got {}", v);
    }

    #[test]
    fn test_sample_quarter() {
        let c = make_curve("x", vec![(0.0, 0.0), (100.0, 1.0)]);
        let v = c.sample(25.0);
        assert!((v - 0.25).abs() < 1e-6, "expected 0.25, got {}", v);
    }

    #[test]
    fn test_animation_clip_info() {
        let clip = AnimationClip {
            name: "blink".to_string(),
            duration_ms: 500.0,
            loop_default: true,
            curves: vec![],
        };
        let info = clip.info();
        assert_eq!(info.name, "blink");
        assert_eq!(info.duration_ms, 500.0);
        assert!(info.loop_default);
    }

    #[test]
    fn test_animation_library_default() {
        let lib = AnimationLibrary::default();
        assert!(lib.clips.is_empty());
    }

    #[test]
    fn test_animation_playback_default() {
        let pb = AnimationPlayback::default();
        assert!(pb.clip_index.is_none());
        assert_eq!(pb.elapsed_ms, 0.0);
        assert!(!pb.playing);
        assert!(!pb.looping);
    }
}
