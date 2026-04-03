//! PuppetService — implementation using native-puppet crate
//!
//! Wraps BevyPuppetWorld with Mutex for thread-safe access.
//! Mirrors the SceneService pattern.

use crate::error::{Error, Result};
use crate::services::puppet::IPuppetService;
use neko_native_puppet::animation::{AnimationClipInfo, ParameterCurveInfo};
use neko_native_puppet::animation_blend::BlendLayerInfo;
use neko_native_puppet::world::{
    BevyPuppetWorld, DeformedMesh, ParameterInfo, PuppetDelta, PuppetSnapshot, PuppetWorld,
};
use neko_types::easing::EasingType;
use std::sync::Mutex;

/// Concrete puppet service backed by bevy_ecs
pub struct PuppetService {
    world: Mutex<BevyPuppetWorld>,
}

impl PuppetService {
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevyPuppetWorld::new()),
        }
    }
}

impl Default for PuppetService {
    fn default() -> Self {
        Self::new()
    }
}

impl IPuppetService for PuppetService {
    fn load_puppet(&self, data: &[u8]) -> Result<PuppetSnapshot> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .load_puppet(data)
            .map_err(|e| Error::Other(format!("Failed to load puppet: {}", e)))
    }

    fn get_snapshot(&self) -> Result<PuppetSnapshot> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_snapshot())
    }

    fn set_parameter(&self, name: &str, value: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .set_parameter(name, value)
            .map_err(Error::Other)
    }

    fn get_parameters(&self) -> Result<Vec<ParameterInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_parameters())
    }

    fn tick(&self, delta_ms: f32) -> Result<PuppetDelta> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.tick(delta_ms))
    }

    fn get_deformed_meshes(&self) -> Result<Vec<DeformedMesh>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_deformed_meshes())
    }

    fn get_animations(&self) -> Result<Vec<AnimationClipInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_animations())
    }

    fn play_animation(&self, name: &str, loop_anim: bool) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world.play_animation(name, loop_anim).map_err(Error::Other)
    }

    fn stop_animation(&self) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world.stop_animation();
        Ok(())
    }

    fn seek_animation(&self, time_ms: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world.seek_animation(time_ms);
        Ok(())
    }

    fn get_keyframe_tracks(&self, clip_name: &str) -> Result<Vec<ParameterCurveInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world.get_keyframe_tracks(clip_name).map_err(Error::Other)
    }

    fn add_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        time_ms: f32,
        value: f32,
    ) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .add_keyframe(clip_name, param_name, time_ms, value)
            .map_err(Error::Other)
    }

    fn remove_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .remove_keyframe(clip_name, param_name, keyframe_id)
            .map_err(Error::Other)
    }

    fn update_keyframe(
        &self,
        clip_name: &str,
        param_name: &str,
        keyframe_id: &str,
        time_ms: Option<f32>,
        value: Option<f32>,
        easing: Option<EasingType>,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .update_keyframe(clip_name, param_name, keyframe_id, time_ms, value, easing)
            .map_err(Error::Other)
    }

    fn create_clip(&self, name: &str, duration_ms: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world.create_clip(name, duration_ms).map_err(Error::Other)
    }

    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration_ms: f32,
        loop_anim: bool,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .crossfade_animation(clip_name, fade_duration_ms, loop_anim)
            .map_err(Error::Other)
    }

    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        world
            .set_blend_weight(clip_name, weight)
            .map_err(Error::Other)
    }

    fn get_blend_state(&self) -> Result<Vec<BlendLayerInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Puppet world lock poisoned: {}", e)))?;

        Ok(world.get_blend_state())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_puppet_service_new() {
        let service = PuppetService::new();
        let snapshot = service.get_snapshot().unwrap();
        assert!(snapshot.nodes.is_empty());
    }

    #[test]
    fn test_puppet_service_default() {
        let service = PuppetService::default();
        let params = service.get_parameters().unwrap();
        assert!(params.is_empty());
    }

    #[test]
    fn test_puppet_service_tick_empty() {
        let service = PuppetService::new();
        let delta = service.tick(16.0).unwrap();
        assert!(delta.deformed_meshes.is_empty());
    }

    #[test]
    fn test_puppet_service_set_parameter_not_found() {
        let service = PuppetService::new();
        let result = service.set_parameter("nonexistent", 0.5);
        assert!(result.is_err());
    }
}
