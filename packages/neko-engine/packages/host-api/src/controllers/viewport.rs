//! ViewportController - handles unified viewport protocol envelopes.

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::gpu::CameraParams;
use neko_engine_kernel::contracts::services::ISceneService;
use neko_engine_types::registry;
use neko_engine_types::{
    ActionResponse, ViewportCommand, ViewportDomain, ViewportEvent, ViewportEventStatus,
    ViewportProtocolError, VIEWPORT_PROTOCOL_VERSION,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;

/// Shared controller for engine-mediated viewport commands.
pub struct ViewportController {
    scene_service: Option<Arc<dyn ISceneService>>,
}

impl ViewportController {
    pub fn new(scene_service: Option<Arc<dyn ISceneService>>) -> Self {
        Self { scene_service }
    }

    fn current_revision(&self) -> u64 {
        self.scene_service
            .as_ref()
            .and_then(|service| service.current_revision().ok())
            .unwrap_or(0)
    }

    fn scene_service(&self) -> ApiResult<&dyn ISceneService> {
        self.scene_service
            .as_deref()
            .ok_or_else(|| ApiError::ServiceError("Scene service not available".to_string()))
    }

    fn handle_command(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        if !command.has_supported_protocol_version() {
            return Ok(error_event(
                &command,
                self.current_revision(),
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
                self.current_revision(),
                "domainActionMismatch",
                "command action prefix does not match viewport protocol domain",
            ));
        }

        if command.domain != ViewportDomain::Viewport {
            return Ok(error_event(
                &command,
                self.current_revision(),
                "unsupportedDomain",
                "viewport_controller only routes viewport domain commands",
            ));
        }

        match command.action.as_str() {
            "viewport:select" => self.handle_select(command),
            "viewport:marquee" => self.handle_marquee(command),
            "viewport:transform" => self.handle_transform(command),
            "viewport:camera" => self.handle_camera(command),
            _ => Ok(error_event(
                &command,
                self.current_revision(),
                "unsupportedViewportAction",
                "viewport action is not supported",
            )),
        }
    }

    fn handle_select(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        let revision = self.current_revision();
        if let Some(error) = self.validate_base_revision(&command, revision) {
            return Ok(error);
        }

        let snapshot = self.snapshot_value()?;
        let viewport_id = viewport_id(&command);
        let hit = hit_test_result(
            &snapshot,
            &command.payload,
            &command.scene_id,
            &viewport_id,
            revision,
        );
        Ok(ack_event(&command, revision, hit))
    }

    fn handle_marquee(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        let revision = self.current_revision();
        if let Some(error) = self.validate_base_revision(&command, revision) {
            return Ok(error);
        }

        let snapshot = self.snapshot_value()?;
        let viewport_id = viewport_id(&command);
        let selection = marquee_result(
            &snapshot,
            &command.payload,
            &command.scene_id,
            &viewport_id,
            revision,
        );
        Ok(ack_event(&command, revision, selection))
    }

    fn handle_transform(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        let revision = self.current_revision();
        if let Some(error) = self.validate_required_base_revision(&command, revision) {
            return Ok(error);
        }

        let transform =
            parse_transform_payload(&command.payload).map_err(ApiError::InvalidRequest)?;
        self.scene_service()?
            .update_transform(
                &transform.node_id,
                transform.position,
                transform.rotation,
                transform.scale,
            )
            .map_err(ApiError::from)?;
        let next_revision = self.current_revision();

        Ok(ack_event(
            &command,
            next_revision,
            json!({
                "sceneId": command.scene_id,
                "viewportId": viewport_id(&command),
                "revision": next_revision,
                "nodeId": transform.node_id
            }),
        ))
    }

    fn handle_camera(&self, command: ViewportCommand) -> ApiResult<ViewportEvent> {
        let revision = self.current_revision();
        if let Some(error) = self.validate_base_revision(&command, revision) {
            return Ok(error);
        }

        let camera = parse_camera_payload(&command.payload).map_err(ApiError::InvalidRequest)?;
        self.scene_service()?.set_editor_camera(camera);

        Ok(ack_event(
            &command,
            revision,
            json!({
                "sceneId": command.scene_id,
                "viewportId": viewport_id(&command),
                "revision": revision,
                "camera": "editor"
            }),
        ))
    }

    fn validate_required_base_revision(
        &self,
        command: &ViewportCommand,
        revision: u64,
    ) -> Option<ViewportEvent> {
        if command.base_revision.is_none() {
            return Some(error_event(
                command,
                revision,
                "missingBaseRevision",
                "viewport write command requires baseRevision",
            ));
        }
        self.validate_base_revision(command, revision)
    }

    fn validate_base_revision(
        &self,
        command: &ViewportCommand,
        revision: u64,
    ) -> Option<ViewportEvent> {
        let base_revision = command.base_revision?;
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

    fn snapshot_value(&self) -> ApiResult<Value> {
        let snapshot = self
            .scene_service()?
            .get_snapshot()
            .map_err(ApiError::from)?;
        serde_json::to_value(snapshot)
            .map_err(|error| ApiError::SerializationError(error.to_string()))
    }
}

impl Controller for ViewportController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        _options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        let body = body.ok_or_else(|| ApiError::InvalidRequest("body required".to_string()))?;
        let command: ViewportCommand = serde_json::from_value(body)
            .map_err(|error| ApiError::InvalidRequest(error.to_string()))?;
        let event = self.handle_command(command)?;
        Ok(ActionResponse::ok("", serde_json::to_value(event)?))
    }

    fn group(&self) -> &'static str {
        registry::groups::VIEWPORT
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::VIEWPORT
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransformPayload {
    node_id: String,
    position: [f32; 3],
    #[serde(default = "identity_rotation")]
    rotation: [f32; 4],
    #[serde(default = "unit_scale")]
    scale: [f32; 3],
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CameraPayload {
    position: Vec3Payload,
    target: Vec3Payload,
    up: Option<Vec3Payload>,
    fov_y: Option<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Vec3Payload {
    Array([f32; 3]),
    Object { x: f32, y: f32, z: f32 },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HitTestNode {
    node_id: String,
    depth: f64,
    screen_position: [f64; 2],
}

fn parse_transform_payload(payload: &Value) -> Result<TransformPayload, String> {
    serde_json::from_value(payload.clone()).map_err(|error| error.to_string())
}

fn parse_camera_payload(payload: &Value) -> Result<CameraParams, String> {
    let payload: CameraPayload =
        serde_json::from_value(payload.clone()).map_err(|error| error.to_string())?;
    let position = vec3_payload_to_glam("position", payload.position)?;
    let target = vec3_payload_to_glam("target", payload.target)?;
    let up = match payload.up {
        Some(up) => vec3_payload_to_glam("up", up)?,
        None => glam::Vec3::Y,
    };

    if position.distance_squared(target) <= 1.0e-8 {
        return Err("camera position and target must be distinct".to_string());
    }
    if up.length_squared() <= 1.0e-8 {
        return Err("camera up vector must be non-zero".to_string());
    }

    Ok(CameraParams {
        position,
        target,
        up: up.normalize(),
        fov_y: normalize_camera_fov_y(payload.fov_y)?,
        ..CameraParams::default()
    })
}

fn hit_test_result(
    snapshot: &Value,
    payload: &Value,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let x = payload_number(payload, "x").unwrap_or(0.5);
    let y = payload_number(payload, "y").unwrap_or(0.5);
    let mut nodes = projected_nodes(snapshot, payload);
    nodes.sort_by(|left, right| left.depth.total_cmp(&right.depth));

    let hit = nodes
        .into_iter()
        .find(|node| point_hits_projected_node(x, y, node.screen_position));

    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "nodeId": hit.as_ref().map(|node| node.node_id.as_str()),
        "depth": hit.as_ref().map(|node| node.depth),
        "screenPosition": hit.map(|node| node.screen_position)
    })
}

fn marquee_result(
    snapshot: &Value,
    payload: &Value,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let rect = read_marquee_rect(payload);
    let mut selected_node_ids: Vec<String> = projected_nodes(snapshot, payload)
        .into_iter()
        .filter(|node| point_in_rect(node.screen_position, rect))
        .map(|node| node.node_id)
        .collect();
    selected_node_ids.sort();
    selected_node_ids.dedup();

    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "selectedNodeIds": selected_node_ids
    })
}

fn projected_nodes(snapshot: &Value, payload: &Value) -> Vec<HitTestNode> {
    let requested = payload_string_array(payload, "nodeIds");
    scene_nodes(snapshot)
        .into_iter()
        .filter(|node| node.get("visible").and_then(Value::as_bool).unwrap_or(true))
        .filter(|node| {
            requested.is_empty() || node_id(node).is_some_and(|id| requested.contains(&id))
        })
        .filter_map(project_node)
        .collect()
}

fn project_node(node: &Value) -> Option<HitTestNode> {
    let node_id = node_id(node)?;
    let position = node_position(node);
    let depth = position[2];
    let screen_position = [
        (0.5 + f64::from(position[0]) * 0.25).clamp(0.0, 1.0),
        (0.5 - f64::from(position[1]) * 0.25).clamp(0.0, 1.0),
    ];
    Some(HitTestNode {
        node_id,
        depth: f64::from(depth),
        screen_position,
    })
}

fn scene_nodes(snapshot: &Value) -> Vec<&Value> {
    snapshot
        .get("nodes")
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().collect())
        .unwrap_or_default()
}

fn node_id(node: &Value) -> Option<String> {
    node.get("id")
        .or_else(|| node.get("nodeId"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn node_position(node: &Value) -> [f32; 3] {
    if let Some(position) = node.get("position").and_then(Value::as_array) {
        return [
            position.first().and_then(Value::as_f64).unwrap_or_default() as f32,
            position.get(1).and_then(Value::as_f64).unwrap_or_default() as f32,
            position.get(2).and_then(Value::as_f64).unwrap_or_default() as f32,
        ];
    }
    if let Some(position) = node
        .get("transform")
        .and_then(|transform| transform.get("position"))
    {
        return [
            position
                .get("x")
                .and_then(Value::as_f64)
                .unwrap_or_default() as f32,
            position
                .get("y")
                .and_then(Value::as_f64)
                .unwrap_or_default() as f32,
            position
                .get("z")
                .and_then(Value::as_f64)
                .unwrap_or_default() as f32,
        ];
    }
    [0.0, 0.0, 0.0]
}

fn read_marquee_rect(payload: &Value) -> [f64; 4] {
    if let Some(rect) = payload.get("rect").and_then(Value::as_array) {
        if rect.len() == 4 {
            return [
                rect.first().and_then(Value::as_f64).unwrap_or(0.0),
                rect.get(1).and_then(Value::as_f64).unwrap_or(0.0),
                rect.get(2).and_then(Value::as_f64).unwrap_or(1.0),
                rect.get(3).and_then(Value::as_f64).unwrap_or(1.0),
            ];
        }
    }
    let start = payload
        .get("start")
        .and_then(value_to_vec2)
        .unwrap_or([0.0, 0.0]);
    let end = payload
        .get("end")
        .and_then(value_to_vec2)
        .unwrap_or([1.0, 1.0]);
    [
        start[0].min(end[0]),
        start[1].min(end[1]),
        start[0].max(end[0]),
        start[1].max(end[1]),
    ]
}

fn point_hits_projected_node(x: f64, y: f64, point: [f64; 2]) -> bool {
    (point[0] - x).abs() <= 0.05 && (point[1] - y).abs() <= 0.05
}

fn point_in_rect(point: [f64; 2], rect: [f64; 4]) -> bool {
    point[0] >= rect[0] && point[0] <= rect[2] && point[1] >= rect[1] && point[1] <= rect[3]
}

fn value_to_vec2(value: &Value) -> Option<[f64; 2]> {
    if let Some(array) = value.as_array() {
        return Some([
            array.first().and_then(Value::as_f64)?,
            array.get(1).and_then(Value::as_f64)?,
        ]);
    }
    Some([
        value.get("x").and_then(Value::as_f64)?,
        value.get("y").and_then(Value::as_f64)?,
    ])
}

fn payload_number(payload: &Value, key: &str) -> Option<f64> {
    payload.get(key).and_then(Value::as_f64)
}

fn payload_string_array(payload: &Value, key: &str) -> Vec<String> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn vec3_payload_to_glam(field: &str, payload: Vec3Payload) -> Result<glam::Vec3, String> {
    let value = match payload {
        Vec3Payload::Array(value) => value,
        Vec3Payload::Object { x, y, z } => [x, y, z],
    };
    if !value.iter().all(|component| component.is_finite()) {
        return Err(format!("camera {field} must contain finite numbers"));
    }
    Ok(glam::Vec3::from(value))
}

fn normalize_camera_fov_y(value: Option<f32>) -> Result<f32, String> {
    let value = value.unwrap_or_else(|| 45.0_f32.to_radians());
    if !value.is_finite() {
        return Err("camera fovY must be finite".to_string());
    }
    let radians = if value > std::f32::consts::PI {
        value.to_radians()
    } else {
        value
    };
    Ok(radians.clamp(1.0_f32.to_radians(), 179.0_f32.to_radians()))
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

fn identity_rotation() -> [f32; 4] {
    [0.0, 0.0, 0.0, 1.0]
}

fn unit_scale() -> [f32; 3] {
    [1.0, 1.0, 1.0]
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;
    use neko_engine_types::{ViewportCommandSource, ViewportDomain};

    fn controller() -> ViewportController {
        let services = ServiceFactory::new().create_with_gpu(None);
        let scene_service = services.scene_service.clone();
        if let Some(service) = &scene_service {
            let snapshot = service
                .create_shape(json!({
                    "type": "cube",
                    "width": 1.0,
                    "height": 1.0,
                    "depth": 1.0
                }))
                .expect("shape should be created");
            let node_id = snapshot.nodes[0].id.clone();
            service
                .update_transform(&node_id, [0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 1.0], [1.0; 3])
                .expect("shape should be positioned");
        }
        ViewportController::new(scene_service)
    }

    fn command(action: &str, seq: u64, base_revision: Option<u64>) -> ViewportCommand {
        ViewportCommand {
            protocol_version: VIEWPORT_PROTOCOL_VERSION,
            domain: ViewportDomain::Viewport,
            action: action.to_string(),
            scene_id: "scene-a".to_string(),
            viewport_id: Some("main".to_string()),
            seq,
            correlation_id: format!("cmd-{seq}"),
            timestamp: 100.0,
            source: ViewportCommandSource::User,
            base_revision,
            payload: json!({}),
        }
    }

    #[tokio::test]
    async fn rejects_unsupported_protocol_version() {
        let controller = controller();
        let mut command = command("viewport:select", 1, None);
        command.protocol_version = 2;

        let response = controller
            .handle(
                "command",
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
    async fn routes_select_with_viewport_identity() {
        let controller = controller();
        let revision = controller.current_revision();
        let mut command = command("viewport:select", 2, Some(revision));
        command.payload = json!({ "x": 0.5, "y": 0.5 });

        let response = controller
            .handle(
                "command",
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(event.ack_seq, 2);
        assert_eq!(event.viewport_id.as_deref(), Some("main"));
        assert_eq!(event.payload["viewportId"], "main");
        assert!(event.payload.get("nodeId").is_some());
    }

    #[tokio::test]
    async fn rejects_stale_transform_revision() {
        let controller = controller();
        let mut command = command("viewport:transform", 3, Some(0));
        command.payload = json!({
            "nodeId": "missing",
            "position": [1.0, 0.0, 0.0]
        });

        let response = controller
            .handle(
                "command",
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
    }

    #[tokio::test]
    async fn applies_transform_with_ordered_ack_sequence() {
        let controller = controller();
        let revision = controller.current_revision();
        let node_id = controller
            .scene_service()
            .unwrap()
            .get_snapshot()
            .unwrap()
            .nodes[0]
            .id
            .clone();
        let mut command = command("viewport:transform", 9, Some(revision));
        command.payload = json!({
            "nodeId": node_id,
            "position": [1.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0, 1.0],
            "scale": [1.0, 1.0, 1.0]
        });

        let response = controller
            .handle(
                "command",
                None,
                Value::Null,
                Some(serde_json::to_value(command).unwrap()),
            )
            .await
            .unwrap();
        let event: ViewportEvent = serde_json::from_value(response.data.unwrap()).unwrap();

        assert_eq!(event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(event.ack_seq, 9);
        assert_eq!(event.applied_seq, Some(9));
        assert!(event.revision > revision);
    }

    #[tokio::test]
    async fn routes_marquee_and_camera_with_viewport_isolation() {
        let controller = controller();
        let revision = controller.current_revision();
        let mut marquee = command("viewport:marquee", 4, Some(revision));
        marquee.viewport_id = Some("side".to_string());
        marquee.payload = json!({ "rect": [0.0, 0.0, 1.0, 1.0] });

        let marquee_response = controller
            .handle(
                "command",
                None,
                Value::Null,
                Some(serde_json::to_value(marquee).unwrap()),
            )
            .await
            .unwrap();
        let marquee_event: ViewportEvent =
            serde_json::from_value(marquee_response.data.unwrap()).unwrap();
        assert_eq!(marquee_event.viewport_id.as_deref(), Some("side"));
        assert_eq!(marquee_event.payload["viewportId"], "side");
        assert!(marquee_event.payload["selectedNodeIds"]
            .as_array()
            .is_some());

        let mut camera = command("viewport:camera", 5, Some(controller.current_revision()));
        camera.viewport_id = Some("main".to_string());
        camera.payload = json!({
            "position": [0.0, 1.5, 5.0],
            "target": [0.0, 0.0, 0.0],
            "up": [0.0, 1.0, 0.0],
            "fovY": 45.0
        });

        let camera_response = controller
            .handle(
                "command",
                None,
                Value::Null,
                Some(serde_json::to_value(camera).unwrap()),
            )
            .await
            .unwrap();
        let camera_event: ViewportEvent =
            serde_json::from_value(camera_response.data.unwrap()).unwrap();
        assert_eq!(camera_event.status, Some(ViewportEventStatus::Ack));
        assert_eq!(camera_event.ack_seq, 5);
    }
}
