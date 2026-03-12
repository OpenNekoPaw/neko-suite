//! Scene service trait for 3D scene management
//!
//! Provides an interface for loading, querying, and manipulating 3D scenes.

use neko_native_scene::world::{AnimationClipInfo, SceneDelta, SceneSnapshot};
use std::path::Path;

/// Service interface for 3D scene management
#[allow(async_fn_in_trait)]
pub trait ISceneService: Send + Sync {
    /// Load a glTF/glb model and return a scene snapshot
    fn load_model(&self, path: &Path) -> crate::error::Result<SceneSnapshot>;

    /// Get the current scene graph snapshot
    fn get_snapshot(&self) -> crate::error::Result<SceneSnapshot>;

    /// Update a node's transform
    fn update_transform(
        &self,
        node_id: &str,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
    ) -> crate::error::Result<()>;

    /// Advance animation by one tick
    fn tick(&self, clip_name: &str, time: f32) -> crate::error::Result<SceneDelta>;

    /// Get available animation clips
    fn get_animation_clips(&self) -> crate::error::Result<Vec<AnimationClipInfo>>;
}
