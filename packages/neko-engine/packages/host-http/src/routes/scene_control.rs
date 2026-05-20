//! Scene control WebSocket endpoint.
//!
//! GET /v1/scenes/control — JSON control plane for 3D scene editing.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use neko_engine_kernel::contracts::gpu::CameraParams;
use neko_engine_kernel::contracts::scene::{
    SceneCommandAck, SceneCommandAckStatus, SceneCommandEnvelope, SceneCommandEvent,
    SceneCommandPhase, SceneDelta, TopologyOperation,
};
use neko_host_api::EngineApi;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::sync::Arc;

const PROTOCOL: &str = "neko-scene-control-v1";

pub async fn handle_scene_control(
    State(engine): State<Arc<EngineApi>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| scene_control_loop(socket, engine))
}

async fn scene_control_loop(mut socket: WebSocket, engine: Arc<EngineApi>) {
    tracing::info!("Scene control WebSocket connected");

    while let Some(message) = socket.recv().await {
        let message = match message {
            Ok(Message::Text(text)) => text,
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
            Ok(Message::Binary(_)) => {
                if !send_error(&mut socket, "binary messages are not supported").await {
                    break;
                }
                continue;
            }
        };

        let client_message = match serde_json::from_str::<SceneControlClientMessage>(&message) {
            Ok(message) => message,
            Err(error) => {
                if !send_error(
                    &mut socket,
                    &format!("invalid scene control message: {error}"),
                )
                .await
                {
                    break;
                }
                continue;
            }
        };

        if !handle_client_message(&mut socket, &engine, client_message).await {
            break;
        }
    }

    tracing::info!("Scene control WebSocket disconnected");
}

async fn handle_client_message(
    socket: &mut WebSocket,
    engine: &EngineApi,
    message: SceneControlClientMessage,
) -> bool {
    match message {
        SceneControlClientMessage::Hello { last_revision } => {
            send_json(
                socket,
                json!({
                    "type": "ready",
                    "protocol": PROTOCOL,
                    "serverRevision": current_revision(engine),
                    "lastClientRevision": last_revision
                }),
            )
            .await
        }
        SceneControlClientMessage::Subscribe { scene_id } => {
            send_snapshot(socket, engine, scene_id, "snapshot").await
        }
        SceneControlClientMessage::Command { envelope } => {
            let seq = envelope.seq;
            let base_revision = envelope.base_revision;
            let envelope = match envelope.into_runtime() {
                Ok(envelope) => envelope,
                Err(error) => {
                    return send_rejected_ack(
                        socket,
                        seq,
                        base_revision,
                        current_revision(engine),
                        &error,
                    )
                    .await
                }
            };
            let service = match engine.scene_service() {
                Some(service) => service,
                None => return send_error(socket, "scene service is not available").await,
            };
            let (acks, delta) = match service.apply_scene_command_with_delta(envelope) {
                Ok(result) => result,
                Err(error) => return send_error(socket, &error.to_string()).await,
            };

            for ack in &acks {
                if !send_json(socket, json!({ "type": "ack", "ack": ack_to_json(ack) })).await {
                    return false;
                }
            }

            if let Some(delta) = delta {
                send_json(
                    socket,
                    json!({ "type": "delta", "delta": delta_to_json(&delta) }),
                )
                .await
            } else {
                true
            }
        }
        SceneControlClientMessage::Query {
            request_id,
            query,
            payload,
        } => {
            if query == "snapshot" {
                send_snapshot(socket, engine, None, "queryResult").await
            } else {
                match scene_query_result(engine, &query, payload.as_ref()) {
                    Ok(result) => {
                        send_json(
                            socket,
                            json!({
                                "type": "queryResult",
                                "requestId": request_id,
                                "query": query,
                                "result": result
                            }),
                        )
                        .await
                    }
                    Err(error) => {
                        send_json(
                            socket,
                            json!({
                                "type": "error",
                                "requestId": request_id,
                                "error": error
                            }),
                        )
                        .await
                    }
                }
            }
        }
        SceneControlClientMessage::Resync { scene_id } => {
            send_snapshot(socket, engine, scene_id, "snapshot").await
        }
        SceneControlClientMessage::ViewportCamera {
            request_id,
            scene_id,
            scene_revision,
            viewport_id,
            position,
            target,
            up,
            fov_y,
            resolution,
        } => {
            let camera = ViewportCameraPayload {
                request_id,
                scene_id,
                scene_revision,
                viewport_id,
                position,
                target,
                up,
                fov_y,
                resolution,
            };
            let engine_revision = current_revision(engine);
            let scene_id = camera
                .scene_id
                .clone()
                .unwrap_or_else(|| "default".to_string());
            let viewport_id = camera
                .viewport_id
                .clone()
                .unwrap_or_else(|| "main".to_string());
            let request_id = camera.request_id.clone();
            if matches!(camera.scene_revision, Some(revision) if revision > engine_revision) {
                return send_viewport_camera_ack(
                    socket,
                    request_id.clone(),
                    &scene_id,
                    &viewport_id,
                    "rejected",
                    engine_revision,
                    Some("scene revision is ahead of engine revision"),
                )
                .await;
            }
            let camera = match camera.into_camera_params() {
                Ok(camera) => camera,
                Err(error) => {
                    return send_viewport_camera_ack(
                        socket,
                        request_id.clone(),
                        &scene_id,
                        &viewport_id,
                        "rejected",
                        engine_revision,
                        Some(&error),
                    )
                    .await
                }
            };
            let service = match engine.scene_service() {
                Some(service) => service,
                None => {
                    return send_viewport_camera_ack(
                        socket,
                        request_id.clone(),
                        &scene_id,
                        &viewport_id,
                        "rejected",
                        engine_revision,
                        Some("scene service is not available"),
                    )
                    .await
                }
            };
            service.set_editor_camera(camera);
            send_viewport_camera_ack(
                socket,
                request_id,
                &scene_id,
                &viewport_id,
                "applied",
                engine_revision,
                None,
            )
            .await
        }
        SceneControlClientMessage::RequestKeyframe { viewport_id } => {
            send_json(
                socket,
                json!({
                    "type": "ready",
                    "protocol": PROTOCOL,
                    "request": "requestKeyframe",
                    "viewportId": viewport_id
                }),
            )
            .await
        }
        SceneControlClientMessage::Heartbeat { nonce } => {
            send_json(
                socket,
                json!({
                    "type": "heartbeat",
                    "nonce": nonce
                }),
            )
            .await
        }
    }
}

async fn send_snapshot(
    socket: &mut WebSocket,
    engine: &EngineApi,
    scene_id: Option<String>,
    message_type: &str,
) -> bool {
    let revision = current_revision(engine);
    let snapshot = match engine.scene_snapshot_value() {
        Ok(snapshot) => snapshot,
        Err(error) => return send_error(socket, &error).await,
    };
    let scene_id = scene_id.unwrap_or_else(|| "default".to_string());

    send_json(
        socket,
        json!({
            "type": message_type,
            "sceneId": scene_id,
            "snapshot": snapshot_to_contract(snapshot, revision)
        }),
    )
    .await
}

fn current_revision(engine: &EngineApi) -> u64 {
    engine
        .scene_service()
        .and_then(|service| service.current_revision().ok())
        .unwrap_or(0)
}

fn scene_query_result(
    engine: &EngineApi,
    query: &str,
    payload: Option<&Value>,
) -> Result<Value, String> {
    let revision = current_revision(engine);
    let snapshot = engine.scene_snapshot_value()?;
    let snapshot = snapshot_to_contract(snapshot, revision);
    let viewport_id = payload_string(payload, "viewportId").unwrap_or_else(|| "main".to_string());
    let scene_id = payload_string(payload, "sceneId")
        .or_else(|| {
            snapshot
                .get("sceneId")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "default".to_string());

    match query {
        "hit-test" | "hitTest" => Ok(hit_test_result(
            &snapshot,
            payload,
            &scene_id,
            &viewport_id,
            revision,
        )),
        "projected-bounds" | "projectedBounds" => Ok(projected_bounds_result(
            &snapshot,
            payload,
            &scene_id,
            &viewport_id,
            revision,
        )),
        "gizmo-anchor" | "gizmoAnchor" => Ok(gizmo_anchor_result(
            &snapshot,
            payload,
            &scene_id,
            &viewport_id,
            revision,
        )),
        "active-camera" | "activeCamera" => Ok(active_camera_result(
            &snapshot,
            &scene_id,
            &viewport_id,
            revision,
        )),
        "overlay-state" | "overlayState" => Ok(overlay_state_result(
            &snapshot,
            payload,
            &scene_id,
            &viewport_id,
            revision,
        )),
        other => Err(format!("unsupported query: {other}")),
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Vec3 {
    x: f64,
    y: f64,
    z: f64,
}

impl Vec3 {
    const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    const UP: Self = Self {
        x: 0.0,
        y: 1.0,
        z: 0.0,
    };

    fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y, self.z + other.z)
    }

    fn sub(self, other: Self) -> Self {
        Self::new(self.x - other.x, self.y - other.y, self.z - other.z)
    }

    fn mul(self, scalar: f64) -> Self {
        Self::new(self.x * scalar, self.y * scalar, self.z * scalar)
    }

    fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    fn cross(self, other: Self) -> Self {
        Self::new(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )
    }

    fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    fn normalize(self) -> Self {
        let length = self.length();
        if length <= f64::EPSILON {
            Self::ZERO
        } else {
            self.mul(1.0 / length)
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct CameraBasis {
    position: Vec3,
    forward: Vec3,
    right: Vec3,
    up: Vec3,
    fov_y_radians: f64,
    aspect: f64,
    orthographic: bool,
    orthographic_height: f64,
}

#[derive(Debug, Clone, Copy)]
struct NodeBounds {
    min: Vec3,
    max: Vec3,
}

fn hit_test_result(
    snapshot: &Value,
    payload: Option<&Value>,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let camera = camera_basis(snapshot, payload);
    let (origin, direction) = camera.ray_for_screen(
        payload_number(payload, "x").unwrap_or(0.5),
        payload_number(payload, "y").unwrap_or(0.5),
    );
    let requested = payload_string_array(payload, "nodeIds");

    let picked = scene_nodes(snapshot)
        .into_iter()
        .filter(is_pickable_node)
        .filter(|node| node_matches_request(node, &requested))
        .filter_map(|node| {
            let bounds = node_world_bounds(node);
            intersect_ray_aabb(origin, direction, bounds).map(|hit| (node, bounds, hit))
        })
        .min_by(|(_, _, left), (_, _, right)| left.depth.total_cmp(&right.depth));

    match picked {
        Some((node, bounds, hit)) => json!({
            "sceneId": scene_id,
            "viewportId": viewport_id,
            "revision": revision,
            "nodeId": node.get("nodeId").and_then(Value::as_str),
            "depth": hit.depth,
            "worldPosition": vec3_to_value(hit.position),
            "normal": vec3_to_value(surface_normal(bounds, hit.position))
        }),
        None => json!({
            "sceneId": scene_id,
            "viewportId": viewport_id,
            "revision": revision,
            "nodeId": Value::Null,
            "depth": Value::Null,
            "worldPosition": Value::Null,
            "normal": Value::Null
        }),
    }
}

fn projected_bounds_result(
    snapshot: &Value,
    payload: Option<&Value>,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let requested = payload_string_array(payload, "nodeIds");
    let camera = camera_basis(snapshot, payload);
    let bounds: Vec<Value> = scene_nodes(snapshot)
        .into_iter()
        .filter(|node| node_matches_request(node, &requested))
        .filter_map(|node| projected_bounds_for_node(node, camera))
        .collect();

    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "bounds": bounds
    })
}

fn gizmo_anchor_result(
    snapshot: &Value,
    payload: Option<&Value>,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let requested = payload_string_array(payload, "nodeIds");
    let camera = camera_basis(snapshot, payload);
    let anchors: Vec<Value> = scene_nodes(snapshot)
        .into_iter()
        .filter(|node| node_matches_request(node, &requested))
        .filter_map(|node| gizmo_anchor_for_node(node, camera))
        .collect();

    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "anchors": anchors
    })
}

fn active_camera_result(
    snapshot: &Value,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "activeCamera": snapshot
            .get("activeCamera")
            .cloned()
            .unwrap_or_else(default_camera_state)
    })
}

fn overlay_state_result(
    snapshot: &Value,
    payload: Option<&Value>,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let selected_node_ids = payload_string_array(payload, "selectedNodeIds");
    let projected_bounds =
        projected_bounds_result(snapshot, payload, scene_id, viewport_id, revision)
            .get("bounds")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()));
    let gizmo_anchors = gizmo_anchor_result(snapshot, payload, scene_id, viewport_id, revision)
        .get("anchors")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));

    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "selectedNodeIds": selected_node_ids,
        "projectedBounds": projected_bounds,
        "gizmoAnchors": gizmo_anchors,
        "activeCamera": snapshot
            .get("activeCamera")
            .cloned()
            .unwrap_or_else(default_camera_state)
    })
}

fn scene_nodes(snapshot: &Value) -> Vec<&Value> {
    snapshot
        .get("nodes")
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().collect())
        .unwrap_or_default()
}

fn is_pickable_node(node: &&Value) -> bool {
    node.get("visible").and_then(Value::as_bool).unwrap_or(true)
        && !matches!(
            node.get("kind").and_then(Value::as_str),
            Some("camera" | "light")
        )
}

fn node_matches_request(node: &&Value, requested: &[String]) -> bool {
    if requested.is_empty() {
        return true;
    }
    node.get("nodeId")
        .and_then(Value::as_str)
        .map(|node_id| requested.iter().any(|requested| requested == node_id))
        .unwrap_or(false)
}

fn projected_bounds_for_node(node: &Value, camera: CameraBasis) -> Option<Value> {
    let node_id = node
        .get("nodeId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let mut projected = node_world_bounds(node)
        .corners()
        .into_iter()
        .filter_map(|corner| camera.project_world(corner));
    let first = projected.next()?;
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (first.0, first.1, first.0, first.1);
    for (x, y) in projected {
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }

    Some(json!({
        "nodeId": node_id,
        "min": {
            "x": min_x.clamp(0.0, 1.0),
            "y": min_y.clamp(0.0, 1.0)
        },
        "max": {
            "x": max_x.clamp(0.0, 1.0),
            "y": max_y.clamp(0.0, 1.0)
        }
    }))
}

fn gizmo_anchor_for_node(node: &Value, camera: CameraBasis) -> Option<Value> {
    let node_id = node
        .get("nodeId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let world_position = node_world_position_vec(node);
    let screen = camera.project_world(world_position)?;
    Some(json!({
        "nodeId": node_id,
        "worldPosition": vec3_to_value(world_position),
        "screenPosition": { "x": screen.0.clamp(0.0, 1.0), "y": screen.1.clamp(0.0, 1.0) }
    }))
}

fn node_world_position_vec(node: &Value) -> Vec3 {
    node.get("transform")
        .and_then(|transform| transform.get("position"))
        .map(value_to_vec3)
        .unwrap_or(Vec3::ZERO)
}

fn node_world_scale_vec(node: &Value) -> Vec3 {
    node.get("transform")
        .and_then(|transform| transform.get("scale"))
        .map(value_to_vec3)
        .unwrap_or_else(|| Vec3::new(1.0, 1.0, 1.0))
}

fn node_world_bounds(node: &Value) -> NodeBounds {
    for key in ["worldBounds", "bounds"] {
        if let Some(bounds) = node.get(key) {
            let min = bounds.get("min").map(value_to_vec3);
            let max = bounds.get("max").map(value_to_vec3);
            if let (Some(min), Some(max)) = (min, max) {
                return NodeBounds { min, max };
            }
        }
    }

    let center = node_world_position_vec(node);
    let scale = node_world_scale_vec(node);
    let half = Vec3::new(
        scale.x.abs().max(0.05) * 0.5,
        scale.y.abs().max(0.05) * 0.5,
        scale.z.abs().max(0.05) * 0.5,
    );
    NodeBounds {
        min: center.sub(half),
        max: center.add(half),
    }
}

impl NodeBounds {
    fn corners(self) -> [Vec3; 8] {
        [
            Vec3::new(self.min.x, self.min.y, self.min.z),
            Vec3::new(self.max.x, self.min.y, self.min.z),
            Vec3::new(self.min.x, self.max.y, self.min.z),
            Vec3::new(self.max.x, self.max.y, self.min.z),
            Vec3::new(self.min.x, self.min.y, self.max.z),
            Vec3::new(self.max.x, self.min.y, self.max.z),
            Vec3::new(self.min.x, self.max.y, self.max.z),
            Vec3::new(self.max.x, self.max.y, self.max.z),
        ]
    }
}

#[derive(Debug, Clone, Copy)]
struct RayHit {
    depth: f64,
    position: Vec3,
}

impl CameraBasis {
    fn ray_for_screen(self, x: f64, y: f64) -> (Vec3, Vec3) {
        let ndc_x = x.clamp(0.0, 1.0) * 2.0 - 1.0;
        let ndc_y = 1.0 - y.clamp(0.0, 1.0) * 2.0;
        if self.orthographic {
            let half_height = self.orthographic_height * 0.5;
            let half_width = half_height * self.aspect;
            let origin = self
                .position
                .add(self.right.mul(ndc_x * half_width))
                .add(self.up.mul(ndc_y * half_height));
            return (origin, self.forward);
        }

        let tan_half_fov = (self.fov_y_radians * 0.5).tan();
        let direction = self
            .forward
            .add(self.right.mul(ndc_x * tan_half_fov * self.aspect))
            .add(self.up.mul(ndc_y * tan_half_fov))
            .normalize();
        (self.position, direction)
    }

    fn project_world(self, point: Vec3) -> Option<(f64, f64)> {
        let relative = point.sub(self.position);
        let view_x = relative.dot(self.right);
        let view_y = relative.dot(self.up);
        let view_z = relative.dot(self.forward);
        if self.orthographic {
            let half_height = self.orthographic_height * 0.5;
            let half_width = half_height * self.aspect;
            return Some((
                0.5 + view_x / (half_width * 2.0),
                0.5 - view_y / (half_height * 2.0),
            ));
        }
        if view_z <= 0.001 {
            return None;
        }
        let tan_half_fov = (self.fov_y_radians * 0.5).tan();
        let ndc_x = view_x / (view_z * tan_half_fov * self.aspect);
        let ndc_y = view_y / (view_z * tan_half_fov);
        Some((0.5 + ndc_x * 0.5, 0.5 - ndc_y * 0.5))
    }
}

fn camera_basis(snapshot: &Value, payload: Option<&Value>) -> CameraBasis {
    let default_camera = default_camera_state();
    let camera = payload
        .and_then(|payload| payload.get("engineCamera"))
        .or_else(|| snapshot.get("activeCamera"))
        .unwrap_or(&default_camera);
    let position = camera
        .get("position")
        .map(value_to_vec3)
        .unwrap_or_else(|| Vec3::new(0.0, 1.5, 5.0));
    let target = camera
        .get("target")
        .map(value_to_vec3)
        .unwrap_or(Vec3::ZERO);
    let up = camera.get("up").map(value_to_vec3).unwrap_or(Vec3::UP);
    let forward = target.sub(position).normalize();
    let forward = if forward.length() <= f64::EPSILON {
        Vec3::new(0.0, 0.0, -1.0)
    } else {
        forward
    };
    let right = forward.cross(up).normalize();
    let right = if right.length() <= f64::EPSILON {
        Vec3::new(1.0, 0.0, 0.0)
    } else {
        right
    };
    let up = right.cross(forward).normalize();

    CameraBasis {
        position,
        forward,
        right,
        up,
        fov_y_radians: normalize_fov_radians(
            camera
                .get("fov")
                .or_else(|| camera.get("fovY"))
                .and_then(Value::as_f64)
                .unwrap_or(45.0),
        ),
        aspect: camera_aspect(camera, payload),
        orthographic: camera
            .get("projection")
            .or_else(|| camera.get("type"))
            .and_then(Value::as_str)
            .map(|value| value.eq_ignore_ascii_case("orthographic"))
            .unwrap_or(false),
        orthographic_height: camera
            .get("orthographicHeight")
            .or_else(|| camera.get("orthographicScale"))
            .or_else(|| camera.get("orthoSize"))
            .and_then(Value::as_f64)
            .unwrap_or(4.0)
            .max(0.01),
    }
}

fn camera_aspect(camera: &Value, payload: Option<&Value>) -> f64 {
    if let Some(aspect) =
        payload_number(payload, "aspect").or_else(|| camera.get("aspect").and_then(Value::as_f64))
    {
        return aspect.max(0.01);
    }
    if let Some(aspect) = payload
        .and_then(|payload| payload.get("resolution"))
        .and_then(|resolution| {
            let width = resolution.get("width").and_then(Value::as_f64)?;
            let height = resolution.get("height").and_then(Value::as_f64)?;
            (height > 0.0).then_some(width / height)
        })
    {
        return aspect.max(0.01);
    }
    let width =
        payload_number(payload, "viewportWidth").or_else(|| payload_number(payload, "width"));
    let height =
        payload_number(payload, "viewportHeight").or_else(|| payload_number(payload, "height"));
    match (width, height) {
        (Some(width), Some(height)) if height > 0.0 => (width / height).max(0.01),
        _ => 16.0 / 9.0,
    }
}

fn normalize_fov_radians(value: f64) -> f64 {
    let radians = if value > std::f64::consts::PI {
        value.to_radians()
    } else {
        value
    };
    radians.clamp(1.0_f64.to_radians(), 179.0_f64.to_radians())
}

fn intersect_ray_aabb(origin: Vec3, direction: Vec3, bounds: NodeBounds) -> Option<RayHit> {
    let mut t_min = f64::NEG_INFINITY;
    let mut t_max = f64::INFINITY;
    for (origin_axis, dir_axis, min_axis, max_axis) in [
        (origin.x, direction.x, bounds.min.x, bounds.max.x),
        (origin.y, direction.y, bounds.min.y, bounds.max.y),
        (origin.z, direction.z, bounds.min.z, bounds.max.z),
    ] {
        if dir_axis.abs() <= f64::EPSILON {
            if origin_axis < min_axis || origin_axis > max_axis {
                return None;
            }
            continue;
        }
        let inv = 1.0 / dir_axis;
        let mut near = (min_axis - origin_axis) * inv;
        let mut far = (max_axis - origin_axis) * inv;
        if near > far {
            std::mem::swap(&mut near, &mut far);
        }
        t_min = t_min.max(near);
        t_max = t_max.min(far);
        if t_min > t_max {
            return None;
        }
    }

    let depth = if t_min >= 0.0 { t_min } else { t_max };
    if depth < 0.0 || !depth.is_finite() {
        return None;
    }
    Some(RayHit {
        depth,
        position: origin.add(direction.mul(depth)),
    })
}

fn surface_normal(bounds: NodeBounds, point: Vec3) -> Vec3 {
    let distances = [
        (Vec3::new(-1.0, 0.0, 0.0), (point.x - bounds.min.x).abs()),
        (Vec3::new(1.0, 0.0, 0.0), (bounds.max.x - point.x).abs()),
        (Vec3::new(0.0, -1.0, 0.0), (point.y - bounds.min.y).abs()),
        (Vec3::new(0.0, 1.0, 0.0), (bounds.max.y - point.y).abs()),
        (Vec3::new(0.0, 0.0, -1.0), (point.z - bounds.min.z).abs()),
        (Vec3::new(0.0, 0.0, 1.0), (bounds.max.z - point.z).abs()),
    ];
    distances
        .into_iter()
        .min_by(|(_, left), (_, right)| left.total_cmp(right))
        .map(|(normal, _)| normal)
        .unwrap_or_else(|| Vec3::new(0.0, 0.0, 1.0))
}

fn value_to_vec3(value: &Value) -> Vec3 {
    if let Some(array) = value.as_array() {
        return Vec3::new(
            array.first().and_then(Value::as_f64).unwrap_or_default(),
            array.get(1).and_then(Value::as_f64).unwrap_or_default(),
            array.get(2).and_then(Value::as_f64).unwrap_or_default(),
        );
    }
    Vec3::new(
        value.get("x").and_then(Value::as_f64).unwrap_or_default(),
        value.get("y").and_then(Value::as_f64).unwrap_or_default(),
        value.get("z").and_then(Value::as_f64).unwrap_or_default(),
    )
}

fn vec3_to_value(value: Vec3) -> Value {
    json!({ "x": value.x, "y": value.y, "z": value.z })
}

fn default_camera_state() -> Value {
    json!({
        "cameraId": "editor-camera",
        "position": { "x": 0.0, "y": 1.5, "z": 5.0 },
        "target": { "x": 0.0, "y": 0.0, "z": 0.0 },
        "up": { "x": 0.0, "y": 1.0, "z": 0.0 },
        "fov": 45.0
    })
}

fn payload_string(payload: Option<&Value>, key: &str) -> Option<String> {
    payload?
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn payload_number(payload: Option<&Value>, key: &str) -> Option<f64> {
    payload?.get(key).and_then(Value::as_f64)
}

fn payload_string_array(payload: Option<&Value>, key: &str) -> Vec<String> {
    payload
        .and_then(|payload| payload.get(key))
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

async fn send_rejected_ack(
    socket: &mut WebSocket,
    seq: u64,
    base_revision: u64,
    revision: u64,
    error: &str,
) -> bool {
    send_json(
        socket,
        json!({
            "type": "ack",
            "ack": {
                "seq": seq,
                "appliedSeq": 0,
                "baseRevision": base_revision,
                "revision": revision,
                "status": "rejected",
                "error": error
            }
        }),
    )
    .await
}

fn ack_to_json(ack: &SceneCommandAck) -> Value {
    json!({
        "seq": ack.seq,
        "appliedSeq": ack.applied_seq,
        "baseRevision": ack.base_revision,
        "revision": ack.revision,
        "status": ack_status_to_str(ack.status),
        "error": ack.error
    })
}

fn ack_status_to_str(status: SceneCommandAckStatus) -> &'static str {
    match status {
        SceneCommandAckStatus::Applied => "applied",
        SceneCommandAckStatus::Rejected => "rejected",
        SceneCommandAckStatus::Superseded => "superseded",
    }
}

fn delta_to_json(delta: &SceneDelta) -> Value {
    let mut object = Map::new();
    object.insert("revision".to_string(), json!(delta.revision));
    if let Some(applied_seq) = delta.applied_seq {
        object.insert("appliedSeq".to_string(), json!(applied_seq));
    }
    if !delta.updated_transforms.is_empty() {
        object.insert(
            "updatedTransforms".to_string(),
            Value::Array(
                delta
                    .updated_transforms
                    .iter()
                    .map(|update| {
                        json!({
                            "nodeId": update.node_id,
                            "position": vec3_to_json(update.position),
                            "rotation": quat_to_json(update.rotation),
                            "scale": vec3_to_json(update.scale)
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.updated_morph_weights.is_empty() {
        object.insert(
            "updatedMorphWeights".to_string(),
            Value::Array(
                delta
                    .updated_morph_weights
                    .iter()
                    .map(|update| {
                        json!({
                            "nodeId": update.node_id,
                            "weights": update.weights
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.updated_visibility.is_empty() {
        object.insert(
            "updatedVisibility".to_string(),
            Value::Array(
                delta
                    .updated_visibility
                    .iter()
                    .map(|update| {
                        json!({
                            "nodeId": update.node_id,
                            "visible": update.visible
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.removed_nodes.is_empty() {
        object.insert("removedNodes".to_string(), json!(delta.removed_nodes));
    }
    if !delta.updated_character_morph_weights.is_empty() {
        object.insert(
            "updatedCharacterMorphWeights".to_string(),
            Value::Array(
                delta
                    .updated_character_morph_weights
                    .iter()
                    .map(|update| {
                        json!({
                            "characterId": update.character_id,
                            "topologyVersion": update.topology_version,
                            "weights": update.weights.iter().map(|weight| {
                                json!({ "name": weight.morph_id, "weight": weight.weight })
                            }).collect::<Vec<_>>()
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.updated_character_materials.is_empty() {
        object.insert(
            "updatedCharacterMaterials".to_string(),
            Value::Array(
                delta
                    .updated_character_materials
                    .iter()
                    .flat_map(|update| {
                        update.layers.iter().map(|layer| {
                            json!({
                                "characterId": update.character_id,
                                "slotId": layer.slot_id,
                                "paramsJson": layer.params_json,
                                "topologyVersion": layer.topology_version
                            })
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.updated_skeleton_pose.is_empty() {
        object.insert(
            "updatedSkeletonPose".to_string(),
            Value::Array(
                delta
                    .updated_skeleton_pose
                    .iter()
                    .flat_map(|update| {
                        update.bones.iter().map(|bone| {
                            json!({
                                "characterId": update.character_id,
                                "boneId": bone.bone_id,
                                "topologyVersion": bone.topology_version
                            })
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.character_overrides.is_empty() {
        object.insert(
            "characterOverrides".to_string(),
            Value::Array(
                delta
                    .character_overrides
                    .iter()
                    .map(|update| {
                        json!({
                            "characterId": update.character_id,
                            "topologyVersion": update.overrides.first().map(|entry| entry.topology_version).unwrap_or_default(),
                            "overrides": update.overrides.iter().map(|entry| {
                                json!({
                                    "path": entry.path,
                                    "valueType": entry.value_type,
                                    "valueJson": entry.value_json,
                                    "operation": "set"
                                })
                            }).collect::<Vec<_>>()
                        })
                    })
                    .collect(),
            ),
        );
    }
    if !delta.modeling_sessions.is_empty() {
        object.insert(
            "modelingSessions".to_string(),
            json!(delta.modeling_sessions),
        );
    }
    if !delta.topology_changes.is_empty() {
        object.insert("topologyChanges".to_string(), json!(delta.topology_changes));
    }
    Value::Object(object)
}

fn snapshot_to_contract(snapshot: Value, revision: u64) -> Value {
    let Some(snapshot_object) = snapshot.as_object() else {
        return json!({
            "sceneId": "default",
            "revision": revision,
            "nodes": [],
            "animations": []
        });
    };

    let nodes_value = snapshot_object
        .get("nodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut children_by_parent: Map<String, Value> = Map::new();
    for node in &nodes_value {
        let Some(node_id) = node_id_from_value(node) else {
            continue;
        };
        if let Some(parent_id) = parent_id_from_value(node) {
            children_by_parent
                .entry(parent_id)
                .or_insert_with(|| Value::Array(Vec::new()))
                .as_array_mut()
                .expect("children entry is always an array")
                .push(Value::String(node_id));
        }
    }

    let nodes: Vec<Value> = nodes_value
        .iter()
        .filter_map(|node| node_to_contract(node, &children_by_parent))
        .collect();
    let animations: Vec<Value> = snapshot_object
        .get("animations")
        .and_then(Value::as_array)
        .map(|animations| animations.iter().map(animation_to_contract).collect())
        .unwrap_or_default();

    json!({
        "sceneId": snapshot_object
            .get("sceneId")
            .or_else(|| snapshot_object.get("scene_id"))
            .and_then(Value::as_str)
            .unwrap_or("default"),
        "revision": snapshot_object
            .get("revision")
            .and_then(Value::as_u64)
            .unwrap_or(revision),
        "nodes": nodes,
        "animations": animations,
        "activeCamera": snapshot_object.get("activeCamera").or_else(|| snapshot_object.get("active_camera")).cloned()
    })
}

fn node_to_contract(node: &Value, children_by_parent: &Map<String, Value>) -> Option<Value> {
    let node_id = node_id_from_value(node)?;
    let object = node.as_object()?;
    let transform = object.get("transform");
    let position = transform
        .and_then(|value| value.get("position"))
        .or_else(|| object.get("position"))
        .map(vec3_value_to_json)
        .unwrap_or_else(|| vec3_to_json([0.0, 0.0, 0.0]));
    let rotation = transform
        .and_then(|value| value.get("rotation"))
        .or_else(|| object.get("rotation"))
        .map(quat_value_to_json)
        .unwrap_or_else(|| quat_to_json([0.0, 0.0, 0.0, 1.0]));
    let scale = transform
        .and_then(|value| value.get("scale"))
        .or_else(|| object.get("scale"))
        .map(vec3_value_to_json)
        .unwrap_or_else(|| vec3_to_json([1.0, 1.0, 1.0]));

    let mut result = Map::new();
    result.insert("nodeId".to_string(), Value::String(node_id.clone()));
    if let Some(parent_id) = parent_id_from_value(node) {
        result.insert("parentId".to_string(), Value::String(parent_id));
    }
    result.insert(
        "name".to_string(),
        Value::String(
            object
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(&node_id)
                .to_string(),
        ),
    );
    result.insert(
        "transform".to_string(),
        json!({
            "position": position,
            "rotation": rotation,
            "scale": scale
        }),
    );
    result.insert(
        "children".to_string(),
        children_by_parent
            .get(&node_id)
            .cloned()
            .or_else(|| object.get("children").cloned())
            .unwrap_or_else(|| Value::Array(Vec::new())),
    );
    result.insert(
        "visible".to_string(),
        Value::Bool(
            object
                .get("visible")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        ),
    );
    if let Some(layer_mask) = object.get("layerMask").or_else(|| object.get("layer_mask")) {
        result.insert("layerMask".to_string(), layer_mask.clone());
    }
    if let Some(mesh) = object.get("mesh") {
        result.insert("mesh".to_string(), mesh.clone());
    }
    if let Some(material) = object.get("material") {
        result.insert("material".to_string(), material.clone());
    }
    result.insert(
        "kind".to_string(),
        Value::String(
            object
                .get("kind")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| infer_node_kind(object)),
        ),
    );

    Some(Value::Object(result))
}

fn animation_to_contract(animation: &Value) -> Value {
    json!({
        "name": animation.get("name").and_then(Value::as_str).unwrap_or_default(),
        "duration": animation.get("duration").and_then(Value::as_f64).unwrap_or_default()
    })
}

fn node_id_from_value(node: &Value) -> Option<String> {
    node.get("nodeId")
        .or_else(|| node.get("node_id"))
        .or_else(|| node.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn parent_id_from_value(node: &Value) -> Option<String> {
    node.get("parentId")
        .or_else(|| node.get("parent_id"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn infer_node_kind(object: &Map<String, Value>) -> String {
    if object
        .get("has_mesh")
        .or_else(|| object.get("hasMesh"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "mesh".to_string()
    } else if object
        .get("has_light")
        .or_else(|| object.get("hasLight"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "light".to_string()
    } else if object
        .get("has_camera")
        .or_else(|| object.get("hasCamera"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "camera".to_string()
    } else if object
        .get("has_skeleton")
        .or_else(|| object.get("hasSkeleton"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "skeleton".to_string()
    } else {
        "node".to_string()
    }
}

fn vec3_to_json(value: [f32; 3]) -> Value {
    json!({ "x": value[0], "y": value[1], "z": value[2] })
}

fn quat_to_json(value: [f32; 4]) -> Value {
    json!({ "x": value[0], "y": value[1], "z": value[2], "w": value[3] })
}

fn vec3_value_to_json(value: &Value) -> Value {
    if let Some(array) = value.as_array() {
        return json!({
            "x": array.first().and_then(Value::as_f64).unwrap_or_default(),
            "y": array.get(1).and_then(Value::as_f64).unwrap_or_default(),
            "z": array.get(2).and_then(Value::as_f64).unwrap_or_default()
        });
    }
    if let Some(object) = value.as_object() {
        return json!({
            "x": object.get("x").and_then(Value::as_f64).unwrap_or_default(),
            "y": object.get("y").and_then(Value::as_f64).unwrap_or_default(),
            "z": object.get("z").and_then(Value::as_f64).unwrap_or_default()
        });
    }
    vec3_to_json([0.0, 0.0, 0.0])
}

fn quat_value_to_json(value: &Value) -> Value {
    if let Some(array) = value.as_array() {
        return json!({
            "x": array.first().and_then(Value::as_f64).unwrap_or_default(),
            "y": array.get(1).and_then(Value::as_f64).unwrap_or_default(),
            "z": array.get(2).and_then(Value::as_f64).unwrap_or_default(),
            "w": array.get(3).and_then(Value::as_f64).unwrap_or(1.0)
        });
    }
    if let Some(object) = value.as_object() {
        return json!({
            "x": object.get("x").and_then(Value::as_f64).unwrap_or_default(),
            "y": object.get("y").and_then(Value::as_f64).unwrap_or_default(),
            "z": object.get("z").and_then(Value::as_f64).unwrap_or_default(),
            "w": object.get("w").and_then(Value::as_f64).unwrap_or(1.0)
        });
    }
    quat_to_json([0.0, 0.0, 0.0, 1.0])
}

async fn send_error(socket: &mut WebSocket, error: &str) -> bool {
    send_json(
        socket,
        json!({
            "type": "error",
            "error": error
        }),
    )
    .await
}

async fn send_json(socket: &mut WebSocket, value: Value) -> bool {
    match serde_json::to_string(&value) {
        Ok(text) => socket.send(Message::Text(text)).await.is_ok(),
        Err(error) => {
            tracing::error!("Scene control serialization error: {error}");
            false
        }
    }
}

async fn send_viewport_camera_ack(
    socket: &mut WebSocket,
    request_id: Option<String>,
    scene_id: &str,
    viewport_id: &str,
    status: &str,
    revision: u64,
    error: Option<&str>,
) -> bool {
    let mut ack = json!({
        "type": "viewportCameraAck",
        "requestId": request_id,
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "status": status,
        "revision": revision,
        "acceptedRevision": revision
    });
    if let Some(error) = error {
        ack["error"] = Value::String(error.to_string());
    }
    send_json(socket, ack).await
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SceneControlClientMessage {
    Hello {
        #[serde(default, rename = "lastRevision")]
        last_revision: Option<u64>,
    },
    Subscribe {
        #[serde(default, rename = "sceneId")]
        scene_id: Option<String>,
    },
    Command {
        envelope: ControlCommandEnvelope,
    },
    Query {
        #[serde(default, rename = "requestId")]
        request_id: Option<String>,
        query: String,
        #[serde(default)]
        payload: Option<Value>,
    },
    Resync {
        #[serde(default, rename = "sceneId")]
        scene_id: Option<String>,
    },
    ViewportCamera {
        #[serde(default, rename = "requestId")]
        request_id: Option<String>,
        #[serde(default, rename = "sceneId")]
        scene_id: Option<String>,
        #[serde(default, rename = "sceneRevision")]
        scene_revision: Option<u64>,
        #[serde(default, rename = "viewportId")]
        viewport_id: Option<String>,
        position: Vec3Payload,
        target: Vec3Payload,
        #[serde(default)]
        up: Option<Vec3Payload>,
        #[serde(default, rename = "fovY", alias = "fovYRad", alias = "fov_y")]
        fov_y: Option<f32>,
        #[serde(default)]
        resolution: Option<ViewportResolutionPayload>,
    },
    RequestKeyframe {
        #[serde(default, rename = "viewportId")]
        viewport_id: Option<String>,
    },
    Heartbeat {
        #[serde(default)]
        nonce: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlCommandEnvelope {
    seq: u64,
    base_revision: u64,
    #[serde(default)]
    transaction_id: Option<String>,
    #[serde(default)]
    phase: Option<ControlCommandPhase>,
    #[serde(default)]
    coalesce_key: Option<String>,
    command: ControlSceneCommand,
}

impl ControlCommandEnvelope {
    fn into_runtime(self) -> Result<SceneCommandEnvelope, String> {
        let event = self.command.into_event()?;
        Ok(SceneCommandEnvelope {
            seq: self.seq,
            base_revision: self.base_revision,
            transaction_id: self.transaction_id,
            phase: self.phase.map(ControlCommandPhase::into_runtime),
            coalesce_key: self.coalesce_key,
            event,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlSceneCommand {
    #[serde(rename = "type")]
    command_type: String,
    payload_json: String,
}

impl ControlSceneCommand {
    fn into_event(self) -> Result<SceneCommandEvent, String> {
        match self.command_type.as_str() {
            "transform" => {
                let payload: TransformCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid transform command payload: {error}"))?;
                Ok(SceneCommandEvent::SetTransform {
                    node_id: payload.node_id,
                    position: payload.position.into_array(),
                    rotation: payload.rotation.into_array(),
                    scale: payload.scale.into_array(),
                })
            }
            "visibility-set" => {
                let payload: VisibilityCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid visibility command payload: {error}"))?;
                Ok(SceneCommandEvent::SetVisibility {
                    node_id: payload.node_id,
                    visible: payload.visible,
                })
            }
            "modeling-begin-session" => {
                let payload: ModelingBeginSessionPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid modeling begin session payload: {error}"))?;
                Ok(SceneCommandEvent::BeginModelingSession {
                    session_id: payload.session_id,
                    mesh_id: payload.mesh_id,
                    character_id: payload.character_id,
                    topology_mutable: payload.topology_mutable,
                    before_hash: payload.before_hash,
                })
            }
            "modeling-end-session" | "modeling-commit-session" => {
                let payload: ModelingCommitSessionPayload =
                    serde_json::from_str(&self.payload_json).map_err(|error| {
                        format!("invalid modeling commit session payload: {error}")
                    })?;
                Ok(SceneCommandEvent::CommitModelingSession {
                    session_id: payload.session_id,
                    operation: payload.operation,
                    vertex_count_before: payload.vertex_count_before,
                    vertex_count_after: payload.vertex_count_after,
                })
            }
            "modeling-cancel-session" => {
                let payload: ModelingCancelSessionPayload =
                    serde_json::from_str(&self.payload_json).map_err(|error| {
                        format!("invalid modeling cancel session payload: {error}")
                    })?;
                Ok(SceneCommandEvent::CancelModelingSession {
                    session_id: payload.session_id,
                })
            }
            other => Err(format!("unsupported scene command type: {other}")),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ControlCommandPhase {
    Begin,
    Update,
    End,
    Cancel,
}

impl ControlCommandPhase {
    fn into_runtime(self) -> SceneCommandPhase {
        match self {
            ControlCommandPhase::Begin => SceneCommandPhase::Begin,
            ControlCommandPhase::Update => SceneCommandPhase::Update,
            ControlCommandPhase::End => SceneCommandPhase::End,
            ControlCommandPhase::Cancel => SceneCommandPhase::Cancel,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransformCommandPayload {
    #[serde(alias = "node_id")]
    node_id: String,
    position: Vec3Payload,
    rotation: QuatPayload,
    scale: Vec3Payload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisibilityCommandPayload {
    #[serde(alias = "node_id")]
    node_id: String,
    visible: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelingBeginSessionPayload {
    #[serde(alias = "session_id")]
    session_id: String,
    #[serde(alias = "mesh_id")]
    mesh_id: String,
    #[serde(default, alias = "character_id")]
    character_id: Option<String>,
    #[serde(default)]
    topology_mutable: bool,
    #[serde(default = "default_before_hash")]
    before_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelingCommitSessionPayload {
    #[serde(alias = "session_id")]
    session_id: String,
    operation: TopologyOperation,
    vertex_count_before: u32,
    vertex_count_after: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelingCancelSessionPayload {
    #[serde(alias = "session_id")]
    session_id: String,
}

fn default_before_hash() -> String {
    "unknown".to_string()
}

#[derive(Debug)]
struct ViewportCameraPayload {
    request_id: Option<String>,
    scene_id: Option<String>,
    scene_revision: Option<u64>,
    viewport_id: Option<String>,
    position: Vec3Payload,
    target: Vec3Payload,
    up: Option<Vec3Payload>,
    fov_y: Option<f32>,
    resolution: Option<ViewportResolutionPayload>,
}

impl ViewportCameraPayload {
    fn into_camera_params(self) -> Result<CameraParams, String> {
        if let Some(resolution) = self.resolution {
            resolution.validate()?;
        }
        let position = vec3_payload_to_glam("position", self.position)?;
        let target = vec3_payload_to_glam("target", self.target)?;
        let up = match self.up {
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
            fov_y: normalize_camera_fov_y(self.fov_y)?,
            ..CameraParams::default()
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewportResolutionPayload {
    width: f32,
    height: f32,
    #[serde(default, rename = "pixelRatio", alias = "pixel_ratio")]
    pixel_ratio: Option<f32>,
}

impl ViewportResolutionPayload {
    fn validate(&self) -> Result<(), String> {
        if !self.width.is_finite() || !self.height.is_finite() {
            return Err("viewport resolution must contain finite numbers".to_string());
        }
        if self.width <= 0.0 || self.height <= 0.0 {
            return Err("viewport resolution must be positive".to_string());
        }
        if let Some(pixel_ratio) = self.pixel_ratio {
            if !pixel_ratio.is_finite() || pixel_ratio <= 0.0 {
                return Err("viewport pixelRatio must be a positive finite number".to_string());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Vec3Payload {
    Array([f32; 3]),
    Object { x: f32, y: f32, z: f32 },
}

impl Vec3Payload {
    fn into_array(self) -> [f32; 3] {
        match self {
            Vec3Payload::Array(value) => value,
            Vec3Payload::Object { x, y, z } => [x, y, z],
        }
    }
}

fn vec3_payload_to_glam(field: &str, payload: Vec3Payload) -> Result<glam::Vec3, String> {
    let value = payload.into_array();
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

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum QuatPayload {
    Array([f32; 4]),
    Object { x: f32, y: f32, z: f32, w: f32 },
}

impl QuatPayload {
    fn into_array(self) -> [f32; 4] {
        match self {
            QuatPayload::Array(value) => value,
            QuatPayload::Object { x, y, z, w } => [x, y, z, w],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::contracts::scene::TransformUpdate;

    #[test]
    fn parses_hello_message() {
        let message: SceneControlClientMessage =
            serde_json::from_str(r#"{"type":"hello","lastRevision":10}"#).unwrap();
        assert!(matches!(
            message,
            SceneControlClientMessage::Hello {
                last_revision: Some(10)
            }
        ));
    }

    #[test]
    fn parses_command_envelope() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":7,"baseRevision":3,"command":{"type":"transform","payloadJson":"{\"nodeId\":\"node_1\",\"position\":{\"x\":1,\"y\":2,\"z\":3},\"rotation\":[0,0,0,1],\"scale\":[1,1,1]}"}}}"#,
        )
        .unwrap();
        match message {
            SceneControlClientMessage::Command { envelope } => {
                assert_eq!(envelope.seq, 7);
                assert_eq!(envelope.base_revision, 3);
                let runtime = envelope.into_runtime().unwrap();
                assert_eq!(runtime.seq, 7);
                match runtime.event {
                    SceneCommandEvent::SetTransform {
                        node_id, position, ..
                    } => {
                        assert_eq!(node_id, "node_1");
                        assert_eq!(position, [1.0, 2.0, 3.0]);
                    }
                    _ => panic!("expected transform event"),
                }
            }
            _ => panic!("expected command message"),
        }
    }

    #[test]
    fn parses_viewport_camera_message_to_camera_params() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"viewportCamera","sceneId":"scene-a","sceneRevision":8,"viewportId":"main","position":[0,1,5],"target":{"x":0,"y":0,"z":0},"up":[0,1,0],"fovY":45,"resolution":{"width":960,"height":540,"pixelRatio":1.25}}"#,
        )
        .unwrap();

        match message {
            SceneControlClientMessage::ViewportCamera {
                scene_id,
                scene_revision,
                viewport_id,
                position,
                target,
                up,
                fov_y,
                resolution,
                ..
            } => {
                assert_eq!(scene_id.as_deref(), Some("scene-a"));
                assert_eq!(scene_revision, Some(8));
                assert_eq!(viewport_id.as_deref(), Some("main"));
                assert_eq!(resolution.as_ref().map(|value| value.width), Some(960.0));
                let params = ViewportCameraPayload {
                    request_id: None,
                    scene_id,
                    scene_revision,
                    viewport_id,
                    position,
                    target,
                    up,
                    fov_y,
                    resolution,
                }
                .into_camera_params()
                .unwrap();
                assert_eq!(params.position.to_array(), [0.0, 1.0, 5.0]);
                assert_eq!(params.target.to_array(), [0.0, 0.0, 0.0]);
                assert!((params.fov_y - 45.0_f32.to_radians()).abs() < f32::EPSILON);
            }
            _ => panic!("expected viewport camera message"),
        }
    }

    #[test]
    fn rejects_degenerate_viewport_camera_payload() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"viewportCamera","position":[1,1,1],"target":[1,1,1]}"#,
        )
        .unwrap();

        match message {
            SceneControlClientMessage::ViewportCamera {
                scene_id,
                scene_revision,
                viewport_id,
                position,
                target,
                up,
                fov_y,
                resolution,
                ..
            } => {
                let error = ViewportCameraPayload {
                    request_id: None,
                    scene_id,
                    scene_revision,
                    viewport_id,
                    position,
                    target,
                    up,
                    fov_y,
                    resolution,
                }
                .into_camera_params()
                .unwrap_err();
                assert!(error.contains("position and target"));
            }
            _ => panic!("expected viewport camera message"),
        }
    }

    #[test]
    fn rejects_invalid_viewport_camera_resolution() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"viewportCamera","position":[0,1,5],"target":[0,0,0],"resolution":{"width":0,"height":540,"pixelRatio":1}}"#,
        )
        .unwrap();

        match message {
            SceneControlClientMessage::ViewportCamera {
                scene_id,
                scene_revision,
                viewport_id,
                position,
                target,
                up,
                fov_y,
                resolution,
                ..
            } => {
                let error = ViewportCameraPayload {
                    request_id: None,
                    scene_id,
                    scene_revision,
                    viewport_id,
                    position,
                    target,
                    up,
                    fov_y,
                    resolution,
                }
                .into_camera_params()
                .unwrap_err();
                assert!(error.contains("resolution"));
            }
            _ => panic!("expected viewport camera message"),
        }
    }

    #[test]
    fn camera_aspect_reads_nested_viewport_resolution() {
        let payload = json!({
            "resolution": {
                "width": 1024.0,
                "height": 512.0,
                "pixelRatio": 1.0
            }
        });

        assert!(
            (camera_aspect(&default_camera_state(), Some(&payload)) - 2.0).abs() < f64::EPSILON
        );
    }

    #[test]
    fn normalizes_runtime_snapshot_to_contract_shape() {
        let snapshot = snapshot_to_contract(
            json!({
                "nodes": [
                    {
                        "id": "root",
                        "name": "Root",
                        "position": [0.0, 1.0, 2.0],
                        "rotation": [0.0, 0.0, 0.0, 1.0],
                        "scale": [1.0, 1.0, 1.0],
                        "visible": true,
                        "has_mesh": false
                    },
                    {
                        "id": "child",
                        "name": "Child",
                        "parent_id": "root",
                        "position": [3.0, 4.0, 5.0],
                        "rotation": [0.0, 0.0, 0.0, 1.0],
                        "scale": [1.0, 1.0, 1.0],
                        "visible": true,
                        "has_mesh": true
                    }
                ],
                "animations": [{ "name": "Idle", "duration": 1.5 }]
            }),
            12,
        );

        assert_eq!(snapshot["revision"], 12);
        assert_eq!(snapshot["nodes"][0]["nodeId"], "root");
        assert_eq!(snapshot["nodes"][0]["children"][0], "child");
        assert_eq!(snapshot["nodes"][1]["parentId"], "root");
        assert_eq!(snapshot["nodes"][1]["kind"], "mesh");
        assert_eq!(snapshot["animations"][0]["name"], "Idle");
    }

    #[test]
    fn serializes_ack_and_delta_as_contract_camel_case() {
        let ack = SceneCommandAck {
            seq: 9,
            applied_seq: 9,
            base_revision: 2,
            revision: 3,
            status: SceneCommandAckStatus::Applied,
            error: None,
        };
        assert_eq!(ack_to_json(&ack)["appliedSeq"], 9);
        assert_eq!(ack_to_json(&ack)["baseRevision"], 2);
        assert_eq!(ack_to_json(&ack)["status"], "applied");

        let delta = SceneDelta {
            revision: 3,
            applied_seq: Some(9),
            updated_transforms: vec![TransformUpdate {
                node_id: "node_1".to_string(),
                position: [1.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            }],
            updated_morph_weights: Vec::new(),
            updated_visibility: Vec::new(),
            removed_nodes: Vec::new(),
            updated_character_morph_weights: Vec::new(),
            updated_character_materials: Vec::new(),
            updated_skeleton_pose: Vec::new(),
            character_overrides: Vec::new(),
            modeling_sessions: Vec::new(),
            topology_changes: Vec::new(),
        };
        let value = delta_to_json(&delta);
        assert_eq!(value["appliedSeq"], 9);
        assert_eq!(value["updatedTransforms"][0]["nodeId"], "node_1");
        assert_eq!(value["updatedTransforms"][0]["position"]["x"], 1.0);
    }

    #[test]
    fn scene_queries_are_viewport_scoped_and_revision_tagged() {
        let snapshot = snapshot_to_contract(
            json!({
                "nodes": [{
                    "id": "mesh_1",
                    "name": "Mesh",
                    "position": [0.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0],
                    "visible": true,
                    "has_mesh": true
                }]
            }),
            15,
        );

        let hit = hit_test_result(
            &snapshot,
            Some(&json!({ "x": 0.5, "y": 0.5 })),
            "scene-a",
            "side",
            15,
        );
        assert_eq!(hit["sceneId"], "scene-a");
        assert_eq!(hit["viewportId"], "side");
        assert_eq!(hit["revision"], 15);
        assert_eq!(hit["nodeId"], "mesh_1");
        assert_eq!(hit["worldPosition"]["x"], 0.0);
        assert_eq!(hit["normal"]["z"], 1.0);

        let overlay = overlay_state_result(
            &snapshot,
            Some(&json!({
                "viewportId": "side",
                "nodeIds": ["mesh_1"],
                "selectedNodeIds": ["mesh_1"]
            })),
            "scene-a",
            "side",
            15,
        );
        assert_eq!(overlay["sceneId"], "scene-a");
        assert_eq!(overlay["viewportId"], "side");
        assert_eq!(overlay["revision"], 15);
        assert_eq!(overlay["selectedNodeIds"][0], "mesh_1");
        assert_eq!(overlay["projectedBounds"][0]["nodeId"], "mesh_1");
        assert_eq!(overlay["gizmoAnchors"][0]["nodeId"], "mesh_1");
    }

    #[test]
    fn hit_test_respects_click_position_and_empty_space() {
        let snapshot = snapshot_to_contract(
            json!({
                "nodes": [{
                    "id": "mesh_1",
                    "name": "Mesh",
                    "position": [0.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0],
                    "visible": true,
                    "has_mesh": true
                }]
            }),
            20,
        );

        let center = hit_test_result(
            &snapshot,
            Some(&json!({ "x": 0.5, "y": 0.5 })),
            "scene-a",
            "main",
            20,
        );
        assert_eq!(center["nodeId"], "mesh_1");

        let empty = hit_test_result(
            &snapshot,
            Some(&json!({ "x": 0.95, "y": 0.95 })),
            "scene-a",
            "main",
            20,
        );
        assert!(empty["nodeId"].is_null());
        assert!(empty["worldPosition"].is_null());
    }

    #[test]
    fn projected_bounds_uses_viewport_camera_projection() {
        let snapshot = snapshot_to_contract(
            json!({
                "activeCamera": {
                    "position": { "x": 0.0, "y": 0.0, "z": 5.0 },
                    "target": { "x": 0.0, "y": 0.0, "z": 0.0 },
                    "up": { "x": 0.0, "y": 1.0, "z": 0.0 },
                    "fov": 45.0,
                    "aspect": 1.0
                },
                "nodes": [{
                    "id": "mesh_1",
                    "name": "Mesh",
                    "position": [1.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0],
                    "visible": true,
                    "has_mesh": true
                }]
            }),
            21,
        );

        let perspective = projected_bounds_result(
            &snapshot,
            Some(&json!({ "nodeIds": ["mesh_1"], "viewportId": "persp" })),
            "scene-a",
            "persp",
            21,
        );
        let orthographic = projected_bounds_result(
            &snapshot,
            Some(&json!({
                "nodeIds": ["mesh_1"],
                "viewportId": "ortho",
                "engineCamera": {
                    "position": { "x": 0.0, "y": 0.0, "z": 5.0 },
                    "target": { "x": 0.0, "y": 0.0, "z": 0.0 },
                    "up": { "x": 0.0, "y": 1.0, "z": 0.0 },
                    "projection": "orthographic",
                    "orthographicHeight": 4.0,
                    "aspect": 1.0
                }
            })),
            "scene-a",
            "ortho",
            21,
        );

        assert_eq!(perspective["viewportId"], "persp");
        assert_eq!(orthographic["viewportId"], "ortho");
        assert_ne!(
            perspective["bounds"][0]["min"]["x"],
            orthographic["bounds"][0]["min"]["x"]
        );
    }

    #[test]
    fn hit_test_ignores_webview_supplied_camera_payload() {
        let snapshot = snapshot_to_contract(
            json!({
                "activeCamera": {
                    "position": { "x": 0.0, "y": 0.0, "z": 5.0 },
                    "target": { "x": 0.0, "y": 0.0, "z": 0.0 },
                    "up": { "x": 0.0, "y": 1.0, "z": 0.0 },
                    "fov": 45.0,
                    "aspect": 1.0
                },
                "nodes": [{
                    "id": "mesh_1",
                    "name": "Mesh",
                    "position": [0.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0],
                    "visible": true,
                    "has_mesh": true
                }]
            }),
            22,
        );

        let hit = hit_test_result(
            &snapshot,
            Some(&json!({
                "x": 0.5,
                "y": 0.5,
                "camera": {
                    "position": { "x": 100.0, "y": 100.0, "z": 100.0 },
                    "target": { "x": 100.0, "y": 100.0, "z": 99.0 },
                    "fov": 45.0
                }
            })),
            "scene-a",
            "main",
            22,
        );

        assert_eq!(hit["nodeId"], "mesh_1");
    }
}
