//! Animation blending — multi-layer animation mixing with crossfade support
//!
//! Mirrors the puppet animation_blend module for 3D scene animations.
//! Allows multiple animation clips to play simultaneously with weighted blending.
//! CrossfadeRequest drives smooth transitions between clips.

use bevy_ecs::prelude::*;
use neko_engine_types::animation::{
    AnimationBlendLayer, AnimationBlendLayerInfo, AnimationBlendState, AnimationCrossfadeRequest,
    AnimationDuration,
};
use serde::{Deserialize, Serialize};
use std::ops::{Deref, DerefMut};

/// A single animation blend layer — one active clip with a weight.
#[derive(Debug, Clone)]
pub struct SceneBlendLayer(AnimationBlendLayer);

impl SceneBlendLayer {
    pub fn new(clip_index: usize, elapsed_seconds: f32, weight: f32, looping: bool) -> Self {
        Self(AnimationBlendLayer::new(
            clip_index,
            AnimationDuration::from_seconds(elapsed_seconds),
            weight,
            looping,
        ))
    }

    pub fn elapsed_seconds(&self) -> f32 {
        self.0.elapsed.as_seconds()
    }

    pub fn set_elapsed_seconds(&mut self, elapsed_seconds: f32) {
        self.0.elapsed = AnimationDuration::from_seconds(elapsed_seconds);
    }
}

impl Deref for SceneBlendLayer {
    type Target = AnimationBlendLayer;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for SceneBlendLayer {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/// Frontend-facing blend layer info
#[derive(Debug, Clone)]
pub struct SceneBlendLayerInfo(AnimationBlendLayerInfo);

impl SceneBlendLayerInfo {
    pub fn new(
        clip_name: impl Into<String>,
        elapsed_seconds: f32,
        weight: f32,
        looping: bool,
    ) -> Self {
        Self(AnimationBlendLayerInfo::new(
            clip_name,
            AnimationDuration::from_seconds(elapsed_seconds),
            weight,
            looping,
        ))
    }

    pub fn clip_name(&self) -> &str {
        &self.0.clip_name
    }

    pub fn elapsed_seconds(&self) -> f32 {
        self.0.elapsed.as_seconds()
    }

    pub fn weight(&self) -> f32 {
        self.0.weight
    }

    pub fn looping(&self) -> bool {
        self.0.looping
    }
}

impl Serialize for SceneBlendLayerInfo {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct SceneBlendLayerInfoSerde<'a> {
            clip_name: &'a str,
            elapsed: f32,
            weight: f32,
            looping: bool,
        }

        SceneBlendLayerInfoSerde {
            clip_name: self.clip_name(),
            elapsed: self.elapsed_seconds(),
            weight: self.weight(),
            looping: self.looping(),
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for SceneBlendLayerInfo {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct SceneBlendLayerInfoSerde {
            clip_name: String,
            elapsed: f32,
            weight: f32,
            looping: bool,
        }

        let value = SceneBlendLayerInfoSerde::deserialize(deserializer)?;
        Ok(Self::new(
            value.clip_name,
            value.elapsed,
            value.weight,
            value.looping,
        ))
    }
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
pub struct SceneAnimationBlendState(AnimationBlendState<SceneBlendLayer>);

impl SceneAnimationBlendState {
    pub fn new(layers: Vec<SceneBlendLayer>) -> Self {
        Self(AnimationBlendState::new(layers))
    }
}

impl Deref for SceneAnimationBlendState {
    type Target = AnimationBlendState<SceneBlendLayer>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for SceneAnimationBlendState {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/// ECS component: active crossfade transition on the scene root entity
#[derive(Debug, Component)]
pub struct SceneCrossfadeRequest(AnimationCrossfadeRequest);

impl SceneCrossfadeRequest {
    pub fn new(
        target_clip_index: usize,
        fade_duration_seconds: f32,
        fade_elapsed_seconds: f32,
        loop_anim: bool,
    ) -> Self {
        Self(AnimationCrossfadeRequest::new(
            target_clip_index,
            AnimationDuration::from_seconds(fade_duration_seconds),
            AnimationDuration::from_seconds(fade_elapsed_seconds),
            loop_anim,
        ))
    }

    pub fn fade_duration_seconds(&self) -> f32 {
        self.0.fade_duration.as_seconds()
    }

    pub fn fade_elapsed_seconds(&self) -> f32 {
        self.0.fade_elapsed.as_seconds()
    }

    pub fn advance_seconds(&mut self, delta_seconds: f32) {
        let elapsed = self.fade_elapsed_seconds() + delta_seconds;
        self.0.fade_elapsed = AnimationDuration::from_seconds(elapsed);
    }
}

impl Deref for SceneCrossfadeRequest {
    type Target = AnimationCrossfadeRequest;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for SceneCrossfadeRequest {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
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
        assert!(!source.contains("pub struct SceneBlendLayer {\n"));
        assert!(!source.contains("pub struct SceneCrossfadeRequest {\n"));
    }
}
