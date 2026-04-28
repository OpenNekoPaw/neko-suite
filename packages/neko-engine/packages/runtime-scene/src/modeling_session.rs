//! Free modeling session state and topology migration helpers.

use bevy_ecs::prelude::Resource;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelingSessionLifecycle {
    Active,
    Committed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TopologyOperation {
    Sculpt,
    Subdivide,
    Decimate,
    Boolean,
    DynamicTopology,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingOperationLogEntry {
    pub seq: u64,
    pub operation: String,
    pub summary: String,
    pub topology_version: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingSession {
    pub session_id: String,
    pub mesh_id: String,
    pub character_id: Option<String>,
    pub topology_mutable: bool,
    pub topology_version: u64,
    pub before_hash: String,
    pub affected_flags: Vec<String>,
    pub op_log: Vec<ModelingOperationLogEntry>,
    pub state: ModelingSessionLifecycle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingSessionStateDelta {
    pub session_id: String,
    pub character_id: Option<String>,
    pub topology_mutable: bool,
    pub topology_version: u64,
    pub state: ModelingSessionLifecycle,
    pub mesh_id: String,
    pub before_hash: String,
    pub op_log: Vec<ModelingOperationLogEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VertexBrushPatchMetadata {
    pub session_id: String,
    pub mesh_id: String,
    pub topology_version: u64,
    pub stroke_id: String,
    pub seq: u64,
    pub encoding: String,
    pub sparse_indices: Vec<u32>,
    pub affected_start: Option<u32>,
    pub affected_count: Option<u32>,
    pub payload_byte_len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshDirtyRegion {
    pub mesh_id: String,
    pub start: u32,
    pub count: u32,
    pub sparse_indices: Vec<u32>,
    pub payload_byte_len: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrushPatchApplyOutcome {
    pub dirty_region: MeshDirtyRegion,
    pub coalesced_previous_patch: bool,
    pub queued_patch_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyMigrationResult {
    pub data_kind: String,
    pub status: TopologyMigrationStatus,
    pub diagnostic: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TopologyMigrationStatus {
    Preserved,
    Migrated,
    Invalidated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopologyChangeEvent {
    pub mesh_id: String,
    pub from_version: u64,
    pub to_version: u64,
    pub operation: TopologyOperation,
    pub invalidates_morph_library: bool,
    pub invalidates_skin_weights: bool,
    pub invalidates_uv: bool,
    pub invalidates_tangents: bool,
    pub invalidates_bounds: bool,
    pub invalidates_acceleration_structure: bool,
    pub vertex_count_before: u32,
    pub vertex_count_after: u32,
    pub operation_summary: Option<String>,
    pub migration_results: Vec<TopologyMigrationResult>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDelta {
    pub sessions: Vec<ModelingSessionStateDelta>,
    pub topology_changes: Vec<TopologyChangeEvent>,
    pub dirty_regions: Vec<MeshDirtyRegion>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ModelingSessionError {
    #[error("Modeling session already active: {0}")]
    SessionAlreadyActive(String),
    #[error("Modeling session not found: {0}")]
    SessionNotFound(String),
    #[error(
        "Topology version mismatch for {mesh_id}: command {command_topology_version}, active {active_topology_version}"
    )]
    StaleTopologyVersion {
        mesh_id: String,
        command_topology_version: u64,
        active_topology_version: u64,
    },
    #[error(
        "Brush patch mesh mismatch for session {session_id}: expected {expected}, got {actual}"
    )]
    MeshMismatch {
        session_id: String,
        expected: String,
        actual: String,
    },
    #[error("Parametric command conflicts with topology-mutable session {0}")]
    ParametricCommandBlocked(String),
}

#[derive(Debug, Clone, Resource, Serialize, Deserialize)]
pub struct ModelingSessionManager {
    sessions: HashMap<String, ModelingSession>,
    topology_versions: HashMap<String, u64>,
    queued_patches: VecDeque<VertexBrushPatchMetadata>,
    dirty_regions: Vec<MeshDirtyRegion>,
    session_deltas: Vec<ModelingSessionStateDelta>,
    topology_events: Vec<TopologyChangeEvent>,
    max_queued_patches: usize,
}

impl Default for ModelingSessionManager {
    fn default() -> Self {
        Self {
            sessions: HashMap::new(),
            topology_versions: HashMap::new(),
            queued_patches: VecDeque::new(),
            dirty_regions: Vec::new(),
            session_deltas: Vec::new(),
            topology_events: Vec::new(),
            max_queued_patches: 32,
        }
    }
}

impl ModelingSessionManager {
    pub fn begin(
        &mut self,
        session_id: impl Into<String>,
        mesh_id: impl Into<String>,
        character_id: Option<String>,
        topology_mutable: bool,
        before_hash: impl Into<String>,
    ) -> Result<ModelingSession, ModelingSessionError> {
        let session_id = session_id.into();
        if self.sessions.contains_key(&session_id) {
            return Err(ModelingSessionError::SessionAlreadyActive(session_id));
        }
        let mesh_id = mesh_id.into();
        let topology_version = self.topology_versions.get(&mesh_id).copied().unwrap_or(1);
        let session = ModelingSession {
            session_id: session_id.clone(),
            mesh_id: mesh_id.clone(),
            character_id,
            topology_mutable,
            topology_version,
            before_hash: before_hash.into(),
            affected_flags: Vec::new(),
            op_log: Vec::new(),
            state: ModelingSessionLifecycle::Active,
        };
        self.sessions.insert(session_id, session.clone());
        self.push_session_delta(&session);
        Ok(session)
    }

    pub fn apply_brush_patch(
        &mut self,
        patch: VertexBrushPatchMetadata,
    ) -> Result<BrushPatchApplyOutcome, ModelingSessionError> {
        let session = self
            .sessions
            .get_mut(&patch.session_id)
            .ok_or_else(|| ModelingSessionError::SessionNotFound(patch.session_id.clone()))?;
        if session.mesh_id != patch.mesh_id {
            return Err(ModelingSessionError::MeshMismatch {
                session_id: patch.session_id,
                expected: session.mesh_id.clone(),
                actual: patch.mesh_id,
            });
        }
        if session.topology_version != patch.topology_version {
            return Err(ModelingSessionError::StaleTopologyVersion {
                mesh_id: session.mesh_id.clone(),
                command_topology_version: patch.topology_version,
                active_topology_version: session.topology_version,
            });
        }

        let coalesced_previous_patch = self
            .queued_patches
            .back()
            .is_some_and(|queued| queued.stroke_id == patch.stroke_id);
        if coalesced_previous_patch {
            self.queued_patches.pop_back();
        }
        self.queued_patches.push_back(patch.clone());
        while self.queued_patches.len() > self.max_queued_patches {
            self.queued_patches.pop_front();
        }

        let dirty_region = dirty_region_from_patch(&patch);
        self.dirty_regions.push(dirty_region.clone());
        session.op_log.push(ModelingOperationLogEntry {
            seq: patch.seq,
            operation: "brush-patch".to_string(),
            summary: format!("{} bytes", patch.payload_byte_len),
            topology_version: session.topology_version,
        });

        Ok(BrushPatchApplyOutcome {
            dirty_region,
            coalesced_previous_patch,
            queued_patch_count: self.queued_patches.len(),
        })
    }

    pub fn commit(
        &mut self,
        session_id: &str,
        operation: TopologyOperation,
        vertex_count_before: u32,
        vertex_count_after: u32,
    ) -> Result<TopologyChangeEvent, ModelingSessionError> {
        let mut session = self
            .sessions
            .remove(session_id)
            .ok_or_else(|| ModelingSessionError::SessionNotFound(session_id.to_string()))?;
        let from_version = session.topology_version;
        let to_version = if operation_changes_topology(operation) {
            from_version.saturating_add(1)
        } else {
            from_version
        };
        let migration_results = MeshTopologyMigrationService::migrate(
            operation,
            vertex_count_before == vertex_count_after && !operation_changes_topology(operation),
        );
        let event = TopologyChangeEvent {
            mesh_id: session.mesh_id.clone(),
            from_version,
            to_version,
            operation,
            invalidates_morph_library: migration_results.iter().any(|result| {
                result.data_kind == "morph" && result.status == TopologyMigrationStatus::Invalidated
            }),
            invalidates_skin_weights: migration_results.iter().any(|result| {
                result.data_kind == "skin" && result.status == TopologyMigrationStatus::Invalidated
            }),
            invalidates_uv: migration_results.iter().any(|result| {
                result.data_kind == "uv" && result.status == TopologyMigrationStatus::Invalidated
            }),
            invalidates_tangents: operation_changes_topology(operation),
            invalidates_bounds: true,
            invalidates_acceleration_structure: true,
            vertex_count_before,
            vertex_count_after,
            operation_summary: Some(format!("{operation:?}")),
            migration_results,
        };
        session.state = ModelingSessionLifecycle::Committed;
        session.topology_version = to_version;
        self.topology_versions
            .insert(session.mesh_id.clone(), to_version);
        self.push_session_delta(&session);
        self.topology_events.push(event.clone());
        Ok(event)
    }

    pub fn cancel(
        &mut self,
        session_id: &str,
    ) -> Result<ModelingSessionStateDelta, ModelingSessionError> {
        let mut session = self
            .sessions
            .remove(session_id)
            .ok_or_else(|| ModelingSessionError::SessionNotFound(session_id.to_string()))?;
        session.state = ModelingSessionLifecycle::Cancelled;
        self.queued_patches
            .retain(|patch| patch.session_id != session.session_id);
        self.push_session_delta(&session);
        Ok(session_delta(&session))
    }

    pub fn can_apply_parametric_command(
        &self,
        character_id: Option<&str>,
        topology_version: u64,
    ) -> Result<(), ModelingSessionError> {
        for session in self.sessions.values() {
            if !session.topology_mutable {
                continue;
            }
            if character_id.is_some() && session.character_id.as_deref() != character_id {
                continue;
            }
            if session.topology_version != topology_version {
                return Err(ModelingSessionError::StaleTopologyVersion {
                    mesh_id: session.mesh_id.clone(),
                    command_topology_version: topology_version,
                    active_topology_version: session.topology_version,
                });
            }
            return Err(ModelingSessionError::ParametricCommandBlocked(
                session.session_id.clone(),
            ));
        }
        Ok(())
    }

    pub fn take_delta(&mut self) -> ModelingDelta {
        ModelingDelta {
            sessions: std::mem::take(&mut self.session_deltas),
            topology_changes: std::mem::take(&mut self.topology_events),
            dirty_regions: std::mem::take(&mut self.dirty_regions),
        }
    }

    fn push_session_delta(&mut self, session: &ModelingSession) {
        self.session_deltas.push(session_delta(session));
    }
}

#[derive(Debug, Clone, Default)]
pub struct MeshTopologyMigrationService;

impl MeshTopologyMigrationService {
    pub fn migrate(
        operation: TopologyOperation,
        vertex_identity_preserved: bool,
    ) -> Vec<TopologyMigrationResult> {
        if vertex_identity_preserved {
            return ["morph", "skin", "uv"]
                .into_iter()
                .map(|data_kind| TopologyMigrationResult {
                    data_kind: data_kind.to_string(),
                    status: TopologyMigrationStatus::Preserved,
                    diagnostic: None,
                })
                .collect();
        }

        let invalidates_skin = matches!(
            operation,
            TopologyOperation::Boolean
                | TopologyOperation::Decimate
                | TopologyOperation::DynamicTopology
        );
        vec![
            TopologyMigrationResult {
                data_kind: "morph".to_string(),
                status: TopologyMigrationStatus::Invalidated,
                diagnostic: Some("vertex identity changed".to_string()),
            },
            TopologyMigrationResult {
                data_kind: "skin".to_string(),
                status: if invalidates_skin {
                    TopologyMigrationStatus::Invalidated
                } else {
                    TopologyMigrationStatus::Migrated
                },
                diagnostic: invalidates_skin.then(|| "skin weights require repair".to_string()),
            },
            TopologyMigrationResult {
                data_kind: "uv".to_string(),
                status: TopologyMigrationStatus::Invalidated,
                diagnostic: Some("uv projection must be regenerated".to_string()),
            },
        ]
    }
}

fn dirty_region_from_patch(patch: &VertexBrushPatchMetadata) -> MeshDirtyRegion {
    let start = patch
        .affected_start
        .or_else(|| patch.sparse_indices.iter().min().copied())
        .unwrap_or(0);
    let count = patch.affected_count.unwrap_or_else(|| {
        if patch.sparse_indices.is_empty() {
            0
        } else {
            let min = patch.sparse_indices.iter().min().copied().unwrap_or(start);
            let max = patch.sparse_indices.iter().max().copied().unwrap_or(start);
            max.saturating_sub(min).saturating_add(1)
        }
    });
    MeshDirtyRegion {
        mesh_id: patch.mesh_id.clone(),
        start,
        count,
        sparse_indices: patch.sparse_indices.clone(),
        payload_byte_len: patch.payload_byte_len,
    }
}

fn session_delta(session: &ModelingSession) -> ModelingSessionStateDelta {
    ModelingSessionStateDelta {
        session_id: session.session_id.clone(),
        character_id: session.character_id.clone(),
        topology_mutable: session.topology_mutable,
        topology_version: session.topology_version,
        state: session.state,
        mesh_id: session.mesh_id.clone(),
        before_hash: session.before_hash.clone(),
        op_log: session.op_log.clone(),
    }
}

fn operation_changes_topology(operation: TopologyOperation) -> bool {
    !matches!(operation, TopologyOperation::Sculpt)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(seq: u64, topology_version: u64) -> VertexBrushPatchMetadata {
        VertexBrushPatchMetadata {
            session_id: "session-a".to_string(),
            mesh_id: "mesh-a".to_string(),
            topology_version,
            stroke_id: "stroke-a".to_string(),
            seq,
            encoding: "f32-delta".to_string(),
            sparse_indices: vec![4, 6, 7],
            affected_start: None,
            affected_count: None,
            payload_byte_len: 48,
        }
    }

    #[test]
    fn modeling_session_begin_patch_commit_and_cancel_are_transactional() {
        let mut manager = ModelingSessionManager::default();
        let session = manager
            .begin(
                "session-a",
                "mesh-a",
                Some("character-a".to_string()),
                true,
                "before-hash",
            )
            .unwrap();
        assert_eq!(session.topology_version, 1);

        let first = manager.apply_brush_patch(patch(1, 1)).unwrap();
        assert_eq!(first.dirty_region.start, 4);
        assert_eq!(first.dirty_region.count, 4);
        let second = manager.apply_brush_patch(patch(2, 1)).unwrap();
        assert!(second.coalesced_previous_patch);

        let event = manager
            .commit("session-a", TopologyOperation::Sculpt, 128, 128)
            .unwrap();
        assert_eq!(event.from_version, 1);
        assert_eq!(event.to_version, 1);
        assert!(event
            .migration_results
            .iter()
            .all(|result| result.status == TopologyMigrationStatus::Preserved));

        manager
            .begin("session-b", "mesh-a", None, false, "before-hash")
            .unwrap();
        let cancel = manager.cancel("session-b").unwrap();
        assert_eq!(cancel.state, ModelingSessionLifecycle::Cancelled);
    }

    #[test]
    fn modeling_session_rejects_stale_topology_and_blocks_parametric_edits() {
        let mut manager = ModelingSessionManager::default();
        manager
            .begin(
                "session-a",
                "mesh-a",
                Some("character-a".to_string()),
                true,
                "before-hash",
            )
            .unwrap();

        assert!(matches!(
            manager.apply_brush_patch(patch(1, 2)).unwrap_err(),
            ModelingSessionError::StaleTopologyVersion { .. }
        ));
        assert!(matches!(
            manager
                .can_apply_parametric_command(Some("character-a"), 1)
                .unwrap_err(),
            ModelingSessionError::ParametricCommandBlocked(_)
        ));
    }

    #[test]
    fn topology_changing_commit_records_invalidation_for_webview_prediction_cleanup() {
        let mut manager = ModelingSessionManager::default();
        manager
            .begin(
                "session-a",
                "mesh-a",
                Some("character-a".to_string()),
                true,
                "before-hash",
            )
            .unwrap();
        let event = manager
            .commit("session-a", TopologyOperation::Boolean, 128, 96)
            .unwrap();
        assert_eq!(event.to_version, 2);
        assert!(event.invalidates_morph_library);
        assert!(event.invalidates_skin_weights);
        assert!(event.invalidates_uv);

        let delta = manager.take_delta();
        assert_eq!(delta.sessions.len(), 2);
        assert_eq!(delta.topology_changes, vec![event]);
    }
}
