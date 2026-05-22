//! AI character preview scene mode DTOs.
//!
//! These mirror the L0 TypeScript contracts in
//! `@neko/shared/types/model-ai-preview-scene-modes` and intentionally contain
//! no renderer or editor implementation logic.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MODEL_CHARACTER_PREVIEW_SET_MODE: &str = "scene:model:characterPreview:setMode";
pub const MODEL_CHARACTER_PREVIEW_RESET_MODE_CAMERA: &str =
    "scene:model:characterPreview:resetModeCamera";
pub const MODEL_CHARACTER_PREVIEW_PLAYBACK: &str = "scene:model:characterPreview:playback";

#[derive(Clone, Debug, Deserialize, Hash, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterPreviewModeId {
    Face,
    FullBody,
    Motion,
    VoicePack,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterPreviewPlaybackState {
    Idle,
    Loading,
    Playing,
    Paused,
    Unavailable,
    Failed,
    Stopped,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterPreviewStateStatus {
    Requested,
    Pending,
    Applied,
    Rejected,
    Resynced,
    Unavailable,
}

impl CharacterPreviewStateStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Requested => "requested",
            Self::Pending => "pending",
            Self::Applied => "applied",
            Self::Rejected => "rejected",
            Self::Resynced => "resynced",
            Self::Unavailable => "unavailable",
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CharacterPreviewDiagnosticCode {
    MissingDemoClip,
    MissingVoicePack,
    UnsupportedVisemeBinding,
    SkeletonIncompatible,
    PreviewFallback,
    StaleRevision,
    CameraOverrideReset,
    AudioUnavailable,
    PlaybackFailed,
    SceneControlUnavailable,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewDiagnostic {
    pub code: CharacterPreviewDiagnosticCode,
    pub severity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewPlaybackDescriptor {
    pub state: CharacterPreviewPlaybackState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clip_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub voice_pack_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phrase_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clock_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub looped: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewModeStatePayload {
    pub character_id: String,
    pub mode_id: CharacterPreviewModeId,
    pub viewport_id: String,
    pub status: CharacterPreviewStateStatus,
    pub scene_revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub applied_seq: Option<u64>,
    pub camera_preset: String,
    pub render_preset: String,
    pub playback: CharacterPreviewPlaybackDescriptor,
    #[serde(default)]
    pub diagnostics: Vec<CharacterPreviewDiagnostic>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_camera_override: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewModeRequestPayload {
    pub character_id: String,
    pub mode_id: CharacterPreviewModeId,
    pub viewport_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reset_camera: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub playback: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewCameraResetPayload {
    pub character_id: String,
    pub mode_id: CharacterPreviewModeId,
    pub viewport_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewPlaybackCommandPayload {
    pub character_id: String,
    pub mode_id: CharacterPreviewModeId,
    pub viewport_id: String,
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clock_ms: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPreviewCameraOverrideState {
    pub mode_id: CharacterPreviewModeId,
    pub character_id: String,
    pub viewport_id: String,
    pub scene_revision: u64,
    pub position: [f32; 3],
    pub target: [f32; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub up: Option<[f32; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fov_y: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub topology_version: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        request: CharacterPreviewModeRequestPayload,
        camera_reset: CharacterPreviewCameraResetPayload,
        playback_command: CharacterPreviewPlaybackCommandPayload,
        state: CharacterPreviewModeStatePayload,
        states: Vec<CharacterPreviewModeStatePayload>,
    }

    #[test]
    fn model_preview_fixture_roundtrips_state_payload() {
        let fixture =
            include_str!("../../../../neko-types/src/types/__fixtures__/model-ai-preview-scene-modes-v1.json");
        let fixture: Fixture = serde_json::from_str(fixture).expect("fixture should deserialize");

        assert_eq!(fixture.request.mode_id, CharacterPreviewModeId::VoicePack);
        assert_eq!(fixture.camera_reset.mode_id, CharacterPreviewModeId::Face);
        assert_eq!(fixture.playback_command.mode_id, CharacterPreviewModeId::Motion);
        assert_eq!(fixture.state.character_id, "character-a");
        assert_eq!(fixture.state.mode_id, CharacterPreviewModeId::VoicePack);
        assert_eq!(fixture.state.status, CharacterPreviewStateStatus::Applied);
        assert_eq!(
            fixture.state.diagnostics[0].code,
            CharacterPreviewDiagnosticCode::MissingVoicePack
        );
        assert_eq!(fixture.states.len(), 4);
        assert_eq!(fixture.states[0].mode_id, CharacterPreviewModeId::Face);
        assert_eq!(fixture.states[1].mode_id, CharacterPreviewModeId::FullBody);
        assert_eq!(fixture.states[2].mode_id, CharacterPreviewModeId::Motion);
        assert_eq!(fixture.states[3].mode_id, CharacterPreviewModeId::VoicePack);
        assert_eq!(
            fixture.states[2].diagnostics[0].code,
            CharacterPreviewDiagnosticCode::MissingDemoClip
        );
        assert_eq!(
            fixture.states[3].diagnostics[0].code,
            CharacterPreviewDiagnosticCode::MissingVoicePack
        );

        let encoded = serde_json::to_string(&fixture.state).unwrap();
        let round_tripped: CharacterPreviewModeStatePayload =
            serde_json::from_str(&encoded).unwrap();
        assert_eq!(round_tripped, fixture.state);

        let encoded_states = serde_json::to_string(&fixture.states).unwrap();
        let round_tripped_states: Vec<CharacterPreviewModeStatePayload> =
            serde_json::from_str(&encoded_states).unwrap();
        assert_eq!(round_tripped_states, fixture.states);
    }
}
