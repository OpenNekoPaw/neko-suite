//! Animation blending — multi-layer animation mixing with crossfade support
//!
//! Allows multiple animation clips to play simultaneously with weighted blending.
//! CrossfadeRequest drives smooth transitions between clips.

use bevy_ecs::prelude::*;
use neko_engine_types::animation::{
    AnimationBlendLayer, AnimationBlendLayerInfo, AnimationBlendState as SharedAnimationBlendState,
    AnimationCrossfadeRequest, AnimationDuration,
};
use serde::{Deserialize, Serialize};
use std::ops::{Deref, DerefMut};

/// A single animation blend layer — one active clip with a weight.
#[derive(Debug, Clone)]
pub struct BlendLayer(AnimationBlendLayer);

impl BlendLayer {
    pub fn new(clip_index: usize, elapsed_ms: f32, weight: f32, looping: bool) -> Self {
        Self(AnimationBlendLayer::new(
            clip_index,
            AnimationDuration::from_millis(elapsed_ms),
            weight,
            looping,
        ))
    }

    pub fn elapsed_ms(&self) -> f32 {
        self.0.elapsed.as_millis()
    }

    pub fn set_elapsed_ms(&mut self, elapsed_ms: f32) {
        self.0.elapsed = AnimationDuration::from_millis(elapsed_ms);
    }
}

impl Deref for BlendLayer {
    type Target = AnimationBlendLayer;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for BlendLayer {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/// Frontend-facing blend layer info
#[derive(Debug, Clone)]
pub struct BlendLayerInfo(AnimationBlendLayerInfo);

impl BlendLayerInfo {
    pub fn new(clip_name: impl Into<String>, elapsed_ms: f32, weight: f32, looping: bool) -> Self {
        Self(AnimationBlendLayerInfo::new(
            clip_name,
            AnimationDuration::from_millis(elapsed_ms),
            weight,
            looping,
        ))
    }

    pub fn clip_name(&self) -> &str {
        &self.0.clip_name
    }

    pub fn elapsed_ms(&self) -> f32 {
        self.0.elapsed.as_millis()
    }

    pub fn weight(&self) -> f32 {
        self.0.weight
    }

    pub fn looping(&self) -> bool {
        self.0.looping
    }
}

impl Serialize for BlendLayerInfo {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct BlendLayerInfoSerde<'a> {
            clip_name: &'a str,
            elapsed_ms: f32,
            weight: f32,
            looping: bool,
        }

        BlendLayerInfoSerde {
            clip_name: self.clip_name(),
            elapsed_ms: self.elapsed_ms(),
            weight: self.weight(),
            looping: self.looping(),
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for BlendLayerInfo {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct BlendLayerInfoSerde {
            clip_name: String,
            elapsed_ms: f32,
            weight: f32,
            looping: bool,
        }

        let value = BlendLayerInfoSerde::deserialize(deserializer)?;
        Ok(Self::new(
            value.clip_name,
            value.elapsed_ms,
            value.weight,
            value.looping,
        ))
    }
}

/// ECS component: multi-layer blend state on the puppet root entity
#[derive(Debug, Default, Component)]
pub struct AnimationBlendStateComponent(SharedAnimationBlendState<BlendLayer>);

impl AnimationBlendStateComponent {
    pub fn new(layers: Vec<BlendLayer>) -> Self {
        Self(SharedAnimationBlendState::new(layers))
    }
}

impl Deref for AnimationBlendStateComponent {
    type Target = SharedAnimationBlendState<BlendLayer>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for AnimationBlendStateComponent {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

pub use AnimationBlendStateComponent as AnimationBlendState;

/// ECS component: active crossfade transition on the puppet root entity
#[derive(Debug, Component)]
pub struct CrossfadeRequest(AnimationCrossfadeRequest);

impl CrossfadeRequest {
    pub fn new(
        target_clip_index: usize,
        fade_duration_ms: f32,
        fade_elapsed_ms: f32,
        loop_anim: bool,
    ) -> Self {
        Self(AnimationCrossfadeRequest::new(
            target_clip_index,
            AnimationDuration::from_millis(fade_duration_ms),
            AnimationDuration::from_millis(fade_elapsed_ms),
            loop_anim,
        ))
    }

    pub fn fade_duration_ms(&self) -> f32 {
        self.0.fade_duration.as_millis()
    }

    pub fn fade_elapsed_ms(&self) -> f32 {
        self.0.fade_elapsed.as_millis()
    }

    pub fn advance_ms(&mut self, delta_ms: f32) {
        let elapsed = self.fade_elapsed_ms() + delta_ms;
        self.0.fade_elapsed = AnimationDuration::from_millis(elapsed);
    }
}

impl Deref for CrossfadeRequest {
    type Target = AnimationCrossfadeRequest;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for CrossfadeRequest {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

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
        assert!(!source.contains("pub struct BlendLayer {\n"));
        assert!(!source.contains("pub struct CrossfadeRequest {\n"));
    }
}
