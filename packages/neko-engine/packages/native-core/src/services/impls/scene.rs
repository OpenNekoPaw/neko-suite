//! SceneService — implementation using native-scene crate
//!
//! Wraps BevySceneWorld with Mutex for thread-safe access.
//! Optionally holds PbrRenderer + AssetCache for GPU rendering.

use crate::error::{Error, Result};
use crate::gpu::scene_renderer::{AssetCache, CameraParams, PbrRenderer, SceneRenderOutput};
use crate::gpu::GpuContext;
use crate::services::scene::ISceneService;
use neko_native_scene::components::{
    GlobalTransform, MeshRef, NodeName, SceneNodeId, Transform,
};
use neko_native_scene::procedural_mesh::ProceduralMesh;
use neko_native_scene::world::{
    AnimationClipInfo, BevySceneWorld, SceneDelta, SceneSnapshot, SceneWorld,
};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Concrete scene service backed by bevy_ecs
pub struct SceneService {
    world: Mutex<BevySceneWorld>,
    /// PBR renderer (None if GPU unavailable)
    renderer: Option<Mutex<PbrRenderer>>,
    /// GPU asset cache (None if GPU unavailable)
    asset_cache: Option<Mutex<AssetCache>>,
    /// CPU-side mesh cache for procedural meshes (needed for CSG lookups)
    procedural_meshes: Mutex<HashMap<String, ProceduralMesh>>,
}

impl SceneService {
    /// Create without GPU (scene management only, no rendering)
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevySceneWorld::new()),
            renderer: None,
            asset_cache: None,
            procedural_meshes: Mutex::new(HashMap::new()),
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
            procedural_meshes: Mutex::new(HashMap::new()),
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

    fn create_shape(&self, params: serde_json::Value) -> Result<SceneSnapshot> {
        let shape_params: neko_native_scene::procedural::ShapeParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid shape params: {}", e)))?;
        let mesh = neko_native_scene::procedural::generate_shape(&shape_params);
        let uri = format!("procedural://shape_{}", uuid::Uuid::new_v4());

        // Register in GPU asset cache if available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.register_procedural_mesh(&uri, 0, &mesh) {
                tracing::warn!("Failed to register procedural shape in GPU cache: {}", e);
            }
        }

        // Store CPU-side mesh for future CSG operations
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            pm.insert(uri.clone(), mesh);
        }

        // Spawn entity in ECS world
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        spawn_procedural_entity(world.ecs_world_mut(), &uri, "Shape");

        Ok(world.get_snapshot())
    }

    fn create_text_mesh(&self, params: serde_json::Value) -> Result<SceneSnapshot> {
        let text_params: crate::generators::text_mesh::TextMeshParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid text mesh params: {}", e)))?;
        let mesh = crate::generators::text_mesh::generate_text_mesh(&text_params)
            .map_err(|e| Error::Other(format!("Text mesh generation failed: {}", e)))?;
        let uri = format!("procedural://text_{}", uuid::Uuid::new_v4());

        // Register in GPU asset cache if available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.register_procedural_mesh(&uri, 0, &mesh) {
                tracing::warn!("Failed to register text mesh in GPU cache: {}", e);
            }
        }

        // Store CPU-side mesh for future CSG operations
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            pm.insert(uri.clone(), mesh);
        }

        // Spawn entity in ECS world
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        spawn_procedural_entity(world.ecs_world_mut(), &uri, "Text");

        Ok(world.get_snapshot())
    }

    fn csg_boolean(
        &self,
        entity_a: &str,
        entity_b: &str,
        operation: &str,
    ) -> Result<SceneSnapshot> {
        let op: neko_native_scene::csg::CsgOp = match operation {
            "union" => neko_native_scene::csg::CsgOp::Union,
            "difference" => neko_native_scene::csg::CsgOp::Difference,
            "intersection" => neko_native_scene::csg::CsgOp::Intersection,
            _ => {
                return Err(Error::Other(format!(
                    "Unknown CSG operation: {} (expected union/difference/intersection)",
                    operation
                )))
            }
        };

        // Look up MeshRef URIs from the ECS world
        let (uri_a, uri_b) = {
            let mut world = self
                .world
                .lock()
                .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
            let ecs = world.ecs_world_mut();
            let ua = find_mesh_uri(ecs, entity_a)?;
            let ub = find_mesh_uri(ecs, entity_b)?;
            (ua, ub)
        };

        // Only support CSG on procedural meshes
        if !uri_a.starts_with("procedural://") {
            return Err(Error::Other(format!(
                "CSG only supported on procedural meshes, entity '{}' has URI '{}'",
                entity_a, uri_a
            )));
        }
        if !uri_b.starts_with("procedural://") {
            return Err(Error::Other(format!(
                "CSG only supported on procedural meshes, entity '{}' has URI '{}'",
                entity_b, uri_b
            )));
        }

        // Retrieve CPU-side meshes
        let pm = self
            .procedural_meshes
            .lock()
            .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;

        let mesh_a = pm.get(&uri_a).ok_or_else(|| {
            Error::Other(format!("No CPU mesh data for procedural URI '{}'", uri_a))
        })?;
        let mesh_b = pm.get(&uri_b).ok_or_else(|| {
            Error::Other(format!("No CPU mesh data for procedural URI '{}'", uri_b))
        })?;

        let result_mesh = neko_native_scene::csg::boolean_op(mesh_a, mesh_b, op);
        drop(pm);

        let uri = format!("procedural://csg_{}", uuid::Uuid::new_v4());

        // Register in GPU asset cache if available
        if let Some(cache_mutex) = &self.asset_cache {
            let mut cache = cache_mutex
                .lock()
                .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
            if let Err(e) = cache.register_procedural_mesh(&uri, 0, &result_mesh) {
                tracing::warn!("Failed to register CSG result in GPU cache: {}", e);
            }
        }

        // Store CPU-side mesh
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            pm.insert(uri.clone(), result_mesh);
        }

        // Spawn entity in ECS world
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        spawn_procedural_entity(world.ecs_world_mut(), &uri, "CSG");

        Ok(world.get_snapshot())
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

/// Spawn a new ECS entity for a procedural mesh with a unique node ID.
fn spawn_procedural_entity(
    ecs_world: &mut bevy_ecs::prelude::World,
    uri: &str,
    label: &str,
) {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let idx = COUNTER.fetch_add(1, Ordering::Relaxed);

    let node_id = format!("procedural_{}_{}", label.to_lowercase(), idx);
    let name = format!("{} {}", label, idx);

    ecs_world.spawn((
        SceneNodeId(node_id),
        NodeName(name),
        Transform::default(),
        GlobalTransform::identity(),
        MeshRef {
            uri: uri.to_string(),
            primitive_index: 0,
        },
    ));
}

/// Look up the MeshRef URI for a given scene node ID.
fn find_mesh_uri(ecs_world: &mut bevy_ecs::prelude::World, node_id: &str) -> Result<String> {
    let mut query = ecs_world
        .query::<(&SceneNodeId, &MeshRef)>();

    for (scene_id, mesh_ref) in query.iter(ecs_world) {
        if scene_id.0 == node_id {
            return Ok(mesh_ref.uri.clone());
        }
    }

    Err(Error::Other(format!(
        "Entity '{}' not found or has no mesh",
        node_id
    )))
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
