//! SceneService — implementation using native-scene crate
//!
//! Wraps BevySceneWorld with Mutex for thread-safe access.

use crate::error::{Error, Result};
use crate::services::scene::ISceneService;
use neko_native_scene::world::{
    AnimationClipInfo, BevySceneWorld, SceneDelta, SceneSnapshot, SceneWorld,
};
use std::path::Path;
use std::sync::Mutex;

/// Concrete scene service backed by bevy_ecs
pub struct SceneService {
    world: Mutex<BevySceneWorld>,
}

impl SceneService {
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevySceneWorld::new()),
        }
    }
}

impl Default for SceneService {
    fn default() -> Self {
        Self::new()
    }
}

impl ISceneService for SceneService {
    fn load_model(&self, path: &Path) -> Result<SceneSnapshot> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        world
            .load_model(path)
            .map_err(|e| Error::Other(format!("Failed to load model: {}", e)))?;

        Ok(world.get_snapshot())
    }

    fn get_snapshot(&self) -> Result<SceneSnapshot> {
        let world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.get_snapshot())
    }

    fn update_transform(
        &self,
        node_id: &str,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        world
            .update_transform(
                node_id,
                glam::Vec3::from(position),
                glam::Quat::from_array(rotation),
                glam::Vec3::from(scale),
            )
            .map_err(Error::Other)
    }

    fn tick(&self, clip_name: &str, time: f32) -> Result<SceneDelta> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.tick(clip_name, time))
    }

    fn get_animation_clips(&self) -> Result<Vec<AnimationClipInfo>> {
        let world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.get_animation_clips())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scene_service_new() {
        let service = SceneService::new();
        let snapshot = service.get_snapshot().unwrap();
        assert!(snapshot.nodes.is_empty());
    }

    #[test]
    fn test_scene_service_default() {
        let service = SceneService::default();
        let clips = service.get_animation_clips().unwrap();
        assert!(clips.is_empty());
    }
}
