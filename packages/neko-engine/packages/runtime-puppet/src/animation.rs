//! Animation bridge — bevy_animation-style ParameterCurves driving inox2d parameters
//!
//! Provides a keyframe animation system that maps named animation clips to
//! inox2d parameter values. Each clip contains a set of ParameterCurves;
//! the animation_tick system evaluates them at the current elapsed time
//! and writes results to PuppetParameters before parameter_update runs.
//!
//! This is the bevy_animation ParameterCurve bridge described in ADR-2D-005.

use bevy_ecs::prelude::*;
use neko_engine_types::easing::{Easing, EasingType};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ─── Public types (serialized to frontend) ───────────────────────────────────

/// Frontend-facing description of an animation clip (list view / playback UI)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationClipInfo {
    pub name: String,
    pub duration_ms: f32,
    pub loop_default: bool,
}

/// Serialized keyframe info returned by keyframe_tracks API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeInfo {
    pub id: String,
    pub time_ms: f32,
    pub value: f32,
    pub easing: String,
}

/// Serialized parameter curve info returned by keyframe_tracks API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterCurveInfo {
    pub param_name: String,
    pub keyframes: Vec<KeyframeInfo>,
}

// ─── Internal animation data ─────────────────────────────────────────────────

/// A single keyframe: time position + parameter value + easing to next keyframe
#[derive(Debug, Clone)]
pub struct Keyframe {
    /// Unique identifier (UUID v4)
    pub id: String,
    /// Time position in milliseconds relative to clip start
    pub time_ms: f32,
    /// Parameter value at this keyframe
    pub value: f32,
    /// Easing function to the next keyframe
    pub easing: EasingType,
}

impl Keyframe {
    /// Create a new keyframe with auto-generated UUID and default Linear easing
    pub fn new(time_ms: f32, value: f32) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            time_ms,
            value,
            easing: EasingType::default(),
        }
    }
}

/// Animation curve for a single inox2d parameter — a sorted list of keyframes
/// evaluated via eased interpolation.
#[derive(Debug, Clone)]
pub struct ParameterCurve {
    /// Name of the inox2d parameter this curve drives
    pub param_name: String,
    /// Keyframes sorted by time_ms (ascending)
    pub keyframes: Vec<Keyframe>,
}

impl ParameterCurve {
    /// Sample the curve at `time_ms` using eased interpolation.
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
                let linear_t = (time_ms - a.time_ms) / (b.time_ms - a.time_ms);
                let eased_t = Easing::evaluate(a.easing, linear_t as f64) as f32;
                return a.value + eased_t * (b.value - a.value);
            }
        }
        last.value
    }

    /// Add a keyframe at the given time/value, maintaining sorted order.
    /// Returns the new keyframe's ID.
    pub fn add_keyframe(&mut self, time_ms: f32, value: f32) -> String {
        let kf = Keyframe::new(time_ms, value);
        let id = kf.id.clone();
        let pos = self.keyframes.partition_point(|k| k.time_ms < time_ms);
        self.keyframes.insert(pos, kf);
        id
    }

    /// Remove a keyframe by ID.
    pub fn remove_keyframe(&mut self, id: &str) -> Result<(), String> {
        let pos = self
            .keyframes
            .iter()
            .position(|k| k.id == id)
            .ok_or_else(|| format!("Keyframe '{}' not found", id))?;
        self.keyframes.remove(pos);
        Ok(())
    }

    /// Update a keyframe by ID. Only provided fields are changed.
    /// Re-sorts if time changed.
    pub fn update_keyframe(
        &mut self,
        id: &str,
        time_ms: Option<f32>,
        value: Option<f32>,
        easing: Option<EasingType>,
    ) -> Result<(), String> {
        let kf = self
            .keyframes
            .iter_mut()
            .find(|k| k.id == id)
            .ok_or_else(|| format!("Keyframe '{}' not found", id))?;

        let time_changed = time_ms.is_some();
        if let Some(t) = time_ms {
            kf.time_ms = t;
        }
        if let Some(v) = value {
            kf.value = v;
        }
        if let Some(e) = easing {
            kf.easing = e;
        }

        // Re-sort if time changed
        if time_changed {
            self.keyframes.sort_by(|a, b| {
                a.time_ms
                    .partial_cmp(&b.time_ms)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        Ok(())
    }

    /// Serialize to frontend-facing ParameterCurveInfo
    pub fn to_info(&self) -> ParameterCurveInfo {
        ParameterCurveInfo {
            param_name: self.param_name.clone(),
            keyframes: self
                .keyframes
                .iter()
                .map(|k| KeyframeInfo {
                    id: k.id.clone(),
                    time_ms: k.time_ms,
                    value: k.value,
                    easing: k.easing.to_str().to_string(),
                })
                .collect(),
        }
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
    /// Create an empty animation clip
    pub fn create(name: &str, duration_ms: f32) -> Self {
        Self {
            name: name.to_string(),
            duration_ms,
            loop_default: false,
            curves: Vec::new(),
        }
    }

    /// Convert to the frontend-facing info struct
    pub fn info(&self) -> AnimationClipInfo {
        AnimationClipInfo {
            name: self.name.clone(),
            duration_ms: self.duration_ms,
            loop_default: self.loop_default,
        }
    }

    /// Get all tracks as serialized ParameterCurveInfo
    pub fn get_tracks(&self) -> Vec<ParameterCurveInfo> {
        self.curves.iter().map(|c| c.to_info()).collect()
    }

    /// Find a curve by parameter name, or create one if not found.
    /// Returns mutable reference to the curve.
    pub fn get_or_create_curve(&mut self, param_name: &str) -> &mut ParameterCurve {
        let exists = self.curves.iter().position(|c| c.param_name == param_name);
        match exists {
            Some(idx) => &mut self.curves[idx],
            None => {
                self.curves.push(ParameterCurve {
                    param_name: param_name.to_string(),
                    keyframes: Vec::new(),
                });
                self.curves.last_mut().unwrap()
            }
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
                .map(|(t, v)| Keyframe::new(t, v))
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
        // Default easing is Linear, so midpoint should still be 0.5
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
    fn test_sample_with_easing() {
        let mut c = make_curve("x", vec![(0.0, 0.0), (100.0, 1.0)]);
        // Set first keyframe to EaseInQuad
        c.keyframes[0].easing = EasingType::EaseInQuad;
        let v = c.sample(50.0);
        // EaseInQuad at t=0.5 → 0.25, so value = 0.0 + 0.25 * 1.0 = 0.25
        assert!((v - 0.25).abs() < 1e-6, "expected 0.25, got {}", v);
    }

    #[test]
    fn test_add_keyframe() {
        let mut c = make_curve("x", vec![(0.0, 0.0), (100.0, 1.0)]);
        let id = c.add_keyframe(50.0, 0.5);
        assert_eq!(c.keyframes.len(), 3);
        assert_eq!(c.keyframes[1].id, id);
        assert_eq!(c.keyframes[1].time_ms, 50.0);
        assert_eq!(c.keyframes[1].value, 0.5);
    }

    #[test]
    fn test_remove_keyframe() {
        let mut c = make_curve("x", vec![(0.0, 0.0), (50.0, 0.5), (100.0, 1.0)]);
        let id = c.keyframes[1].id.clone();
        c.remove_keyframe(&id).unwrap();
        assert_eq!(c.keyframes.len(), 2);
    }

    #[test]
    fn test_update_keyframe() {
        let mut c = make_curve("x", vec![(0.0, 0.0), (100.0, 1.0)]);
        let id = c.keyframes[0].id.clone();
        c.update_keyframe(&id, Some(10.0), Some(0.1), Some(EasingType::EaseInCubic))
            .unwrap();
        assert_eq!(c.keyframes[0].time_ms, 10.0);
        assert_eq!(c.keyframes[0].value, 0.1);
        assert_eq!(c.keyframes[0].easing, EasingType::EaseInCubic);
    }

    #[test]
    fn test_clip_create() {
        let clip = AnimationClip::create("test", 1000.0);
        assert_eq!(clip.name, "test");
        assert_eq!(clip.duration_ms, 1000.0);
        assert!(clip.curves.is_empty());
    }

    #[test]
    fn test_clip_get_or_create_curve() {
        let mut clip = AnimationClip::create("test", 1000.0);
        let curve = clip.get_or_create_curve("mouth_open");
        curve.add_keyframe(0.0, 0.0);
        assert_eq!(clip.curves.len(), 1);
        // Second call returns existing
        let curve2 = clip.get_or_create_curve("mouth_open");
        assert_eq!(curve2.keyframes.len(), 1);
        assert_eq!(clip.curves.len(), 1);
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
