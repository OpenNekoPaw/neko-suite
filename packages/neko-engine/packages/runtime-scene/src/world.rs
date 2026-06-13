//! SceneWorld — abstraction over bevy_ecs::World for scene management
//!
//! Isolates bevy_ecs API details behind a stable interface.

use crate::access::{
    BeginModelingSession, CommitModelingSession, CreativeAccess, DataAccess, ProceduralSceneEntity,
    ProceduralSceneEntitySpec, SceneCommandBatch, SceneEntityFilter, SceneExportRef,
    SceneNodeMeshRef, SceneRenderExtractInput, SceneRenderExtraction, SceneRenderExtractor,
    SerializedSceneEntities,
};
use crate::animation_blend::{
    SceneAnimationBlendState, SceneAnimationPlaybackState, SceneBlendLayer, SceneBlendLayerInfo,
    SceneCrossfadeRequest,
};
use crate::bounds::SceneBounds3;
use crate::character_authoring::CharacterRegionDescriptorSet;
use crate::components::*;
use crate::hierarchy;
use crate::ik::{self, IkChain, IkChainInfo, IkSolverType};
use crate::loader::{self, LoadError, LoadResult};
use crate::modeling_session::{
    ModelingSession, ModelingSessionManager, ModelingSessionStateDelta, TopologyChangeEvent,
};
use crate::procedural::{generate_shape, ShapeParams};
use crate::procedural_mesh::ProceduralMesh;
use crate::scene_control::{
    advance_scene_revision, current_environment, ensure_scene_control_resources,
    extract_scene_delta, light_from_patch, light_patch_from_component, mark_morph_weights_dirty,
    mark_node_removed, mark_transform_dirty, mark_visibility_dirty, rebuild_node_index,
    EnvironmentDiagnostic, LightPatch, SceneCommandAck, SceneCommandEnvelope,
    SceneEnvironmentState, SceneRevision,
};
use crate::systems;
use bevy_ecs::prelude::*;
use glam::Vec3;
use neko_engine_types::easing::EasingType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Snapshot of the scene graph for serialization to the frontend
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SceneSnapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scene_id: Option<String>,
    #[serde(default)]
    pub revision: u64,
    pub nodes: Vec<SceneNodeSnapshot>,
    pub animations: Vec<AnimationClipInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<EnvironmentPatch>,
}

/// Snapshot of a single scene node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneNodeSnapshot {
    pub id: String,
    pub name: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
    pub parent_id: Option<String>,
    pub visible: bool,
    pub has_mesh: bool,
    pub has_light: bool,
    pub has_camera: bool,
    pub has_skeleton: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bounds: Option<SceneBounds3>,
    #[serde(
        default,
        rename = "worldBounds",
        skip_serializing_if = "Option::is_none"
    )]
    pub world_bounds: Option<SceneBounds3>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub primitives: Vec<MeshPrimitiveSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region_descriptors: Option<CharacterRegionDescriptorSet>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub light: Option<LightPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshPrimitiveSnapshot {
    pub mesh: AssetHandleRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub material: Option<AssetHandleRef>,
    pub submesh_id: String,
    pub primitive_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub material_slot_id: Option<String>,
}

/// Info about an animation clip
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationClipInfo {
    pub name: String,
    pub duration: f32,
    pub channel_count: usize,
}

/// Delta change from a scene tick
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDelta {
    pub revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applied_seq: Option<u64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub added_nodes: Vec<SceneNodePatch>,
    pub updated_transforms: Vec<TransformUpdate>,
    pub updated_morph_weights: Vec<MorphWeightsUpdate>,
    pub updated_visibility: Vec<VisibilityUpdate>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub updated_lights: Vec<LightPatch>,
    pub removed_nodes: Vec<String>,
    pub updated_character_morph_weights: Vec<CharacterMorphWeightsUpdate>,
    pub updated_character_materials: Vec<CharacterMaterialUpdate>,
    pub updated_skeleton_pose: Vec<CharacterSkeletonPoseUpdate>,
    pub character_overrides: Vec<CharacterOverrideUpdate>,
    pub modeling_sessions: Vec<ModelingSessionStateDelta>,
    pub topology_changes: Vec<TopologyChangeEvent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment: Option<Option<EnvironmentPatch>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub selected_targets: Vec<SelectionTarget>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub environment_diagnostics: Vec<EnvironmentDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssetHandleRef {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EnvironmentMode {
    Skybox,
    Ibl,
    BackgroundAndIbl,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentPatch {
    pub environment_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<AssetHandleRef>,
    pub mode: EnvironmentMode,
    pub rotation_deg: f32,
    pub intensity: f32,
    pub exposure: f32,
    pub visible_as_background: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<[f32; 4]>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeRemoveCommand {
    pub node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cascade: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SceneNodePatch {
    pub node_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transform: Option<SceneNodeTransformPatch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneNodeTransformPatch {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SelectionKind {
    Node,
    Bone,
    MaterialSlot,
    Submesh,
    Primitive,
    CharacterRegion,
    MorphControl,
    Environment,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SelectionHit {
    pub world_position: [f32; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub world_normal: Option<[f32; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub depth: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SelectionTarget {
    pub kind: SelectionKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bone_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub material_slot_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub submesh_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primitive_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub morph_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub environment_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hit: Option<SelectionHit>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SelectionMode {
    Replace,
    Add,
    Toggle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SelectionQuery {
    pub viewport_id: String,
    pub x: f32,
    pub y: f32,
    #[serde(default)]
    pub mask: Vec<SelectionKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<SelectionMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SelectionQueryResult {
    pub viewport_id: String,
    pub revision: u64,
    #[serde(default)]
    pub candidates: Vec<SelectionTarget>,
}

/// A single transform update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformUpdate {
    pub node_id: String,
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

/// Morph weight update for a single mesh node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MorphWeightsUpdate {
    pub node_id: String,
    pub weights: Vec<f32>,
}

/// Visibility update for a single scene node
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisibilityUpdate {
    pub node_id: String,
    pub visible: bool,
}

/// Morph weight update for one editable character.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterMorphWeightsUpdate {
    pub character_id: String,
    pub weights: Vec<CharacterMorphWeight>,
    pub topology_version: u64,
}

/// Material layer update for one editable character.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterMaterialUpdate {
    pub character_id: String,
    pub layers: Vec<CharacterMaterialLayer>,
}

/// Skeleton pose update for one editable character.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSkeletonPoseUpdate {
    pub character_id: String,
    pub bones: Vec<CharacterBonePose>,
}

/// Override update for one editable character.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterOverrideUpdate {
    pub character_id: String,
    pub overrides: Vec<CharacterOverrideState>,
}

/// Abstraction for scene management operations
pub trait SceneWorld: Send + Sync {
    fn load_model(&mut self, path: &Path) -> Result<LoadResult, LoadError>;
    fn get_snapshot(&mut self) -> SceneSnapshot;
    fn update_transform(
        &mut self,
        node_id: &str,
        position: Vec3,
        rotation: glam::Quat,
        scale: Vec3,
    ) -> Result<(), String>;
    fn tick(&mut self, clip_name: &str, time: f32) -> SceneDelta;
    fn get_animation_clips(&mut self) -> Vec<AnimationClipInfo>;
    /// Restore scene from a snapshot (used when loading .nkm projects).
    fn restore_snapshot(&mut self, snapshot: &SceneSnapshot);

    /// Get keyframe tracks for a named animation clip
    fn get_keyframe_tracks(&mut self, clip_name: &str)
        -> Result<Vec<AnimationChannelInfo>, String>;

    /// Add a keyframe to a channel within a named clip.
    /// `node_id` + `property` identify the channel; creates channel if needed.
    fn add_keyframe(
        &mut self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String, String>;

    /// Remove a keyframe by ID from a named clip
    fn remove_keyframe(&mut self, clip_name: &str, keyframe_id: &str) -> Result<(), String>;

    /// Update a keyframe by ID (partial update)
    fn update_keyframe(
        &mut self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<(), String>;

    /// Create a new empty animation clip
    fn create_clip(&mut self, name: &str, duration: f32) -> Result<(), String>;

    /// Crossfade to a named animation clip over a duration
    fn crossfade_animation(
        &mut self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<(), String>;

    /// Set blend weight for a named clip layer
    fn set_blend_weight(&mut self, clip_name: &str, weight: f32) -> Result<(), String>;

    /// Get the current blend state
    fn get_blend_state(&mut self) -> Vec<SceneBlendLayerInfo>;

    /// Create an IK chain between two joints
    fn create_ik_chain(
        &mut self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String, String>;

    /// Remove an IK chain by ID
    fn remove_ik_chain(&mut self, chain_id: &str) -> Result<(), String>;

    /// Set IK target for a chain
    fn set_ik_target(
        &mut self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<(), String>;

    /// Enable/disable an IK chain
    fn set_ik_enabled(&mut self, chain_id: &str, enabled: bool) -> Result<(), String>;

    /// Get all IK chains
    fn get_ik_chains(&mut self) -> Vec<IkChainInfo>;

    /// Set visibility of a scene node
    fn set_visible(&mut self, node_id: &str, visible: bool) -> Result<(), String>;

    /// Set morph target weights on a mesh node
    fn set_morph_weights(&mut self, node_id: &str, weights: Vec<f32>) -> Result<(), String>;

    /// Get material reference for a node (returns uri + material_index)
    fn get_material_ref(&mut self, node_id: &str) -> Result<Option<(String, usize)>, String>;

    /// Delete a node and all its descendants from the scene
    fn delete_node(&mut self, node_id: &str) -> Result<(), String>;
}

/// Implementation using bevy_ecs::World
pub struct BevySceneWorld {
    world: World,
    default_procedural_meshes: HashMap<String, ProceduralMesh>,
}

impl BevySceneWorld {
    pub fn new() -> Self {
        let mut world = World::new();
        ensure_scene_control_resources(&mut world);
        let default_procedural_meshes = spawn_default_cube(&mut world);
        Self {
            world,
            default_procedural_meshes,
        }
    }

    pub fn default_procedural_meshes(&self) -> &HashMap<String, ProceduralMesh> {
        &self.default_procedural_meshes
    }

    #[cfg(test)]
    pub(crate) fn test_world_mut(&mut self) -> &mut World {
        &mut self.world
    }

    fn write_playback_state(
        &mut self,
        clip_name: &str,
        time_cursor: f32,
        playing: bool,
        looping: bool,
        root_motion_enabled: bool,
        root_node_id: Option<String>,
    ) {
        let Some(entity) = self.playback_state_entity() else {
            return;
        };
        let duration = self.clip_duration(clip_name).unwrap_or(0.0);
        let evaluated_time = if duration > 0.0 {
            time_cursor % duration
        } else {
            0.0
        };

        self.world
            .entity_mut(entity)
            .insert(SceneAnimationPlaybackState {
                clip_name: Some(clip_name.to_string()),
                time_cursor,
                evaluated_time,
                playing,
                looping,
                root_motion_enabled,
                root_node_id,
            });
    }

    fn playback_state_entity(&mut self) -> Option<Entity> {
        let root = {
            let mut query = self.world.query_filtered::<Entity, With<SceneRoot>>();
            query.iter(&self.world).next()
        };
        if root.is_some() {
            return root;
        }

        let mut query = self.world.query_filtered::<Entity, With<AnimationTarget>>();
        query.iter(&self.world).next()
    }

    fn clip_duration(&mut self, clip_name: &str) -> Option<f32> {
        let mut query = self.world.query::<&AnimationTarget>();
        query.iter(&self.world).find_map(|target| {
            target
                .clips
                .iter()
                .find(|clip| clip.name == clip_name)
                .map(|clip| clip.duration)
        })
    }

    /// Find the entity + clip by clip name within AnimationTarget components
    fn find_clip_mut(&mut self, clip_name: &str) -> Result<(Entity, usize), String> {
        let mut q = self.world.query::<(Entity, &AnimationTarget)>();
        let targets: Vec<(Entity, Vec<String>)> = q
            .iter(&self.world)
            .map(|(e, t)| {
                (
                    e,
                    t.clips.iter().map(|c| c.name.clone()).collect::<Vec<_>>(),
                )
            })
            .collect();

        for (entity, names) in targets {
            for (idx, name) in names.iter().enumerate() {
                if name == clip_name {
                    return Ok((entity, idx));
                }
            }
        }
        Err(format!("Clip '{}' not found", clip_name))
    }
}

fn spawn_default_cube(world: &mut World) -> HashMap<String, ProceduralMesh> {
    const DEFAULT_CUBE_URI: &str = "procedural://default_cube";
    const DEFAULT_CUBE_NODE_ID: &str = "default_cube";

    let mesh = generate_shape(&ShapeParams::default_cube());
    world.spawn((
        SceneNodeId(DEFAULT_CUBE_NODE_ID.to_string()),
        NodeName("Cube".to_string()),
        Transform::default(),
        GlobalTransform::identity(),
        Visible(true),
        MeshRef {
            asset: crate::asset_database::AssetHandle::for_mesh(DEFAULT_CUBE_URI, 0),
            uri: DEFAULT_CUBE_URI.to_string(),
            primitive_index: 0,
        },
        MeshBounds {
            local: SceneBounds3 {
                min: [-0.5, -0.5, -0.5],
                max: [0.5, 0.5, 0.5],
            },
        },
    ));
    rebuild_node_index(world);
    systems::transform_propagation(world);

    HashMap::from([(DEFAULT_CUBE_URI.to_string(), mesh)])
}

impl Default for BevySceneWorld {
    fn default() -> Self {
        Self::new()
    }
}

impl CreativeAccess for BevySceneWorld {
    fn current_revision(&mut self) -> u64 {
        ensure_scene_control_resources(&mut self.world);
        self.world.resource::<SceneRevision>().current()
    }
}

impl DataAccess for BevySceneWorld {
    fn extract_render_world<C, E>(
        &mut self,
        input: SceneRenderExtractInput<'_, C>,
        extractor: &mut E,
    ) -> SceneRenderExtraction<E::RenderWorld, E::Stats>
    where
        E: SceneRenderExtractor<C>,
    {
        extractor.extract(&mut self.world, input)
    }

    fn serialize_entities(&mut self, filter: SceneEntityFilter) -> SerializedSceneEntities {
        let mut export_refs = Vec::new();
        let mut node_mesh_map = HashMap::new();

        if matches!(
            filter,
            SceneEntityFilter::All | SceneEntityFilter::Export | SceneEntityFilter::Project
        ) {
            let mut query = self.world.query::<(
                &SceneNodeId,
                Option<&MeshRef>,
                Option<&MaterialRef>,
                Option<&Light>,
                Option<&Camera>,
            )>();
            for (scene_id, mesh_ref, material_ref, light, camera) in query.iter(&self.world) {
                if let Some(mesh_ref) = mesh_ref {
                    node_mesh_map.insert(scene_id.0.clone(), mesh_ref.uri.clone());
                }
                export_refs.push(SceneExportRef {
                    node_id: scene_id.0.clone(),
                    mesh_uri: mesh_ref.map(|mesh| mesh.uri.clone()),
                    material_handle: material_ref.map(|material| material.asset.clone()),
                    light: light.cloned(),
                    camera: camera.cloned(),
                });
            }
        }

        let animation_clips =
            if matches!(filter, SceneEntityFilter::All | SceneEntityFilter::Export) {
                let mut query = self.world.query::<&AnimationTarget>();
                query
                    .iter(&self.world)
                    .flat_map(|target| target.clips.iter().cloned())
                    .collect()
            } else {
                Vec::new()
            };

        SerializedSceneEntities {
            export_refs,
            animation_clips,
            node_mesh_map,
        }
    }

    fn spawn_procedural(&mut self, spec: ProceduralSceneEntitySpec) -> ProceduralSceneEntity {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let idx = COUNTER.fetch_add(1, Ordering::Relaxed);
        let node_id = format!("procedural_{}_{}", spec.label.to_lowercase(), idx);
        let name = format!("{} {}", spec.label, idx);

        self.world.spawn((
            SceneNodeId(node_id.clone()),
            NodeName(name.clone()),
            Transform::default(),
            GlobalTransform::identity(),
            Visible::default(),
            MeshRef {
                asset: crate::asset_database::AssetHandle::for_mesh(&spec.uri, 0),
                uri: spec.uri,
                primitive_index: 0,
            },
        ));
        rebuild_node_index(&mut self.world);
        advance_scene_revision(&mut self.world);

        ProceduralSceneEntity { node_id, name }
    }

    fn mesh_uri(&mut self, node_id: &str) -> Result<String, String> {
        let mut query = self.world.query::<(&SceneNodeId, &MeshRef)>();
        query
            .iter(&self.world)
            .find(|(scene_id, _)| scene_id.0 == node_id)
            .map(|(_, mesh_ref)| mesh_ref.uri.clone())
            .ok_or_else(|| format!("Entity '{}' not found or has no mesh", node_id))
    }

    fn insert_mesh_refs(&mut self, refs: &[SceneNodeMeshRef]) {
        for mesh_ref in refs {
            let entity = {
                let mut query = self.world.query::<(Entity, &SceneNodeId)>();
                query
                    .iter(&self.world)
                    .find(|(_, id)| id.0 == mesh_ref.node_id)
                    .map(|(entity, _)| entity)
            };
            if let Some(entity) = entity {
                self.world.entity_mut(entity).insert(mesh_ref.mesh_ref());
            }
        }
        rebuild_node_index(&mut self.world);
        advance_scene_revision(&mut self.world);
    }

    fn apply_scene_command_batch<Q>(
        &mut self,
        queue: &mut Q,
        envelope: SceneCommandEnvelope,
    ) -> Vec<SceneCommandAck>
    where
        Q: SceneCommandBatch,
    {
        queue.apply_to_world(&mut self.world, envelope)
    }

    fn extract_delta(&mut self, applied_seq: Option<u64>) -> SceneDelta {
        extract_scene_delta(&mut self.world, applied_seq)
    }

    fn begin_modeling_session(
        &mut self,
        request: BeginModelingSession,
    ) -> Result<(ModelingSession, SceneDelta), crate::modeling_session::ModelingSessionError> {
        ensure_scene_control_resources(&mut self.world);
        if !self.world.contains_resource::<ModelingSessionManager>() {
            self.world
                .insert_resource(ModelingSessionManager::default());
        }
        let session = self.world.resource_mut::<ModelingSessionManager>().begin(
            request.session_id,
            request.mesh_id,
            request.character_id,
            request.topology_mutable,
            request.before_hash,
        )?;
        self.world.resource_mut::<SceneRevision>().advance();
        let delta = extract_scene_delta(&mut self.world, None);
        Ok((session, delta))
    }

    fn commit_modeling_session(
        &mut self,
        request: CommitModelingSession,
    ) -> Result<(TopologyChangeEvent, SceneDelta), crate::modeling_session::ModelingSessionError>
    {
        ensure_scene_control_resources(&mut self.world);
        let event = self
            .world
            .get_resource_mut::<ModelingSessionManager>()
            .ok_or_else(|| {
                crate::modeling_session::ModelingSessionError::SessionNotFound(
                    request.session_id.clone(),
                )
            })?
            .commit(
                &request.session_id,
                request.operation,
                request.vertex_count_before,
                request.vertex_count_after,
            )?;
        self.world.resource_mut::<SceneRevision>().advance();
        let delta = extract_scene_delta(&mut self.world, None);
        Ok((event, delta))
    }

    fn cancel_modeling_session(
        &mut self,
        session_id: &str,
    ) -> Result<
        (ModelingSessionStateDelta, SceneDelta),
        crate::modeling_session::ModelingSessionError,
    > {
        ensure_scene_control_resources(&mut self.world);
        let session = self
            .world
            .get_resource_mut::<ModelingSessionManager>()
            .ok_or_else(|| {
                crate::modeling_session::ModelingSessionError::SessionNotFound(
                    session_id.to_string(),
                )
            })?
            .cancel(session_id)?;
        self.world.resource_mut::<SceneRevision>().advance();
        let delta = extract_scene_delta(&mut self.world, None);
        Ok((session, delta))
    }

    fn apply_vertex_brush_patch(
        &mut self,
        patch: crate::modeling_session::VertexBrushPatchMetadata,
    ) -> Result<
        crate::modeling_session::BrushPatchApplyOutcome,
        crate::modeling_session::ModelingSessionError,
    > {
        if !self.world.contains_resource::<ModelingSessionManager>() {
            self.world
                .insert_resource(ModelingSessionManager::default());
        }
        self.world
            .resource_mut::<ModelingSessionManager>()
            .apply_brush_patch(patch)
    }
}

impl SceneWorld for BevySceneWorld {
    fn load_model(&mut self, path: &Path) -> Result<LoadResult, LoadError> {
        self.world.clear_all();
        ensure_scene_control_resources(&mut self.world);
        let result = loader::load_gltf(&mut self.world, path)?;
        rebuild_node_index(&mut self.world);
        systems::transform_propagation(&mut self.world);
        advance_scene_revision(&mut self.world);
        Ok(result)
    }

    fn get_snapshot(&mut self) -> SceneSnapshot {
        let mut nodes = Vec::new();

        // Query all scene nodes
        let mut query = self.world.query::<(
            Entity,
            &SceneNodeId,
            &NodeName,
            &Transform,
            Option<&hierarchy::Parent>,
            Option<&Visible>,
            Option<&MeshRef>,
            Option<&Light>,
            Option<&Camera>,
            Option<&Skeleton>,
            Option<&MeshBounds>,
            Option<&GlobalTransform>,
            Option<&MeshPrimitiveRefs>,
        )>();

        for (
            _entity,
            node_id,
            name,
            transform,
            parent,
            visible,
            mesh,
            light,
            camera,
            skeleton,
            mesh_bounds,
            global_transform,
            primitive_refs,
        ) in query.iter(&self.world)
        {
            let parent_id =
                parent.and_then(|p| self.world.get::<SceneNodeId>(p.0).map(|id| id.0.clone()));
            let bounds = mesh_bounds.map(|bounds| bounds.local);
            let world_bounds = bounds
                .zip(global_transform)
                .map(|(bounds, global)| bounds.transform(global.0));

            nodes.push(SceneNodeSnapshot {
                id: node_id.0.clone(),
                name: name.0.clone(),
                position: transform.position.to_array(),
                rotation: transform.rotation.to_array(),
                scale: transform.scale.to_array(),
                parent_id,
                visible: visible.is_none_or(|v| v.0),
                has_mesh: mesh.is_some(),
                has_light: light.is_some(),
                has_camera: camera.is_some(),
                has_skeleton: skeleton.is_some(),
                bounds,
                world_bounds,
                primitives: primitive_refs
                    .map(|refs| mesh_primitive_snapshots(refs))
                    .unwrap_or_default(),
                character_id: None,
                region_descriptors: None,
                light: light.map(|light| light_patch_from_component(&node_id.0, light)),
            });
        }

        let animations = self.get_animation_clips();

        SceneSnapshot {
            scene_id: None,
            revision: self
                .world
                .get_resource::<SceneRevision>()
                .map(|revision| revision.current())
                .unwrap_or_default(),
            nodes,
            animations,
            environment: current_environment(&mut self.world),
        }
    }

    fn update_transform(
        &mut self,
        node_id: &str,
        position: Vec3,
        rotation: glam::Quat,
        scale: Vec3,
    ) -> Result<(), String> {
        let entity = {
            let mut found = None;
            let mut query = self.world.query::<(Entity, &SceneNodeId)>();
            for (entity, id) in query.iter(&self.world) {
                if id.0 == node_id {
                    found = Some(entity);
                    break;
                }
            }
            found.ok_or_else(|| format!("Node not found: {}", node_id))?
        };

        if let Some(mut transform) = self.world.get_mut::<Transform>(entity) {
            transform.position = position;
            transform.rotation = rotation;
            transform.scale = scale;
        }

        // Re-propagate transforms
        systems::transform_propagation(&mut self.world);
        mark_transform_dirty(&mut self.world, node_id);
        advance_scene_revision(&mut self.world);

        Ok(())
    }

    fn tick(&mut self, clip_name: &str, time: f32) -> SceneDelta {
        // Advance animation
        systems::animation_tick(&mut self.world, clip_name, time);
        self.write_playback_state(clip_name, time, true, true, true, None);

        // Propagate transforms
        systems::transform_propagation(&mut self.world);

        // Collect updated transforms
        let mut updated_transforms = Vec::new();
        let mut query = self.world.query::<(&SceneNodeId, &Transform)>();
        for (node_id, transform) in query.iter(&self.world) {
            updated_transforms.push(TransformUpdate {
                node_id: node_id.0.clone(),
                position: transform.position.to_array(),
                rotation: transform.rotation.to_array(),
                scale: transform.scale.to_array(),
            });
        }

        // Collect updated morph weights (only nodes that have the component)
        let mut updated_morph_weights = Vec::new();
        let mut mw_query = self.world.query::<(&SceneNodeId, &MorphWeights)>();
        for (node_id, morph_weights) in mw_query.iter(&self.world) {
            updated_morph_weights.push(MorphWeightsUpdate {
                node_id: node_id.0.clone(),
                weights: morph_weights.weights.clone(),
            });
        }

        for update in &updated_transforms {
            mark_transform_dirty(&mut self.world, &update.node_id);
        }
        for update in &updated_morph_weights {
            mark_morph_weights_dirty(&mut self.world, &update.node_id);
        }
        if !updated_transforms.is_empty() || !updated_morph_weights.is_empty() {
            advance_scene_revision(&mut self.world);
        }

        extract_scene_delta(&mut self.world, None)
    }

    fn get_animation_clips(&mut self) -> Vec<AnimationClipInfo> {
        let mut clips = Vec::new();
        let mut query = self.world.query::<&AnimationTarget>();
        for target in query.iter(&self.world) {
            for clip in &target.clips {
                clips.push(AnimationClipInfo {
                    name: clip.name.clone(),
                    duration: clip.duration,
                    channel_count: clip.channels.len(),
                });
            }
        }
        clips
    }

    fn restore_snapshot(&mut self, snapshot: &SceneSnapshot) {
        // Clear existing world
        self.world.clear_all();
        ensure_scene_control_resources(&mut self.world);

        if snapshot.nodes.is_empty() {
            if let Some(environment) = snapshot.environment.clone() {
                self.world.resource_mut::<SceneEnvironmentState>().current = Some(environment);
            }
            self.default_procedural_meshes = spawn_default_cube(&mut self.world);
            advance_scene_revision(&mut self.world);
            return;
        }

        self.default_procedural_meshes.clear();

        // Rebuild ECS entities from snapshot nodes
        let mut id_to_entity: HashMap<String, Entity> = HashMap::new();

        for node in &snapshot.nodes {
            let entity = self
                .world
                .spawn((
                    SceneNodeId(node.id.clone()),
                    NodeName(node.name.clone()),
                    Transform {
                        position: Vec3::from(node.position),
                        rotation: glam::Quat::from_array(node.rotation),
                        scale: Vec3::from(node.scale),
                    },
                    GlobalTransform::identity(),
                    Visible(node.visible),
                ))
                .id();

            id_to_entity.insert(node.id.clone(), entity);

            if let Some(light_patch) = &node.light {
                if let Ok(light) = light_from_patch(light_patch) {
                    self.world.entity_mut(entity).insert(light);
                }
            }
        }

        // Restore parent-child relationships
        for node in &snapshot.nodes {
            if let Some(ref parent_id) = node.parent_id {
                if let (Some(&child_e), Some(&parent_e)) =
                    (id_to_entity.get(&node.id), id_to_entity.get(parent_id))
                {
                    self.world
                        .entity_mut(child_e)
                        .insert(hierarchy::Parent(parent_e));
                }
            }
        }

        // Propagate transforms
        systems::transform_propagation(&mut self.world);
        rebuild_node_index(&mut self.world);
        self.world.resource_mut::<SceneEnvironmentState>().current = snapshot.environment.clone();
        advance_scene_revision(&mut self.world);
    }

    fn get_keyframe_tracks(
        &mut self,
        clip_name: &str,
    ) -> Result<Vec<AnimationChannelInfo>, String> {
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let target = self
            .world
            .get::<AnimationTarget>(entity)
            .ok_or("No animation target")?;
        Ok(target.clips[clip_idx].get_tracks())
    }

    fn add_keyframe(
        &mut self,
        clip_name: &str,
        node_id: &str,
        property: &str,
        timestamp: f32,
        values: Vec<f32>,
    ) -> Result<String, String> {
        let prop = parse_animation_property(property)?;
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let mut target = self
            .world
            .get_mut::<AnimationTarget>(entity)
            .ok_or("No animation target")?;
        let channel = target.clips[clip_idx].get_or_create_channel(node_id, prop);
        Ok(channel.add_keyframe(timestamp, values))
    }

    fn remove_keyframe(&mut self, clip_name: &str, keyframe_id: &str) -> Result<(), String> {
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let mut target = self
            .world
            .get_mut::<AnimationTarget>(entity)
            .ok_or("No animation target")?;
        // Search all channels for the keyframe
        for channel in &mut target.clips[clip_idx].channels {
            if channel.keyframes.iter().any(|k| k.id == keyframe_id) {
                return channel.remove_keyframe(keyframe_id);
            }
        }
        Err(format!(
            "Keyframe '{}' not found in clip '{}'",
            keyframe_id, clip_name
        ))
    }

    fn update_keyframe(
        &mut self,
        clip_name: &str,
        keyframe_id: &str,
        timestamp: Option<f32>,
        values: Option<Vec<f32>>,
        easing: Option<EasingType>,
    ) -> Result<(), String> {
        let (entity, clip_idx) = self.find_clip_mut(clip_name)?;
        let mut target = self
            .world
            .get_mut::<AnimationTarget>(entity)
            .ok_or("No animation target")?;
        for channel in &mut target.clips[clip_idx].channels {
            if channel.keyframes.iter().any(|k| k.id == keyframe_id) {
                return channel.update_keyframe(keyframe_id, timestamp, values, easing);
            }
        }
        Err(format!(
            "Keyframe '{}' not found in clip '{}'",
            keyframe_id, clip_name
        ))
    }

    fn create_clip(&mut self, name: &str, duration: f32) -> Result<(), String> {
        // Check if clip already exists
        let mut q = self.world.query::<&AnimationTarget>();
        for target in q.iter(&self.world) {
            if target.clips.iter().any(|c| c.name == name) {
                return Err(format!("Clip '{}' already exists", name));
            }
        }

        // Find scene root or first entity with AnimationTarget, or create AnimationTarget on root
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next()
        };

        if let Some(root) = root {
            if let Some(mut target) = self.world.get_mut::<AnimationTarget>(root) {
                target.clips.push(AnimationClipData::create(name, duration));
            } else {
                self.world.entity_mut(root).insert(AnimationTarget {
                    clips: vec![AnimationClipData::create(name, duration)],
                });
            }
        } else {
            // No scene root — spawn a dedicated entity
            self.world.spawn(AnimationTarget {
                clips: vec![AnimationClipData::create(name, duration)],
            });
        }
        Ok(())
    }

    fn crossfade_animation(
        &mut self,
        clip_name: &str,
        fade_duration: f32,
        loop_anim: bool,
    ) -> Result<(), String> {
        // Find scene root
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next().ok_or("No scene root entity")?
        };

        // Find the target clip index
        let target_clip_index = {
            let target = self
                .world
                .get::<AnimationTarget>(root)
                .ok_or("No animation target on scene root")?;
            target
                .clips
                .iter()
                .position(|c| c.name == clip_name)
                .ok_or_else(|| format!("Clip '{}' not found", clip_name))?
        };

        // Ensure blend state exists; migrate current single-clip if needed
        let has_blend = self
            .world
            .get::<SceneAnimationBlendState>(root)
            .map(|s| !s.layers.is_empty())
            .unwrap_or(false);

        if !has_blend {
            // Start with an empty blend state (or single layer at weight 1.0 if something is playing)
            let initial_layers = Vec::new();
            self.world
                .entity_mut(root)
                .insert(SceneAnimationBlendState::new(initial_layers));
        }

        // Add target clip as new layer with weight 0
        if let Some(mut blend) = self.world.get_mut::<SceneAnimationBlendState>(root) {
            // Remove existing layer for same clip if present
            blend.layers.retain(|l| l.clip_index != target_clip_index);
            blend
                .layers
                .push(SceneBlendLayer::new(target_clip_index, 0.0, 0.0, loop_anim));
        }

        // Insert crossfade request
        self.world
            .entity_mut(root)
            .insert(SceneCrossfadeRequest::new(
                target_clip_index,
                fade_duration,
                0.0,
                loop_anim,
            ));

        self.write_playback_state(clip_name, 0.0, true, loop_anim, true, None);

        Ok(())
    }

    fn set_blend_weight(&mut self, clip_name: &str, weight: f32) -> Result<(), String> {
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next().ok_or("No scene root entity")?
        };

        let clip_index = {
            let target = self
                .world
                .get::<AnimationTarget>(root)
                .ok_or("No animation target on scene root")?;
            target
                .clips
                .iter()
                .position(|c| c.name == clip_name)
                .ok_or_else(|| format!("Clip '{}' not found", clip_name))?
        };

        let mut blend = self
            .world
            .get_mut::<SceneAnimationBlendState>(root)
            .ok_or("No blend state on scene root")?;

        for layer in &mut blend.layers {
            if layer.clip_index == clip_index {
                layer.weight = weight.clamp(0.0, 1.0);
                return Ok(());
            }
        }

        Err(format!("Clip '{}' not found in blend layers", clip_name))
    }

    fn get_blend_state(&mut self) -> Vec<SceneBlendLayerInfo> {
        let root = {
            let mut rq = self.world.query_filtered::<Entity, With<SceneRoot>>();
            rq.iter(&self.world).next()
        };
        let root = match root {
            Some(e) => e,
            None => return Vec::new(),
        };

        let clip_names: Vec<String> = self
            .world
            .get::<AnimationTarget>(root)
            .map(|t| t.clips.iter().map(|c| c.name.clone()).collect())
            .unwrap_or_default();

        self.world
            .get::<SceneAnimationBlendState>(root)
            .map(|blend| {
                blend
                    .layers
                    .iter()
                    .map(|l| {
                        SceneBlendLayerInfo::new(
                            clip_names.get(l.clip_index).cloned().unwrap_or_default(),
                            l.elapsed_seconds(),
                            l.weight,
                            l.looping,
                        )
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn create_ik_chain(
        &mut self,
        root_joint: &str,
        end_effector: &str,
        solver: &str,
        iterations: u32,
        tolerance: f32,
    ) -> Result<String, String> {
        // Build the joint chain by walking the hierarchy from end_effector up to root_joint
        let chain_nodes = self.build_joint_chain(root_joint, end_effector)?;

        let chain_id = uuid::Uuid::new_v4().to_string();
        let solver_type = ik::parse_solver_type(solver, iterations, tolerance);

        // Get the end effector's current world position as initial target
        let target_pos = {
            let entity = self.find_node_entity(end_effector)?;
            self.world
                .get::<GlobalTransform>(entity)
                .map(|gt| gt.0.col(3).truncate())
                .unwrap_or(glam::Vec3::ZERO)
        };

        self.world.spawn(IkChain {
            id: chain_id.clone(),
            joint_node_ids: chain_nodes,
            target_position: target_pos,
            target_rotation: None,
            pole_target: None,
            solver: solver_type,
            enabled: true,
        });

        Ok(chain_id)
    }

    fn remove_ik_chain(&mut self, chain_id: &str) -> Result<(), String> {
        let entity = {
            let mut q = self.world.query::<(Entity, &IkChain)>();
            q.iter(&self.world)
                .find(|(_, c)| c.id == chain_id)
                .map(|(e, _)| e)
                .ok_or_else(|| format!("IK chain '{}' not found", chain_id))?
        };
        self.world.despawn(entity);
        Ok(())
    }

    fn set_ik_target(
        &mut self,
        chain_id: &str,
        position: [f32; 3],
        rotation: Option<[f32; 4]>,
        pole: Option<[f32; 3]>,
    ) -> Result<(), String> {
        let entity = {
            let mut q = self.world.query::<(Entity, &IkChain)>();
            q.iter(&self.world)
                .find(|(_, c)| c.id == chain_id)
                .map(|(e, _)| e)
                .ok_or_else(|| format!("IK chain '{}' not found", chain_id))?
        };

        if let Some(mut chain) = self.world.get_mut::<IkChain>(entity) {
            chain.target_position = glam::Vec3::from(position);
            chain.target_rotation = rotation.map(glam::Quat::from_array);
            chain.pole_target = pole.map(glam::Vec3::from);
        }

        // Solve IK immediately and propagate
        ik::ik_solve(&mut self.world);
        systems::transform_propagation(&mut self.world);

        Ok(())
    }

    fn set_ik_enabled(&mut self, chain_id: &str, enabled: bool) -> Result<(), String> {
        let entity = {
            let mut q = self.world.query::<(Entity, &IkChain)>();
            q.iter(&self.world)
                .find(|(_, c)| c.id == chain_id)
                .map(|(e, _)| e)
                .ok_or_else(|| format!("IK chain '{}' not found", chain_id))?
        };

        if let Some(mut chain) = self.world.get_mut::<IkChain>(entity) {
            chain.enabled = enabled;
        }

        Ok(())
    }

    fn get_ik_chains(&mut self) -> Vec<IkChainInfo> {
        let mut chains = Vec::new();
        let mut q = self.world.query::<&IkChain>();
        for chain in q.iter(&self.world) {
            chains.push(IkChainInfo {
                id: chain.id.clone(),
                root_joint: chain.joint_node_ids.first().cloned().unwrap_or_default(),
                end_effector: chain.joint_node_ids.last().cloned().unwrap_or_default(),
                joint_count: chain.joint_node_ids.len(),
                solver: match &chain.solver {
                    IkSolverType::Fabrik { .. } => "fabrik".to_string(),
                    IkSolverType::Ccd { .. } => "ccd".to_string(),
                    IkSolverType::TwoBone { .. } => "two_bone".to_string(),
                },
                enabled: chain.enabled,
                target_position: chain.target_position.to_array(),
                target_rotation: chain.target_rotation.map(|r| r.to_array()),
                pole_target: chain.pole_target.map(|p| p.to_array()),
            });
        }
        chains
    }

    fn set_visible(&mut self, node_id: &str, visible: bool) -> Result<(), String> {
        let entity = self.find_node_entity(node_id)?;
        if let Some(mut vis) = self.world.get_mut::<Visible>(entity) {
            vis.0 = visible;
        } else {
            self.world.entity_mut(entity).insert(Visible(visible));
        }
        mark_visibility_dirty(&mut self.world, node_id);
        advance_scene_revision(&mut self.world);
        Ok(())
    }

    fn set_morph_weights(&mut self, node_id: &str, weights: Vec<f32>) -> Result<(), String> {
        let entity = self.find_node_entity(node_id)?;
        if let Some(mut mw) = self.world.get_mut::<MorphWeights>(entity) {
            mw.weights = weights;
        } else {
            self.world
                .entity_mut(entity)
                .insert(MorphWeights { weights });
        }
        Ok(())
    }

    fn get_material_ref(&mut self, node_id: &str) -> Result<Option<(String, usize)>, String> {
        let entity = self.find_node_entity(node_id)?;
        Ok(self
            .world
            .get::<MaterialRef>(entity)
            .map(|m| (m.uri.clone(), m.material_index)))
    }

    fn delete_node(&mut self, node_id: &str) -> Result<(), String> {
        let entity = self.find_node_entity(node_id)?;

        // Collect all descendant entities via BFS
        let mut to_despawn = vec![entity];
        let mut queue = vec![entity];
        while let Some(current) = queue.pop() {
            if let Some(children) = self.world.get::<hierarchy::Children>(current) {
                for &child in &children.0 {
                    to_despawn.push(child);
                    queue.push(child);
                }
            }
        }

        // Remove from parent's children list
        if let Some(parent) = self.world.get::<hierarchy::Parent>(entity).map(|p| p.0) {
            if let Some(mut children) = self.world.get_mut::<hierarchy::Children>(parent) {
                children.0.retain(|&e| e != entity);
            }
        }

        // Despawn all collected entities (children first to avoid dangling refs)
        let removed_node_ids: Vec<String> = to_despawn
            .iter()
            .filter_map(|entity| {
                self.world
                    .get::<SceneNodeId>(*entity)
                    .map(|id| id.0.clone())
            })
            .collect();
        for e in to_despawn.into_iter().rev() {
            self.world.despawn(e);
        }
        for node_id in removed_node_ids {
            mark_node_removed(&mut self.world, &node_id);
        }
        rebuild_node_index(&mut self.world);
        advance_scene_revision(&mut self.world);

        Ok(())
    }
}

fn mesh_primitive_snapshots(refs: &MeshPrimitiveRefs) -> Vec<MeshPrimitiveSnapshot> {
    refs.primitives
        .iter()
        .map(|primitive| {
            let primitive_id = format!("primitive:{}", primitive.mesh.primitive_index);
            MeshPrimitiveSnapshot {
                mesh: mesh_asset_handle_ref(&primitive.mesh),
                material: primitive.material.as_ref().map(material_asset_handle_ref),
                submesh_id: format!("submesh:{}", primitive.mesh.primitive_index),
                material_slot_id: primitive
                    .material
                    .as_ref()
                    .map(|material| format!("material:{}", material.material_index)),
                primitive_id,
            }
        })
        .collect()
}

fn mesh_asset_handle_ref(mesh: &MeshRef) -> AssetHandleRef {
    AssetHandleRef {
        id: mesh.asset.guid.clone(),
        uri: Some(mesh.uri.clone()),
        kind: Some("mesh".to_string()),
    }
}

fn material_asset_handle_ref(material: &MaterialRef) -> AssetHandleRef {
    AssetHandleRef {
        id: material.asset.guid.clone(),
        uri: Some(material.uri.clone()),
        kind: Some("material".to_string()),
    }
}

impl BevySceneWorld {
    /// Find a node entity by SceneNodeId
    fn find_node_entity(&mut self, node_id: &str) -> Result<Entity, String> {
        let mut q = self.world.query::<(Entity, &SceneNodeId)>();
        q.iter(&self.world)
            .find(|(_, id)| id.0 == node_id)
            .map(|(e, _)| e)
            .ok_or_else(|| format!("Node '{}' not found", node_id))
    }

    /// Build a joint chain by walking up the hierarchy from end_effector to root_joint.
    /// Returns node IDs from root to end (inclusive).
    fn build_joint_chain(
        &mut self,
        root_joint: &str,
        end_effector: &str,
    ) -> Result<Vec<String>, String> {
        // Verify both nodes exist
        let _root_entity = self.find_node_entity(root_joint)?;
        let _end_entity = self.find_node_entity(end_effector)?;

        // Walk up from end_effector collecting node IDs until we reach root
        let mut chain = Vec::new();
        let mut current_id = end_effector.to_string();

        for _ in 0..100 {
            // Safety limit
            chain.push(current_id.clone());

            if current_id == root_joint {
                chain.reverse();
                return Ok(chain);
            }

            // Find parent
            let entity = self.find_node_entity(&current_id)?;
            let parent = self.world.get::<hierarchy::Parent>(entity).map(|p| p.0);

            match parent {
                Some(parent_entity) => {
                    let parent_id = self
                        .world
                        .get::<SceneNodeId>(parent_entity)
                        .map(|id| id.0.clone())
                        .ok_or_else(|| "Parent has no SceneNodeId".to_string())?;
                    current_id = parent_id;
                }
                None => {
                    return Err(format!(
                        "Could not find path from '{}' up to '{}'",
                        end_effector, root_joint
                    ));
                }
            }
        }

        Err("Joint chain too deep (> 100 levels)".to_string())
    }
}

/// Parse animation property string to enum
fn parse_animation_property(s: &str) -> Result<AnimationProperty, String> {
    match s {
        "translation" => Ok(AnimationProperty::Translation),
        "rotation" => Ok(AnimationProperty::Rotation),
        "scale" => Ok(AnimationProperty::Scale),
        "morphWeights" | "morph_weights" => Ok(AnimationProperty::MorphWeights),
        _ => Err(format!("Unknown animation property: {}", s)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bevy_scene_world_new() {
        let mut world = BevySceneWorld::new();
        let snapshot = world.get_snapshot();
        assert_eq!(snapshot.nodes.len(), 1);
        assert_eq!(snapshot.nodes[0].id, "default_cube");
        assert_eq!(snapshot.nodes[0].name, "Cube");
        assert!(snapshot.animations.is_empty());
    }

    #[test]
    fn test_bevy_scene_world_default() {
        let mut world = BevySceneWorld::default();
        let snapshot = world.get_snapshot();
        assert_eq!(snapshot.nodes.len(), 1);
        assert!(world
            .default_procedural_meshes()
            .contains_key("procedural://default_cube"));
    }

    #[test]
    fn load_model_replaces_existing_scene_entities() {
        let mut scene = BevySceneWorld::new();
        {
            let ecs = &mut scene.world;
            ecs.spawn((
                SceneNodeId("template_humanoid".to_string()),
                NodeName("Template Humanoid".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
                Visible(true),
            ));
        }

        let dir = tempfile::tempdir().unwrap();
        let model_path = dir.path().join("loaded.gltf");
        std::fs::write(
            &model_path,
            r#"{
                "asset": { "version": "2.0" },
                "scenes": [{ "nodes": [0] }],
                "scene": 0,
                "nodes": [{ "name": "Loaded" }]
            }"#,
        )
        .unwrap();

        scene.load_model(&model_path).unwrap();
        let snapshot = scene.get_snapshot();

        assert!(snapshot
            .nodes
            .iter()
            .all(|node| node.id != "template_humanoid"));
        assert!(snapshot.nodes.iter().all(|node| node.id != "default_cube"));
        assert!(snapshot.nodes.iter().any(|node| node.name == "Scene"));
        assert!(snapshot.nodes.iter().any(|node| node.name == "Loaded"));
    }

    #[test]
    fn restore_snapshot_clears_prior_environment_when_snapshot_has_none() {
        let mut scene = BevySceneWorld::new();
        let mut snapshot = scene.get_snapshot();
        snapshot.environment = Some(EnvironmentPatch {
            environment_id: "scene-environment".to_string(),
            source: None,
            mode: EnvironmentMode::BackgroundAndIbl,
            rotation_deg: 15.0,
            intensity: 1.0,
            exposure: 0.0,
            visible_as_background: true,
            background_color: Some([0.1, 0.2, 0.3, 1.0]),
        });
        scene.restore_snapshot(&snapshot);
        assert!(scene.get_snapshot().environment.is_some());

        let mut cleared = snapshot;
        cleared.environment = None;
        scene.restore_snapshot(&cleared);

        assert!(scene.get_snapshot().environment.is_none());
    }

    #[test]
    fn restore_snapshot_preserves_authored_lights() {
        let mut scene = BevySceneWorld::new();
        let mut snapshot = scene.get_snapshot();
        snapshot.nodes[0].id = "key_light".to_string();
        snapshot.nodes[0].name = "Key Light".to_string();
        snapshot.nodes[0].has_mesh = false;
        snapshot.nodes[0].has_light = true;
        snapshot.nodes[0].light = Some(LightPatch {
            node_id: "key_light".to_string(),
            kind: "spot".to_string(),
            color: [1.0, 0.8, 0.6],
            intensity: 4.0,
            range: Some(12.0),
            inner_cone_angle: Some(0.1),
            outer_cone_angle: Some(0.7),
            shadow: Some(crate::scene_control::LightShadowPatch {
                enabled: true,
                resolution: Some(1024),
                bias: Some(0.001),
            }),
        });

        scene.restore_snapshot(&snapshot);
        let restored = scene.get_snapshot();
        let node = restored
            .nodes
            .iter()
            .find(|node| node.id == "key_light")
            .expect("restored light node");

        assert!(node.has_light);
        assert_eq!(node.light.as_ref().unwrap().kind, "spot");
        assert_eq!(node.light.as_ref().unwrap().range, Some(12.0));
    }

    #[test]
    fn tick_writes_engine_playback_state_and_evaluated_pose() {
        let mut scene = BevySceneWorld::new();
        let (root, target) = {
            let ecs = &mut scene.world;
            let target = ecs
                .spawn((
                    SceneNodeId("node_0".to_string()),
                    NodeName("Target".to_string()),
                    Transform::default(),
                    GlobalTransform::identity(),
                ))
                .id();
            let clip = AnimationClipData {
                name: "Move".to_string(),
                duration: 1.0,
                channels: vec![AnimationChannel::from_flat(
                    "node_0".to_string(),
                    AnimationProperty::Translation,
                    &[0.0, 1.0],
                    &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                )],
            };
            let root = ecs
                .spawn((SceneRoot, AnimationTarget { clips: vec![clip] }))
                .id();
            (root, target)
        };

        scene.tick("Move", 1.25);

        let ecs = &mut scene.world;
        let state = ecs
            .get::<SceneAnimationPlaybackState>(root)
            .expect("playback state is stored in ECS");
        assert_eq!(state.clip_name.as_deref(), Some("Move"));
        assert!((state.time_cursor - 1.25).abs() < f32::EPSILON);
        assert!((state.evaluated_time - 0.25).abs() < f32::EPSILON);
        assert!(state.playing);

        let transform = ecs.get::<Transform>(target).unwrap();
        assert!((transform.position.x - 0.25).abs() < f32::EPSILON);
    }

    #[test]
    fn snapshot_includes_local_and_world_mesh_bounds() {
        let mut scene = BevySceneWorld::new();
        {
            let ecs = &mut scene.world;
            ecs.spawn((
                SceneNodeId("node_0".to_string()),
                NodeName("Mesh".to_string()),
                Transform {
                    position: Vec3::new(10.0, 0.0, 0.0),
                    rotation: glam::Quat::IDENTITY,
                    scale: Vec3::new(2.0, 3.0, 4.0),
                },
                GlobalTransform::identity(),
                Visible(true),
                MeshRef {
                    asset: crate::asset_database::AssetHandle::for_mesh("mesh.glb", 0),
                    uri: "mesh.glb".to_string(),
                    primitive_index: 0,
                },
                MeshBounds {
                    local: SceneBounds3::new([-1.0, -2.0, -3.0], [1.0, 2.0, 3.0]),
                },
            ));
        }
        systems::transform_propagation(&mut scene.world);

        let snapshot = scene.get_snapshot();
        let node = snapshot
            .nodes
            .iter()
            .find(|node| node.id == "node_0")
            .unwrap();

        assert_eq!(node.bounds.unwrap().min, [-1.0, -2.0, -3.0]);
        assert_eq!(node.bounds.unwrap().max, [1.0, 2.0, 3.0]);
        assert_eq!(node.world_bounds.unwrap().min, [8.0, -6.0, -12.0]);
        assert_eq!(node.world_bounds.unwrap().max, [12.0, 6.0, 12.0]);
    }
}
