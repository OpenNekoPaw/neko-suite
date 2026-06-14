//! LiveCompositorController - handles engine-owned live compositor scene state.

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::{StreamRegistry, StreamStateError};
use neko_engine_kernel::contracts::domain::{FrameData, StreamCodec, StreamConfig};
use neko_engine_kernel::live_compositor::{
    plan_live_compositor_scene, LiveCompositorAdapterContext,
};
use neko_engine_types::registry;
use neko_engine_types::{
    ActionResponse, FrameFormat, LiveCompositorLayer, LiveCompositorLayerPatch,
    LiveCompositorReorderLayerPayload, LiveCompositorScene, LiveCompositorSetOutputRoutePayload,
    LiveCompositorSetPresetPayload, LiveCompositorSetTrackingOverlayPayload,
    LiveCompositorUpdateLayerPayload, LiveOutputRoute, LiveOutputRouteStatus,
    RenderFrameDiagnostics, RenderFrameMeta, StreamId, ViewportCommand, ViewportDomain,
    ViewportEvent, ViewportEventStatus, ViewportProtocolError, LIVE_COMPOSITOR_CONTRACT_VERSION,
    VIEWPORT_PROTOCOL_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const ACTION_CREATE: &str = "create";
const ACTION_UPDATE: &str = "update";
const ACTION_GET: &str = "get";
const ACTION_RESET: &str = "reset";
const ACTION_LIST: &str = "list";
const ACTION_COMMAND: &str = "command";
const ACTION_STREAM: &str = "stream";
const ACTION_STOP: &str = "stop";

const LIVE_SET_PRESET: &str = "scene:live:set-preset";
const LIVE_UPDATE_LAYER: &str = "scene:live:update-layer";
const LIVE_REORDER_LAYER: &str = "scene:live:reorder-layer";
const LIVE_SET_TRACKING_OVERLAY: &str = "scene:live:set-tracking-overlay";
const LIVE_SET_OUTPUT_ROUTE: &str = "scene:live:set-output-route";

#[derive(Debug, Clone)]
struct LiveCompositorSceneEntry {
    scene: LiveCompositorScene,
    applied_seq: u64,
}

#[derive(Default)]
struct LiveCompositorStore {
    scenes: HashMap<String, LiveCompositorSceneEntry>,
    streams: HashMap<String, LiveCompositorStreamEntry>,
}

#[derive(Debug, Clone)]
struct LiveCompositorStreamEntry {
    stream_id: StreamId,
    scene_id: String,
}

/// Controller for live compositor scene CRUD and scene:live:* command routing.
pub struct LiveCompositorController {
    store: Arc<RwLock<LiveCompositorStore>>,
    stream_registry: Option<Arc<StreamRegistry>>,
}

impl Default for LiveCompositorController {
    fn default() -> Self {
        Self::new()
    }
}

impl LiveCompositorController {
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(LiveCompositorStore::default())),
            stream_registry: None,
        }
    }

    pub fn with_stream_registry(stream_registry: Arc<StreamRegistry>) -> Self {
        Self {
            store: Arc::new(RwLock::new(LiveCompositorStore::default())),
            stream_registry: Some(stream_registry),
        }
    }

    pub fn is_live_viewport_command_body(body: Option<&Value>) -> bool {
        body.and_then(|value| value.get("domain"))
            .and_then(Value::as_str)
            .is_some_and(|domain| domain == "scene")
            && body
                .and_then(|value| value.get("action"))
                .and_then(Value::as_str)
                .is_some_and(is_live_command_action)
    }

    fn read_store(&self) -> ApiResult<RwLockReadGuard<'_, LiveCompositorStore>> {
        self.store
            .read()
            .map_err(|_| ApiError::Internal("live compositor store lock poisoned".to_string()))
    }

    fn write_store(&self) -> ApiResult<RwLockWriteGuard<'_, LiveCompositorStore>> {
        self.store
            .write()
            .map_err(|_| ApiError::Internal("live compositor store lock poisoned".to_string()))
    }

    fn stream_registry(&self) -> ApiResult<Arc<StreamRegistry>> {
        self.stream_registry
            .clone()
            .ok_or_else(|| ApiError::ServiceError("Stream registry not available".to_string()))
    }

    fn handle_create(&self, body: Option<Value>) -> ApiResult<ActionResponse> {
        let envelope = parse_scene_write(body)?;
        validate_scene_contract(&envelope.scene).map_err(ApiError::InvalidRequest)?;

        let mut store = self.write_store()?;
        if store.scenes.contains_key(&envelope.scene.scene_id) {
            return Err(ApiError::InvalidRequest(format!(
                "live compositor scene {} already exists",
                envelope.scene.scene_id
            )));
        }

        let scene = envelope.scene;
        let scene_id = scene.scene_id.clone();
        self.remove_scene_stream_entries(&mut store, &scene_id);
        store.scenes.insert(
            scene_id.clone(),
            LiveCompositorSceneEntry {
                scene: scene.clone(),
                applied_seq: 0,
            },
        );
        Ok(ActionResponse::ok(scene_id, serde_json::to_value(scene)?))
    }

    fn handle_update(&self, body: Option<Value>) -> ApiResult<ActionResponse> {
        let envelope = parse_scene_write(body)?;
        validate_scene_contract(&envelope.scene).map_err(ApiError::InvalidRequest)?;

        let mut store = self.write_store()?;
        if let Some(base_revision) = envelope.base_revision {
            let current_revision = store
                .scenes
                .get(&envelope.scene.scene_id)
                .map(|entry| entry.scene.revision)
                .unwrap_or(0);
            if base_revision != current_revision {
                return Err(ApiError::InvalidRequest(format!(
                    "base revision {base_revision} does not match current revision {current_revision}"
                )));
            }
        }

        let scene = envelope.scene;
        let scene_id = scene.scene_id.clone();
        self.remove_scene_stream_entries(&mut store, &scene_id);
        let applied_seq = store
            .scenes
            .get(&scene_id)
            .map(|entry| entry.applied_seq)
            .unwrap_or_default();
        store.scenes.insert(
            scene_id.clone(),
            LiveCompositorSceneEntry {
                scene: scene.clone(),
                applied_seq,
            },
        );
        Ok(ActionResponse::ok(scene_id, serde_json::to_value(scene)?))
    }

    fn handle_get(
        &self,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        let scene_id = request_scene_id(resource_id, &options, body.as_ref(), ACTION_GET)?;
        let store = self.read_store()?;
        let entry = store
            .scenes
            .get(&scene_id)
            .ok_or_else(|| ApiError::NotFound(format!("live compositor scene {scene_id}")))?;

        Ok(ActionResponse::ok(
            scene_id,
            json!({
                "scene": entry.scene,
                "appliedSeq": entry.applied_seq
            }),
        ))
    }

    fn handle_reset(
        &self,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        let scene_id = request_scene_id(resource_id, &options, body.as_ref(), ACTION_RESET)?;
        let mut store = self.write_store()?;
        let removed = store.scenes.remove(&scene_id);
        self.remove_scene_stream_entries(&mut store, &scene_id);
        Ok(ActionResponse::ok(
            scene_id.clone(),
            json!({
                "sceneId": scene_id,
                "removed": removed.is_some(),
                "previousRevision": removed.map(|entry| entry.scene.revision)
            }),
        ))
    }

    fn handle_list(&self) -> ApiResult<ActionResponse> {
        let store = self.read_store()?;
        let mut scenes: Vec<&LiveCompositorScene> =
            store.scenes.values().map(|entry| &entry.scene).collect();
        scenes.sort_by(|left, right| left.scene_id.cmp(&right.scene_id));
        Ok(ActionResponse::ok("", json!({ "scenes": scenes })))
    }

    fn handle_command_response(&self, body: Option<Value>) -> ApiResult<ActionResponse> {
        let body = body.ok_or_else(|| ApiError::InvalidRequest("body required".to_string()))?;
        let command: ViewportCommand = serde_json::from_value(body)
            .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
        let event = self.handle_viewport_command(command)?;
        Ok(ActionResponse::ok("", serde_json::to_value(event)?))
    }

    async fn handle_stream(
        &self,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        let request = parse_stream_request(resource_id, options, body)?;
        let stream_registry = self.stream_registry()?;
        let (scene, applied_seq) = self.snapshot_scene_for_stream(&request.scene_id)?;
        let width =
            normalize_stream_dimension(request.width.unwrap_or(scene.canvas.width as u32), 1280);
        let height =
            normalize_stream_dimension(request.height.unwrap_or(scene.canvas.height as u32), 720);
        let fps = normalize_stream_fps(request.fps.unwrap_or(scene.canvas.fps));
        let session_id = request
            .session_id
            .unwrap_or_else(|| format!("live-{}", request.scene_id));
        let resource_id = live_stream_resource_id(&request.scene_id, &request.viewport_id);
        let stream_config = StreamConfig {
            resolution: neko_engine_types::Resolution::new(width, height),
            fps,
            start_time: 0.0,
            codec: StreamCodec::H264,
            initial_paused: false,
        };

        let (stream_id, _rx) = stream_registry
            .create_stream(&session_id, &resource_id, stream_config)
            .await;
        stream_registry
            .activate(&stream_id)
            .await
            .map_err(|error| {
                ApiError::ServiceError(format!(
                    "Failed to activate live compositor stream {}: {}",
                    stream_id.as_str(),
                    error
                ))
            })?;

        let cancel_token = CancellationToken::new();
        stream_registry
            .set_cancel_token(&stream_id, cancel_token.clone())
            .await;

        self.register_stream_entry(&request.scene_id, &request.viewport_id, stream_id.clone())?;
        spawn_live_compositor_stream_producer(
            stream_registry,
            Arc::clone(&self.store),
            stream_id.clone(),
            LiveCompositorStreamConfig {
                scene_id: request.scene_id.clone(),
                viewport_id: request.viewport_id.clone(),
                width,
                height,
                fps,
                initial_revision: scene.revision,
                initial_applied_seq: applied_seq,
            },
            cancel_token,
        );

        Ok(ActionResponse::ok(
            "",
            json!({
                "streamId": stream_id.as_str(),
                "viewportId": request.viewport_id,
                "container": "h264-annexb",
                "codecString": "avc1.42001f",
                "profile": "baseline",
                "level": "3.1",
                "frameHeader": "neko-h264-v1",
                "width": width,
                "height": height,
                "fps": fps,
                "colorSpace": scene.canvas.color_space.unwrap_or_else(|| "srgb".to_string()),
                "bitDepth": 8,
                "toneMapping": "none",
                "gopSize": 1,
                "initialRevision": scene.revision,
                "qualityTier": "live-synthetic",
                "helperPassesEnabled": false,
                "postProcessEnabled": false,
                "sceneId": request.scene_id,
                "appliedSeq": applied_seq,
                "compositor": {
                    "kind": "live",
                    "source": "synthetic-layer"
                }
            }),
        ))
    }

    async fn handle_stop(
        &self,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        let target = parse_stop_request(resource_id, options, body)?;
        let stream_registry = self.stream_registry()?;
        let stream_id = match target.stream_id {
            Some(stream_id) => StreamId::from_string(stream_id),
            None => {
                let scene_id = target.scene_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "sceneId required when streamId is not provided".to_string(),
                    )
                })?;
                self.stream_entry_for_scene(&scene_id, target.viewport_id.as_deref())?
                    .stream_id
            }
        };

        match stream_registry.destroy(&stream_id).await {
            Ok(()) | Err(StreamStateError::NotFound(_)) => {}
            Err(error) => {
                return Err(ApiError::ServiceError(format!(
                    "Failed to stop live compositor stream {}: {}",
                    stream_id.as_str(),
                    error
                )));
            }
        }
        self.remove_stream_entry(&stream_id)?;

        Ok(ActionResponse::ok(
            stream_id.as_str(),
            json!({
                "streamId": stream_id.as_str(),
                "stopped": true
            }),
        ))
    }

    fn snapshot_scene_for_stream(&self, scene_id: &str) -> ApiResult<(LiveCompositorScene, u64)> {
        let store = self.read_store()?;
        let entry = store
            .scenes
            .get(scene_id)
            .ok_or_else(|| ApiError::NotFound(format!("live compositor scene {scene_id}")))?;
        Ok((entry.scene.clone(), entry.applied_seq))
    }

    fn register_stream_entry(
        &self,
        scene_id: &str,
        viewport_id: &str,
        stream_id: StreamId,
    ) -> ApiResult<()> {
        let mut store = self.write_store()?;
        let key = live_stream_key(scene_id, viewport_id);
        store.streams.insert(
            key,
            LiveCompositorStreamEntry {
                stream_id,
                scene_id: scene_id.to_string(),
            },
        );
        Ok(())
    }

    fn stream_entry_for_scene(
        &self,
        scene_id: &str,
        viewport_id: Option<&str>,
    ) -> ApiResult<LiveCompositorStreamEntry> {
        let store = self.read_store()?;
        let entry = match viewport_id {
            Some(viewport_id) => store.streams.get(&live_stream_key(scene_id, viewport_id)),
            None => store
                .streams
                .values()
                .find(|entry| entry.scene_id == scene_id),
        };
        entry.cloned().ok_or_else(|| {
            ApiError::NotFound(format!("live compositor stream for scene {scene_id}"))
        })
    }

    fn remove_stream_entry(&self, stream_id: &StreamId) -> ApiResult<()> {
        let mut store = self.write_store()?;
        store
            .streams
            .retain(|_, entry| entry.stream_id.as_str() != stream_id.as_str());
        Ok(())
    }

    fn remove_scene_stream_entries(&self, store: &mut LiveCompositorStore, scene_id: &str) {
        store.streams.retain(|_, entry| entry.scene_id != scene_id);
    }

    pub fn handle_viewport_command(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        if !command.has_supported_protocol_version() {
            return Ok(error_event(
                &command,
                self.current_revision(&command.scene_id),
                "unsupportedProtocolVersion",
                format!(
                    "viewport protocol version {} is not supported; expected {}",
                    command.protocol_version, VIEWPORT_PROTOCOL_VERSION
                ),
            ));
        }

        if !command.has_domain_aligned_action() {
            return Ok(error_event(
                &command,
                self.current_revision(&command.scene_id),
                "domainActionMismatch",
                "command action prefix does not match viewport protocol domain",
            ));
        }

        if command.domain != ViewportDomain::Scene || !is_live_command_action(&command.action) {
            return Ok(error_event(
                &command,
                self.current_revision(&command.scene_id),
                "unsupportedLiveAction",
                "live compositor only routes scene:live:* scene commands",
            ));
        }

        self.apply_live_command(command)
    }

    fn current_revision(&self, scene_id: &str) -> u64 {
        self.read_store()
            .ok()
            .and_then(|store| store.scenes.get(scene_id).map(|entry| entry.scene.revision))
            .unwrap_or_default()
    }

    fn apply_live_command(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        let mut store = self.write_store()?;
        let Some(entry) = store.scenes.get_mut(&command.scene_id) else {
            return Ok(error_event(
                &command,
                0,
                "liveSceneNotFound",
                "live compositor scene does not exist",
            ));
        };

        if let Some(error) = validate_required_base_revision(&command, entry.scene.revision) {
            return Ok(error);
        }

        let result = match command.action.as_str() {
            LIVE_SET_PRESET => apply_set_preset(&mut entry.scene, &command),
            LIVE_UPDATE_LAYER => apply_update_layer(&mut entry.scene, &command),
            LIVE_REORDER_LAYER => apply_reorder_layer(&mut entry.scene, &command),
            LIVE_SET_TRACKING_OVERLAY => apply_tracking_overlay(&mut entry.scene, &command),
            LIVE_SET_OUTPUT_ROUTE => apply_output_route(&mut entry.scene, &command),
            _ => Err(LiveCommandRejection::new(
                "unsupportedLiveAction",
                "live compositor command action is not supported",
            )),
        };

        match result {
            Ok(payload) => {
                entry.scene.revision = entry.scene.revision.saturating_add(1);
                entry.scene.updated_at = command.timestamp;
                entry.applied_seq = command.seq;
                Ok(ack_event(&command, entry.scene.revision, payload))
            }
            Err(rejection) => Ok(error_event(
                &command,
                entry.scene.revision,
                rejection.code,
                rejection.message,
            )),
        }
    }
}

impl Controller for LiveCompositorController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        match action {
            ACTION_CREATE => self.handle_create(body),
            ACTION_UPDATE => self.handle_update(body),
            ACTION_GET => self.handle_get(resource_id, options, body),
            ACTION_RESET => self.handle_reset(resource_id, options, body),
            ACTION_LIST => self.handle_list(),
            ACTION_COMMAND => self.handle_command_response(body),
            ACTION_STREAM => self.handle_stream(resource_id, options, body).await,
            ACTION_STOP => self.handle_stop(resource_id, options, body).await,
            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::LIVE_COMPOSITOR
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::LIVE_COMPOSITOR
    }
}

#[derive(Debug)]
struct LiveCommandRejection {
    code: &'static str,
    message: String,
}

impl LiveCommandRejection {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Debug)]
struct SceneWriteEnvelope {
    scene: LiveCompositorScene,
    base_revision: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSceneWriteEnvelope {
    scene: LiveCompositorScene,
    #[serde(default)]
    base_revision: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LiveCompositorStreamRequest {
    scene_id: String,
    viewport_id: String,
    session_id: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
}

#[derive(Debug)]
struct LiveCompositorStopRequest {
    stream_id: Option<String>,
    scene_id: Option<String>,
    viewport_id: Option<String>,
}

#[derive(Debug, Clone)]
struct LiveCompositorStreamConfig {
    scene_id: String,
    viewport_id: String,
    width: u32,
    height: u32,
    fps: f64,
    initial_revision: u64,
    initial_applied_seq: u64,
}

fn parse_scene_write(body: Option<Value>) -> ApiResult<SceneWriteEnvelope> {
    let body = body.ok_or_else(|| ApiError::InvalidRequest("body required".to_string()))?;
    if body.get("scene").is_some() {
        let envelope: RawSceneWriteEnvelope = serde_json::from_value(body)
            .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
        return Ok(SceneWriteEnvelope {
            scene: envelope.scene,
            base_revision: envelope.base_revision,
        });
    }
    let scene: LiveCompositorScene = serde_json::from_value(body)
        .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
    Ok(SceneWriteEnvelope {
        scene,
        base_revision: None,
    })
}

fn parse_stream_request(
    resource_id: Option<&str>,
    options: Value,
    body: Option<Value>,
) -> ApiResult<LiveCompositorStreamRequest> {
    let mut value = body.unwrap_or(options);
    if !value.is_object() {
        value = Value::Object(Default::default());
    }
    let scene_id = resource_id
        .filter(|id| !id.is_empty())
        .or_else(|| value.get("sceneId").and_then(Value::as_str))
        .map(str::to_string)
        .ok_or_else(|| {
            ApiError::InvalidRequest("sceneId required for live-compositor:stream".to_string())
        })?;
    let viewport_id = value
        .get("viewportId")
        .and_then(Value::as_str)
        .unwrap_or("main")
        .to_string();

    Ok(LiveCompositorStreamRequest {
        scene_id,
        viewport_id,
        session_id: value
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string),
        width: value
            .get("width")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        height: value
            .get("height")
            .and_then(Value::as_u64)
            .map(|value| value as u32),
        fps: value.get("fps").and_then(Value::as_f64),
    })
}

fn parse_stop_request(
    resource_id: Option<&str>,
    options: Value,
    body: Option<Value>,
) -> ApiResult<LiveCompositorStopRequest> {
    let value = body.unwrap_or(options);
    let stream_id = resource_id
        .filter(|id| !id.is_empty() && id.starts_with("strm_"))
        .or_else(|| value.get("streamId").and_then(Value::as_str))
        .map(str::to_string);
    let scene_id = resource_id
        .filter(|id| !id.is_empty() && !id.starts_with("strm_"))
        .or_else(|| value.get("sceneId").and_then(Value::as_str))
        .map(str::to_string);
    let viewport_id = value
        .get("viewportId")
        .and_then(Value::as_str)
        .map(str::to_string);

    if stream_id.is_none() && scene_id.is_none() {
        return Err(ApiError::InvalidRequest(
            "streamId or sceneId required for live-compositor:stop".to_string(),
        ));
    }

    Ok(LiveCompositorStopRequest {
        stream_id,
        scene_id,
        viewport_id,
    })
}

fn request_scene_id(
    resource_id: Option<&str>,
    options: &Value,
    body: Option<&Value>,
    action: &str,
) -> ApiResult<String> {
    resource_id
        .filter(|id| !id.is_empty())
        .or_else(|| options.get("sceneId").and_then(Value::as_str))
        .or_else(|| {
            body.and_then(|value| value.get("sceneId"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
        .ok_or_else(|| {
            ApiError::InvalidRequest(format!("sceneId required for live-compositor:{action}"))
        })
}

fn validate_scene_contract(scene: &LiveCompositorScene) -> Result<(), String> {
    if scene.contract_version != LIVE_COMPOSITOR_CONTRACT_VERSION {
        return Err(format!(
            "live compositor contract version {} is not supported; expected {}",
            scene.contract_version, LIVE_COMPOSITOR_CONTRACT_VERSION
        ));
    }

    let source_ids: HashSet<&str> = scene
        .sources
        .iter()
        .map(|source| source.source_id.as_str())
        .collect();
    if source_ids.len() != scene.sources.len() {
        return Err("live compositor source ids must be unique".to_string());
    }

    let layer_ids: HashSet<&str> = scene.layers.iter().map(|layer| layer.id.as_str()).collect();
    if layer_ids.len() != scene.layers.len() {
        return Err("live compositor layer ids must be unique".to_string());
    }

    for layer in &scene.layers {
        if !source_ids.contains(layer.source.source_id.as_str()) {
            return Err(format!(
                "layer {} references unknown source {}",
                layer.id, layer.source.source_id
            ));
        }
    }

    let route_ids: HashSet<&str> = scene
        .output_routes
        .iter()
        .map(|route| route.id.as_str())
        .collect();
    if route_ids.len() != scene.output_routes.len() {
        return Err("live compositor output route ids must be unique".to_string());
    }

    for preset in &scene.presets {
        for layer_id in &preset.layer_ids {
            if !layer_ids.contains(layer_id.as_str()) {
                return Err(format!(
                    "preset {} references unknown layer {}",
                    preset.id, layer_id
                ));
            }
        }
        for route_id in &preset.output_route_ids {
            if !route_ids.contains(route_id.as_str()) {
                return Err(format!(
                    "preset {} references unknown output route {}",
                    preset.id, route_id
                ));
            }
        }
    }

    Ok(())
}

fn validate_required_base_revision(
    command: &ViewportCommand,
    revision: u64,
) -> Option<ViewportEvent> {
    let Some(base_revision) = command.base_revision else {
        return Some(error_event(
            command,
            revision,
            "missingBaseRevision",
            "live compositor write command requires baseRevision",
        ));
    };

    if base_revision != revision {
        return Some(error_event(
            command,
            revision,
            "revisionConflict",
            format!("base revision {base_revision} does not match current revision {revision}"),
        ));
    }

    None
}

fn apply_set_preset(
    scene: &mut LiveCompositorScene,
    command: &ViewportCommand,
) -> Result<Value, LiveCommandRejection> {
    let payload: LiveCompositorSetPresetPayload = parse_payload(command)?;
    if !scene
        .presets
        .iter()
        .any(|preset| preset.id == payload.preset_id)
    {
        return Err(LiveCommandRejection::new(
            "presetNotFound",
            format!(
                "live compositor preset {} does not exist",
                payload.preset_id
            ),
        ));
    }
    scene.active_preset_id = Some(payload.preset_id.clone());
    Ok(json!({
        "sceneId": command.scene_id,
        "viewportId": viewport_id(command),
        "activePresetId": payload.preset_id
    }))
}

fn apply_update_layer(
    scene: &mut LiveCompositorScene,
    command: &ViewportCommand,
) -> Result<Value, LiveCommandRejection> {
    let payload: LiveCompositorUpdateLayerPayload = parse_payload(command)?;
    if let Some(source) = &payload.patch.source {
        validate_source_ref(scene, source.source_id.as_str())?;
    }
    let layer = scene
        .layers
        .iter_mut()
        .find(|layer| layer.id == payload.layer_id)
        .ok_or_else(|| {
            LiveCommandRejection::new(
                "layerNotFound",
                format!("live compositor layer {} does not exist", payload.layer_id),
            )
        })?;
    apply_layer_patch(layer, payload.patch);
    Ok(json!({
        "sceneId": command.scene_id,
        "viewportId": viewport_id(command),
        "layerId": payload.layer_id
    }))
}

fn apply_reorder_layer(
    scene: &mut LiveCompositorScene,
    command: &ViewportCommand,
) -> Result<Value, LiveCommandRejection> {
    let payload: LiveCompositorReorderLayerPayload = parse_payload(command)?;
    if let Some(ordered_layer_ids) = payload.ordered_layer_ids {
        apply_ordered_layer_ids(scene, &ordered_layer_ids)?;
        return Ok(json!({
            "sceneId": command.scene_id,
            "viewportId": viewport_id(command),
            "orderedLayerIds": ordered_layer_ids
        }));
    }

    let layer_id = payload.layer_id.clone().ok_or_else(|| {
        LiveCommandRejection::new(
            "invalidLayerOrder",
            "layerId required when orderedLayerIds is not provided",
        )
    })?;
    let new_z_index = resolve_reordered_z_index(scene, &payload, &layer_id)?;
    let layer = scene
        .layers
        .iter_mut()
        .find(|layer| layer.id == layer_id)
        .ok_or_else(|| {
            LiveCommandRejection::new(
                "layerNotFound",
                format!("live compositor layer {layer_id} does not exist"),
            )
        })?;
    layer.z_index = new_z_index;
    normalize_layer_order(scene);
    Ok(json!({
        "sceneId": command.scene_id,
        "viewportId": viewport_id(command),
        "layerId": layer_id
    }))
}

fn apply_tracking_overlay(
    scene: &mut LiveCompositorScene,
    command: &ViewportCommand,
) -> Result<Value, LiveCommandRejection> {
    let payload: LiveCompositorSetTrackingOverlayPayload = parse_payload(command)?;
    for source_id in &payload.tracking_overlay.source_ids {
        validate_source_ref(scene, source_id)?;
    }
    scene.tracking_overlay = payload.tracking_overlay.clone();
    Ok(json!({
        "sceneId": command.scene_id,
        "viewportId": viewport_id(command),
        "trackingOverlayId": scene.tracking_overlay.id
    }))
}

fn apply_output_route(
    scene: &mut LiveCompositorScene,
    command: &ViewportCommand,
) -> Result<Value, LiveCommandRejection> {
    let payload: LiveCompositorSetOutputRoutePayload = parse_payload(command)?;
    let mut route = match payload.route {
        Some(route) => route,
        None => scene
            .output_routes
            .iter()
            .find(|route| route.id == payload.route_id)
            .cloned()
            .ok_or_else(|| {
                LiveCommandRejection::new(
                    "unavailableOutputRoute",
                    format!("live output route {} is unavailable", payload.route_id),
                )
            })?,
    };

    if route.id != payload.route_id {
        return Err(LiveCommandRejection::new(
            "invalidOutputRoute",
            "route.id must match routeId",
        ));
    }

    if let Some(enabled) = payload.enabled {
        route.enabled = enabled;
    }
    reject_unavailable_enabled_route(&route)?;
    if route.enabled && route.status == LiveOutputRouteStatus::Available {
        route.status = LiveOutputRouteStatus::Active;
    }
    upsert_output_route(scene, route.clone());

    Ok(json!({
        "sceneId": command.scene_id,
        "viewportId": viewport_id(command),
        "routeId": route.id,
        "status": route.status
    }))
}

fn parse_payload<T>(command: &ViewportCommand) -> Result<T, LiveCommandRejection>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(command.payload.clone()).map_err(|error| {
        LiveCommandRejection::new(
            "invalidLivePayload",
            format!("invalid {} payload: {error}", command.action),
        )
    })
}

fn validate_source_ref(
    scene: &LiveCompositorScene,
    source_id: &str,
) -> Result<(), LiveCommandRejection> {
    if scene
        .sources
        .iter()
        .any(|source| source.source_id == source_id)
    {
        return Ok(());
    }
    Err(LiveCommandRejection::new(
        "unsupportedSource",
        format!("live compositor source {source_id} is not available"),
    ))
}

fn apply_layer_patch(layer: &mut LiveCompositorLayer, patch: LiveCompositorLayerPatch) {
    if let Some(role) = patch.role {
        layer.role = role;
    }
    if let Some(label) = patch.label {
        layer.label = Some(label);
    }
    if let Some(source) = patch.source {
        layer.source = source;
    }
    if let Some(transform) = patch.transform {
        layer.transform = transform;
    }
    if let Some(opacity) = patch.opacity {
        layer.opacity = opacity;
    }
    if let Some(blend_mode) = patch.blend_mode {
        layer.blend_mode = blend_mode;
    }
    if let Some(visible) = patch.visible {
        layer.visible = visible;
    }
    if let Some(z_index) = patch.z_index {
        layer.z_index = z_index;
    }
    if let Some(locked) = patch.locked {
        layer.locked = Some(locked);
    }
    if let Some(source_unavailable_policy) = patch.source_unavailable_policy {
        layer.source_unavailable_policy = source_unavailable_policy;
    }
    if let Some(metadata) = patch.metadata {
        layer.metadata = Some(metadata);
    }
}

fn apply_ordered_layer_ids(
    scene: &mut LiveCompositorScene,
    ordered_layer_ids: &[String],
) -> Result<(), LiveCommandRejection> {
    let known: HashSet<&str> = scene.layers.iter().map(|layer| layer.id.as_str()).collect();
    if ordered_layer_ids.len() != scene.layers.len()
        || ordered_layer_ids
            .iter()
            .any(|layer_id| !known.contains(layer_id.as_str()))
    {
        return Err(LiveCommandRejection::new(
            "invalidLayerOrder",
            "orderedLayerIds must contain every existing layer id exactly once",
        ));
    }

    for (index, layer_id) in ordered_layer_ids.iter().enumerate() {
        if let Some(layer) = scene.layers.iter_mut().find(|layer| layer.id == *layer_id) {
            layer.z_index = index as f64;
        }
    }
    normalize_layer_order(scene);
    Ok(())
}

fn resolve_reordered_z_index(
    scene: &LiveCompositorScene,
    payload: &LiveCompositorReorderLayerPayload,
    layer_id: &str,
) -> Result<f64, LiveCommandRejection> {
    if let Some(z_index) = payload.z_index {
        return Ok(z_index);
    }
    if let Some(after_layer_id) = &payload.after_layer_id {
        let after = scene
            .layers
            .iter()
            .find(|layer| layer.id == *after_layer_id)
            .ok_or_else(|| {
                LiveCommandRejection::new(
                    "layerNotFound",
                    format!("live compositor layer {after_layer_id} does not exist"),
                )
            })?;
        return Ok(after.z_index + 0.5);
    }
    if let Some(before_layer_id) = &payload.before_layer_id {
        let before = scene
            .layers
            .iter()
            .find(|layer| layer.id == *before_layer_id)
            .ok_or_else(|| {
                LiveCommandRejection::new(
                    "layerNotFound",
                    format!("live compositor layer {before_layer_id} does not exist"),
                )
            })?;
        return Ok(before.z_index - 0.5);
    }
    Err(LiveCommandRejection::new(
        "invalidLayerOrder",
        format!("layer {layer_id} requires zIndex, beforeLayerId, or afterLayerId"),
    ))
}

fn normalize_layer_order(scene: &mut LiveCompositorScene) {
    scene
        .layers
        .sort_by(|left, right| left.z_index.total_cmp(&right.z_index));
    for (index, layer) in scene.layers.iter_mut().enumerate() {
        layer.z_index = index as f64;
    }
}

fn reject_unavailable_enabled_route(route: &LiveOutputRoute) -> Result<(), LiveCommandRejection> {
    if !route.enabled {
        return Ok(());
    }

    match route.status {
        LiveOutputRouteStatus::Available | LiveOutputRouteStatus::Active => Ok(()),
        LiveOutputRouteStatus::Unsupported => Err(LiveCommandRejection::new(
            "unsupportedOutputRoute",
            format!("live output route {} is unsupported", route.id),
        )),
        LiveOutputRouteStatus::Unavailable
        | LiveOutputRouteStatus::Disabled
        | LiveOutputRouteStatus::PermissionRequired => Err(LiveCommandRejection::new(
            "unavailableOutputRoute",
            format!("live output route {} is unavailable", route.id),
        )),
    }
}

fn upsert_output_route(scene: &mut LiveCompositorScene, route: LiveOutputRoute) {
    if let Some(existing) = scene
        .output_routes
        .iter_mut()
        .find(|existing| existing.id == route.id)
    {
        *existing = route;
        return;
    }
    scene.output_routes.push(route);
}

fn spawn_live_compositor_stream_producer(
    stream_registry: Arc<StreamRegistry>,
    store: Arc<RwLock<LiveCompositorStore>>,
    stream_id: StreamId,
    config: LiveCompositorStreamConfig,
    cancel_token: CancellationToken,
) {
    tokio::spawn(async move {
        let frame_duration = Duration::from_secs_f64(1.0 / config.fps.max(1.0));
        let duration_us = (1_000_000.0 / config.fps.max(1.0)) as i64;
        let mut frame_id = 0u64;
        let mut pts_us = 0i64;

        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = tokio::time::sleep(frame_duration) => {
                    let (revision, applied_seq, scene_metrics) =
                        live_stream_scene_state(&store, &config)
                            .unwrap_or((
                                config.initial_revision,
                                config.initial_applied_seq,
                                LiveCompositorStreamSceneMetrics::default(),
                            ));
                    let diagnostics = live_stream_diagnostics(frame_id, &scene_metrics);
                    let meta = RenderFrameMeta {
                        stream_id: stream_id.as_str().to_string(),
                        viewport_id: config.viewport_id.clone(),
                        frame_id,
                        pts_us: pts_us.max(0) as u64,
                        duration_us: duration_us.max(0) as u64,
                        is_keyframe: true,
                        scene_revision: revision,
                        applied_seq,
                        diagnostics: Some(diagnostics.clone()),
                        scene_id: Some(config.scene_id.clone()),
                        frame_timestamp: pts_us as f64 / 1000.0,
                        view_transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                        projection_json: Some(json!({
                            "kind": "live-compositor",
                            "source": "synthetic-layer",
                            "layerCount": scene_metrics.layer_count,
                            "adapterDiagnosticCount": scene_metrics.adapter_diagnostic_count,
                            "diagnosticOverlayCount": scene_metrics.diagnostic_overlay_count
                        }).to_string()),
                        active_preview_mode: None,
                        preview_playback_clock_ms: None,
                    };
                    let frame = pack_live_synthetic_h264_frame(
                        &config,
                        pts_us,
                        duration_us,
                        frame_id,
                        diagnostics,
                        meta,
                    );

                    match stream_registry.send_frame(&stream_id, frame).await {
                        Ok(_) => {}
                        Err(StreamStateError::NoReceivers(_)) => {}
                        Err(StreamStateError::NotFound(_)) => break,
                        Err(error) => {
                            tracing::warn!(
                                "Live compositor stream {} send failed: {}",
                                stream_id.as_str(),
                                error
                            );
                            break;
                        }
                    }
                    frame_id = frame_id.saturating_add(1);
                    pts_us = pts_us.saturating_add(duration_us);
                }
            }
        }
    });
}

fn live_stream_scene_state(
    store: &Arc<RwLock<LiveCompositorStore>>,
    config: &LiveCompositorStreamConfig,
) -> Option<(u64, u64, LiveCompositorStreamSceneMetrics)> {
    let store = store.read().ok()?;
    let entry = store.scenes.get(&config.scene_id)?;
    let context = LiveCompositorAdapterContext::from_scene_metadata(&entry.scene);
    let plan = plan_live_compositor_scene(&entry.scene, &context);
    Some((
        entry.scene.revision,
        entry.applied_seq,
        LiveCompositorStreamSceneMetrics {
            scene_diagnostic_count: entry.scene.diagnostics.len(),
            adapter_diagnostic_count: plan.diagnostics.len(),
            diagnostic_overlay_count: plan
                .layers
                .iter()
                .filter(|layer| layer.diagnostic_overlay)
                .count(),
            layer_count: plan.layers.len(),
        },
    ))
}

#[derive(Debug, Clone, Copy, Default)]
struct LiveCompositorStreamSceneMetrics {
    scene_diagnostic_count: usize,
    adapter_diagnostic_count: usize,
    diagnostic_overlay_count: usize,
    layer_count: usize,
}

fn live_stream_diagnostics(
    _frame_id: u64,
    metrics: &LiveCompositorStreamSceneMetrics,
) -> RenderFrameDiagnostics {
    RenderFrameDiagnostics {
        render_path: neko_engine_types::GpuRenderPath::LegacyCpu,
        render_time_ms: 0.1,
        encode_time_ms: 0.0,
        queue_depth: metrics
            .scene_diagnostic_count
            .saturating_add(metrics.adapter_diagnostic_count) as u32,
        dropped_frames_since_last: 0,
        texture_allocations: metrics.layer_count as u64,
        iosurface_creations: 0,
        convert_time_ms: 0.0,
        gpu_wait_time_ms: metrics.diagnostic_overlay_count as f32,
        ..RenderFrameDiagnostics::default()
    }
}

fn pack_live_synthetic_h264_frame(
    config: &LiveCompositorStreamConfig,
    pts_us: i64,
    duration_us: i64,
    frame_id: u64,
    diagnostics: RenderFrameDiagnostics,
    meta: RenderFrameMeta,
) -> FrameData {
    let payload = synthetic_h264_payload(frame_id);
    let mut data = Vec::with_capacity(8 + 8 + 1 + 8 + payload.len());
    data.extend_from_slice(&pts_us.to_le_bytes());
    data.extend_from_slice(&pts_us.to_le_bytes());
    data.push(1);
    data.extend_from_slice(&duration_us.to_le_bytes());
    data.extend_from_slice(&payload);
    FrameData {
        data,
        width: config.width,
        height: config.height,
        format: FrameFormat::H264,
        timestamp: pts_us as f64 / 1_000_000.0,
        diagnostics: Some(diagnostics),
        meta: Some(meta),
    }
}

fn synthetic_h264_payload(frame_id: u64) -> Vec<u8> {
    let color = (frame_id % 255) as u8;
    vec![
        0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0xe5, 0x88, 0x68, 0x54, 0x05, 0x01, 0xed, 0, 0, 0, 1,
        0x68, 0xce, 0x06, 0xe2, 0, 0, 0, 1, 0x65, 0x88, 0x84, color,
    ]
}

fn normalize_stream_dimension(value: u32, fallback: u32) -> u32 {
    let dimension = if value == 0 { fallback } else { value };
    dimension.max(2) & !1
}

fn normalize_stream_fps(fps: f64) -> f64 {
    if fps.is_finite() {
        fps.clamp(1.0, 120.0)
    } else {
        30.0
    }
}

fn live_stream_resource_id(scene_id: &str, viewport_id: &str) -> String {
    format!("live:{scene_id}:viewport:{viewport_id}")
}

fn live_stream_key(scene_id: &str, viewport_id: &str) -> String {
    format!("{scene_id}:{viewport_id}")
}

fn is_live_command_action(action: &str) -> bool {
    matches!(
        action,
        LIVE_SET_PRESET
            | LIVE_UPDATE_LAYER
            | LIVE_REORDER_LAYER
            | LIVE_SET_TRACKING_OVERLAY
            | LIVE_SET_OUTPUT_ROUTE
    )
}

fn ack_event(command: &ViewportCommand, revision: u64, payload: Value) -> ViewportEvent {
    ViewportEvent {
        protocol_version: VIEWPORT_PROTOCOL_VERSION,
        domain: command.domain,
        event: format!("{}:ack", command.action),
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
        event: format!("{}:error", command.action),
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
        payload: json!({
            "sceneId": command.scene_id,
            "viewportId": viewport_id(command),
            "revision": revision
        }),
    }
}

fn viewport_id(command: &ViewportCommand) -> String {
    command
        .viewport_id
        .clone()
        .unwrap_or_else(|| "main".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::{
        ViewportCommandSource, ViewportDomain, LIVE_COMPOSITOR_CONTRACT_VERSION,
    };
    use tokio::sync::broadcast;

    fn controller() -> LiveCompositorController {
        LiveCompositorController::new()
    }

    fn stream_controller() -> (LiveCompositorController, Arc<StreamRegistry>) {
        let stream_registry = Arc::new(StreamRegistry::new());
        (
            LiveCompositorController::with_stream_registry(stream_registry.clone()),
            stream_registry,
        )
    }

    fn fixture_scene() -> LiveCompositorScene {
        let fixture = include_str!(
            "../../../../../neko-types/src/types/__fixtures__/live-compositor-scene-v1.json"
        );
        let value: Value = serde_json::from_str(fixture).unwrap();
        serde_json::from_value(value["scene"].clone()).unwrap()
    }

    fn command(
        action: &str,
        seq: u64,
        base_revision: Option<u64>,
        payload: Value,
    ) -> ViewportCommand {
        ViewportCommand {
            protocol_version: VIEWPORT_PROTOCOL_VERSION,
            domain: ViewportDomain::Scene,
            action: action.to_string(),
            scene_id: "live-scene-main".to_string(),
            viewport_id: Some("viewport-live-main".to_string()),
            seq,
            correlation_id: format!("live-cmd-{seq}"),
            timestamp: 1810814400100.0 + seq as f64,
            source: ViewportCommandSource::User,
            base_revision,
            payload,
        }
    }

    async fn create_fixture_scene(controller: &LiveCompositorController) {
        let response = controller
            .handle(
                ACTION_CREATE,
                None,
                Value::Null,
                Some(serde_json::to_value(fixture_scene()).unwrap()),
            )
            .await
            .unwrap();
        assert!(response.is_ok());
    }

    async fn receive_live_frame(rx: &mut broadcast::Receiver<FrameData>) -> FrameData {
        tokio::time::timeout(Duration::from_millis(600), async {
            loop {
                match rx.recv().await {
                    Ok(frame) if frame.meta.is_some() => return frame,
                    Ok(_) => {}
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(error) => panic!("live compositor stream closed unexpectedly: {error}"),
                }
            }
        })
        .await
        .expect("live compositor stream should emit frame metadata")
    }

    async fn receive_live_frame_matching(
        rx: &mut broadcast::Receiver<FrameData>,
        matches: impl Fn(&RenderFrameMeta) -> bool,
    ) -> FrameData {
        tokio::time::timeout(Duration::from_millis(800), async {
            loop {
                let frame = receive_live_frame(rx).await;
                if frame.meta.as_ref().is_some_and(&matches) {
                    return frame;
                }
            }
        })
        .await
        .expect("live compositor stream should emit matching frame metadata")
    }

    #[tokio::test]
    async fn creates_queries_and_resets_live_compositor_scene() {
        let controller = controller();
        create_fixture_scene(&controller).await;

        let get = controller
            .handle(ACTION_GET, Some("live-scene-main"), Value::Null, None)
            .await
            .unwrap();
        assert!(get.is_ok());
        assert_eq!(get.data.as_ref().unwrap()["scene"]["contractVersion"], 1);

        let reset = controller
            .handle(ACTION_RESET, Some("live-scene-main"), Value::Null, None)
            .await
            .unwrap();
        assert_eq!(reset.data.as_ref().unwrap()["removed"], true);
    }

    #[tokio::test]
    async fn applies_live_preset_command_with_revision_and_sequence_ack() {
        let controller = controller();
        create_fixture_scene(&controller).await;
        let command = command(
            LIVE_SET_PRESET,
            70,
            Some(12),
            json!({ "presetId": "preset-closeup" }),
        );

        let response = controller
            .handle(
                ACTION_COMMAND,
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(event.ack_seq, 70);
        assert_eq!(event.applied_seq, Some(70));
        assert_eq!(event.revision, 13);
        assert_eq!(event.payload["activePresetId"], "preset-closeup");
    }

    #[tokio::test]
    async fn rejects_stale_live_command_without_mutating_scene() {
        let controller = controller();
        create_fixture_scene(&controller).await;
        let command = command(
            LIVE_UPDATE_LAYER,
            71,
            Some(1),
            json!({
                "layerId": "layer-puppet",
                "patch": { "opacity": 0.5 }
            }),
        );

        let response = controller
            .handle(
                ACTION_COMMAND,
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Error));
        assert_eq!(
            event.error.as_ref().map(|error| error.code.as_str()),
            Some("revisionConflict")
        );
        assert_eq!(event.revision, 12);
    }

    #[tokio::test]
    async fn rejects_unsupported_protocol_version() {
        let controller = controller();
        create_fixture_scene(&controller).await;
        let mut command = command(
            LIVE_SET_PRESET,
            72,
            Some(12),
            json!({ "presetId": "preset-main" }),
        );
        command.protocol_version = 2;

        let response = controller
            .handle(
                ACTION_COMMAND,
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Error));
        assert_eq!(
            event.error.as_ref().map(|error| error.code.as_str()),
            Some("unsupportedProtocolVersion")
        );
    }

    #[tokio::test]
    async fn rejects_unsupported_source_update() {
        let controller = controller();
        create_fixture_scene(&controller).await;
        let command = command(
            LIVE_UPDATE_LAYER,
            73,
            Some(12),
            json!({
                "layerId": "layer-puppet",
                "patch": {
                    "source": {
                        "sourceId": "source-missing",
                        "kind": "model",
                        "label": "Missing Model"
                    }
                }
            }),
        );

        let response = controller
            .handle(
                ACTION_COMMAND,
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Error));
        assert_eq!(
            event.error.as_ref().map(|error| error.code.as_str()),
            Some("unsupportedSource")
        );
    }

    #[tokio::test]
    async fn rejects_unavailable_output_route_enable() {
        let controller = controller();
        create_fixture_scene(&controller).await;
        let command = command(
            LIVE_SET_OUTPUT_ROUTE,
            74,
            Some(12),
            json!({
                "routeId": "route-obs",
                "enabled": true
            }),
        );

        let response = controller
            .handle(
                ACTION_COMMAND,
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Error));
        assert_eq!(
            event.error.as_ref().map(|error| error.code.as_str()),
            Some("unavailableOutputRoute")
        );
    }

    #[tokio::test]
    async fn starts_live_compositor_stream_and_emits_frame_metadata() {
        let (controller, stream_registry) = stream_controller();
        create_fixture_scene(&controller).await;

        let response = controller
            .handle(
                ACTION_STREAM,
                Some("live-scene-main"),
                Value::Null,
                Some(json!({
                    "viewportId": "viewport-live-main",
                    "width": 641,
                    "height": 479,
                    "fps": 120.0
                })),
            )
            .await
            .unwrap();
        assert!(response.is_ok());

        let descriptor = response.data.unwrap();
        assert_eq!(descriptor["container"], "h264-annexb");
        assert_eq!(descriptor["frameHeader"], "neko-h264-v1");
        assert_eq!(descriptor["sceneId"], "live-scene-main");
        assert_eq!(descriptor["viewportId"], "viewport-live-main");
        assert_eq!(descriptor["width"], 640);
        assert_eq!(descriptor["height"], 478);

        let stream_id = descriptor["streamId"].as_str().unwrap();
        let stream_id = StreamId::from_string(stream_id.to_string());
        assert!(stream_registry.exists(&stream_id).await);
        let mut rx = stream_registry.subscribe(&stream_id).await.unwrap();

        let frame = receive_live_frame(&mut rx).await;
        assert_eq!(frame.format, FrameFormat::H264);
        assert!(frame.data.len() > 25);
        let meta = frame.meta.as_ref().unwrap();
        assert_eq!(meta.stream_id, stream_id.as_str());
        assert_eq!(meta.scene_id.as_deref(), Some("live-scene-main"));
        assert_eq!(meta.viewport_id, "viewport-live-main");
        assert_eq!(meta.scene_revision, 12);
        assert_eq!(meta.applied_seq, 0);
        assert_eq!(
            meta.diagnostics.as_ref().unwrap().queue_depth,
            fixture_scene().diagnostics.len() as u32
        );

        let stop = controller
            .handle(ACTION_STOP, Some(stream_id.as_str()), Value::Null, None)
            .await
            .unwrap();
        assert_eq!(stop.data.as_ref().unwrap()["stopped"], true);
        assert!(!stream_registry.exists(&stream_id).await);
        assert!(stream_registry.subscribe(&stream_id).await.is_none());
        assert!(controller
            .handle(ACTION_STOP, Some("live-scene-main"), Value::Null, None)
            .await
            .is_err());
    }

    #[tokio::test]
    async fn live_compositor_stream_metadata_reconciles_applied_commands() {
        let (controller, stream_registry) = stream_controller();
        create_fixture_scene(&controller).await;

        let response = controller
            .handle(
                ACTION_STREAM,
                Some("live-scene-main"),
                Value::Null,
                Some(json!({
                    "viewportId": "viewport-live-main",
                    "fps": 120.0
                })),
            )
            .await
            .unwrap();
        let descriptor = response.data.unwrap();
        let stream_id = StreamId::from_string(descriptor["streamId"].as_str().unwrap().to_string());
        let mut rx = stream_registry.subscribe(&stream_id).await.unwrap();

        let initial = receive_live_frame(&mut rx).await;
        let initial_meta = initial.meta.as_ref().unwrap();
        assert_eq!(initial_meta.scene_revision, 12);
        assert_eq!(initial_meta.applied_seq, 0);

        let command = command(
            LIVE_SET_PRESET,
            70,
            Some(12),
            json!({ "presetId": "preset-closeup" }),
        );
        let response = controller
            .handle(
                ACTION_COMMAND,
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();
        assert_eq!(event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(event.revision, 13);
        assert_eq!(event.applied_seq, Some(70));

        let reconciled = receive_live_frame_matching(&mut rx, |meta| {
            meta.scene_revision == 13 && meta.applied_seq == 70
        })
        .await;
        let meta = reconciled.meta.as_ref().unwrap();
        assert_eq!(meta.scene_id.as_deref(), Some("live-scene-main"));
        assert_eq!(meta.viewport_id, "viewport-live-main");

        let _ = controller
            .handle(ACTION_STOP, Some(stream_id.as_str()), Value::Null, None)
            .await;
    }

    #[test]
    fn validates_fixture_contract_version() {
        assert_eq!(
            fixture_scene().contract_version,
            LIVE_COMPOSITOR_CONTRACT_VERSION
        );
    }
}
