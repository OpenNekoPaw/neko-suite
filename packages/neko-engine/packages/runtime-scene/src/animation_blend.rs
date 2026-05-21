//! Animation blending — multi-layer animation mixing with crossfade support
//!
//! Mirrors the puppet animation_blend module for 3D scene animations.
//! Allows multiple animation clips to play simultaneously with weighted blending.
//! CrossfadeRequest drives smooth transitions between clips.

use bevy_ecs::prelude::*;
use neko_engine_types::animation::AnimationDurationUnit;
use neko_engine_types::declare_animation_blend_wrappers;
use serde::{Deserialize, Serialize};

declare_animation_blend_wrappers! {
    layer {
        /// A single animation blend layer — one active clip with a weight.
        pub struct SceneBlendLayer;
        unit: AnimationDurationUnit::Seconds;
        new: new(elapsed_seconds);
        elapsed: elapsed_seconds;
        set_elapsed: set_elapsed_seconds;
    }
    info {
        /// Frontend-facing blend layer info.
        pub struct SceneBlendLayerInfo;
        field: "elapsed";
        unit: AnimationDurationUnit::Seconds;
        new: new(elapsed_seconds);
        elapsed: elapsed_seconds;
    }
    state {
        /// ECS component: multi-layer blend state on the scene root entity.
        #[derive(Debug, Default, Component)]
        pub struct SceneAnimationBlendState;
        target: AnimationBlendState;
        new: new;
    }
    crossfade {
        /// ECS component: active crossfade transition on the scene root entity.
        #[derive(Debug, Component)]
        pub struct SceneCrossfadeRequest;
        unit: AnimationDurationUnit::Seconds;
        new: new(fade_duration_seconds, fade_elapsed_seconds);
        duration: fade_duration_seconds;
        elapsed: fade_elapsed_seconds;
        advance: advance_seconds(delta_seconds);
    }
}

/// ECS component: authoritative animation playback cursor for export/capture.
#[derive(Debug, Clone, Component, Serialize, Deserialize)]
pub struct SceneAnimationPlaybackState {
    pub clip_name: Option<String>,
    pub time_cursor: f32,
    pub evaluated_time: f32,
    pub playing: bool,
    pub looping: bool,
    pub root_motion_enabled: bool,
    pub root_node_id: Option<String>,
}

impl Default for SceneAnimationPlaybackState {
    fn default() -> Self {
        Self {
            clip_name: None,
            time_cursor: 0.0,
            evaluated_time: 0.0,
            playing: false,
            looping: false,
            root_motion_enabled: true,
            root_node_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scene_blend_layer_creation() {
        let layer = SceneBlendLayer::new(0, 0.0, 1.0, false);
        assert_eq!(layer.clip_index, 0);
        assert_eq!(layer.elapsed_seconds(), 0.0);
        assert_eq!(layer.weight, 1.0);
    }

    #[test]
    fn test_scene_blend_state_default() {
        let state = SceneAnimationBlendState::default();
        assert!(state.layers.is_empty());
    }

    #[test]
    fn test_scene_blend_layer_info_serialization() {
        let info = SceneBlendLayerInfo::new("walk", 0.5, 0.7, true);
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"clip_name\":\"walk\""));
        assert!(json.contains("\"elapsed\":0.5"));
        assert!(json.contains("\"weight\":0.7"));

        let restored: SceneBlendLayerInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.clip_name(), "walk");
        assert_eq!(restored.elapsed_seconds(), 0.5);
        assert_eq!(restored.weight(), 0.7);
        assert!(restored.looping());
    }

    #[test]
    fn test_scene_animation_playback_state_default() {
        let state = SceneAnimationPlaybackState::default();
        assert!(state.clip_name.is_none());
        assert!(!state.playing);
        assert!(state.root_motion_enabled);
        assert!(state.root_node_id.is_none());
    }

    #[test]
    fn test_scene_crossfade_uses_seconds_contract() {
        let mut request = SceneCrossfadeRequest::new(3, 0.25, 0.0, true);
        request.advance_seconds(0.125);

        assert_eq!(request.target_clip_index, 3);
        assert_eq!(request.fade_duration_seconds(), 0.25);
        assert_eq!(request.fade_elapsed_seconds(), 0.125);
        assert!(request.loop_anim);
    }

    #[test]
    fn animation_blend_module_uses_shared_contracts() {
        let source = include_str!("animation_blend.rs");
        assert!(source.contains("neko_engine_types::animation"));
        assert!(source.contains("declare_animation_blend_wrappers!"));
        assert!(!source.contains(concat!("struct ", "SceneBlendLayer(")));
        assert!(!source.contains(concat!("struct ", "SceneCrossfadeRequest(")));
        assert!(source.contains("pub struct SceneAnimationPlaybackState"));
    }
}
