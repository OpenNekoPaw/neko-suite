//! Animation blending — multi-layer animation mixing with crossfade support
//!
//! Allows multiple animation clips to play simultaneously with weighted blending.
//! CrossfadeRequest drives smooth transitions between clips.

use bevy_ecs::prelude::*;
use neko_engine_types::animation::AnimationDurationUnit;
use neko_engine_types::declare_animation_blend_wrappers;

declare_animation_blend_wrappers! {
    layer {
        /// A single animation blend layer — one active clip with a weight.
        pub struct BlendLayer;
        unit: AnimationDurationUnit::Milliseconds;
        new: new(elapsed_ms);
        elapsed: elapsed_ms;
        set_elapsed: set_elapsed_ms;
    }
    info {
        /// Frontend-facing blend layer info.
        pub struct BlendLayerInfo;
        field: "elapsed_ms";
        unit: AnimationDurationUnit::Milliseconds;
        new: new(elapsed_ms);
        elapsed: elapsed_ms;
    }
    state {
        /// ECS component: multi-layer blend state on the puppet root entity.
        #[derive(Debug, Default, Component)]
        pub struct AnimationBlendStateComponent;
        target: AnimationBlendState;
        new: new;
    }
    crossfade {
        /// ECS component: active crossfade transition on the puppet root entity.
        #[derive(Debug, Component)]
        pub struct CrossfadeRequest;
        unit: AnimationDurationUnit::Milliseconds;
        new: new(fade_duration_ms, fade_elapsed_ms);
        duration: fade_duration_ms;
        elapsed: fade_elapsed_ms;
        advance: advance_ms(delta_ms);
    }
}

pub use AnimationBlendStateComponent as AnimationBlendState;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blend_layer_creation() {
        let layer = BlendLayer::new(0, 0.0, 1.0, false);
        assert_eq!(layer.clip_index, 0);
        assert_eq!(layer.elapsed_ms(), 0.0);
        assert_eq!(layer.weight, 1.0);
    }

    #[test]
    fn test_blend_state_default() {
        let state = AnimationBlendState::default();
        assert!(state.layers.is_empty());
    }

    #[test]
    fn test_blend_layer_info_serialization() {
        let info = BlendLayerInfo::new("walk", 500.0, 0.7, true);
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"clip_name\":\"walk\""));
        assert!(json.contains("\"elapsed_ms\":500.0"));
        assert!(json.contains("\"weight\":0.7"));

        let restored: BlendLayerInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.clip_name(), "walk");
        assert_eq!(restored.elapsed_ms(), 500.0);
        assert_eq!(restored.weight(), 0.7);
        assert!(restored.looping());
    }

    #[test]
    fn test_crossfade_uses_milliseconds_contract() {
        let mut request = CrossfadeRequest::new(3, 250.0, 0.0, true);
        request.advance_ms(125.0);

        assert_eq!(request.target_clip_index, 3);
        assert_eq!(request.fade_duration_ms(), 250.0);
        assert_eq!(request.fade_elapsed_ms(), 125.0);
        assert!(request.loop_anim);
    }

    #[test]
    fn animation_blend_module_uses_shared_contracts() {
        let source = include_str!("animation_blend.rs");
        assert!(source.contains("neko_engine_types::animation"));
        assert!(source.contains("declare_animation_blend_wrappers!"));
        assert!(!source.contains(concat!("struct ", "BlendLayer(")));
        assert!(!source.contains(concat!("struct ", "CrossfadeRequest(")));
    }
}
