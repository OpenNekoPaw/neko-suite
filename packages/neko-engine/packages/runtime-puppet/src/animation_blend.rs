//! Animation blending — multi-layer animation mixing with crossfade support
//!
//! Allows multiple animation clips to play simultaneously with weighted blending.
//! CrossfadeRequest drives smooth transitions between clips.

use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

/// A single animation blend layer — one active clip with a weight
#[derive(Debug, Clone)]
pub struct BlendLayer {
    /// Index into AnimationLibrary.clips
    pub clip_index: usize,
    /// Elapsed time within the clip (milliseconds)
    pub elapsed_ms: f32,
    /// Blend weight in [0, 1]
    pub weight: f32,
    /// Whether the clip should loop
    pub looping: bool,
}

/// Frontend-facing blend layer info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlendLayerInfo {
    pub clip_name: String,
    pub elapsed_ms: f32,
    pub weight: f32,
    pub looping: bool,
}

/// ECS component: multi-layer blend state on the puppet root entity
#[derive(Debug, Default, Component)]
pub struct AnimationBlendState {
    pub layers: Vec<BlendLayer>,
}

/// ECS component: active crossfade transition on the puppet root entity
#[derive(Debug, Component)]
pub struct CrossfadeRequest {
    /// Target clip index to fade into
    pub target_clip_index: usize,
    /// Total duration of the fade in milliseconds
    pub fade_duration_ms: f32,
    /// Elapsed time of the fade so far
    pub fade_elapsed_ms: f32,
    /// Whether the target clip should loop
    pub loop_anim: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blend_layer_creation() {
        let layer = BlendLayer {
            clip_index: 0,
            elapsed_ms: 0.0,
            weight: 1.0,
            looping: false,
        };
        assert_eq!(layer.clip_index, 0);
        assert_eq!(layer.weight, 1.0);
    }

    #[test]
    fn test_blend_state_default() {
        let state = AnimationBlendState::default();
        assert!(state.layers.is_empty());
    }

    #[test]
    fn test_blend_layer_info_serialization() {
        let info = BlendLayerInfo {
            clip_name: "walk".to_string(),
            elapsed_ms: 500.0,
            weight: 0.7,
            looping: true,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"clip_name\":\"walk\""));
        assert!(json.contains("\"weight\":0.7"));
    }
}
