//! Scene control primitives for command-driven authoring.
//!
//! This module owns revision, node indexing, dirty tracking, and the minimal
//! command application surface. Transport-level ordering and ack semantics are
//! layered on top by engine-kernel/host-http.

use crate::character_authoring::{
    ensure_character_authoring_store, CharacterAuthoringModule, CharacterAuthoringMutationError,
    CharacterAuthoringStore, LayeredCharacterDescription,
};
use crate::components::{
    AnimationProperty, AnimationTarget, Camera, CharacterInstanceId, CharacterMaterialLayers,
    CharacterMorphWeights, CharacterOverrides, GlobalTransform, Light, LightKind, LightShadow,
    MeshRef, NodeName, SceneNodeId, Skeleton, SkeletonPose, Transform, Visible,
};
use crate::hierarchy::{self, Children, Parent};
use crate::modeling_session::{ModelingSessionManager, TopologyOperation};
use crate::systems;
use crate::world::{
    CharacterMaterialUpdate, CharacterMorphWeightsUpdate, CharacterOverrideUpdate,
    CharacterSkeletonPoseUpdate, EnvironmentPatch, MorphWeightsUpdate, NodeRemoveCommand,
    SceneDelta, SceneNodePatch, SceneNodeTransformPatch, TransformUpdate, VisibilityUpdate,
};
use bevy_ecs::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, Default, Resource, Serialize, Deserialize)]
pub struct SceneRevision(pub u64);

impl SceneRevision {
    pub fn current(self) -> u64 {
        self.0
    }

    pub fn advance(&mut self) -> u64 {
        self.0 = self.0.saturating_add(1);
        self.0
    }
}

#[derive(Debug, Clone, Default, Resource)]
pub struct NodeIndex {
    by_node_id: HashMap<String, Entity>,
}

impl NodeIndex {
    pub fn get(&self, node_id: &str) -> Option<Entity> {
        self.by_node_id.get(node_id).copied()
    }

    pub fn insert(&mut self, node_id: impl Into<String>, entity: Entity) {
        self.by_node_id.insert(node_id.into(), entity);
    }

    pub fn remove(&mut self, node_id: &str) {
        self.by_node_id.remove(node_id);
    }

    pub fn len(&self) -> usize {
        self.by_node_id.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_node_id.is_empty()
    }
}

#[derive(Debug, Clone, Default, Resource, Serialize, Deserialize)]
pub struct DirtyTracker {
    pub added_nodes: HashSet<String>,
    pub transforms: HashSet<String>,
    pub morph_weights: HashSet<String>,
    pub hierarchy: HashSet<String>,
    pub visibility: HashSet<String>,
    pub materials: HashSet<String>,
    pub lights: HashSet<String>,
    pub removed_nodes: HashSet<String>,
    pub character_morph_weights: HashSet<String>,
    pub character_materials: HashSet<String>,
    pub character_skeleton_pose: HashSet<String>,
    pub character_overrides: HashSet<String>,
    pub environment: bool,
}

impl DirtyTracker {
    pub fn clear(&mut self) {
        self.added_nodes.clear();
        self.transforms.clear();
        self.morph_weights.clear();
        self.hierarchy.clear();
        self.visibility.clear();
        self.materials.clear();
        self.lights.clear();
        self.removed_nodes.clear();
        self.character_morph_weights.clear();
        self.character_materials.clear();
        self.character_skeleton_pose.clear();
        self.character_overrides.clear();
        self.environment = false;
    }

    pub fn is_empty(&self) -> bool {
        self.added_nodes.is_empty()
            && self.transforms.is_empty()
            && self.morph_weights.is_empty()
            && self.hierarchy.is_empty()
            && self.visibility.is_empty()
            && self.materials.is_empty()
            && self.lights.is_empty()
            && self.removed_nodes.is_empty()
            && self.character_morph_weights.is_empty()
            && self.character_materials.is_empty()
            && self.character_skeleton_pose.is_empty()
            && self.character_overrides.is_empty()
            && !self.environment
    }
}

#[derive(Debug, Clone, Default, Resource, Serialize, Deserialize)]
pub struct SceneEnvironmentState {
    pub current: Option<EnvironmentPatch>,
    pub diagnostics: Vec<EnvironmentDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    #[serde(default)]
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SceneCommandEvent {
    AddNode {
        kind: String,
        payload_json: String,
    },
    RemoveNode(NodeRemoveCommand),
    SetTransform {
        node_id: String,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
    },
    SetVisibility {
        node_id: String,
        visible: bool,
    },
    UpdateLight {
        patch: LightPatch,
    },
    SetEnvironment {
        patch: EnvironmentPatch,
    },
    UpdateEnvironment {
        patch: EnvironmentPatch,
    },
    ClearEnvironment {
        environment_id: Option<String>,
    },
    UpdateViewportSettings {
        scene_id: Option<String>,
        viewport_id: String,
        settings_json: String,
    },
    SetAnimationPlayback {
        action: AnimationPlaybackAction,
        clip_name: Option<String>,
        time_ms: Option<f32>,
        fade_duration: Option<f32>,
        loop_anim: bool,
        root_motion_enabled: bool,
        root_node_id: Option<String>,
    },
    SetCharacterMorph {
        character_id: String,
        morph_id: String,
        weight: f32,
        topology_version: u64,
    },
    SetCharacterMaterialLayer {
        character_id: String,
        slot_id: String,
        params_json: String,
        topology_version: u64,
    },
    SetCharacterBonePose {
        character_id: String,
        bone_id: String,
        position: [f32; 3],
        rotation: [f32; 4],
        scale: [f32; 3],
        topology_version: u64,
    },
    ApplyCharacterExpressionPreset {
        character_id: String,
        preset_id: String,
        weight: f32,
        topology_version: u64,
    },
    ApplyCharacterOverride {
        character_id: String,
        path: String,
        value_type: String,
        value_json: String,
        topology_version: u64,
    },
    BeginModelingSession {
        session_id: String,
        mesh_id: String,
        character_id: Option<String>,
        topology_mutable: bool,
        before_hash: String,
    },
    CommitModelingSession {
        session_id: String,
        operation: TopologyOperation,
        vertex_count_before: u32,
        vertex_count_after: u32,
    },
    CancelModelingSession {
        session_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LightPatch {
    pub node_id: String,
    pub kind: String,
    pub color: [f32; 3],
    pub intensity: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inner_cone_angle: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outer_cone_angle: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow: Option<LightShadowPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LightShadowPatch {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bias: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct LightNodeAddPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    node_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    parent_id: Option<String>,
    #[serde(default)]
    visible: Option<bool>,
    #[serde(default)]
    transform: Option<LightNodeTransformPayload>,
    #[serde(default)]
    light: Option<LightPatch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    color: Option<[f32; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    intensity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    range: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    inner_cone_angle: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    outer_cone_angle: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    shadow: Option<LightShadowPatch>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct LightNodeTransformPayload {
    #[serde(default)]
    position: Option<[f32; 3]>,
    #[serde(default)]
    rotation: Option<[f32; 4]>,
    #[serde(default)]
    scale: Option<[f32; 3]>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnimationPlaybackAction {
    Select,
    Play,
    Pause,
    Stop,
    Crossfade,
    Seek,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SceneCommandPhase {
    Begin,
    Update,
    End,
    Cancel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneCommandEnvelope {
    pub seq: u64,
    pub base_revision: u64,
    pub transaction_id: Option<String>,
    pub phase: Option<SceneCommandPhase>,
    pub coalesce_key: Option<String>,
    pub event: SceneCommandEvent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SceneCommandAckStatus {
    Applied,
    Rejected,
    Superseded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneCommandAck {
    pub seq: u64,
    pub applied_seq: u64,
    pub base_revision: u64,
    pub revision: u64,
    pub status: SceneCommandAckStatus,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedSceneCommand {
    pub superseded_seq: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SceneCommandValidationError {
    #[error("seq {seq} is not greater than last seen seq {last_seq}")]
    NonMonotonicSeq { seq: u64, last_seq: u64 },
    #[error("base revision {base_revision} is older than current revision {current_revision}")]
    StaleRevision {
        base_revision: u64,
        current_revision: u64,
    },
    #[error("base revision {base_revision} is newer than current revision {current_revision}")]
    FutureRevision {
        base_revision: u64,
        current_revision: u64,
    },
    #[error("transaction phase requires transaction_id")]
    MissingTransactionId,
    #[error("transaction '{0}' is already active")]
    TransactionAlreadyActive(String),
    #[error("transaction '{0}' is not active")]
    TransactionNotActive(String),
}

#[derive(Debug, Default)]
pub struct SceneCommandValidator {
    last_seen_seq: u64,
    has_seen_seq: bool,
    active_transactions: HashSet<String>,
    coalesce_latest_seq: HashMap<String, u64>,
}

impl SceneCommandValidator {
    pub fn validate(
        &mut self,
        envelope: &SceneCommandEnvelope,
        current_revision: u64,
    ) -> Result<ValidatedSceneCommand, SceneCommandValidationError> {
        if self.has_seen_seq && envelope.seq <= self.last_seen_seq {
            return Err(SceneCommandValidationError::NonMonotonicSeq {
                seq: envelope.seq,
                last_seq: self.last_seen_seq,
            });
        }
        self.last_seen_seq = envelope.seq;
        self.has_seen_seq = true;

        if envelope.base_revision < current_revision {
            return Err(SceneCommandValidationError::StaleRevision {
                base_revision: envelope.base_revision,
                current_revision,
            });
        }
        if envelope.base_revision > current_revision {
            return Err(SceneCommandValidationError::FutureRevision {
                base_revision: envelope.base_revision,
                current_revision,
            });
        }

        self.validate_transaction(envelope)?;
        let superseded_seq = envelope
            .coalesce_key
            .as_ref()
            .and_then(|key| self.coalesce_latest_seq.insert(key.clone(), envelope.seq));

        Ok(ValidatedSceneCommand { superseded_seq })
    }

    fn validate_transaction(
        &mut self,
        envelope: &SceneCommandEnvelope,
    ) -> Result<(), SceneCommandValidationError> {
        let Some(phase) = envelope.phase else {
            return Ok(());
        };
        let transaction_id = envelope
            .transaction_id
            .as_ref()
            .ok_or(SceneCommandValidationError::MissingTransactionId)?;

        match phase {
            SceneCommandPhase::Begin => {
                if !self.active_transactions.insert(transaction_id.clone()) {
                    return Err(SceneCommandValidationError::TransactionAlreadyActive(
                        transaction_id.clone(),
                    ));
                }
            }
            SceneCommandPhase::Update => {
                if !self.active_transactions.contains(transaction_id) {
                    return Err(SceneCommandValidationError::TransactionNotActive(
                        transaction_id.clone(),
                    ));
                }
            }
            SceneCommandPhase::End | SceneCommandPhase::Cancel => {
                if !self.active_transactions.remove(transaction_id) {
                    return Err(SceneCommandValidationError::TransactionNotActive(
                        transaction_id.clone(),
                    ));
                }
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandApplyOutcome {
    pub revision: u64,
    pub dirty: DirtyTracker,
}

#[derive(Debug, thiserror::Error)]
pub enum CommandApplyError {
    #[error("Node not found: {0}")]
    NodeNotFound(String),
    #[error("Node already exists: {0}")]
    NodeAlreadyExists(String),
    #[error("Node remove rejected: {0}")]
    NodeRemoveRejected(String),
    #[error("Invalid light command: {0}")]
    InvalidLightCommand(String),
    #[error("Light component not found: {0}")]
    LightNotFound(String),
    #[error("Character not found: {0}")]
    CharacterNotFound(String),
    #[error("Character command rejected: {0}")]
    CharacterCommandRejected(String),
    #[error("Modeling command rejected: {0}")]
    ModelingCommandRejected(String),
    #[error("Animation command rejected: {0}")]
    AnimationCommandRejected(String),
    #[error("Scene command is not implemented yet: {0}")]
    UnsupportedCommand(String),
}

pub struct CommandApplySystem;

impl CommandApplySystem {
    pub fn apply(
        world: &mut World,
        event: SceneCommandEvent,
    ) -> Result<CommandApplyOutcome, CommandApplyError> {
        ensure_scene_control_resources(world);
        rebuild_node_index(world);

        match event {
            SceneCommandEvent::AddNode { kind, payload_json } => {
                if kind == "light" {
                    apply_add_light_node(world, &payload_json)?;
                } else {
                    return Err(CommandApplyError::UnsupportedCommand(format!(
                        "node-add/{kind}"
                    )));
                }
            }
            SceneCommandEvent::RemoveNode(command) => {
                apply_remove_node(world, command)?;
            }
            SceneCommandEvent::SetTransform {
                node_id,
                position,
                rotation,
                scale,
            } => {
                let entity = find_indexed_node(world, &node_id)?;
                if let Some(mut transform) = world.get_mut::<Transform>(entity) {
                    transform.position = glam::Vec3::from(position);
                    transform.rotation = glam::Quat::from_array(rotation);
                    transform.scale = glam::Vec3::from(scale);
                }
                systems::transform_propagation(world);
                mark_transform_dirty(world, &node_id);
            }
            SceneCommandEvent::SetVisibility { node_id, visible } => {
                let entity = find_indexed_node(world, &node_id)?;
                if let Some(mut visibility) = world.get_mut::<Visible>(entity) {
                    visibility.0 = visible;
                } else {
                    world.entity_mut(entity).insert(Visible(visible));
                }
                mark_visibility_dirty(world, &node_id);
            }
            SceneCommandEvent::UpdateLight { patch } => {
                apply_light_update(world, patch)?;
            }
            SceneCommandEvent::SetEnvironment { patch } => {
                apply_environment_set(world, patch)?;
            }
            SceneCommandEvent::UpdateEnvironment { patch } => {
                apply_environment_update(world, patch)?;
            }
            SceneCommandEvent::ClearEnvironment { environment_id } => {
                apply_environment_clear(world, environment_id)?;
            }
            SceneCommandEvent::UpdateViewportSettings { .. } => {
                let revision = world.resource::<SceneRevision>().current();
                let dirty = DirtyTracker::default();
                return Ok(CommandApplyOutcome { revision, dirty });
            }
            SceneCommandEvent::SetAnimationPlayback {
                action,
                clip_name,
                time_ms,
                fade_duration,
                loop_anim,
                root_motion_enabled,
                root_node_id,
            } => {
                apply_animation_playback_command(
                    world,
                    action,
                    clip_name,
                    time_ms,
                    fade_duration,
                    loop_anim,
                    root_motion_enabled,
                    root_node_id,
                )?;
            }
            SceneCommandEvent::SetCharacterMorph {
                character_id,
                morph_id,
                weight,
                topology_version,
            } => {
                guard_parametric_command(world, Some(&character_id), topology_version)?;
                apply_character_authoring_command(world, |store| {
                    store.set_morph_weight(&character_id, &morph_id, weight, topology_version)
                })?;
            }
            SceneCommandEvent::SetCharacterMaterialLayer {
                character_id,
                slot_id,
                params_json,
                topology_version,
            } => {
                guard_parametric_command(world, Some(&character_id), topology_version)?;
                apply_character_authoring_command(world, |store| {
                    store.set_material_layer(
                        &character_id,
                        &slot_id,
                        &params_json,
                        topology_version,
                    )
                })?;
            }
            SceneCommandEvent::SetCharacterBonePose {
                character_id,
                bone_id,
                position,
                rotation,
                scale,
                topology_version,
            } => {
                guard_parametric_command(world, Some(&character_id), topology_version)?;
                apply_character_authoring_command(world, |store| {
                    store.set_bone_pose(
                        &character_id,
                        &bone_id,
                        position,
                        rotation,
                        scale,
                        topology_version,
                    )
                })?;
            }
            SceneCommandEvent::ApplyCharacterExpressionPreset {
                character_id,
                preset_id,
                weight,
                topology_version,
            } => {
                guard_parametric_command(world, Some(&character_id), topology_version)?;
                apply_character_authoring_command(world, |store| {
                    store.apply_expression_preset(
                        &character_id,
                        &preset_id,
                        weight,
                        topology_version,
                    )
                })?;
            }
            SceneCommandEvent::ApplyCharacterOverride {
                character_id,
                path,
                value_type,
                value_json,
                topology_version,
            } => {
                guard_parametric_command(world, Some(&character_id), topology_version)?;
                apply_character_authoring_command(world, |store| {
                    store.apply_override(
                        &character_id,
                        &path,
                        &value_type,
                        &value_json,
                        topology_version,
                    )
                })?;
            }
            SceneCommandEvent::BeginModelingSession {
                session_id,
                mesh_id,
                character_id,
                topology_mutable,
                before_hash,
            } => {
                ensure_modeling_session_manager(world)
                    .begin(
                        session_id,
                        mesh_id,
                        character_id,
                        topology_mutable,
                        before_hash,
                    )
                    .map_err(|error| {
                        CommandApplyError::ModelingCommandRejected(error.to_string())
                    })?;
            }
            SceneCommandEvent::CommitModelingSession {
                session_id,
                operation,
                vertex_count_before,
                vertex_count_after,
            } => {
                ensure_modeling_session_manager(world)
                    .commit(
                        &session_id,
                        operation,
                        vertex_count_before,
                        vertex_count_after,
                    )
                    .map_err(|error| {
                        CommandApplyError::ModelingCommandRejected(error.to_string())
                    })?;
            }
            SceneCommandEvent::CancelModelingSession { session_id } => {
                ensure_modeling_session_manager(world)
                    .cancel(&session_id)
                    .map_err(|error| {
                        CommandApplyError::ModelingCommandRejected(error.to_string())
                    })?;
            }
        }

        let revision = advance_scene_revision(world);
        let dirty = world.resource::<DirtyTracker>().clone();
        Ok(CommandApplyOutcome { revision, dirty })
    }
}

pub fn ensure_scene_control_resources(world: &mut World) {
    if !world.contains_resource::<SceneRevision>() {
        world.insert_resource(SceneRevision::default());
    }
    if !world.contains_resource::<NodeIndex>() {
        world.insert_resource(NodeIndex::default());
    }
    if !world.contains_resource::<DirtyTracker>() {
        world.insert_resource(DirtyTracker::default());
    }
    if !world.contains_resource::<SceneEnvironmentState>() {
        world.insert_resource(SceneEnvironmentState::default());
    }
}

pub fn rebuild_node_index(world: &mut World) {
    ensure_scene_control_resources(world);
    let entries: Vec<(String, Entity)> = {
        let mut query = world.query::<(Entity, &SceneNodeId)>();
        query
            .iter(world)
            .map(|(entity, node_id)| (node_id.0.clone(), entity))
            .collect()
    };

    let mut index = NodeIndex::default();
    for (node_id, entity) in entries {
        index.insert(node_id, entity);
    }
    world.insert_resource(index);
}

pub fn advance_scene_revision(world: &mut World) -> u64 {
    ensure_scene_control_resources(world);
    world.resource_mut::<SceneRevision>().advance()
}

pub fn mark_transform_dirty(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .transforms
        .insert(node_id.to_string());
}

pub fn mark_node_added(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .added_nodes
        .insert(node_id.to_string());
}

pub fn mark_morph_weights_dirty(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .morph_weights
        .insert(node_id.to_string());
}

pub fn mark_hierarchy_dirty(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .hierarchy
        .insert(node_id.to_string());
}

pub fn mark_visibility_dirty(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .visibility
        .insert(node_id.to_string());
}

pub fn mark_material_dirty(world: &mut World, material_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .materials
        .insert(material_id.to_string());
}

pub fn mark_light_dirty(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .lights
        .insert(node_id.to_string());
}

pub fn mark_node_removed(world: &mut World, node_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .removed_nodes
        .insert(node_id.to_string());
}

pub fn mark_character_morph_weights_dirty(world: &mut World, character_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .character_morph_weights
        .insert(character_id.to_string());
}

pub fn mark_character_materials_dirty(world: &mut World, character_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .character_materials
        .insert(character_id.to_string());
}

pub fn mark_character_skeleton_pose_dirty(world: &mut World, character_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .character_skeleton_pose
        .insert(character_id.to_string());
}

pub fn mark_character_overrides_dirty(world: &mut World, character_id: &str) {
    ensure_scene_control_resources(world);
    world
        .resource_mut::<DirtyTracker>()
        .character_overrides
        .insert(character_id.to_string());
}

pub fn mark_environment_dirty(world: &mut World) {
    ensure_scene_control_resources(world);
    world.resource_mut::<DirtyTracker>().environment = true;
}

pub fn set_environment_diagnostics(world: &mut World, diagnostics: Vec<EnvironmentDiagnostic>) {
    ensure_scene_control_resources(world);
    world.resource_mut::<SceneEnvironmentState>().diagnostics = diagnostics;
    mark_environment_dirty(world);
}

pub fn current_environment(world: &mut World) -> Option<EnvironmentPatch> {
    ensure_scene_control_resources(world);
    world.resource::<SceneEnvironmentState>().current.clone()
}

pub fn extract_scene_delta(world: &mut World, applied_seq: Option<u64>) -> SceneDelta {
    ensure_scene_control_resources(world);
    rebuild_node_index(world);

    let revision = world.resource::<SceneRevision>().current();
    let dirty = world.resource::<DirtyTracker>().clone();

    let added_nodes = dirty
        .added_nodes
        .iter()
        .filter_map(|node_id| {
            find_indexed_node(world, node_id)
                .ok()
                .and_then(|entity| scene_node_patch(world, entity))
        })
        .collect();

    let updated_transforms = dirty
        .transforms
        .iter()
        .filter_map(|node_id| {
            find_indexed_node(world, node_id).ok().and_then(|entity| {
                world
                    .get::<Transform>(entity)
                    .map(|transform| TransformUpdate {
                        node_id: node_id.clone(),
                        position: transform.position.to_array(),
                        rotation: transform.rotation.to_array(),
                        scale: transform.scale.to_array(),
                    })
            })
        })
        .collect();

    let updated_morph_weights = dirty
        .morph_weights
        .iter()
        .filter_map(|node_id| {
            find_indexed_node(world, node_id).ok().and_then(|entity| {
                world
                    .get::<crate::components::MorphWeights>(entity)
                    .map(|morph_weights| MorphWeightsUpdate {
                        node_id: node_id.clone(),
                        weights: morph_weights.weights.clone(),
                    })
            })
        })
        .collect();

    let updated_visibility = dirty
        .visibility
        .iter()
        .filter_map(|node_id| {
            find_indexed_node(world, node_id)
                .ok()
                .map(|entity| VisibilityUpdate {
                    node_id: node_id.clone(),
                    visible: world.get::<Visible>(entity).is_none_or(|visible| visible.0),
                })
        })
        .collect();

    let updated_lights = dirty
        .lights
        .iter()
        .filter_map(|node_id| {
            find_indexed_node(world, node_id).ok().and_then(|entity| {
                world
                    .get::<Light>(entity)
                    .map(|light| light_patch_from_component(node_id, light))
            })
        })
        .collect();

    let updated_character_morph_weights = dirty
        .character_morph_weights
        .iter()
        .filter_map(|character_id| {
            find_character_entity(world, character_id)
                .ok()
                .and_then(|entity| {
                    world.get::<CharacterMorphWeights>(entity).map(|weights| {
                        CharacterMorphWeightsUpdate {
                            character_id: character_id.clone(),
                            weights: weights.weights.clone(),
                            topology_version: weights.topology_version,
                        }
                    })
                })
        })
        .collect();

    let updated_character_materials = dirty
        .character_materials
        .iter()
        .filter_map(|character_id| {
            find_character_entity(world, character_id)
                .ok()
                .and_then(|entity| {
                    world.get::<CharacterMaterialLayers>(entity).map(|layers| {
                        CharacterMaterialUpdate {
                            character_id: character_id.clone(),
                            layers: layers.layers.clone(),
                        }
                    })
                })
        })
        .collect();

    let updated_skeleton_pose = dirty
        .character_skeleton_pose
        .iter()
        .filter_map(|character_id| {
            find_character_entity(world, character_id)
                .ok()
                .and_then(|entity| {
                    world
                        .get::<SkeletonPose>(entity)
                        .map(|pose| CharacterSkeletonPoseUpdate {
                            character_id: character_id.clone(),
                            bones: pose.bones.clone(),
                        })
                })
        })
        .collect();

    let character_overrides = dirty
        .character_overrides
        .iter()
        .filter_map(|character_id| {
            find_character_entity(world, character_id)
                .ok()
                .and_then(|entity| {
                    world.get::<CharacterOverrides>(entity).map(|overrides| {
                        CharacterOverrideUpdate {
                            character_id: character_id.clone(),
                            overrides: overrides.entries.clone(),
                        }
                    })
                })
        })
        .collect();

    let removed_nodes = dirty.removed_nodes.iter().cloned().collect();
    let environment = dirty
        .environment
        .then(|| world.resource::<SceneEnvironmentState>().current.clone());
    let environment_diagnostics = if dirty.environment {
        world
            .resource::<SceneEnvironmentState>()
            .diagnostics
            .clone()
    } else {
        Vec::new()
    };
    let modeling_delta = world
        .get_resource_mut::<ModelingSessionManager>()
        .map(|mut manager| manager.take_delta())
        .unwrap_or_default();
    world.resource_mut::<DirtyTracker>().clear();

    SceneDelta {
        revision,
        applied_seq,
        added_nodes,
        updated_transforms,
        updated_morph_weights,
        updated_visibility,
        updated_lights,
        removed_nodes,
        updated_character_morph_weights,
        updated_character_materials,
        updated_skeleton_pose,
        character_overrides,
        modeling_sessions: modeling_delta.sessions,
        topology_changes: modeling_delta.topology_changes,
        environment,
        selected_targets: Vec::new(),
        environment_diagnostics,
    }
}

fn find_indexed_node(world: &mut World, node_id: &str) -> Result<Entity, CommandApplyError> {
    world
        .resource::<NodeIndex>()
        .get(node_id)
        .ok_or_else(|| CommandApplyError::NodeNotFound(node_id.to_string()))
}

fn find_character_entity(
    world: &mut World,
    character_id: &str,
) -> Result<Entity, CommandApplyError> {
    let mut query = world.query::<(Entity, &CharacterInstanceId)>();
    query
        .iter(world)
        .find_map(|(entity, id)| (id.0 == character_id).then_some(entity))
        .ok_or_else(|| CommandApplyError::CharacterNotFound(character_id.to_string()))
}

fn apply_add_light_node(world: &mut World, payload_json: &str) -> Result<(), CommandApplyError> {
    let payload: LightNodeAddPayload = serde_json::from_str(payload_json)
        .map_err(|error| CommandApplyError::InvalidLightCommand(error.to_string()))?;
    let mut patch = light_patch_from_add_payload(&payload)?;
    let node_id = payload
        .node_id
        .filter(|value| !value.is_empty())
        .or_else(|| (!patch.node_id.is_empty()).then_some(patch.node_id.clone()))
        .unwrap_or_else(|| generate_light_node_id(world));
    patch.node_id = node_id.clone();

    if world.resource::<NodeIndex>().get(&node_id).is_some() {
        return Err(CommandApplyError::NodeAlreadyExists(node_id));
    }

    let transform = transform_from_payload(payload.transform);
    let name = payload
        .name
        .unwrap_or_else(|| default_light_name(&patch.kind));
    let visible = payload.visible.unwrap_or(true);
    let light = light_from_patch(&patch)?;
    let entity = world
        .spawn((
            SceneNodeId(node_id.clone()),
            NodeName(name),
            transform,
            GlobalTransform::identity(),
            Visible(visible),
            light,
        ))
        .id();

    if let Some(parent_id) = payload.parent_id.filter(|value| !value.is_empty()) {
        let parent = find_indexed_node(world, &parent_id)?;
        hierarchy::set_parent(world, entity, parent);
    }

    systems::transform_propagation(world);
    rebuild_node_index(world);
    mark_node_added(world, &node_id);
    mark_light_dirty(world, &node_id);
    mark_transform_dirty(world, &node_id);
    mark_visibility_dirty(world, &node_id);
    Ok(())
}

fn light_patch_from_add_payload(
    payload: &LightNodeAddPayload,
) -> Result<LightPatch, CommandApplyError> {
    if let Some(light) = payload.light.clone() {
        return Ok(light);
    }

    Ok(LightPatch {
        node_id: payload.node_id.clone().unwrap_or_default(),
        kind: payload.kind.clone().unwrap_or_else(|| "point".to_string()),
        color: payload.color.unwrap_or([1.0, 1.0, 1.0]),
        intensity: payload.intensity.unwrap_or(1.0),
        range: payload.range,
        inner_cone_angle: payload.inner_cone_angle,
        outer_cone_angle: payload.outer_cone_angle,
        shadow: payload.shadow.clone(),
    })
}

fn apply_light_update(world: &mut World, patch: LightPatch) -> Result<(), CommandApplyError> {
    let entity = find_indexed_node(world, &patch.node_id)?;
    if world.get::<Light>(entity).is_none() {
        return Err(CommandApplyError::LightNotFound(patch.node_id));
    }
    let light = light_from_patch(&patch)?;
    world.entity_mut(entity).insert(light);
    mark_light_dirty(world, &patch.node_id);
    Ok(())
}

fn apply_remove_node(
    world: &mut World,
    command: NodeRemoveCommand,
) -> Result<(), CommandApplyError> {
    let entity = find_indexed_node(world, &command.node_id)?;
    let cascade = command.cascade.unwrap_or(false);
    let descendants = hierarchy::get_descendants(world, entity);

    if !cascade && !descendants.is_empty() {
        return Err(CommandApplyError::NodeRemoveRejected(format!(
            "node '{}' has {} dependent child node(s); cascade=false",
            command.node_id,
            descendants.len()
        )));
    }

    let mut to_remove = Vec::with_capacity(descendants.len() + 1);
    to_remove.push(entity);
    to_remove.extend(descendants);

    if let Some(parent) = world.get::<Parent>(entity).map(|parent| parent.0) {
        if let Some(mut children) = world.get_mut::<Children>(parent) {
            children.remove(entity);
        }
    }

    let removed_node_ids: Vec<String> = to_remove
        .iter()
        .filter_map(|entity| world.get::<SceneNodeId>(*entity).map(|id| id.0.clone()))
        .collect();

    for entity in to_remove.into_iter().rev() {
        world.despawn(entity);
    }

    for node_id in removed_node_ids {
        mark_node_removed(world, &node_id);
    }
    rebuild_node_index(world);
    systems::transform_propagation(world);
    Ok(())
}

fn apply_environment_set(
    world: &mut World,
    patch: EnvironmentPatch,
) -> Result<(), CommandApplyError> {
    let patch = normalize_environment_patch(patch);
    world.resource_mut::<SceneEnvironmentState>().current = Some(patch);
    world
        .resource_mut::<SceneEnvironmentState>()
        .diagnostics
        .clear();
    mark_environment_dirty(world);
    Ok(())
}

fn apply_environment_update(
    world: &mut World,
    patch: EnvironmentPatch,
) -> Result<(), CommandApplyError> {
    let patch = normalize_environment_patch(patch);
    let state = world.resource_mut::<SceneEnvironmentState>();
    let mut next = state
        .current
        .clone()
        .filter(|current| current.environment_id == patch.environment_id)
        .unwrap_or_else(|| patch.clone());

    next.source = patch.source.or(next.source);
    next.mode = patch.mode;
    next.rotation_deg = patch.rotation_deg;
    next.intensity = patch.intensity;
    next.exposure = patch.exposure;
    next.visible_as_background = patch.visible_as_background;
    next.background_color = patch.background_color.or(next.background_color);

    world.resource_mut::<SceneEnvironmentState>().current = Some(next);
    world
        .resource_mut::<SceneEnvironmentState>()
        .diagnostics
        .clear();
    mark_environment_dirty(world);
    Ok(())
}

fn apply_environment_clear(
    world: &mut World,
    environment_id: Option<String>,
) -> Result<(), CommandApplyError> {
    let should_clear = {
        let state = world.resource::<SceneEnvironmentState>();
        match (&environment_id, &state.current) {
            (None, _) => true,
            (Some(_), None) => false,
            (Some(expected), Some(current)) => current.environment_id == *expected,
        }
    };

    if should_clear {
        world.resource_mut::<SceneEnvironmentState>().current = None;
        world
            .resource_mut::<SceneEnvironmentState>()
            .diagnostics
            .clear();
        mark_environment_dirty(world);
    }
    Ok(())
}

fn normalize_environment_patch(mut patch: EnvironmentPatch) -> EnvironmentPatch {
    patch.rotation_deg = normalize_degrees(patch.rotation_deg);
    patch.intensity = patch.intensity.max(0.0);
    patch.exposure = patch.exposure.clamp(-16.0, 16.0);
    if let Some(color) = patch.background_color {
        patch.background_color = Some([
            color[0].clamp(0.0, 1.0),
            color[1].clamp(0.0, 1.0),
            color[2].clamp(0.0, 1.0),
            color[3].clamp(0.0, 1.0),
        ]);
    }
    patch
}

fn normalize_degrees(value: f32) -> f32 {
    if !value.is_finite() {
        return 0.0;
    }
    let normalized = value % 360.0;
    if normalized < 0.0 {
        normalized + 360.0
    } else {
        normalized
    }
}

fn transform_from_payload(payload: Option<LightNodeTransformPayload>) -> Transform {
    let payload = payload.unwrap_or(LightNodeTransformPayload {
        position: None,
        rotation: None,
        scale: None,
    });
    Transform {
        position: glam::Vec3::from(payload.position.unwrap_or([0.0, 0.0, 0.0])),
        rotation: glam::Quat::from_array(payload.rotation.unwrap_or([0.0, 0.0, 0.0, 1.0])),
        scale: glam::Vec3::from(payload.scale.unwrap_or([1.0, 1.0, 1.0])),
    }
}

pub fn light_from_patch(patch: &LightPatch) -> Result<Light, CommandApplyError> {
    validate_positive("intensity", patch.intensity)?;
    if let Some(range) = patch.range {
        validate_positive("range", range)?;
    }

    let kind = match patch.kind.as_str() {
        "directional" => LightKind::Directional,
        "point" => LightKind::Point,
        "spot" => {
            let inner = patch.inner_cone_angle.unwrap_or(0.0);
            let outer = patch
                .outer_cone_angle
                .unwrap_or(std::f32::consts::FRAC_PI_4);
            if inner < 0.0 || outer < 0.0 || inner > outer {
                return Err(CommandApplyError::InvalidLightCommand(
                    "spot cone angles must satisfy 0 <= inner <= outer".to_string(),
                ));
            }
            LightKind::Spot {
                inner_cone: inner,
                outer_cone: outer,
            }
        }
        other => {
            return Err(CommandApplyError::InvalidLightCommand(format!(
                "unsupported light kind: {other}"
            )))
        }
    };

    Ok(Light {
        kind,
        color: glam::Vec3::from(patch.color),
        intensity: patch.intensity,
        range: patch.range,
        shadow: patch.shadow.as_ref().map(|shadow| LightShadow {
            enabled: shadow.enabled,
            resolution: shadow.resolution,
            bias: shadow.bias,
        }),
    })
}

fn validate_positive(label: &str, value: f32) -> Result<(), CommandApplyError> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(CommandApplyError::InvalidLightCommand(format!(
            "{label} must be a finite non-negative number"
        )))
    }
}

pub fn light_patch_from_component(node_id: &str, light: &Light) -> LightPatch {
    let (kind, inner_cone_angle, outer_cone_angle) = match light.kind {
        LightKind::Directional => ("directional".to_string(), None, None),
        LightKind::Point => ("point".to_string(), None, None),
        LightKind::Spot {
            inner_cone,
            outer_cone,
        } => ("spot".to_string(), Some(inner_cone), Some(outer_cone)),
    };

    LightPatch {
        node_id: node_id.to_string(),
        kind,
        color: light.color.to_array(),
        intensity: light.intensity,
        range: light.range,
        inner_cone_angle,
        outer_cone_angle,
        shadow: light.shadow.as_ref().map(|shadow| LightShadowPatch {
            enabled: shadow.enabled,
            resolution: shadow.resolution,
            bias: shadow.bias,
        }),
    }
}

fn scene_node_patch(world: &mut World, entity: Entity) -> Option<SceneNodePatch> {
    let node_id = world.get::<SceneNodeId>(entity)?.0.clone();
    let transform = world
        .get::<Transform>(entity)
        .map(|transform| SceneNodeTransformPatch {
            position: transform.position.to_array(),
            rotation: transform.rotation.to_array(),
            scale: transform.scale.to_array(),
        });
    let parent_id = world
        .get::<Parent>(entity)
        .and_then(|parent| world.get::<SceneNodeId>(parent.0))
        .map(|parent_id| parent_id.0.clone());
    let children = world
        .get::<Children>(entity)
        .map(|children| {
            children
                .0
                .iter()
                .filter_map(|child| world.get::<SceneNodeId>(*child).map(|id| id.0.clone()))
                .collect()
        })
        .unwrap_or_default();

    Some(SceneNodePatch {
        node_id,
        parent_id,
        name: world.get::<NodeName>(entity).map(|name| name.0.clone()),
        transform,
        visible: Some(world.get::<Visible>(entity).is_none_or(|visible| visible.0)),
        children,
        kind: Some(node_kind(world, entity).to_string()),
    })
}

fn node_kind(world: &World, entity: Entity) -> &'static str {
    if world.get::<Light>(entity).is_some() {
        "light"
    } else if world.get::<Camera>(entity).is_some() {
        "camera"
    } else if world.get::<Skeleton>(entity).is_some() {
        "skeleton"
    } else if world.get::<MeshRef>(entity).is_some() {
        "mesh"
    } else {
        "node"
    }
}

fn generate_light_node_id(world: &mut World) -> String {
    let mut index = world.resource::<NodeIndex>().len().saturating_add(1);
    loop {
        let candidate = format!("light_{index}");
        if world.resource::<NodeIndex>().get(&candidate).is_none() {
            return candidate;
        }
        index = index.saturating_add(1);
    }
}

fn default_light_name(kind: &str) -> String {
    match kind {
        "directional" => "Directional Light".to_string(),
        "spot" => "Spot Light".to_string(),
        _ => "Point Light".to_string(),
    }
}

#[allow(clippy::too_many_arguments)]
fn apply_animation_playback_command(
    world: &mut World,
    action: AnimationPlaybackAction,
    clip_name: Option<String>,
    time_ms: Option<f32>,
    fade_duration: Option<f32>,
    loop_anim: bool,
    root_motion_enabled: bool,
    root_node_id: Option<String>,
) -> Result<(), CommandApplyError> {
    let Some(root_entity) = scene_root_entity(world) else {
        return Err(CommandApplyError::AnimationCommandRejected(
            "No scene root entity".to_string(),
        ));
    };

    match action {
        AnimationPlaybackAction::Stop => {
            world
                .entity_mut(root_entity)
                .remove::<crate::animation_blend::SceneAnimationBlendState>()
                .remove::<crate::animation_blend::SceneCrossfadeRequest>()
                .insert(crate::animation_blend::SceneAnimationPlaybackState {
                    clip_name: None,
                    time_cursor: 0.0,
                    evaluated_time: 0.0,
                    playing: false,
                    looping: false,
                    root_motion_enabled,
                    root_node_id,
                });
            return Ok(());
        }
        AnimationPlaybackAction::Pause => {
            let current = world
                .get::<crate::animation_blend::SceneAnimationPlaybackState>(root_entity)
                .cloned()
                .unwrap_or_default();
            world.entity_mut(root_entity).insert(
                crate::animation_blend::SceneAnimationPlaybackState {
                    playing: false,
                    root_motion_enabled,
                    root_node_id: root_node_id.or(current.root_node_id),
                    ..current
                },
            );
            return Ok(());
        }
        AnimationPlaybackAction::Select => {
            let clip_name = require_clip_name(clip_name)?;
            validate_clip_exists(world, root_entity, &clip_name)?;
            write_animation_playback_state(
                world,
                root_entity,
                Some(clip_name),
                time_ms.unwrap_or_default() / 1000.0,
                false,
                loop_anim,
                root_motion_enabled,
                root_node_id,
            );
            return Ok(());
        }
        AnimationPlaybackAction::Seek => {
            let clip_name = require_clip_name(clip_name.or_else(|| {
                world
                    .get::<crate::animation_blend::SceneAnimationPlaybackState>(root_entity)
                    .and_then(|state| state.clip_name.clone())
            }))?;
            let time_seconds = time_ms.unwrap_or_default() / 1000.0;
            apply_clip_time(
                world,
                &clip_name,
                time_seconds,
                root_motion_enabled,
                root_node_id.as_deref(),
            )?;
            write_animation_playback_state(
                world,
                root_entity,
                Some(clip_name),
                time_seconds,
                false,
                loop_anim,
                root_motion_enabled,
                root_node_id,
            );
            return Ok(());
        }
        AnimationPlaybackAction::Play | AnimationPlaybackAction::Crossfade => {}
    }

    let clip_name = require_clip_name(clip_name.or_else(|| {
        world
            .get::<crate::animation_blend::SceneAnimationPlaybackState>(root_entity)
            .and_then(|state| state.clip_name.clone())
    }))?;
    let clip_index = validate_clip_exists(world, root_entity, &clip_name)?;
    let start_seconds = time_ms.unwrap_or_default() / 1000.0;

    if matches!(action, AnimationPlaybackAction::Crossfade) {
        let fade_duration = fade_duration.unwrap_or(0.3).max(0.0);
        let has_blend = world
            .get::<crate::animation_blend::SceneAnimationBlendState>(root_entity)
            .map(|state| !state.layers.is_empty())
            .unwrap_or(false);
        if !has_blend {
            world.entity_mut(root_entity).insert(
                crate::animation_blend::SceneAnimationBlendState::new(Vec::new()),
            );
        }
        if let Some(mut blend) =
            world.get_mut::<crate::animation_blend::SceneAnimationBlendState>(root_entity)
        {
            blend.layers.retain(|layer| layer.clip_index != clip_index);
            blend
                .layers
                .push(crate::animation_blend::SceneBlendLayer::new(
                    clip_index,
                    start_seconds,
                    0.0,
                    loop_anim,
                ));
        }
        world
            .entity_mut(root_entity)
            .insert(crate::animation_blend::SceneCrossfadeRequest::new(
                clip_index,
                fade_duration,
                0.0,
                loop_anim,
            ));
    } else {
        world.entity_mut(root_entity).insert(
            crate::animation_blend::SceneAnimationBlendState::new(vec![
                crate::animation_blend::SceneBlendLayer::new(
                    clip_index,
                    start_seconds,
                    1.0,
                    loop_anim,
                ),
            ]),
        );
        apply_clip_time(
            world,
            &clip_name,
            start_seconds,
            root_motion_enabled,
            root_node_id.as_deref(),
        )?;
    }

    write_animation_playback_state(
        world,
        root_entity,
        Some(clip_name),
        start_seconds,
        true,
        loop_anim,
        root_motion_enabled,
        root_node_id,
    );
    Ok(())
}

fn scene_root_entity(world: &mut World) -> Option<Entity> {
    let mut query = world.query_filtered::<Entity, With<crate::components::SceneRoot>>();
    query.iter(world).next()
}

fn require_clip_name(clip_name: Option<String>) -> Result<String, CommandApplyError> {
    clip_name
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CommandApplyError::AnimationCommandRejected("clipName required".to_string()))
}

fn validate_clip_exists(
    world: &mut World,
    root_entity: Entity,
    clip_name: &str,
) -> Result<usize, CommandApplyError> {
    world
        .get::<AnimationTarget>(root_entity)
        .and_then(|target| target.clips.iter().position(|clip| clip.name == clip_name))
        .ok_or_else(|| {
            CommandApplyError::AnimationCommandRejected(format!("Clip '{clip_name}' not found"))
        })
}

fn apply_clip_time(
    world: &mut World,
    clip_name: &str,
    time_seconds: f32,
    root_motion_enabled: bool,
    root_node_id: Option<&str>,
) -> Result<(), CommandApplyError> {
    let locked_root = if !root_motion_enabled {
        resolve_root_motion_node_id(world, root_node_id).and_then(|node_id| {
            find_indexed_node(world, &node_id)
                .ok()
                .and_then(|entity| {
                    world
                        .get::<Transform>(entity)
                        .map(|transform| transform.position)
                })
                .map(|position| (node_id, position))
        })
    } else {
        None
    };
    systems::animation_tick(world, clip_name, time_seconds);
    if let Some((node_id, position)) = locked_root {
        let entity = find_indexed_node(world, &node_id)?;
        if let Some(mut transform) = world.get_mut::<Transform>(entity) {
            transform.position = position;
        }
    }
    systems::transform_propagation(world);
    mark_all_transforms_dirty(world);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn write_animation_playback_state(
    world: &mut World,
    root_entity: Entity,
    clip_name: Option<String>,
    time_cursor: f32,
    playing: bool,
    looping: bool,
    root_motion_enabled: bool,
    root_node_id: Option<String>,
) {
    let evaluated_time = clip_name
        .as_deref()
        .and_then(|name| clip_duration(world, root_entity, name))
        .filter(|duration| *duration > 0.0)
        .map(|duration| time_cursor % duration)
        .unwrap_or_default();
    world
        .entity_mut(root_entity)
        .insert(crate::animation_blend::SceneAnimationPlaybackState {
            clip_name,
            time_cursor,
            evaluated_time,
            playing,
            looping,
            root_motion_enabled,
            root_node_id,
        });
}

fn clip_duration(world: &mut World, root_entity: Entity, clip_name: &str) -> Option<f32> {
    world
        .get::<AnimationTarget>(root_entity)
        .and_then(|target| {
            target
                .clips
                .iter()
                .find(|clip| clip.name == clip_name)
                .map(|clip| clip.duration)
        })
}

fn mark_all_transforms_dirty(world: &mut World) {
    let node_ids: Vec<String> = {
        let mut query = world.query::<&SceneNodeId>();
        query.iter(world).map(|node_id| node_id.0.clone()).collect()
    };
    for node_id in node_ids {
        mark_transform_dirty(world, &node_id);
    }
}

fn resolve_root_motion_node_id(
    world: &mut World,
    explicit_node_id: Option<&str>,
) -> Option<String> {
    if let Some(node_id) = explicit_node_id.filter(|value| !value.is_empty()) {
        return Some(node_id.to_string());
    }

    let animated_translation_targets: Vec<String> = {
        let mut query = world.query::<&AnimationTarget>();
        query
            .iter(world)
            .flat_map(|target| target.clips.iter())
            .flat_map(|clip| clip.channels.iter())
            .filter(|channel| matches!(channel.property, AnimationProperty::Translation))
            .map(|channel| channel.target_node.clone())
            .collect()
    };

    for node_id in &animated_translation_targets {
        if is_top_level_scene_node(world, node_id) {
            return Some(node_id.clone());
        }
    }
    animated_translation_targets.into_iter().next()
}

fn is_top_level_scene_node(world: &mut World, node_id: &str) -> bool {
    let Ok(entity) = find_indexed_node(world, node_id) else {
        return false;
    };
    match world.get::<Parent>(entity).map(|parent| parent.0) {
        None => true,
        Some(parent) => world.get::<crate::components::SceneRoot>(parent).is_some(),
    }
}

fn apply_character_authoring_command(
    world: &mut World,
    mutate: impl FnOnce(
        &mut CharacterAuthoringStore,
    ) -> Result<LayeredCharacterDescription, CharacterAuthoringMutationError>,
) -> Result<(), CommandApplyError> {
    ensure_character_authoring_store(world);
    let character = {
        let mut store = world.resource_mut::<CharacterAuthoringStore>();
        mutate(&mut store).map_err(map_character_authoring_error)?
    };
    CharacterAuthoringModule.project_to_ecs(world, &character);
    Ok(())
}

fn guard_parametric_command(
    world: &mut World,
    character_id: Option<&str>,
    topology_version: u64,
) -> Result<(), CommandApplyError> {
    let Some(manager) = world.get_resource::<ModelingSessionManager>() else {
        return Ok(());
    };
    manager
        .can_apply_parametric_command(character_id, topology_version)
        .map_err(|error| CommandApplyError::CharacterCommandRejected(error.to_string()))
}

fn ensure_modeling_session_manager(world: &mut World) -> Mut<'_, ModelingSessionManager> {
    if !world.contains_resource::<ModelingSessionManager>() {
        world.insert_resource(ModelingSessionManager::default());
    }
    world.resource_mut::<ModelingSessionManager>()
}

fn map_character_authoring_error(error: CharacterAuthoringMutationError) -> CommandApplyError {
    match error {
        CharacterAuthoringMutationError::CharacterNotFound(character_id) => {
            CommandApplyError::CharacterNotFound(character_id)
        }
        other => CommandApplyError::CharacterCommandRejected(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::character_authoring::{
        AssetRef, CharacterAuthoringStore, CharacterDefinition, CharacterDescriptor,
        CharacterGeometry, CharacterOverrideLayer, LayeredCharacterDescription, MaterialSlot,
        MorphDescriptor, CURRENT_CHARACTER_SCHEMA_VERSION,
    };
    use crate::components::{GlobalTransform, NodeName};

    fn transform_event() -> SceneCommandEvent {
        SceneCommandEvent::SetTransform {
            node_id: "node_1".to_string(),
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0, 1.0, 1.0],
        }
    }

    fn envelope(seq: u64, base_revision: u64) -> SceneCommandEnvelope {
        SceneCommandEnvelope {
            seq,
            base_revision,
            transaction_id: None,
            phase: None,
            coalesce_key: None,
            event: transform_event(),
        }
    }

    fn test_character_description() -> LayeredCharacterDescription {
        LayeredCharacterDescription {
            descriptor: CharacterDescriptor {
                character_id: "character-a".to_string(),
                name: "Ava".to_string(),
                schema_version: CURRENT_CHARACTER_SCHEMA_VERSION,
                feature_flags: Vec::new(),
                base_template: None,
                template_version: None,
                checksum: None,
            },
            topology_version: 3,
            definition: CharacterDefinition::default(),
            geometry: CharacterGeometry {
                base_mesh: AssetRef {
                    id: "mesh-main".to_string(),
                    uri: Some("assets/ava.glb".to_string()),
                    kind: Some("mesh".to_string()),
                },
                skeleton: None,
                morph_library: vec![MorphDescriptor {
                    morph_id: "Smile".to_string(),
                    display_name: "Smile".to_string(),
                    target_path: "$.geometry.blendShapes.Smile".to_string(),
                    default_weight: 0.0,
                    min: Some(0.0),
                    max: Some(1.0),
                    sparse_delta: None,
                    tags: vec!["face".to_string()],
                }],
                skin_weight_atlases: Vec::new(),
                blend_shapes: Vec::new(),
                data_blocks: Vec::new(),
            },
            material_slots: vec![MaterialSlot {
                slot_id: "skin".to_string(),
                name: "Skin".to_string(),
                material: AssetRef {
                    id: "mat-skin".to_string(),
                    uri: Some("assets/ava.glb#skin".to_string()),
                    kind: Some("material".to_string()),
                },
                role: Some("skin".to_string()),
                index: Some(0),
            }],
            override_layer: CharacterOverrideLayer {
                base_template: None,
                overrides: Vec::new(),
            },
        }
    }

    fn insert_test_character_store(world: &mut World) {
        let mut store = CharacterAuthoringStore::default();
        store.insert(test_character_description());
        world.insert_resource(store);
    }

    #[test]
    fn validator_rejects_non_monotonic_seq_and_stale_revision() {
        let mut validator = SceneCommandValidator::default();
        validator.validate(&envelope(1, 10), 10).unwrap();

        let duplicate = validator.validate(&envelope(1, 10), 10).unwrap_err();
        assert!(matches!(
            duplicate,
            SceneCommandValidationError::NonMonotonicSeq { .. }
        ));

        let stale = validator.validate(&envelope(2, 9), 10).unwrap_err();
        assert!(matches!(
            stale,
            SceneCommandValidationError::StaleRevision { .. }
        ));

        let future = validator.validate(&envelope(3, 11), 10).unwrap_err();
        assert!(matches!(
            future,
            SceneCommandValidationError::FutureRevision { .. }
        ));
    }

    #[test]
    fn validator_enforces_transaction_phase_order() {
        let mut validator = SceneCommandValidator::default();
        let update_without_begin = SceneCommandEnvelope {
            seq: 1,
            base_revision: 0,
            transaction_id: Some("tx".to_string()),
            phase: Some(SceneCommandPhase::Update),
            coalesce_key: None,
            event: transform_event(),
        };
        assert!(matches!(
            validator.validate(&update_without_begin, 0).unwrap_err(),
            SceneCommandValidationError::TransactionNotActive(_)
        ));

        let begin = SceneCommandEnvelope {
            seq: 2,
            base_revision: 0,
            transaction_id: Some("tx".to_string()),
            phase: Some(SceneCommandPhase::Begin),
            coalesce_key: None,
            event: transform_event(),
        };
        validator.validate(&begin, 0).unwrap();

        let update = SceneCommandEnvelope {
            seq: 3,
            base_revision: 0,
            transaction_id: Some("tx".to_string()),
            phase: Some(SceneCommandPhase::Update),
            coalesce_key: None,
            event: transform_event(),
        };
        validator.validate(&update, 0).unwrap();

        let end = SceneCommandEnvelope {
            seq: 4,
            base_revision: 0,
            transaction_id: Some("tx".to_string()),
            phase: Some(SceneCommandPhase::End),
            coalesce_key: None,
            event: transform_event(),
        };
        validator.validate(&end, 0).unwrap();

        let late_update = SceneCommandEnvelope {
            seq: 5,
            base_revision: 0,
            transaction_id: Some("tx".to_string()),
            phase: Some(SceneCommandPhase::Update),
            coalesce_key: None,
            event: transform_event(),
        };
        assert!(matches!(
            validator.validate(&late_update, 0).unwrap_err(),
            SceneCommandValidationError::TransactionNotActive(_)
        ));
    }

    #[test]
    fn validator_reports_superseded_coalesce_key() {
        let mut validator = SceneCommandValidator::default();
        let first = SceneCommandEnvelope {
            coalesce_key: Some("drag:x".to_string()),
            ..envelope(1, 0)
        };
        assert_eq!(validator.validate(&first, 0).unwrap().superseded_seq, None);

        let second = SceneCommandEnvelope {
            coalesce_key: Some("drag:x".to_string()),
            ..envelope(2, 0)
        };
        assert_eq!(
            validator.validate(&second, 0).unwrap().superseded_seq,
            Some(1)
        );
    }

    #[test]
    fn command_apply_updates_transform_revision_and_dirty_tracker() {
        let mut world = World::new();
        let entity = world
            .spawn((
                SceneNodeId("node_1".to_string()),
                NodeName("Node".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
            ))
            .id();

        let outcome = CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetTransform {
                node_id: "node_1".to_string(),
                position: [1.0, 2.0, 3.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            },
        )
        .unwrap();

        assert_eq!(outcome.revision, 1);
        assert!(outcome.dirty.transforms.contains("node_1"));
        assert_eq!(world.resource::<SceneRevision>().current(), 1);
        assert_eq!(world.resource::<NodeIndex>().get("node_1"), Some(entity));
        assert_eq!(
            world.get::<Transform>(entity).unwrap().position,
            glam::Vec3::new(1.0, 2.0, 3.0)
        );
    }

    #[test]
    fn command_apply_updates_visibility() {
        let mut world = World::new();
        world.spawn((
            SceneNodeId("node_1".to_string()),
            NodeName("Node".to_string()),
            Transform::default(),
            GlobalTransform::identity(),
        ));

        let outcome = CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetVisibility {
                node_id: "node_1".to_string(),
                visible: false,
            },
        )
        .unwrap();

        assert!(outcome.dirty.visibility.contains("node_1"));
        assert!(!world
            .query::<(&SceneNodeId, &Visible)>()
            .iter(&world)
            .find(|(node_id, _)| node_id.0 == "node_1")
            .map(|(_, visible)| visible.0)
            .unwrap());
    }

    #[test]
    fn extract_scene_delta_uses_dirty_tracker_revision_and_applied_seq() {
        let mut world = World::new();
        world.spawn((
            SceneNodeId("node_1".to_string()),
            NodeName("Node".to_string()),
            Transform::default(),
            GlobalTransform::identity(),
        ));

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetTransform {
                node_id: "node_1".to_string(),
                position: [2.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            },
        )
        .unwrap();

        let delta = extract_scene_delta(&mut world, Some(42));
        assert_eq!(delta.revision, 1);
        assert_eq!(delta.applied_seq, Some(42));
        assert_eq!(delta.updated_transforms.len(), 1);
        assert_eq!(delta.updated_transforms[0].node_id, "node_1");
        assert_eq!(delta.updated_transforms[0].position, [2.0, 0.0, 0.0]);
        assert!(world.resource::<DirtyTracker>().is_empty());

        let empty = extract_scene_delta(&mut world, None);
        assert_eq!(empty.revision, 1);
        assert!(empty.updated_transforms.is_empty());
        assert!(empty.updated_visibility.is_empty());
    }

    #[test]
    fn character_command_projects_runtime_components_and_scene_delta() {
        let mut world = World::new();
        insert_test_character_store(&mut world);

        let morph = CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetCharacterMorph {
                character_id: "character-a".to_string(),
                morph_id: "Smile".to_string(),
                weight: 0.6,
                topology_version: 3,
            },
        )
        .unwrap();
        assert_eq!(morph.revision, 1);
        assert_eq!(
            world
                .resource::<CharacterAuthoringStore>()
                .get("character-a")
                .and_then(|character| character
                    .geometry
                    .morph_library
                    .iter()
                    .find(|morph| morph.morph_id == "Smile"))
                .map(|morph| morph.default_weight),
            Some(0.6)
        );

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetCharacterMaterialLayer {
                character_id: "character-a".to_string(),
                slot_id: "skin".to_string(),
                params_json: "{\"roughness\":0.4}".to_string(),
                topology_version: 3,
            },
        )
        .unwrap();
        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetCharacterBonePose {
                character_id: "character-a".to_string(),
                bone_id: "head".to_string(),
                position: [0.0, 1.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
                topology_version: 3,
            },
        )
        .unwrap();
        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::ApplyCharacterOverride {
                character_id: "character-a".to_string(),
                path: "$.descriptor.name".to_string(),
                value_type: "string".to_string(),
                value_json: "\"Ava\"".to_string(),
                topology_version: 3,
            },
        )
        .unwrap();

        let delta = extract_scene_delta(&mut world, Some(9));

        assert_eq!(delta.revision, 4);
        assert_eq!(delta.applied_seq, Some(9));
        assert_eq!(
            delta.updated_character_morph_weights[0].weights[0].morph_id,
            "Smile"
        );
        assert_eq!(
            delta.updated_character_materials[0].layers[0].slot_id,
            "skin"
        );
        assert_eq!(
            delta.updated_character_materials[0].layers[0].params_json,
            "{\"roughness\":0.4}"
        );
        assert_eq!(delta.updated_skeleton_pose[0].bones[0].bone_id, "head");
        assert!(delta.character_overrides[0]
            .overrides
            .iter()
            .any(|entry| entry.path == "$.descriptor.name"));
        assert!(world.resource::<DirtyTracker>().is_empty());
    }

    #[test]
    fn animation_playback_command_locks_auto_root_motion_node() {
        use crate::components::{
            AnimationChannel, AnimationClipData, AnimationProperty, AnimationTarget, SceneRoot,
        };

        let mut world = World::new();
        let root = world.spawn(SceneRoot).id();
        let hips = world
            .spawn((
                SceneNodeId("hips".to_string()),
                NodeName("Hips".to_string()),
                Transform {
                    position: glam::Vec3::new(10.0, 0.0, 0.0),
                    ..Default::default()
                },
                GlobalTransform::identity(),
                Parent(root),
            ))
            .id();
        world
            .entity_mut(root)
            .insert(crate::hierarchy::Children(vec![hips]));
        world.entity_mut(root).insert(AnimationTarget {
            clips: vec![AnimationClipData {
                name: "Walk".to_string(),
                duration: 1.0,
                channels: vec![AnimationChannel::from_flat(
                    "hips".to_string(),
                    AnimationProperty::Translation,
                    &[0.0, 1.0],
                    &[0.0, 0.0, 0.0, 2.0, 0.0, 0.0],
                )],
            }],
        });

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetAnimationPlayback {
                action: AnimationPlaybackAction::Seek,
                clip_name: Some("Walk".to_string()),
                time_ms: Some(500.0),
                fade_duration: None,
                loop_anim: true,
                root_motion_enabled: false,
                root_node_id: None,
            },
        )
        .unwrap();

        let transform = world.get::<Transform>(hips).unwrap();
        assert!((transform.position.x - 10.0).abs() < f32::EPSILON);
    }

    #[test]
    fn character_parametric_command_is_blocked_during_topology_mutable_session() {
        let mut world = World::new();
        insert_test_character_store(&mut world);
        let mut manager = ModelingSessionManager::default();
        manager
            .begin(
                "sculpt-a",
                "mesh-a",
                Some("character-a".to_string()),
                true,
                "before-hash",
            )
            .unwrap();
        world.insert_resource(manager);

        let error = CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetCharacterMorph {
                character_id: "character-a".to_string(),
                morph_id: "Smile".to_string(),
                weight: 0.6,
                topology_version: 1,
            },
        )
        .unwrap_err();

        assert!(matches!(
            error,
            CommandApplyError::CharacterCommandRejected(_)
        ));
    }

    #[test]
    fn command_apply_adds_updates_hides_and_removes_light_nodes() {
        let mut world = World::new();

        let add = CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::AddNode {
                kind: "light".to_string(),
                payload_json: r#"{"nodeId":"key_light","name":"Key Light","transform":{"position":[1,2,3],"rotation":[0,0,0,1],"scale":[1,1,1]},"light":{"nodeId":"key_light","kind":"point","color":[1,0.8,0.6],"intensity":4,"range":12}}"#.to_string(),
            },
        )
        .unwrap();
        assert_eq!(add.revision, 1);
        assert!(add.dirty.added_nodes.contains("key_light"));
        assert!(add.dirty.lights.contains("key_light"));

        let entity = world.resource::<NodeIndex>().get("key_light").unwrap();
        let light = world.get::<Light>(entity).unwrap();
        assert!(matches!(light.kind, LightKind::Point));
        assert_eq!(light.range, Some(12.0));
        assert_eq!(
            world.get::<Transform>(entity).unwrap().position,
            glam::Vec3::new(1.0, 2.0, 3.0)
        );

        let delta = extract_scene_delta(&mut world, Some(1));
        assert_eq!(delta.added_nodes.len(), 1);
        assert_eq!(delta.added_nodes[0].node_id, "key_light");
        assert_eq!(delta.added_nodes[0].kind.as_deref(), Some("light"));
        assert_eq!(delta.updated_lights.len(), 1);
        assert_eq!(delta.updated_lights[0].range, Some(12.0));

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::UpdateLight {
                patch: LightPatch {
                    node_id: "key_light".to_string(),
                    kind: "spot".to_string(),
                    color: [0.3, 0.4, 1.0],
                    intensity: 6.0,
                    range: Some(20.0),
                    inner_cone_angle: Some(0.2),
                    outer_cone_angle: Some(0.8),
                    shadow: Some(LightShadowPatch {
                        enabled: true,
                        resolution: Some(2048),
                        bias: Some(0.01),
                    }),
                },
            },
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(2));
        assert_eq!(delta.updated_lights.len(), 1);
        assert_eq!(delta.updated_lights[0].kind, "spot");
        assert_eq!(
            delta.updated_lights[0].shadow.as_ref().unwrap().resolution,
            Some(2048)
        );

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetVisibility {
                node_id: "key_light".to_string(),
                visible: false,
            },
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(3));
        assert_eq!(delta.updated_visibility[0].node_id, "key_light");
        assert!(!delta.updated_visibility[0].visible);

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::RemoveNode(NodeRemoveCommand {
                node_id: "key_light".to_string(),
                cascade: None,
            }),
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(4));
        assert_eq!(delta.removed_nodes, vec!["key_light".to_string()]);
        assert!(world.resource::<NodeIndex>().get("key_light").is_none());
    }

    #[test]
    fn command_apply_rejects_non_cascade_remove_when_node_has_children() {
        let mut world = World::new();
        let parent = world
            .spawn((
                SceneNodeId("parent".to_string()),
                NodeName("Parent".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
            ))
            .id();
        let child = world
            .spawn((
                SceneNodeId("child".to_string()),
                NodeName("Child".to_string()),
                Transform::default(),
                GlobalTransform::identity(),
            ))
            .id();
        hierarchy::set_parent(&mut world, child, parent);

        let error = CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::RemoveNode(NodeRemoveCommand {
                node_id: "parent".to_string(),
                cascade: Some(false),
            }),
        )
        .unwrap_err();
        assert!(matches!(error, CommandApplyError::NodeRemoveRejected(_)));

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::RemoveNode(NodeRemoveCommand {
                node_id: "parent".to_string(),
                cascade: Some(true),
            }),
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(5));
        assert!(delta.removed_nodes.contains(&"parent".to_string()));
        assert!(delta.removed_nodes.contains(&"child".to_string()));
    }

    #[test]
    fn command_apply_sets_updates_and_clears_environment_state() {
        let mut world = World::new();

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::SetEnvironment {
                patch: EnvironmentPatch {
                    environment_id: "scene-environment".to_string(),
                    source: None,
                    mode: crate::world::EnvironmentMode::BackgroundAndIbl,
                    rotation_deg: 725.0,
                    intensity: 2.0,
                    exposure: 0.5,
                    visible_as_background: true,
                    background_color: Some([1.2, 0.4, -0.2, 1.0]),
                },
            },
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(10));
        let environment = delta.environment.as_ref().unwrap().as_ref().unwrap();
        assert_eq!(environment.rotation_deg, 5.0);
        assert_eq!(environment.background_color, Some([1.0, 0.4, 0.0, 1.0]));

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::UpdateEnvironment {
                patch: EnvironmentPatch {
                    environment_id: "scene-environment".to_string(),
                    source: None,
                    mode: crate::world::EnvironmentMode::Skybox,
                    rotation_deg: 45.0,
                    intensity: 0.8,
                    exposure: -1.0,
                    visible_as_background: false,
                    background_color: None,
                },
            },
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(11));
        let environment = delta.environment.as_ref().unwrap().as_ref().unwrap();
        assert_eq!(environment.mode, crate::world::EnvironmentMode::Skybox);
        assert_eq!(environment.background_color, Some([1.0, 0.4, 0.0, 1.0]));
        assert!(!environment.visible_as_background);

        CommandApplySystem::apply(
            &mut world,
            SceneCommandEvent::ClearEnvironment {
                environment_id: Some("scene-environment".to_string()),
            },
        )
        .unwrap();
        let delta = extract_scene_delta(&mut world, Some(12));
        assert_eq!(delta.environment, Some(None));
    }
}
