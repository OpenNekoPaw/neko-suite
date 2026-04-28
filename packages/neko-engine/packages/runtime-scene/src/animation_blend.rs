//! Animation blending — multi-layer animation mixing with crossfade support
//!
//! Mirrors the puppet animation_blend module for 3D scene animations.
//! Allows multiple animation clips to play simultaneously with weighted blending.
//! CrossfadeRequest drives smooth transitions between clips.

use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};

/// A single animation blend layer — one active clip with a weight
#[derive(Debug, Clone)]
pub struct SceneBlendLayer {
    /// Index into AnimationTarget.clips
    pub clip_index: usize,
    /// Current playback time (seconds)
    pub elapsed: f32,
    /// Blend weight in [0, 1]
    pub weight: f32,
    /// Whether the clip should loop
    pub looping: bool,
}

/// Frontend-facing blend layer info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneBlendLayerInfo {
    pub clip_name: String,
    pub elapsed: f32,
    pub weight: f32,
    pub looping: bool,
}

/// ECS component: authoritative animation playback cursor for export/capture.
#[derive(Debug, Clone, Default, Component, Serialize, Deserialize)]
pub struct SceneAnimationPlaybackState {
    pub clip_name: Option<String>,
    pub time_cursor: f32,
    pub evaluated_time: f32,
    pub playing: bool,
    pub looping: bool,
}

/// ECS component: multi-layer blend state on the scene root entity
#[derive(Debug, Default, Component)]
pub struct SceneAnimationBlendState {
    pub layers: Vec<SceneBlendLayer>,
}

/// ECS component: active crossfade transition on the scene root entity
#[derive(Debug, Component)]
pub struct SceneCrossfadeRequest {
    /// Target clip index to fade into
    pub target_clip_index: usize,
    /// Total duration of the fade in seconds
    pub fade_duration: f32,
    /// Elapsed time of the fade so far
    pub fade_elapsed: f32,
    /// Whether the target clip should loop
    pub loop_anim: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scene_blend_layer_creation() {
        let layer = SceneBlendLayer {
            clip_index: 0,
            elapsed: 0.0,
            weight: 1.0,
            looping: false,
        };
        assert_eq!(layer.clip_index, 0);
        assert_eq!(layer.weight, 1.0);
    }

    #[test]
    fn test_scene_blend_state_default() {
        let state = SceneAnimationBlendState::default();
        assert!(state.layers.is_empty());
    }

    #[test]
    fn test_scene_blend_layer_info_serialization() {
        let info = SceneBlendLayerInfo {
            clip_name: "walk".to_string(),
            elapsed: 0.5,
            weight: 0.7,
            looping: true,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"clip_name\":\"walk\""));
        assert!(json.contains("\"weight\":0.7"));
    }

    #[test]
    fn test_scene_animation_playback_state_default() {
        let state = SceneAnimationPlaybackState::default();
        assert!(state.clip_name.is_none());
        assert!(!state.playing);
    }
}
