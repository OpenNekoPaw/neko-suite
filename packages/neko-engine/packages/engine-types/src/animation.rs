//! Shared animation blend DTOs.
//!
//! These contracts describe blend/crossfade state shared by animation runtimes.
//! Runtime crates own their ECS components and domain-specific animation math.

use serde::{Deserialize, Serialize};

/// Explicit animation duration stored in milliseconds.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct AnimationDuration {
    millis: f32,
}

impl AnimationDuration {
    /// Creates a duration from seconds.
    pub fn from_seconds(seconds: f32) -> Self {
        Self {
            millis: seconds * 1000.0,
        }
    }

    /// Creates a duration from milliseconds.
    pub fn from_millis(millis: f32) -> Self {
        Self { millis }
    }

    /// Returns this duration in seconds.
    pub fn as_seconds(self) -> f32 {
        self.millis / 1000.0
    }

    /// Returns this duration in milliseconds.
    pub fn as_millis(self) -> f32 {
        self.millis
    }
}

impl Default for AnimationDuration {
    fn default() -> Self {
        Self::from_millis(0.0)
    }
}

/// A weighted animation blend layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationBlendLayer {
    pub clip_index: usize,
    pub elapsed: AnimationDuration,
    pub weight: f32,
    pub looping: bool,
}

impl AnimationBlendLayer {
    pub fn new(clip_index: usize, elapsed: AnimationDuration, weight: f32, looping: bool) -> Self {
        Self {
            clip_index,
            elapsed,
            weight,
            looping,
        }
    }
}

/// Frontend-facing blend layer info with explicit duration semantics.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationBlendLayerInfo {
    pub clip_name: String,
    pub elapsed: AnimationDuration,
    pub weight: f32,
    pub looping: bool,
}

impl AnimationBlendLayerInfo {
    pub fn new(
        clip_name: impl Into<String>,
        elapsed: AnimationDuration,
        weight: f32,
        looping: bool,
    ) -> Self {
        Self {
            clip_name: clip_name.into(),
            elapsed,
            weight,
            looping,
        }
    }
}

/// Multi-layer animation blend state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationBlendState<TLayer = AnimationBlendLayer> {
    pub layers: Vec<TLayer>,
}

impl<TLayer> AnimationBlendState<TLayer> {
    pub fn new(layers: Vec<TLayer>) -> Self {
        Self { layers }
    }
}

impl<TLayer> Default for AnimationBlendState<TLayer> {
    fn default() -> Self {
        Self { layers: Vec::new() }
    }
}

/// Active crossfade transition between animation layers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationCrossfadeRequest {
    pub target_clip_index: usize,
    pub fade_duration: AnimationDuration,
    pub fade_elapsed: AnimationDuration,
    pub loop_anim: bool,
}

impl AnimationCrossfadeRequest {
    pub fn new(
        target_clip_index: usize,
        fade_duration: AnimationDuration,
        fade_elapsed: AnimationDuration,
        loop_anim: bool,
    ) -> Self {
        Self {
            target_clip_index,
            fade_duration,
            fade_elapsed,
            loop_anim,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_close(left: f32, right: f32) {
        assert!(
            (left - right).abs() < 0.0001,
            "expected {left} to be close to {right}"
        );
    }

    #[test]
    fn duration_converts_seconds_and_milliseconds() {
        let from_seconds = AnimationDuration::from_seconds(1.25);
        let from_millis = AnimationDuration::from_millis(1250.0);

        assert_close(from_seconds.as_millis(), 1250.0);
        assert_close(from_millis.as_seconds(), 1.25);
        assert_eq!(from_seconds, from_millis);
    }

    #[test]
    fn shared_blend_state_serializes_explicit_duration() {
        let state = AnimationBlendState::new(vec![AnimationBlendLayer::new(
            7,
            AnimationDuration::from_millis(500.0),
            0.75,
            true,
        )]);

        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"clip_index\":7"));
        assert!(json.contains("\"elapsed\":{\"millis\":500.0}"));
        assert!(json.contains("\"weight\":0.75"));

        let restored: AnimationBlendState = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, state);
    }

    #[test]
    fn shared_crossfade_serializes_duration_fields() {
        let request = AnimationCrossfadeRequest::new(
            2,
            AnimationDuration::from_seconds(0.5),
            AnimationDuration::from_millis(125.0),
            false,
        );

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"target_clip_index\":2"));
        assert!(json.contains("\"fade_duration\":{\"millis\":500.0}"));
        assert!(json.contains("\"fade_elapsed\":{\"millis\":125.0}"));
    }
}
