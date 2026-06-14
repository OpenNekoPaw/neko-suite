//! ModelPreviewController - engine-owned AI character preview scene state.

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::gpu::CameraParams;
use neko_engine_kernel::contracts::services::ISceneService;
use neko_engine_types::registry;
use neko_engine_types::{
    ActionResponse, CharacterPreviewCameraOverrideState, CharacterPreviewDiagnostic,
    CharacterPreviewDiagnosticCode, CharacterPreviewModeId, CharacterPreviewModeRequestPayload,
    CharacterPreviewModeStatePayload, CharacterPreviewPlaybackCommandPayload,
    CharacterPreviewPlaybackDescriptor, CharacterPreviewPlaybackState, CharacterPreviewStateStatus,
    ViewportCommand, ViewportDomain, ViewportEvent, ViewportEventStatus, ViewportProtocolError,
    MODEL_CHARACTER_PREVIEW_PLAYBACK, MODEL_CHARACTER_PREVIEW_RESET_MODE_CAMERA,
    MODEL_CHARACTER_PREVIEW_SET_MODE, VIEWPORT_PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};

const ACTION_COMMAND: &str = "command";
const ACTION_STATE: &str = "state";
const ACTION_RESET: &str = "reset";

#[derive(Default)]
struct ModelPreviewStore {
    sessions: HashMap<PreviewSessionKey, ModelPreviewSession>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct PreviewSessionKey {
    scene_id: String,
    viewport_id: String,
    character_id: String,
}

#[derive(Clone, Debug)]
struct ModelPreviewSession {
    active_state: CharacterPreviewModeStatePayload,
    camera_overrides: HashMap<CharacterPreviewModeId, CharacterPreviewCameraOverrideState>,
}

/// Controller for semantic AI character preview modes in Neko Model.
pub struct ModelPreviewController {
    scene_service: Option<Arc<dyn ISceneService>>,
    store: Arc<RwLock<ModelPreviewStore>>,
}

impl ModelPreviewController {
    pub fn new(scene_service: Option<Arc<dyn ISceneService>>) -> Self {
        Self {
            scene_service,
            store: Arc::new(RwLock::new(ModelPreviewStore::default())),
        }
    }

    pub fn handle_viewport_command(
        &self,
        command: ViewportCommand,
    ) -> ApiResult<ModelPreviewCommandResult> {
        if !command.has_supported_protocol_version() {
            return Ok(ModelPreviewCommandResult::event_only(error_event(
                &command,
                self.current_revision(),
                "unsupportedProtocolVersion",
                format!(
                    "viewport protocol version {} is not supported; expected {}",
                    command.protocol_version, VIEWPORT_PROTOCOL_VERSION
                ),
            )));
        }

        if !command.has_domain_aligned_action() {
            return Ok(ModelPreviewCommandResult::event_only(error_event(
                &command,
                self.current_revision(),
                "domainActionMismatch",
                "command action prefix does not match viewport protocol domain",
            )));
        }

        if command.domain != ViewportDomain::Scene || !is_model_preview_action(&command.action) {
            return Ok(ModelPreviewCommandResult::event_only(error_event(
                &command,
                self.current_revision(),
                "unsupportedModelPreviewAction",
                "model preview controller only routes scene:model:characterPreview:* commands",
            )));
        }

        match command.action.as_str() {
            MODEL_CHARACTER_PREVIEW_SET_MODE => self.handle_set_mode(command),
            MODEL_CHARACTER_PREVIEW_RESET_MODE_CAMERA => self.handle_reset_mode_camera(command),
            MODEL_CHARACTER_PREVIEW_PLAYBACK => self.handle_playback(command),
            _ => Ok(ModelPreviewCommandResult::event_only(error_event(
                &command,
                self.current_revision(),
                "unsupportedModelPreviewAction",
                "model preview command action is not supported",
            ))),
        }
    }

    pub fn active_preview_mode(
        &self,
        scene_id: &str,
        viewport_id: &str,
    ) -> Option<CharacterPreviewModeId> {
        self.read_store().ok().and_then(|store| {
            store
                .sessions
                .iter()
                .find(|(key, _)| key.scene_id == scene_id && key.viewport_id == viewport_id)
                .map(|(_, session)| session.active_state.mode_id.clone())
        })
    }

    pub fn playback_clock_ms(&self, scene_id: &str, viewport_id: &str) -> Option<f64> {
        self.read_store().ok().and_then(|store| {
            store
                .sessions
                .iter()
                .find(|(key, _)| key.scene_id == scene_id && key.viewport_id == viewport_id)
                .and_then(|(_, session)| session.active_state.playback.clock_ms)
        })
    }

    pub fn camera_for_viewport(&self, scene_id: &str, viewport_id: &str) -> Option<CameraParams> {
        let store = self.read_store().ok()?;
        let session = store
            .sessions
            .iter()
            .find(|(key, _)| key.scene_id == scene_id && key.viewport_id == viewport_id)
            .map(|(_, session)| session)?;
        let override_state = session
            .camera_overrides
            .get(&session.active_state.mode_id)
            .filter(|state| state.scene_revision == session.active_state.scene_revision);
        override_state
            .map(camera_from_override)
            .or_else(|| Some(preset_camera(session.active_state.mode_id.clone())))
    }

    pub fn record_camera_override(
        &self,
        scene_id: &str,
        viewport_id: &str,
        camera: CameraParams,
    ) -> ApiResult<bool> {
        let mut store = self.write_store()?;
        let Some((key, session)) = store
            .sessions
            .iter_mut()
            .find(|(key, _)| key.scene_id == scene_id && key.viewport_id == viewport_id)
        else {
            return Ok(false);
        };
        session.camera_overrides.insert(
            session.active_state.mode_id.clone(),
            CharacterPreviewCameraOverrideState {
                mode_id: session.active_state.mode_id.clone(),
                character_id: key.character_id.clone(),
                viewport_id: key.viewport_id.clone(),
                scene_revision: session.active_state.scene_revision,
                position: camera.position.to_array(),
                target: camera.target.to_array(),
                up: Some(camera.up.to_array()),
                fov_y: Some(camera.fov_y),
                topology_version: None,
            },
        );
        session.active_state.has_camera_override = Some(true);
        Ok(true)
    }

    fn handle_set_mode(&self, command: ViewportCommand) -> ApiResult<ModelPreviewCommandResult> {
        let revision = self.current_revision();
        if let Some(error) = validate_required_base_revision(&command, revision) {
            let state = rejected_state(
                &command,
                "stale-revision",
                "preview mode command targets a stale scene revision",
            )?;
            return Ok(ModelPreviewCommandResult::new(error, Some(state)));
        }

        let payload: CharacterPreviewModeRequestPayload =
            serde_json::from_value(command.payload.clone())
                .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
        let state = self.apply_mode(&command, payload, revision, false)?;
        Ok(ModelPreviewCommandResult::new(
            ack_event(&command, revision, serde_json::to_value(&state)?),
            Some(state),
        ))
    }

    fn handle_reset_mode_camera(
        &self,
        command: ViewportCommand,
    ) -> ApiResult<ModelPreviewCommandResult> {
        let revision = self.current_revision();
        if let Some(error) = validate_required_base_revision(&command, revision) {
            let state = rejected_state(
                &command,
                "stale-revision",
                "preview camera reset targets a stale scene revision",
            )?;
            return Ok(ModelPreviewCommandResult::new(error, Some(state)));
        }

        let payload: CharacterPreviewModeRequestPayload =
            serde_json::from_value(command.payload.clone())
                .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
        let state = self.apply_mode(&command, payload, revision, true)?;
        Ok(ModelPreviewCommandResult::new(
            ack_event(&command, revision, serde_json::to_value(&state)?),
            Some(state),
        ))
    }

    fn handle_playback(&self, command: ViewportCommand) -> ApiResult<ModelPreviewCommandResult> {
        let revision = self.current_revision();
        if let Some(error) = validate_required_base_revision(&command, revision) {
            let state = rejected_state(
                &command,
                "stale-revision",
                "preview playback targets a stale scene revision",
            )?;
            return Ok(ModelPreviewCommandResult::new(error, Some(state)));
        }

        let payload: CharacterPreviewPlaybackCommandPayload =
            serde_json::from_value(command.payload.clone())
                .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
        let request = CharacterPreviewModeRequestPayload {
            character_id: payload.character_id,
            mode_id: payload.mode_id,
            viewport_id: payload.viewport_id,
            reset_camera: None,
            playback: None,
        };
        let mut state = self.apply_mode(&command, request, revision, false)?;
        state.playback.clock_ms = payload.clock_ms;
        state.playback.state = match payload.action.as_str() {
            "pause" => CharacterPreviewPlaybackState::Paused,
            "stop" => CharacterPreviewPlaybackState::Stopped,
            _ => state.playback.state,
        };
        self.store_state(&command, state.clone(), false)?;
        Ok(ModelPreviewCommandResult::new(
            ack_event(&command, revision, serde_json::to_value(&state)?),
            Some(state),
        ))
    }

    fn apply_mode(
        &self,
        command: &ViewportCommand,
        payload: CharacterPreviewModeRequestPayload,
        revision: u64,
        reset_camera: bool,
    ) -> ApiResult<CharacterPreviewModeStatePayload> {
        if payload.character_id.trim().is_empty() {
            return Err(ApiError::InvalidRequest(
                "characterId is required".to_string(),
            ));
        }
        if payload.viewport_id.trim().is_empty() {
            return Err(ApiError::InvalidRequest(
                "viewportId is required".to_string(),
            ));
        }

        let camera = preset_camera(payload.mode_id.clone());
        if reset_camera || !self.has_compatible_camera_override(command, &payload, revision) {
            if let Some(scene_service) = self.scene_service.as_ref() {
                scene_service.set_editor_camera(camera);
            }
        }

        let mut diagnostics =
            preview_mode_diagnostics(&payload.mode_id, self.scene_service.as_ref());
        if reset_camera {
            diagnostics.push(CharacterPreviewDiagnostic {
                code: CharacterPreviewDiagnosticCode::CameraOverrideReset,
                severity: "info".to_string(),
                message: Some("Preview camera override reset to engine preset.".to_string()),
                retryable: None,
                detail: None,
            });
        }

        let mode_id = payload.mode_id;
        let camera_preset = camera_preset_id(&mode_id).to_string();
        let render_preset = render_preset_id(&mode_id).to_string();
        let playback = playback_descriptor(
            &mode_id,
            self.scene_service.as_ref(),
            payload.playback.as_ref(),
        );
        let state = CharacterPreviewModeStatePayload {
            character_id: payload.character_id,
            mode_id,
            viewport_id: payload.viewport_id,
            status: CharacterPreviewStateStatus::Applied,
            scene_revision: revision,
            applied_seq: Some(command.seq),
            camera_preset,
            render_preset,
            playback,
            diagnostics,
            has_camera_override: Some(false),
        };
        self.store_state(command, state.clone(), reset_camera)?;
        Ok(state)
    }

    fn store_state(
        &self,
        command: &ViewportCommand,
        state: CharacterPreviewModeStatePayload,
        reset_camera: bool,
    ) -> ApiResult<()> {
        let key = PreviewSessionKey {
            scene_id: command.scene_id.clone(),
            viewport_id: state.viewport_id.clone(),
            character_id: state.character_id.clone(),
        };
        let mut store = self.write_store()?;
        let entry = store
            .sessions
            .entry(key)
            .or_insert_with(|| ModelPreviewSession {
                active_state: state.clone(),
                camera_overrides: HashMap::new(),
            });
        if reset_camera {
            entry.camera_overrides.remove(&state.mode_id);
        }
        entry.active_state = state;
        Ok(())
    }

    fn has_compatible_camera_override(
        &self,
        command: &ViewportCommand,
        payload: &CharacterPreviewModeRequestPayload,
        revision: u64,
    ) -> bool {
        self.read_store()
            .ok()
            .and_then(|store| {
                store
                    .sessions
                    .get(&PreviewSessionKey {
                        scene_id: command.scene_id.clone(),
                        viewport_id: payload.viewport_id.clone(),
                        character_id: payload.character_id.clone(),
                    })
                    .and_then(|session| session.camera_overrides.get(&payload.mode_id))
                    .map(|state| state.scene_revision == revision)
            })
            .unwrap_or(false)
    }

    fn current_revision(&self) -> u64 {
        self.scene_service
            .as_ref()
            .and_then(|service| service.current_revision().ok())
            .unwrap_or_default()
    }

    fn read_store(&self) -> ApiResult<RwLockReadGuard<'_, ModelPreviewStore>> {
        self.store
            .read()
            .map_err(|_| ApiError::Internal("model preview store lock poisoned".to_string()))
    }

    fn write_store(&self) -> ApiResult<RwLockWriteGuard<'_, ModelPreviewStore>> {
        self.store
            .write()
            .map_err(|_| ApiError::Internal("model preview store lock poisoned".to_string()))
    }
}

impl Controller for ModelPreviewController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        _options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            ACTION_COMMAND => {
                let body =
                    body.ok_or_else(|| ApiError::InvalidRequest("body required".to_string()))?;
                let command: ViewportCommand = serde_json::from_value(body)
                    .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
                let result = self.handle_viewport_command(command)?;
                Ok(ActionResponse::ok("", serde_json::to_value(result)?))
            }
            ACTION_STATE => {
                let value = body.unwrap_or(Value::Null);
                let scene_id = value
                    .get("sceneId")
                    .and_then(Value::as_str)
                    .unwrap_or("default");
                let viewport_id = value
                    .get("viewportId")
                    .and_then(Value::as_str)
                    .unwrap_or("main");
                Ok(ActionResponse::ok(
                    "",
                    json!({
                        "sceneId": scene_id,
                        "viewportId": viewport_id,
                        "activePreviewMode": self.active_preview_mode(scene_id, viewport_id),
                        "previewPlaybackClockMs": self.playback_clock_ms(scene_id, viewport_id)
                    }),
                ))
            }
            ACTION_RESET => {
                let mut store = self.write_store()?;
                store.sessions.clear();
                Ok(ActionResponse::ok("", json!({ "status": "reset" })))
            }
            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::MODEL_PREVIEW
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::MODEL_PREVIEW
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreviewCommandResult {
    pub event: ViewportEvent,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<CharacterPreviewModeStatePayload>,
}

impl ModelPreviewCommandResult {
    fn new(event: ViewportEvent, state: Option<CharacterPreviewModeStatePayload>) -> Self {
        Self { event, state }
    }

    fn event_only(event: ViewportEvent) -> Self {
        Self { event, state: None }
    }
}

pub fn is_model_preview_action(action: &str) -> bool {
    matches!(
        action,
        MODEL_CHARACTER_PREVIEW_SET_MODE
            | MODEL_CHARACTER_PREVIEW_RESET_MODE_CAMERA
            | MODEL_CHARACTER_PREVIEW_PLAYBACK
    )
}

fn validate_required_base_revision(
    command: &ViewportCommand,
    revision: u64,
) -> Option<ViewportEvent> {
    let base_revision = command.base_revision?;
    if base_revision > revision {
        return Some(error_event(
            command,
            revision,
            "stale-revision",
            "preview command targets a future scene revision",
        ));
    }
    None
}

fn rejected_state(
    command: &ViewportCommand,
    code: &str,
    message: &str,
) -> ApiResult<CharacterPreviewModeStatePayload> {
    let payload: CharacterPreviewModeRequestPayload =
        serde_json::from_value(command.payload.clone())
            .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
    let mode_id = payload.mode_id;
    let camera_preset = camera_preset_id(&mode_id).to_string();
    let render_preset = render_preset_id(&mode_id).to_string();
    Ok(CharacterPreviewModeStatePayload {
        character_id: payload.character_id,
        mode_id,
        viewport_id: payload.viewport_id,
        status: CharacterPreviewStateStatus::Rejected,
        scene_revision: command.base_revision.unwrap_or_default(),
        applied_seq: Some(command.seq),
        camera_preset,
        render_preset,
        playback: CharacterPreviewPlaybackDescriptor {
            state: CharacterPreviewPlaybackState::Unavailable,
            clip_id: None,
            voice_pack_id: None,
            phrase_id: None,
            started_at_ms: None,
            clock_ms: None,
            duration_ms: None,
            looped: None,
        },
        diagnostics: vec![CharacterPreviewDiagnostic {
            code: if code == "stale-revision" {
                CharacterPreviewDiagnosticCode::StaleRevision
            } else {
                CharacterPreviewDiagnosticCode::PreviewFallback
            },
            severity: "error".to_string(),
            message: Some(message.to_string()),
            retryable: Some(true),
            detail: None,
        }],
        has_camera_override: Some(false),
    })
}

fn ack_event(command: &ViewportCommand, revision: u64, payload: Value) -> ViewportEvent {
    ViewportEvent {
        protocol_version: VIEWPORT_PROTOCOL_VERSION,
        domain: command.domain,
        event: command.action.clone(),
        scene_id: command.scene_id.clone(),
        viewport_id: command.viewport_id.clone(),
        ack_seq: command.seq,
        revision,
        timestamp: command.timestamp,
        status: Some(ViewportEventStatus::Ack),
        applied_seq: Some(command.seq),
        error: None,
        payload,
    }
}

fn error_event(
    command: &ViewportCommand,
    revision: u64,
    code: impl Into<String>,
    message: impl Into<String>,
) -> ViewportEvent {
    ViewportEvent {
        protocol_version: VIEWPORT_PROTOCOL_VERSION,
        domain: command.domain,
        event: command.action.clone(),
        scene_id: command.scene_id.clone(),
        viewport_id: command.viewport_id.clone(),
        ack_seq: command.seq,
        revision,
        timestamp: command.timestamp,
        status: Some(ViewportEventStatus::Error),
        applied_seq: None,
        error: Some(ViewportProtocolError {
            code: code.into(),
            message: message.into(),
            retryable: Some(true),
        }),
        payload: Value::Object(Default::default()),
    }
}

fn preview_mode_diagnostics(
    mode_id: &CharacterPreviewModeId,
    scene_service: Option<&Arc<dyn ISceneService>>,
) -> Vec<CharacterPreviewDiagnostic> {
    match mode_id {
        CharacterPreviewModeId::Motion if default_motion_clip(scene_service).is_none() => {
            vec![CharacterPreviewDiagnostic {
                code: CharacterPreviewDiagnosticCode::MissingDemoClip,
                severity: "warning".to_string(),
                message: Some(
                    "No compatible demo motion clip is bound to this character.".to_string(),
                ),
                retryable: None,
                detail: None,
            }]
        }
        CharacterPreviewModeId::VoicePack => vec![CharacterPreviewDiagnostic {
            code: CharacterPreviewDiagnosticCode::MissingVoicePack,
            severity: "warning".to_string(),
            message: Some("No compatible voice pack is bound to this character.".to_string()),
            retryable: None,
            detail: None,
        }],
        _ => Vec::new(),
    }
}

fn playback_descriptor(
    mode_id: &CharacterPreviewModeId,
    scene_service: Option<&Arc<dyn ISceneService>>,
    playback_request: Option<&Value>,
) -> CharacterPreviewPlaybackDescriptor {
    match mode_id {
        CharacterPreviewModeId::Face | CharacterPreviewModeId::FullBody => {
            CharacterPreviewPlaybackDescriptor {
                state: CharacterPreviewPlaybackState::Idle,
                clip_id: None,
                voice_pack_id: None,
                phrase_id: None,
                started_at_ms: None,
                clock_ms: None,
                duration_ms: None,
                looped: None,
            }
        }
        CharacterPreviewModeId::Motion => match default_motion_clip(scene_service) {
            Some((clip_id, duration_ms)) => CharacterPreviewPlaybackDescriptor {
                state: CharacterPreviewPlaybackState::Playing,
                clip_id: Some(clip_id),
                voice_pack_id: None,
                phrase_id: None,
                started_at_ms: Some(0.0),
                clock_ms: Some(0.0),
                duration_ms: Some(duration_ms),
                looped: Some(true),
            },
            None => CharacterPreviewPlaybackDescriptor {
                state: CharacterPreviewPlaybackState::Unavailable,
                clip_id: None,
                voice_pack_id: None,
                phrase_id: None,
                started_at_ms: None,
                clock_ms: None,
                duration_ms: None,
                looped: None,
            },
        },
        CharacterPreviewModeId::VoicePack => CharacterPreviewPlaybackDescriptor {
            state: CharacterPreviewPlaybackState::Unavailable,
            clip_id: None,
            voice_pack_id: playback_request
                .and_then(|value| value.get("voicePackId"))
                .and_then(Value::as_str)
                .map(str::to_string),
            phrase_id: playback_request
                .and_then(|value| value.get("phraseId"))
                .and_then(Value::as_str)
                .map(str::to_string),
            started_at_ms: None,
            clock_ms: None,
            duration_ms: None,
            looped: None,
        },
    }
}

fn default_motion_clip(scene_service: Option<&Arc<dyn ISceneService>>) -> Option<(String, f64)> {
    scene_service?
        .get_animation_clips()
        .ok()?
        .into_iter()
        .find(|clip| clip.duration.is_finite() && clip.duration > 0.0)
        .map(|clip| (clip.name, f64::from(clip.duration) * 1000.0))
}

fn camera_preset_id(mode_id: &CharacterPreviewModeId) -> &'static str {
    match mode_id {
        CharacterPreviewModeId::Face => "face-closeup",
        CharacterPreviewModeId::FullBody => "full-body",
        CharacterPreviewModeId::Motion => "motion-review",
        CharacterPreviewModeId::VoicePack => "voice-performance",
    }
}

fn render_preset_id(mode_id: &CharacterPreviewModeId) -> &'static str {
    match mode_id {
        CharacterPreviewModeId::Face => "face-detail",
        CharacterPreviewModeId::FullBody => "body-silhouette",
        CharacterPreviewModeId::Motion => "motion-diagnostics",
        CharacterPreviewModeId::VoicePack => "voice-lipsync",
    }
}

fn preset_camera(mode_id: CharacterPreviewModeId) -> CameraParams {
    match mode_id {
        CharacterPreviewModeId::Face => CameraParams {
            position: glam::Vec3::new(0.0, 1.45, 1.35),
            target: glam::Vec3::new(0.0, 1.42, 0.0),
            fov_y: 24.0_f32.to_radians(),
            ..CameraParams::default()
        },
        CharacterPreviewModeId::FullBody => CameraParams {
            position: glam::Vec3::new(0.0, 1.1, 4.2),
            target: glam::Vec3::new(0.0, 0.9, 0.0),
            fov_y: 35.0_f32.to_radians(),
            ..CameraParams::default()
        },
        CharacterPreviewModeId::Motion => CameraParams {
            position: glam::Vec3::new(0.0, 1.15, 5.0),
            target: glam::Vec3::new(0.0, 0.95, 0.0),
            fov_y: 38.0_f32.to_radians(),
            ..CameraParams::default()
        },
        CharacterPreviewModeId::VoicePack => CameraParams {
            position: glam::Vec3::new(0.0, 1.4, 1.8),
            target: glam::Vec3::new(0.0, 1.35, 0.0),
            fov_y: 28.0_f32.to_radians(),
            ..CameraParams::default()
        },
    }
}

fn camera_from_override(state: &CharacterPreviewCameraOverrideState) -> CameraParams {
    CameraParams {
        position: glam::Vec3::from_array(state.position),
        target: glam::Vec3::from_array(state.target),
        up: state
            .up
            .map(glam::Vec3::from_array)
            .unwrap_or(glam::Vec3::Y),
        fov_y: state.fov_y.unwrap_or_else(|| 45.0_f32.to_radians()),
        ..CameraParams::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;
    use neko_engine_types::{ViewportCommandSource, ViewportDomain};

    fn controller() -> ModelPreviewController {
        let services = ServiceFactory::new().create_with_gpu(None);
        ModelPreviewController::new(services.scene_service)
    }

    fn command(action: &str, mode_id: &str, seq: u64, base_revision: u64) -> ViewportCommand {
        ViewportCommand {
            protocol_version: VIEWPORT_PROTOCOL_VERSION,
            domain: ViewportDomain::Scene,
            action: action.to_string(),
            scene_id: "scene-a".to_string(),
            viewport_id: Some("main".to_string()),
            seq,
            correlation_id: format!("main:preview:{seq}"),
            timestamp: 100.0,
            source: ViewportCommandSource::User,
            base_revision: Some(base_revision),
            payload: json!({
                "characterId": "character-a",
                "modeId": mode_id,
                "viewportId": "main"
            }),
        }
    }

    #[test]
    fn applies_face_and_full_body_presets_as_authoritative_state() {
        let controller = controller();
        let event = controller
            .handle_viewport_command(command(MODEL_CHARACTER_PREVIEW_SET_MODE, "face", 7, 0))
            .unwrap();
        let state = event.state.unwrap();
        assert_eq!(event.event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(state.mode_id, CharacterPreviewModeId::Face);
        assert_eq!(state.camera_preset, "face-closeup");
        assert_eq!(state.render_preset, "face-detail");
        assert_eq!(
            controller.active_preview_mode("scene-a", "main"),
            Some(CharacterPreviewModeId::Face)
        );

        let event = controller
            .handle_viewport_command(command(MODEL_CHARACTER_PREVIEW_SET_MODE, "full-body", 8, 0))
            .unwrap();
        let state = event.state.unwrap();
        assert_eq!(state.mode_id, CharacterPreviewModeId::FullBody);
        assert_eq!(state.camera_preset, "full-body");
    }

    #[test]
    fn reports_motion_and_voice_fallback_diagnostics() {
        let controller = controller();
        let motion = controller
            .handle_viewport_command(command(MODEL_CHARACTER_PREVIEW_SET_MODE, "motion", 9, 0))
            .unwrap()
            .state
            .unwrap();
        assert_eq!(
            motion.playback.state,
            CharacterPreviewPlaybackState::Unavailable
        );
        assert_eq!(
            motion.diagnostics[0].code,
            CharacterPreviewDiagnosticCode::MissingDemoClip
        );

        let voice = controller
            .handle_viewport_command(command(
                MODEL_CHARACTER_PREVIEW_SET_MODE,
                "voice-pack",
                10,
                0,
            ))
            .unwrap()
            .state
            .unwrap();
        assert_eq!(
            voice.playback.state,
            CharacterPreviewPlaybackState::Unavailable
        );
        assert_eq!(
            voice.diagnostics[0].code,
            CharacterPreviewDiagnosticCode::MissingVoicePack
        );
    }

    #[test]
    fn motion_preview_uses_available_animation_clip_for_playback() {
        let services = ServiceFactory::new().create_with_gpu(None);
        let scene_service = services.scene_service.clone().unwrap();
        scene_service.create_clip("IdleCheck", 1.25).unwrap();
        let controller = ModelPreviewController::new(services.scene_service);

        let motion = controller
            .handle_viewport_command(command(MODEL_CHARACTER_PREVIEW_SET_MODE, "motion", 13, 0))
            .unwrap()
            .state
            .unwrap();

        assert_eq!(
            motion.playback.state,
            CharacterPreviewPlaybackState::Playing
        );
        assert_eq!(motion.playback.clip_id.as_deref(), Some("IdleCheck"));
        assert_eq!(motion.playback.duration_ms, Some(1250.0));
        assert!(motion.diagnostics.is_empty());
    }

    #[test]
    fn reset_camera_clears_override_and_reports_diagnostic() {
        let controller = controller();
        let result = controller
            .handle_viewport_command(command(
                MODEL_CHARACTER_PREVIEW_RESET_MODE_CAMERA,
                "face",
                11,
                0,
            ))
            .unwrap();
        let state = result.state.unwrap();
        assert_eq!(state.mode_id, CharacterPreviewModeId::Face);
        assert_eq!(
            state.diagnostics[0].code,
            CharacterPreviewDiagnosticCode::CameraOverrideReset
        );
        assert!(controller.camera_for_viewport("scene-a", "main").is_some());
    }

    #[test]
    fn camera_override_is_preserved_until_reset() {
        let controller = controller();
        controller
            .handle_viewport_command(command(MODEL_CHARACTER_PREVIEW_SET_MODE, "face", 14, 0))
            .unwrap();
        let camera = CameraParams {
            position: glam::Vec3::new(1.0, 2.0, 3.0),
            target: glam::Vec3::new(0.0, 1.0, 0.0),
            fov_y: 30.0_f32.to_radians(),
            ..CameraParams::default()
        };

        assert!(controller
            .record_camera_override("scene-a", "main", camera.clone())
            .unwrap());
        let stored = controller.camera_for_viewport("scene-a", "main").unwrap();
        assert_eq!(stored.position, camera.position);

        let reset = controller
            .handle_viewport_command(command(
                MODEL_CHARACTER_PREVIEW_RESET_MODE_CAMERA,
                "face",
                15,
                0,
            ))
            .unwrap()
            .state
            .unwrap();
        assert_eq!(reset.has_camera_override, Some(false));
        let preset = controller.camera_for_viewport("scene-a", "main").unwrap();
        assert_ne!(preset.position, camera.position);
    }

    #[test]
    fn rejects_future_revision_preview_commands() {
        let controller = controller();
        let result = controller
            .handle_viewport_command(command(MODEL_CHARACTER_PREVIEW_SET_MODE, "face", 12, 99))
            .unwrap();
        assert_eq!(result.event.status, Some(ViewportEventStatus::Error));
        assert_eq!(result.event.error.unwrap().code, "stale-revision");
        assert_eq!(
            result.state.unwrap().status,
            CharacterPreviewStateStatus::Rejected
        );
    }
}
