//! Puppet control protocol DTOs.
//!
//! These types are transport-neutral contracts shared by REST aliases,
//! WebSocket control routes, and engine-kernel services.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Revision-aware command envelope for puppet editing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PuppetCommandEnvelope {
    /// Strictly ordered command sequence number.
    pub seq: u64,
    /// Client's observed puppet revision before applying this command.
    pub base_revision: u64,
    /// Optional client correlation id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transaction_id: Option<String>,
    /// Typed puppet command payload.
    pub command: PuppetCommand,
}

/// Typed puppet editing command.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PuppetCommand {
    /// Load puppet bytes encoded as base64.
    Load { data_base64: String },
    /// Set a model parameter.
    SetParameter { name: String, value: f32 },
    /// Advance runtime animation/physics.
    Tick { delta_ms: f32 },
    /// Play an animation clip.
    PlayAnimation { name: String, loop_anim: bool },
    /// Stop the active animation.
    StopAnimation,
    /// Seek the active animation.
    SeekAnimation { time_ms: f32 },
    /// Add a parameter keyframe.
    AddKeyframe {
        clip_name: String,
        param_name: String,
        time_ms: f32,
        value: f32,
    },
    /// Remove a parameter keyframe.
    RemoveKeyframe {
        clip_name: String,
        param_name: String,
        keyframe_id: String,
    },
    /// Update a parameter keyframe.
    UpdateKeyframe {
        clip_name: String,
        param_name: String,
        keyframe_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        time_ms: Option<f32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value: Option<f32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        easing: Option<String>,
    },
    /// Create an empty animation clip.
    CreateClip { name: String, duration_ms: f32 },
    /// Crossfade to another animation clip.
    CrossfadeAnimation {
        clip_name: String,
        fade_duration_ms: f32,
        loop_anim: bool,
    },
    /// Set an animation blend layer weight.
    SetBlendWeight { clip_name: String, weight: f32 },
    /// Set node opacity.
    SetNodeOpacity { node_id: String, opacity: f32 },
    /// Set node texture index.
    SetTexture {
        node_id: String,
        texture_index: usize,
    },
    /// Activate an expression.
    SetExpression { name: String },
    /// Clear the active expression.
    ClearExpression,
    /// Load auxiliary MOC3 JSON documents.
    LoadMoc3Auxiliary {
        #[serde(default)]
        expressions: Vec<(String, String)>,
        #[serde(default)]
        motions: Vec<(String, String)>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        physics_json: Option<String>,
    },
}

/// Command acknowledgement status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PuppetCommandAckStatus {
    /// Command was applied and advanced the puppet revision.
    Applied,
    /// Command was rejected by validation or execution.
    Rejected,
}

/// Stable machine-readable puppet command error code.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PuppetCommandErrorCode {
    /// Command sequence did not match the expected sequence.
    Ordering,
    /// Command base revision did not match the current revision.
    RevisionConflict,
    /// Command payload could not be decoded or applied.
    ApplyFailed,
}

/// Puppet command error DTO.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PuppetCommandError {
    /// Stable error code.
    pub code: PuppetCommandErrorCode,
    /// Human-readable message.
    pub message: String,
}

impl PuppetCommandError {
    /// Create an ordering error.
    pub fn ordering(message: impl Into<String>) -> Self {
        Self {
            code: PuppetCommandErrorCode::Ordering,
            message: message.into(),
        }
    }

    /// Create a revision conflict error.
    pub fn revision_conflict(message: impl Into<String>) -> Self {
        Self {
            code: PuppetCommandErrorCode::RevisionConflict,
            message: message.into(),
        }
    }

    /// Create an apply failure error.
    pub fn apply_failed(message: impl Into<String>) -> Self {
        Self {
            code: PuppetCommandErrorCode::ApplyFailed,
            message: message.into(),
        }
    }
}

/// Puppet command acknowledgement.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PuppetCommandAck {
    /// Received command sequence.
    pub seq: u64,
    /// Applied command sequence, or 0 when rejected.
    pub applied_seq: u64,
    /// Client supplied base revision.
    pub base_revision: u64,
    /// Current puppet revision after handling the command.
    pub revision: u64,
    /// Ack status.
    pub status: PuppetCommandAckStatus,
    /// Optional command result for REST alias parity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// Optional rejection details.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<PuppetCommandError>,
}
