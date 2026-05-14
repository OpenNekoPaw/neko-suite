//! Dual access contracts for scene runtime worlds.
//!
//! Creative access represents user intent and revision-aware authoring. Data
//! access represents typed, bulk ECS operations needed by render, export, and
//! modeling pipelines without exposing a raw `World` to callers.

use crate::asset_database::{AssetDatabase, AssetHandle};
use crate::components::{AnimationClipData, Camera, Light, MeshRef};
use crate::modeling_session::{
    BrushPatchApplyOutcome, ModelingSession, ModelingSessionError, ModelingSessionStateDelta,
    TopologyChangeEvent, TopologyOperation, VertexBrushPatchMetadata,
};
use crate::scene_control::{SceneCommandAck, SceneCommandEnvelope};
use crate::world::{SceneDelta, SceneSnapshot, SceneWorld};
use bevy_ecs::prelude::World;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// User-intent access surface for editor and controller operations.
pub trait CreativeAccess: SceneWorld {
    /// Read the current scene revision, initializing control resources if needed.
    fn current_revision(&mut self) -> u64;
}

/// Data-oriented access surface for render, export, and domain pipelines.
pub trait DataAccess: Send + Sync {
    /// Extract a render snapshot through a typed extractor owned by the caller.
    fn extract_render_world<C, E>(
        &mut self,
        input: SceneRenderExtractInput<'_, C>,
        extractor: &mut E,
    ) -> SceneRenderExtraction<E::RenderWorld, E::Stats>
    where
        E: SceneRenderExtractor<C>;

    /// Read serialized entity/component projections for export and project files.
    fn serialize_entities(&mut self, filter: SceneEntityFilter) -> SerializedSceneEntities;

    /// Spawn a controlled procedural mesh entity.
    fn spawn_procedural(&mut self, spec: ProceduralSceneEntitySpec) -> ProceduralSceneEntity;

    /// Read a mesh URI for CSG or data-pipeline lookup.
    fn mesh_uri(&mut self, node_id: &str) -> Result<String, String>;

    /// Restore mesh references onto nodes after a project snapshot import.
    fn insert_mesh_refs(&mut self, refs: &[SceneNodeMeshRef]);

    /// Apply a validated scene command batch against the ECS world.
    fn apply_scene_command_batch<Q>(
        &mut self,
        queue: &mut Q,
        envelope: SceneCommandEnvelope,
    ) -> Vec<SceneCommandAck>
    where
        Q: SceneCommandBatch;

    /// Extract a scene delta for an optional applied command sequence.
    fn extract_delta(&mut self, applied_seq: Option<u64>) -> SceneDelta;

    /// Begin a modeling session and return the matching scene delta.
    fn begin_modeling_session(
        &mut self,
        request: BeginModelingSession,
    ) -> Result<(ModelingSession, SceneDelta), ModelingSessionError>;

    /// Commit a modeling session and return the matching scene delta.
    fn commit_modeling_session(
        &mut self,
        request: CommitModelingSession,
    ) -> Result<(TopologyChangeEvent, SceneDelta), ModelingSessionError>;

    /// Cancel a modeling session and return the matching scene delta.
    fn cancel_modeling_session(
        &mut self,
        session_id: &str,
    ) -> Result<(ModelingSessionStateDelta, SceneDelta), ModelingSessionError>;

    /// Apply a vertex brush patch through the modeling session manager.
    fn apply_vertex_brush_patch(
        &mut self,
        patch: VertexBrushPatchMetadata,
    ) -> Result<BrushPatchApplyOutcome, ModelingSessionError>;
}

/// Kernel-side render extract adapter.
pub trait SceneRenderExtractor<C> {
    type RenderWorld;
    type Stats;

    fn extract(
        &mut self,
        world: &mut World,
        input: SceneRenderExtractInput<'_, C>,
    ) -> SceneRenderExtraction<Self::RenderWorld, Self::Stats>;
}

/// Input for a render extraction pass.
#[derive(Debug, Clone, Copy)]
pub struct SceneRenderExtractInput<'a, C> {
    pub asset_database: &'a AssetDatabase,
    pub camera: &'a C,
}

/// Output of a render extraction pass.
#[derive(Debug, Clone)]
pub struct SceneRenderExtraction<R, S> {
    pub revision: u64,
    pub render_world: R,
    pub stats: S,
}

/// Filter for serialized scene data readers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SceneEntityFilter {
    All,
    Export,
    Project,
}

/// Export/project data projection from ECS components.
#[derive(Debug, Clone, Default)]
pub struct SerializedSceneEntities {
    pub export_refs: Vec<SceneExportRef>,
    pub animation_clips: Vec<AnimationClipData>,
    pub node_mesh_map: HashMap<String, String>,
}

/// Export-relevant data for one scene node.
#[derive(Debug, Clone)]
pub struct SceneExportRef {
    pub node_id: String,
    pub mesh_uri: Option<String>,
    pub material_handle: Option<AssetHandle>,
    pub light: Option<Light>,
    pub camera: Option<Camera>,
}

/// Controlled procedural entity creation request.
#[derive(Debug, Clone)]
pub struct ProceduralSceneEntitySpec {
    pub uri: String,
    pub label: String,
}

/// Result of controlled procedural entity creation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProceduralSceneEntity {
    pub node_id: String,
    pub name: String,
}

/// Mesh reference restoration request for project import.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SceneNodeMeshRef {
    pub node_id: String,
    pub mesh_uri: String,
    pub primitive_index: usize,
}

impl SceneNodeMeshRef {
    pub fn mesh_ref(&self) -> MeshRef {
        MeshRef {
            asset: AssetHandle::for_mesh(&self.mesh_uri, self.primitive_index),
            uri: self.mesh_uri.clone(),
            primitive_index: self.primitive_index,
        }
    }
}

/// Adapter trait for command queues that need temporary ECS access.
pub trait SceneCommandBatch {
    fn apply_to_world(
        &mut self,
        world: &mut World,
        envelope: SceneCommandEnvelope,
    ) -> Vec<SceneCommandAck>;
}

#[derive(Debug, Clone)]
pub struct BeginModelingSession {
    pub session_id: String,
    pub mesh_id: String,
    pub character_id: Option<String>,
    pub topology_mutable: bool,
    pub before_hash: String,
}

#[derive(Debug, Clone)]
pub struct CommitModelingSession {
    pub session_id: String,
    pub operation: TopologyOperation,
    pub vertex_count_before: u32,
    pub vertex_count_after: u32,
}

#[allow(dead_code)]
#[deprecated(
    since = "0.0.0",
    note = "Migration-only escape hatch; use CreativeAccess or DataAccess typed methods"
)]
pub(crate) trait RawWorldAccess {
    fn ecs_world_mut_raw(&mut self) -> &mut World;
}

#[allow(dead_code)]
pub(crate) fn snapshot_from_world(world: &mut dyn SceneWorld) -> SceneSnapshot {
    world.get_snapshot()
}
