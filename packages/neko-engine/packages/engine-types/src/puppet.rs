//! Puppet control protocol DTOs.
//!
//! These types are transport-neutral contracts shared by REST aliases,
//! WebSocket control routes, and engine-kernel services.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

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
    /// Load a native .nkp v2 Bone2D + BlendShape project.
    LoadNativeProject { project: NkpProjectData },
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
    /// Set a native BlendShape weight.
    SetNativeBlendShape { name: String, weight: f32 },
    /// Edit a native BlendShape vertex delta.
    SetNativeBlendShapeDelta {
        name: String,
        mesh_id: String,
        vertex_index: usize,
        delta: NkpVec2,
    },
    /// Set or offset a native Bone2D transform.
    SetNativeBoneTransform {
        bone: String,
        transform: NkpTransform2DEdit,
        #[serde(default)]
        mode: NkpTransformEditMode,
    },
    /// Edit one native skin-weight row.
    SetNativeSkinWeight {
        mesh_id: String,
        vertex_index: usize,
        joint_indices: NkpJointIndex4,
        joint_weights: NkpVec4,
    },
    /// Insert or replace a native ControlDriver.
    UpsertNativeControlDriver { driver: NkpControlDriver },
    /// Remove a native ControlDriver by id.
    RemoveNativeControlDriver { id: String },
    /// Set a native tracking/control input value.
    SetNativeTrackingInput { name: String, value: f32 },
    /// Activate a native expression preset.
    SetNativeExpression { name: String },
    /// Clear native expression preset weights.
    ClearNativeExpression,
    /// Play a native Bone2D + BlendShape animation clip.
    PlayNativeAnimation { name: String, loop_anim: bool },
    /// Stop native animation playback.
    StopNativeAnimation,
    /// Seek native animation playback.
    SeekNativeAnimation { time_ms: f32 },
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

/// Supported .nkp source formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PuppetFormat {
    #[deprecated(note = "INP import was removed on 2026-05-20; keep only for legacy metadata")]
    Inp,
    Moc3,
    Native,
}

/// Runtime/authoring animation model for .nkp projects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NkpAnimationModel {
    Moc3Parameter,
    BoneBlendshape,
}

/// Original import source kind for native puppets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NkpImportSourceKind {
    Psd,
    Png,
    Live2dBundle,
    Moc3,
    Generated,
}

pub type NkpVec2 = [f32; 2];
pub type NkpVec4 = [f32; 4];
pub type NkpJointIndex4 = [u16; 4];

/// Partial native Bone2D transform edit. Rotation is stored in degrees.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpTransform2DEdit {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<NkpVec2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<NkpVec2>,
}

/// Whether a transform edit is absolute or relative.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum NkpTransformEditMode {
    #[default]
    Set,
    Offset,
}

/// Archive entry locator mirror used by native puppet metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleEntryLocatorDto {
    pub bundle_path: String,
    pub entry_path: String,
    pub fragment_ref: String,
}

/// Native puppet source provenance.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpImportSource {
    pub kind: NkpImportSourceKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Live2D bundle source metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpLive2dBundleReference {
    pub path: String,
    pub manifest: BundleEntryLocatorDto,
    pub moc: BundleEntryLocatorDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
}

/// .nkp puppet source metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpPuppetSource {
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format: Option<PuppetFormat>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub animation_model: Option<NkpAnimationModel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_source: Option<NkpImportSource>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle: Option<NkpLive2dBundleReference>,
}

/// Native puppet layer mesh.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpLayerMesh {
    pub id: String,
    pub vertices: Vec<NkpVec2>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub uvs: Vec<NkpVec2>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub triangles: Vec<[u32; 3]>,
}

/// Native 2D skin weights.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpSkinWeights2D {
    pub mesh_id: String,
    pub joint_indices: Vec<NkpJointIndex4>,
    pub joint_weights: Vec<NkpVec4>,
}

/// Native render layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpLayer {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub texture_ref: String,
    pub mesh: NkpLayerMesh,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_order: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skin_weights: Option<NkpSkinWeights2D>,
}

/// Native 2D bone definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpBone2D {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub position: NkpVec2,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<NkpVec2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub length: Option<f32>,
}

/// Native IK solver definition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NkpIkSolver2D {
    TwoBone,
    Ccd {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_iterations: Option<u32>,
    },
}

/// Native IK constraint definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpIkConstraint2D {
    pub id: String,
    pub target_bone: String,
    pub end_bone: String,
    pub chain_length: u8,
    pub solver: NkpIkSolver2D,
}

/// Native path constraint definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpPathConstraint2D {
    pub id: String,
    pub bone: String,
    pub path: Vec<NkpVec2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub influence: Option<f32>,
}

/// Native spring bone definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpSpringBone2D {
    pub id: String,
    pub bone: String,
    pub stiffness: f32,
    pub damping: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gravity_scale: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wind_influence: Option<f32>,
}

/// Native 2D skeleton definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpSkeleton2D {
    pub bones: Vec<NkpBone2D>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ik_constraints: Vec<NkpIkConstraint2D>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub path_constraints: Vec<NkpPathConstraint2D>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spring_bones: Vec<NkpSpringBone2D>,
}

/// Native BlendShape standard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NkpBlendShapeStandard {
    #[serde(rename = "arkit_52")]
    Arkit52,
    Vrm,
    Custom,
}

/// Native BlendShape definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpBlendShapeDef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub mesh_id: String,
    pub vertex_deltas: Vec<NkpVec2>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub post_skin: Option<bool>,
}

/// Native BlendShape library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpBlendShapeLibrary {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub standard: Option<NkpBlendShapeStandard>,
    pub implemented: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub shapes: Vec<NkpBlendShapeDef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub custom: Vec<NkpBlendShapeDef>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub aliases: BTreeMap<String, Value>,
}

/// Driver curve definition.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NkpDriverCurve {
    Linear {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        scale: Option<f32>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        offset: Option<f32>,
    },
    Bezier {
        points: [f32; 4],
    },
    Step,
}

/// Driver blend mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NkpDriverBlendMode {
    Add,
    Override,
    Max,
}

/// Driver axis for 2D bone rotations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NkpAxis2D {
    X,
    Y,
    Z,
}

/// Control driver source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NkpControlSource {
    Blendshape { name: String },
    Expression { preset: String },
    Tracking { name: String },
    Live2dParam { name: String },
}

/// Control driver target.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NkpControlTarget {
    BoneRotation { bone: String, axis: NkpAxis2D },
    BonePosition { bone: String },
    BoneScale { bone: String },
    BlendshapeWeight { name: String },
}

/// Explicit native puppet control driver.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpControlDriver {
    pub id: String,
    pub source: NkpControlSource,
    pub target: NkpControlTarget,
    pub curve: NkpDriverCurve,
    pub blend_mode: NkpDriverBlendMode,
    pub priority: i16,
}

/// Keyframe easing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NkpEasingType {
    Linear,
    Step,
    Bezier { c1: NkpVec2, c2: NkpVec2 },
}

/// Generic numeric keyframe.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpScalarKeyframe {
    pub time_ms: f32,
    pub value: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easing: Option<NkpEasingType>,
}

/// Generic 2D vector keyframe.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpVec2Keyframe {
    pub time_ms: f32,
    pub value: NkpVec2,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easing: Option<NkpEasingType>,
}

/// Bone animation track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpBoneTrack {
    pub bone: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub position_keys: Vec<NkpVec2Keyframe>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rotation_keys: Vec<NkpScalarKeyframe>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scale_keys: Vec<NkpVec2Keyframe>,
}

/// BlendShape animation track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpBlendShapeTrack {
    pub blendshape: String,
    pub weight_keys: Vec<NkpScalarKeyframe>,
}

/// Native 2D animation clip.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationClip2D {
    pub name: String,
    pub duration_ms: f32,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bone_tracks: Vec<NkpBoneTrack>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blendshape_tracks: Vec<NkpBlendShapeTrack>,
}

/// Native puppet auto-rig metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpAutoRigMetadata {
    pub template: String,
    pub generated_by: String,
    pub confidence: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub user_adjusted: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_kind: Option<NkpImportSourceKind>,
}

/// Viewport state saved in .nkp.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpViewportState {
    pub zoom: f32,
}

/// Native-compatible .nkp project DTO.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NkpProjectData {
    pub version: String,
    pub name: String,
    pub puppet: NkpPuppetSource,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub layers: Vec<NkpLayer>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skeleton: Option<NkpSkeleton2D>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blend_shapes: Option<NkpBlendShapeLibrary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub control_drivers: Vec<NkpControlDriver>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub expressions: BTreeMap<String, BTreeMap<String, f32>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub animations: Vec<AnimationClip2D>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_rig: Option<NkpAutoRigMetadata>,
    #[serde(default)]
    pub parameters: BTreeMap<String, f32>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub face_parameters: BTreeMap<String, f32>,
    pub viewport: NkpViewportState,
}

#[cfg(test)]
mod native_contract_tests {
    use super::*;

    #[test]
    fn native_nkp_project_roundtrips() {
        let project = NkpProjectData {
            version: "2.0".to_string(),
            name: "Sakura Native".to_string(),
            puppet: NkpPuppetSource {
                src: None,
                format: Some(PuppetFormat::Native),
                animation_model: Some(NkpAnimationModel::BoneBlendshape),
                import_source: Some(NkpImportSource {
                    kind: NkpImportSourceKind::Live2dBundle,
                    path: Some("./sakura.zip".to_string()),
                    content_hash: Some("sha256:fixture".to_string()),
                    metadata: None,
                }),
                bundle: None,
            },
            layers: vec![NkpLayer {
                id: "layer-face".to_string(),
                name: Some("Face".to_string()),
                texture_ref: "textures/face.png".to_string(),
                mesh: NkpLayerMesh {
                    id: "mesh-face".to_string(),
                    vertices: vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
                    uvs: vec![],
                    triangles: vec![[0, 1, 2]],
                },
                blend_mode: None,
                opacity: Some(1.0),
                z_order: Some(0.0),
                skin_weights: Some(NkpSkinWeights2D {
                    mesh_id: "mesh-face".to_string(),
                    joint_indices: vec![[0, 1, 0, 0]],
                    joint_weights: vec![[0.25, 0.75, 0.0, 0.0]],
                }),
            }],
            skeleton: Some(NkpSkeleton2D {
                bones: vec![
                    NkpBone2D {
                        id: "bone-root".to_string(),
                        name: "root".to_string(),
                        parent: None,
                        position: [0.0, 0.0],
                        rotation: Some(0.0),
                        scale: None,
                        length: None,
                    },
                    NkpBone2D {
                        id: "bone-head".to_string(),
                        name: "head".to_string(),
                        parent: Some("bone-root".to_string()),
                        position: [0.0, -40.0],
                        rotation: Some(0.0),
                        scale: None,
                        length: Some(40.0),
                    },
                ],
                ik_constraints: vec![NkpIkConstraint2D {
                    id: "ik-head".to_string(),
                    target_bone: "bone-head".to_string(),
                    end_bone: "bone-head".to_string(),
                    chain_length: 1,
                    solver: NkpIkSolver2D::Ccd {
                        max_iterations: Some(4),
                    },
                }],
                path_constraints: vec![NkpPathConstraint2D {
                    id: "path-head-arc".to_string(),
                    bone: "bone-head".to_string(),
                    path: vec![[0.0, -42.0], [2.0, -44.0]],
                    influence: Some(0.25),
                }],
                spring_bones: vec![],
            }),
            blend_shapes: Some(NkpBlendShapeLibrary {
                standard: Some(NkpBlendShapeStandard::Arkit52),
                implemented: vec!["jawOpen".to_string()],
                shapes: vec![NkpBlendShapeDef {
                    id: Some("shape-jaw-open".to_string()),
                    name: "jawOpen".to_string(),
                    mesh_id: "mesh-face".to_string(),
                    vertex_deltas: vec![[0.0, 0.0], [0.0, 1.0], [0.0, 1.0]],
                    post_skin: None,
                }],
                custom: vec![],
                aliases: BTreeMap::new(),
            }),
            control_drivers: vec![NkpControlDriver {
                id: "driver-jaw-open".to_string(),
                source: NkpControlSource::Blendshape {
                    name: "jawOpen".to_string(),
                },
                target: NkpControlTarget::BoneRotation {
                    bone: "bone-head".to_string(),
                    axis: NkpAxis2D::Z,
                },
                curve: NkpDriverCurve::Linear {
                    scale: Some(18.0),
                    offset: None,
                },
                blend_mode: NkpDriverBlendMode::Add,
                priority: 0,
            }],
            expressions: BTreeMap::from([(
                "happy".to_string(),
                BTreeMap::from([("jawOpen".to_string(), 0.2)]),
            )]),
            animations: vec![AnimationClip2D {
                name: "idle".to_string(),
                duration_ms: 1000.0,
                bone_tracks: vec![NkpBoneTrack {
                    bone: "bone-head".to_string(),
                    position_keys: vec![],
                    rotation_keys: vec![NkpScalarKeyframe {
                        time_ms: 0.0,
                        value: 0.0,
                        easing: Some(NkpEasingType::Linear),
                    }],
                    scale_keys: vec![],
                }],
                blendshape_tracks: vec![],
            }],
            auto_rig: Some(NkpAutoRigMetadata {
                template: "humanoid_upper".to_string(),
                generated_by: "neko-auto-rig/fixture".to_string(),
                confidence: 0.87,
                model_version: None,
                user_adjusted: vec!["bone:bone-head".to_string()],
                source_kind: Some(NkpImportSourceKind::Live2dBundle),
            }),
            parameters: BTreeMap::new(),
            face_parameters: BTreeMap::new(),
            viewport: NkpViewportState { zoom: 1.0 },
        };

        let json = serde_json::to_string(&project).unwrap();
        assert!(json.contains("\"format\":\"native\""));
        assert!(json.contains("\"animationModel\":\"bone-blendshape\""));

        let restored: NkpProjectData = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, project);
    }

    #[test]
    fn native_nkp_json_fixture_roundtrips() {
        let fixture =
            include_str!("../../../../neko-types/src/types/__fixtures__/native-puppet-v2.json");
        let project: NkpProjectData = serde_json::from_str(fixture).unwrap();

        assert_eq!(project.version, "2.0");
        assert_eq!(project.puppet.format, Some(PuppetFormat::Native));
        assert_eq!(
            project.puppet.animation_model,
            Some(NkpAnimationModel::BoneBlendshape)
        );
        assert_eq!(project.layers.len(), 1);
        assert_eq!(project.control_drivers.len(), 1);

        let round_tripped: NkpProjectData =
            serde_json::from_str(&serde_json::to_string(&project).unwrap()).unwrap();
        assert_eq!(round_tripped, project);
    }
}
