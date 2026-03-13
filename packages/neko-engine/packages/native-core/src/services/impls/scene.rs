//! SceneService — implementation using native-scene crate
//!
//! Wraps BevySceneWorld with Mutex for thread-safe access.
//! Optionally holds PbrRenderer + AssetCache for GPU rendering.

use crate::error::{Error, Result};
use crate::gpu::scene_renderer::{AssetCache, CameraParams, PbrRenderer, SceneRenderOutput};
use crate::gpu::GpuContext;
use crate::services::scene::ISceneService;
use neko_native_scene::world::{
    AnimationClipInfo, BevySceneWorld, SceneDelta, SceneSnapshot, SceneWorld,
};
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Concrete scene service backed by bevy_ecs
pub struct SceneService {
    world: Mutex<BevySceneWorld>,
    /// PBR renderer (None if GPU unavailable)
    renderer: Option<Mutex<PbrRenderer>>,
    /// GPU asset cache (None if GPU unavailable)
    asset_cache: Option<Mutex<AssetCache>>,
}

impl SceneService {
    /// Create without GPU (scene management only, no rendering)
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevySceneWorld::new()),
            renderer: None,
            asset_cache: None,
        }
    }

    /// Create with GPU context (enables render_frame)
    pub fn with_gpu(ctx: Arc<GpuContext>) -> Self {
        let (renderer, material_bgl) = PbrRenderer::new(Arc::clone(&ctx));
        let asset_cache = AssetCache::new(Arc::clone(&ctx), material_bgl);

        Self {
            world: Mutex::new(BevySceneWorld::new()),
            renderer: Some(Mutex::new(renderer)),
            asset_cache: Some(Mutex::new(asset_cache)),
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

        // Also load GPU assets if renderer is available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.load_gltf(path) {
                tracing::warn!("Failed to load GPU assets for {}: {}", path.display(), e);
            }
        }

        Ok(world.get_snapshot())
    }

    fn get_snapshot(&self) -> Result<SceneSnapshot> {
        let mut world = self
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
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        Ok(world.get_animation_clips())
    }

    fn render_frame(
        &self,
        clip_name: Option<&str>,
        time: f32,
        output_size: (u32, u32),
        camera_override: Option<&CameraParams>,
        background_color: Option<[f32; 4]>,
    ) -> Result<SceneRenderOutput> {
        let renderer_mutex = self
            .renderer
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for rendering".into()))?;
        let cache_mutex = self
            .asset_cache
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available for rendering".into()))?;

        // Lock all resources in consistent order: world → renderer → cache
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        let renderer = renderer_mutex
            .lock()
            .map_err(|e| Error::Other(format!("Renderer lock poisoned: {}", e)))?;
        let cache = cache_mutex
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;

        // Tick animation if clip specified (same lock scope as render)
        if let Some(clip) = clip_name {
            world.tick(clip, time);
        }

        // Determine camera params
        let default_camera = CameraParams::default();
        let camera = camera_override.unwrap_or(&default_camera);

        // Render
        renderer
            .render(
                world.ecs_world_mut(),
                &cache,
                camera,
                output_size,
                background_color,
            )
            .map_err(|e| Error::Other(format!("PBR render failed: {}", e)))
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
