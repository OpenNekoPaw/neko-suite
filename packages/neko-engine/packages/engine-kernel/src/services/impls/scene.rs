//! SceneService — implementation using runtime-scene crate
//!
//! Wraps BevySceneWorld with Mutex for thread-safe access.
//! Optionally holds PbrRenderer + AssetCache for GPU rendering.

use crate::error::{Error, Result};
use crate::gpu::scene_renderer::{AssetCache, CameraParams, PbrRenderer, SceneRenderOutput};
use crate::gpu::GpuContext;
use crate::services::scene::ISceneService;
use neko_runtime_scene::animation_blend::SceneBlendLayerInfo;
use neko_runtime_scene::components::{
    AnimationChannelInfo, GlobalTransform, MeshRef, NodeName, SceneNodeId, Transform,
};
use neko_runtime_scene::exporter::{self, ExportNode};
use neko_runtime_scene::ik::IkChainInfo;
use neko_runtime_scene::procedural_mesh::ProceduralMesh;
use neko_runtime_scene::project::NkmProject;
use neko_runtime_scene::world::{
    AnimationClipInfo, BevySceneWorld, SceneDelta, SceneSnapshot, SceneWorld,
};
use neko_engine_types::easing::EasingType;
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
    /// VRM face parameter presets (populated from NkmProject on load)
    face_params: Mutex<HashMap<String, f32>>,
}

impl SceneService {
    /// Create without GPU (scene management only, no rendering)
    pub fn new() -> Self {
        Self {
            world: Mutex::new(BevySceneWorld::new()),
            renderer: None,
            asset_cache: None,
            procedural_meshes: Mutex::new(HashMap::new()),
            face_params: Mutex::new(HashMap::new()),
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
            face_params: Mutex::new(HashMap::new()),
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
        let shape_params: neko_runtime_scene::procedural::ShapeParams =
            serde_json::from_value(params)
                .map_err(|e| Error::Other(format!("Invalid shape params: {}", e)))?;
        let mesh = neko_runtime_scene::procedural::generate_shape(&shape_params);
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
        let op: neko_runtime_scene::csg::CsgOp = match operation {
            "union" => neko_runtime_scene::csg::CsgOp::Union,
            "difference" => neko_runtime_scene::csg::CsgOp::Difference,
            "intersection" => neko_runtime_scene::csg::CsgOp::Intersection,
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

        let result_mesh = neko_runtime_scene::csg::boolean_op(mesh_a, mesh_b, op);
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

    fn export_glb(&self) -> Result<Vec<u8>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        let snapshot = world.get_snapshot();

        // Build ExportNodes by querying MeshRef URIs from ECS
        let export_nodes: Vec<ExportNode> = {
            let ecs = world.ecs_world_mut();
            snapshot
                .nodes
                .iter()
                .map(|node| {
                    let mesh_uri = if node.has_mesh {
                        find_mesh_uri(ecs, &node.id).ok()
                    } else {
                        None
                    };
                    ExportNode {
                        snapshot: node.clone(),
                        mesh_uri,
                    }
                })
                .collect()
        };

        // Query animation clips from ECS
        let animation_clips: Vec<neko_runtime_scene::components::AnimationClipData> = {
            let ecs = world.ecs_world_mut();
            let mut query = ecs.query::<&neko_runtime_scene::components::AnimationTarget>();
            query
                .iter(ecs)
                .flat_map(|target| target.clips.iter().cloned())
                .collect()
        };

        let pm = self
            .procedural_meshes
            .lock()
            .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;

        let fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;

        let clips_ref = if animation_clips.is_empty() {
            None
        } else {
            Some(animation_clips.as_slice())
        };
        let fp_ref = if fp.is_empty() { None } else { Some(&*fp) };

        exporter::export_glb(&export_nodes, &pm, clips_ref, fp_ref)
            .map_err(|e| Error::Other(format!("GLB export failed: {}", e)))
    }

    fn save_project(&self, path: &str, editor_state: serde_json::Value) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        let snapshot = world.get_snapshot();

        // Build node_id → mesh_uri mapping from ECS
        let node_mesh_map: HashMap<String, String> = {
            let ecs = world.ecs_world_mut();
            let mut query = ecs.query::<(&SceneNodeId, &MeshRef)>();
            query
                .iter(ecs)
                .map(|(id, mesh_ref)| (id.0.clone(), mesh_ref.uri.clone()))
                .collect()
        };

        let pm = self
            .procedural_meshes
            .lock()
            .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;

        let fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;

        let project = NkmProject::from_scene(
            vec![], // TODO(P2): track source model paths
            pm.clone(),
            snapshot,
            node_mesh_map,
            editor_state,
            fp.clone(),
        );

        project
            .save(Path::new(path))
            .map_err(|e| Error::Other(format!("Project save failed: {}", e)))
    }

    fn load_project(&self, path: &str) -> Result<(SceneSnapshot, serde_json::Value)> {
        let project = NkmProject::load(Path::new(path))
            .map_err(|e| Error::Other(format!("Project load failed: {}", e)))?;

        // Restore scene world from snapshot
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;

        world.restore_snapshot(&project.scene_snapshot);

        // Restore procedural meshes and re-register in GPU cache
        {
            let mut pm = self
                .procedural_meshes
                .lock()
                .map_err(|e| Error::Other(format!("Procedural meshes lock poisoned: {}", e)))?;
            *pm = project.procedural_meshes.clone();

            if let Some(cache_mutex) = &self.asset_cache {
                let mut cache = cache_mutex
                    .lock()
                    .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;
                for (uri, mesh) in &*pm {
                    if let Err(e) = cache.register_procedural_mesh(uri, 0, mesh) {
                        tracing::warn!("Failed to re-register mesh '{}' in GPU cache: {}", uri, e);
                    }
                }
            }
        }

        // Re-add MeshRef components using the saved node_mesh_map
        {
            let ecs = world.ecs_world_mut();
            for (node_id, mesh_uri) in &project.node_mesh_map {
                let entity = {
                    let mut query = ecs.query::<(bevy_ecs::prelude::Entity, &SceneNodeId)>();
                    query
                        .iter(ecs)
                        .find(|(_, id)| id.0 == *node_id)
                        .map(|(e, _)| e)
                };
                if let Some(entity) = entity {
                    ecs.entity_mut(entity).insert(MeshRef {
                        uri: mesh_uri.clone(),
                        primitive_index: 0,
                    });
                }
            }
        }

        // Restore face params for VRM export
        {
            let mut fp = self
                .face_params
                .lock()
                .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
            *fp = project.face_params.clone();
        }

        let final_snapshot = world.get_snapshot();
        Ok((final_snapshot, project.editor_state))
    }

    fn get_keyframe_tracks(&self, clip_name: &str) -> Result<Vec<AnimationChannelInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.get_keyframe_tracks(clip_name).map_err(Error::Other)
    }

    fn add_keyframe(
        &self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .add_keyframe(clip_name, node_id, property, timestamp, values)
            .map_err(Error::Other)
    }

    fn remove_keyframe(&self, clip_name: &str, keyframe_id: &str) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .remove_keyframe(clip_name, keyframe_id)
            .map_err(Error::Other)
    }

    fn update_keyframe(
        &self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .update_keyframe(clip_name, keyframe_id, timestamp, values, easing)
            .map_err(Error::Other)
    }

    fn create_clip(&self, name: &str, duration: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.create_clip(name, duration).map_err(Error::Other)
    }

    fn crossfade_animation(
        &self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .crossfade_animation(clip_name, fade_duration, loop_anim)
            .map_err(Error::Other)
    }

    fn set_blend_weight(&self, clip_name: &str, weight: f32) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_blend_weight(clip_name, weight)
            .map_err(Error::Other)
    }

    fn get_blend_state(&self) -> Result<Vec<SceneBlendLayerInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        Ok(world.get_blend_state())
    }

    fn create_ik_chain(
        &self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .create_ik_chain(root_joint, end_effector, solver, iterations, tolerance)
            .map_err(Error::Other)
    }

    fn remove_ik_chain(&self, chain_id: &str) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.remove_ik_chain(chain_id).map_err(Error::Other)
    }

    fn set_ik_target(
        &self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_ik_target(chain_id, position, rotation, pole)
            .map_err(Error::Other)
    }

    fn set_ik_enabled(&self, chain_id: &str, enabled: bool) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_ik_enabled(chain_id, enabled)
            .map_err(Error::Other)
    }

    fn get_ik_chains(&self) -> Result<Vec<IkChainInfo>> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        Ok(world.get_ik_chains())
    }

    fn set_visible(&self, node_id: &str, visible: bool) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.set_visible(node_id, visible).map_err(Error::Other)
    }

    fn set_morph_weights(&self, node_id: &str, weights: Vec<f32>) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world
            .set_morph_weights(node_id, weights)
            .map_err(Error::Other)
    }

    fn set_face_params(&self, params: HashMap<String, f32>) -> Result<()> {
        let mut fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
        *fp = params;
        Ok(())
    }

    fn get_face_params(&self) -> Result<HashMap<String, f32>> {
        let fp = self
            .face_params
            .lock()
            .map_err(|e| Error::Other(format!("Face params lock poisoned: {}", e)))?;
        Ok(fp.clone())
    }

    fn update_material(
        &self,
        node_id: &str,
        base_color: Option<[f32; 4]>,
        metallic: Option<f32>,
        roughness: Option<f32>,
        emissive: Option<[f32; 3]>,
        occlusion_strength: Option<f32>,
    ) -> Result<()> {
        // Read the material reference from the scene world
        let mat_ref = {
            let mut world = self
                .world
                .lock()
                .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
            world.get_material_ref(node_id).map_err(Error::Other)?
        };

        let (uri, mat_idx) =
            mat_ref.ok_or_else(|| Error::Other(format!("Node '{}' has no material", node_id)))?;

        // Update the GPU material buffer
        let cache_mutex = self
            .asset_cache
            .as_ref()
            .ok_or_else(|| Error::Other("GPU not available".into()))?;
        let cache = cache_mutex
            .lock()
            .map_err(|e| Error::Other(format!("Asset cache lock poisoned: {}", e)))?;

        cache
            .update_material_uniforms(
                &uri,
                mat_idx,
                base_color,
                metallic,
                roughness,
                emissive,
                occlusion_strength,
            )
            .map_err(Error::Other)
    }

    fn delete_node(&self, node_id: &str) -> Result<()> {
        let mut world = self
            .world
            .lock()
            .map_err(|e| Error::Other(format!("Scene world lock poisoned: {}", e)))?;
        world.delete_node(node_id).map_err(Error::Other)
    }
}

/// Spawn a new ECS entity for a procedural mesh with a unique node ID.
fn spawn_procedural_entity(ecs_world: &mut bevy_ecs::prelude::World, uri: &str, label: &str) {
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
    let mut query = ecs_world.query::<(&SceneNodeId, &MeshRef)>();

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
