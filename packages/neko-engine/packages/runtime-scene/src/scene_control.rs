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
    AnimationProperty, AnimationTarget, CharacterInstanceId, CharacterMaterialLayers,
    CharacterMorphWeights, CharacterOverrides, SceneNodeId, SkeletonPose, Transform, Visible,
};
use crate::hierarchy::Parent;
use crate::modeling_session::{ModelingSessionManager, TopologyOperation};
use crate::systems;
use crate::world::{
    CharacterMaterialUpdate, CharacterMorphWeightsUpdate, CharacterOverrideUpdate,
    CharacterSkeletonPoseUpdate, MorphWeightsUpdate, SceneDelta, TransformUpdate, VisibilityUpdate,
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
    pub transforms: HashSet<String>,
    pub morph_weights: HashSet<String>,
    pub hierarchy: HashSet<String>,
    pub visibility: HashSet<String>,
    pub materials: HashSet<String>,
    pub removed_nodes: HashSet<String>,
    pub character_morph_weights: HashSet<String>,
    pub character_materials: HashSet<String>,
    pub character_skeleton_pose: HashSet<String>,
    pub character_overrides: HashSet<String>,
}

impl DirtyTracker {
    pub fn clear(&mut self) {
        self.transforms.clear();
        self.morph_weights.clear();
        self.hierarchy.clear();
        self.visibility.clear();
        self.materials.clear();
        self.removed_nodes.clear();
        self.character_morph_weights.clear();
        self.character_materials.clear();
        self.character_skeleton_pose.clear();
        self.character_overrides.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.transforms.is_empty()
            && self.morph_weights.is_empty()
            && self.hierarchy.is_empty()
            && self.visibility.is_empty()
            && self.materials.is_empty()
            && self.removed_nodes.is_empty()
            && self.character_morph_weights.is_empty()
            && self.character_materials.is_empty()
            && self.character_skeleton_pose.is_empty()
            && self.character_overrides.is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SceneCommandEvent {
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
    #[error("Character not found: {0}")]
    CharacterNotFound(String),
    #[error("Character command rejected: {0}")]
    CharacterCommandRejected(String),
    #[error("Modeling command rejected: {0}")]
    ModelingCommandRejected(String),
    #[error("Animation command rejected: {0}")]
    AnimationCommandRejected(String),
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

pub fn extract_scene_delta(world: &mut World, applied_seq: Option<u64>) -> SceneDelta {
    ensure_scene_control_resources(world);
    rebuild_node_index(world);

    let revision = world.resource::<SceneRevision>().current();
    let dirty = world.resource::<DirtyTracker>().clone();

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
    let modeling_delta = world
        .get_resource_mut::<ModelingSessionManager>()
        .map(|mut manager| manager.take_delta())
        .unwrap_or_default();
    world.resource_mut::<DirtyTracker>().clear();

    SceneDelta {
        revision,
        applied_seq,
        updated_transforms,
        updated_morph_weights,
        updated_visibility,
        removed_nodes,
        updated_character_morph_weights,
        updated_character_materials,
        updated_skeleton_pose,
        character_overrides,
        modeling_sessions: modeling_delta.sessions,
        topology_changes: modeling_delta.topology_changes,
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
}
