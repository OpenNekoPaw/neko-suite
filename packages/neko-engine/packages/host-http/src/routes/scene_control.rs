//! Scene control WebSocket endpoint.
//!
//! GET /v1/scenes/control — JSON control plane for 3D scene editing.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use neko_engine_kernel::contracts::gpu::CameraParams;
use neko_engine_kernel::contracts::scene::{
    AnimationPlaybackAction, AssetHandleRef, EnvironmentDiagnostic, EnvironmentMode,
    EnvironmentPatch, LightPatch, SceneCommandAck, SceneCommandAckStatus, SceneCommandEnvelope,
    SceneCommandEvent, SceneCommandPhase, SceneDelta, SceneNodePatch, TopologyOperation,
};
use neko_engine_kernel::contracts::services::{
    EnvironmentLoadDiagnostic, ViewportStreamInteractionProfile,
};
use neko_engine_types::{
    ViewportCommand, ViewportDomain, ViewportEvent, ViewportFrameMeta, ViewportMetadataCadence,
    ViewportMetadataEvent, ViewportMetadataTransport,
};
use neko_host_api::EngineApi;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::sync::Arc;
use std::time::Duration;

const PROTOCOL: &str = "neko-scene-control-v1";
const VIEWPORT_PROTOCOL_VERSION: u64 = 1;
const ENVIRONMENT_FILE_TOKEN_KIND: &str = "file-token";
const ENVIRONMENT_ASSET_HANDLE_KIND: &str = "asset-handle";
const ENVIRONMENT_SOFT_LIMIT_BYTES: u64 = 64 * 1024 * 1024;

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
                && send_environment_load_diagnostics(socket, engine).await
        }
        SceneControlClientMessage::Subscribe { scene_id } => {
            send_snapshot(socket, engine, scene_id, "snapshot").await
                && send_environment_load_diagnostics(socket, engine).await
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
            if let Err(error) = validate_scene_command_event_sources(engine, &envelope.event) {
                return send_rejected_ack(
                    socket,
                    seq,
                    base_revision,
                    current_revision(engine),
                    &error,
                )
                .await;
            }
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
                if !send_json(
                    socket,
                    json!({ "type": "delta", "delta": delta_to_json(&delta) }),
                )
                .await
                {
                    return false;
                }
                send_environment_load_diagnostics(socket, engine).await
            } else {
                send_environment_load_diagnostics(socket, engine).await
            }
        }
        SceneControlClientMessage::Query {
            request_id,
            query,
            payload,
        } => {
            if query == "snapshot" {
                send_snapshot(socket, engine, None, "queryResult").await
                    && send_environment_load_diagnostics(socket, engine).await
            } else {
                match scene_query_result(engine, &query, payload.as_ref()) {
                    Ok(result) => {
                        if !send_json(
                            socket,
                            json!({
                                "type": "queryResult",
                                "requestId": request_id,
                                "query": query,
                                "result": result
                            }),
                        )
                        .await
                        {
                            return false;
                        }
                        send_environment_load_diagnostics(socket, engine).await
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
        SceneControlClientMessage::ViewportCommand {
            request_id,
            command,
        } => handle_viewport_command(socket, engine, request_id, command).await,
        SceneControlClientMessage::Resync { scene_id } => {
            send_snapshot(socket, engine, scene_id, "snapshot").await
                && send_environment_load_diagnostics(socket, engine).await
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
            stream_profile,
            profile_ttl_ms,
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
                stream_profile,
                profile_ttl_ms,
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
            let stream_profile = camera.stream_profile.clone();
            let profile_ttl_ms = camera.profile_ttl_ms;
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
            service.set_editor_camera(camera.clone());
            if let Some(profile) =
                parse_viewport_stream_interaction_profile(stream_profile.as_deref())
            {
                let ttl = Duration::from_millis(profile_ttl_ms.unwrap_or(0));
                service.set_viewport_stream_interaction_profile(
                    &scene_id,
                    &viewport_id,
                    profile,
                    ttl,
                );
            }
            if let Err(error) = engine.model_preview_controller().record_camera_override(
                &scene_id,
                &viewport_id,
                camera,
            ) {
                tracing::warn!(
                    "Failed to record model preview camera override for {scene_id}/{viewport_id}: {error}"
                );
            }
            if request_id.is_some() {
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
            } else {
                true
            }
        }
        SceneControlClientMessage::RequestKeyframe { viewport_id } => {
            let scene_id = "default".to_string();
            let viewport_id = viewport_id.unwrap_or_else(|| "main".to_string());
            let revision = current_revision(engine);
            if !send_json(
                socket,
                json!({
                    "type": "viewportMetadata",
                    "event": viewport_metadata_event(&scene_id, &viewport_id, revision, 0)
                }),
            )
            .await
            {
                return false;
            }
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
                && send_environment_load_diagnostics(socket, engine).await
        }
    }
}

async fn handle_viewport_command(
    socket: &mut WebSocket,
    engine: &EngineApi,
    request_id: Option<String>,
    command: ViewportProtocolCommand,
) -> bool {
    let command = match command.into_runtime() {
        Ok(command) => command,
        Err(error) => return send_error(socket, &error).await,
    };

    if neko_host_api::controllers::is_model_preview_action(&command.action) {
        let result = match engine
            .model_preview_controller()
            .handle_viewport_command(command)
        {
            Ok(result) => result,
            Err(error) => return send_error(socket, &error.to_string()).await,
        };
        let event = match serde_json::to_value(&result.event) {
            Ok(event) => event,
            Err(error) => return send_error(socket, &error.to_string()).await,
        };
        let state = match result.state {
            Some(state) => match serde_json::to_value(state) {
                Ok(state) => Some(state),
                Err(error) => return send_error(socket, &error.to_string()).await,
            },
            None => None,
        };
        return send_viewport_event(socket, request_id, event, state).await;
    }

    let event = unsupported_viewport_command_event(&command, current_revision(engine));
    match serde_json::to_value(event) {
        Ok(event) => send_viewport_event(socket, request_id, event, None).await,
        Err(error) => send_error(socket, &error.to_string()).await,
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

fn parse_viewport_stream_interaction_profile(
    value: Option<&str>,
) -> Option<ViewportStreamInteractionProfile> {
    match value {
        Some("interactive") => Some(ViewportStreamInteractionProfile::Interactive),
        Some("default") => Some(ViewportStreamInteractionProfile::Default),
        _ => None,
    }
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
        "selection-query" | "selectionQuery" => Ok(selection_query_result(
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
    match picked_node_hit(snapshot, payload) {
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

fn selection_query_result(
    snapshot: &Value,
    payload: Option<&Value>,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let hit = picked_node_hit(snapshot, payload);
    let candidates = hit
        .as_ref()
        .map(|(node, bounds, hit)| {
            selection_candidates_for_node(node, bounds, hit, &selection_mask(payload))
        })
        .unwrap_or_default();

    json!({
        "sceneId": scene_id,
        "viewportId": viewport_id,
        "revision": revision,
        "candidates": candidates
    })
}

fn picked_node_hit<'a>(
    snapshot: &'a Value,
    payload: Option<&Value>,
) -> Option<(&'a Value, NodeBounds, RayHit)> {
    let camera = camera_basis(snapshot, payload);
    let (origin, direction) = camera.ray_for_screen(
        payload_number(payload, "x").unwrap_or(0.5),
        payload_number(payload, "y").unwrap_or(0.5),
    );
    let requested = payload_string_array(payload, "nodeIds");

    scene_nodes(snapshot)
        .into_iter()
        .filter(is_pickable_node)
        .filter(|node| node_matches_request(node, &requested))
        .filter_map(|node| {
            let bounds = node_world_bounds(node);
            intersect_ray_aabb(origin, direction, bounds).map(|hit| (node, bounds, hit))
        })
        .min_by(|(_, _, left), (_, _, right)| left.depth.total_cmp(&right.depth))
}

fn selection_candidates_for_node(
    node: &Value,
    bounds: &NodeBounds,
    hit: &RayHit,
    mask: &[String],
) -> Vec<Value> {
    let Some(node_id) = node.get("nodeId").and_then(Value::as_str) else {
        return Vec::new();
    };
    let accepts = |kind: &str| mask.is_empty() || mask.iter().any(|value| value == kind);
    let hit_json = || {
        json!({
            "worldPosition": vec3_to_value(hit.position),
            "worldNormal": vec3_to_value(surface_normal(*bounds, hit.position)),
            "depth": hit.depth
        })
    };
    let mut candidates = Vec::new();

    append_character_region_candidates(node, &hit_json(), &accepts, &mut candidates);

    if let Some(primitive) = node
        .get("primitives")
        .and_then(Value::as_array)
        .and_then(|values| values.first())
    {
        if accepts("materialSlot") {
            if let Some(material_slot_id) = primitive
                .get("materialSlotId")
                .and_then(Value::as_str)
                .or_else(|| {
                    primitive
                        .get("material")
                        .and_then(|material| material.get("id"))
                        .and_then(Value::as_str)
                })
            {
                candidates.push(json!({
                    "kind": "materialSlot",
                    "nodeId": node_id,
                    "materialSlotId": material_slot_id,
                    "hit": hit_json()
                }));
            }
        }
        if accepts("submesh") {
            if let Some(submesh_id) = primitive.get("submeshId").and_then(Value::as_str) {
                candidates.push(json!({
                    "kind": "submesh",
                    "nodeId": node_id,
                    "submeshId": submesh_id,
                    "hit": hit_json()
                }));
            }
        }
        if accepts("primitive") {
            if let Some(primitive_id) = primitive.get("primitiveId").and_then(Value::as_str) {
                candidates.push(json!({
                    "kind": "primitive",
                    "nodeId": node_id,
                    "primitiveId": primitive_id,
                    "hit": hit_json()
                }));
            }
        }
    }

    if accepts("node") {
        candidates.push(json!({
            "kind": "node",
            "nodeId": node_id,
            "hit": hit_json()
        }));
    }

    candidates
}

fn append_character_region_candidates(
    node: &Value,
    hit: &Value,
    accepts: &impl Fn(&str) -> bool,
    candidates: &mut Vec<Value>,
) {
    if !accepts("characterRegion") && !accepts("morphControl") {
        return;
    }
    let Some(node_id) = node.get("nodeId").and_then(Value::as_str) else {
        return;
    };
    let Some(character_id) = node.get("characterId").and_then(Value::as_str) else {
        return;
    };
    let Some(regions) = node
        .get("regionDescriptors")
        .and_then(|descriptors| descriptors.get("regions"))
        .and_then(Value::as_array)
    else {
        return;
    };

    for region in regions {
        let Some(region_id) = region.get("regionId").and_then(Value::as_str) else {
            continue;
        };
        let bindings = region
            .get("bindings")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let has_compatible_binding = bindings.iter().any(|binding| {
            let kind = binding.get("kind").and_then(Value::as_str);
            matches!(
                kind,
                Some("morphControl" | "materialSlot" | "bone" | "submesh" | "primitive" | "mask")
            )
        });
        if has_compatible_binding && accepts("characterRegion") {
            candidates.push(json!({
                "kind": "characterRegion",
                "nodeId": node_id,
                "characterId": character_id,
                "regionId": region_id,
                "hit": hit
            }));
        }
        if accepts("morphControl") {
            for binding in bindings.iter().filter(|binding| {
                binding.get("kind").and_then(Value::as_str) == Some("morphControl")
            }) {
                let Some(morph_id) = binding.get("targetId").and_then(Value::as_str) else {
                    continue;
                };
                candidates.push(json!({
                    "kind": "morphControl",
                    "nodeId": node_id,
                    "characterId": character_id,
                    "regionId": region_id,
                    "morphId": morph_id,
                    "hit": hit
                }));
            }
        }
    }
}

fn projected_bounds_result(
    snapshot: &Value,
    payload: Option<&Value>,
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
) -> Value {
    let camera = camera_basis(snapshot, payload);
    let bounds = overlay_items_for_targets(snapshot, payload, |node, target| {
        projected_bounds_for_node(node, camera, target)
    });

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
    let camera = camera_basis(snapshot, payload);
    let anchors = overlay_items_for_targets(snapshot, payload, |node, target| {
        gizmo_anchor_for_node(node, camera, target)
    });

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
    let has_overlay_targets = has_explicit_overlay_targets(payload);
    let projected_bounds = if has_overlay_targets {
        projected_bounds_result(snapshot, payload, scene_id, viewport_id, revision)
            .get("bounds")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()))
    } else {
        Value::Array(Vec::new())
    };
    let gizmo_anchors = if has_overlay_targets {
        gizmo_anchor_result(snapshot, payload, scene_id, viewport_id, revision)
            .get("anchors")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()))
    } else {
        Value::Array(Vec::new())
    };
    let light_helpers = light_helper_anchors(snapshot, payload);
    let gizmo_anchors = merge_overlay_arrays(gizmo_anchors, light_helpers);

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

fn merge_overlay_arrays(base: Value, extra: Vec<Value>) -> Value {
    let mut values = base.as_array().cloned().unwrap_or_default();
    values.extend(extra);
    Value::Array(values)
}

fn has_explicit_overlay_targets(payload: Option<&Value>) -> bool {
    !payload_selection_targets(payload).is_empty()
        || !payload_string_array(payload, "nodeIds").is_empty()
        || !payload_string_array(payload, "selectedNodeIds").is_empty()
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

fn overlay_items_for_targets<F>(
    snapshot: &Value,
    payload: Option<&Value>,
    mut project: F,
) -> Vec<Value>
where
    F: FnMut(&Value, Option<Value>) -> Option<Value>,
{
    let targets = payload_selection_targets(payload);
    if !targets.is_empty() {
        return targets
            .into_iter()
            .filter_map(|target| {
                let node_id = target.get("nodeId").and_then(Value::as_str)?;
                scene_nodes(snapshot)
                    .into_iter()
                    .find(|node| {
                        node.get("nodeId")
                            .and_then(Value::as_str)
                            .map(|candidate| candidate == node_id)
                            .unwrap_or(false)
                    })
                    .and_then(|node| project(node, Some(target)))
            })
            .collect();
    }

    let requested = payload_string_array(payload, "nodeIds");
    let requested = if requested.is_empty() {
        payload_string_array(payload, "selectedNodeIds")
    } else {
        requested
    };
    scene_nodes(snapshot)
        .into_iter()
        .filter(|node| node_matches_request(node, &requested))
        .filter_map(|node| project(node, None))
        .collect()
}

fn light_helper_anchors(snapshot: &Value, payload: Option<&Value>) -> Vec<Value> {
    let camera = camera_basis(snapshot, payload);
    let requested = payload_string_array(payload, "lightNodeIds");
    scene_nodes(snapshot)
        .into_iter()
        .filter(|node| node.get("visible").and_then(Value::as_bool).unwrap_or(true))
        .filter(|node| {
            node.get("kind").and_then(Value::as_str) == Some("light") || node.get("light").is_some()
        })
        .filter(|node| node_matches_request(node, &requested))
        .filter_map(|node| light_helper_anchor_for_node(node, camera))
        .collect()
}

fn payload_selection_targets(payload: Option<&Value>) -> Vec<Value> {
    for key in ["selectedTargets", "targets"] {
        let Some(values) = payload
            .and_then(|payload| payload.get(key))
            .and_then(Value::as_array)
        else {
            continue;
        };
        return values
            .iter()
            .filter(|value| value.get("nodeId").and_then(Value::as_str).is_some())
            .cloned()
            .collect();
    }
    Vec::new()
}

fn projected_bounds_for_node(
    node: &Value,
    camera: CameraBasis,
    target: Option<Value>,
) -> Option<Value> {
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

    let mut result = json!({
        "nodeId": node_id,
        "min": {
            "x": min_x.clamp(0.0, 1.0),
            "y": min_y.clamp(0.0, 1.0)
        },
        "max": {
            "x": max_x.clamp(0.0, 1.0),
            "y": max_y.clamp(0.0, 1.0)
        }
    });
    if let Some(target) = target {
        result["target"] = target;
    }
    Some(result)
}

fn gizmo_anchor_for_node(
    node: &Value,
    camera: CameraBasis,
    target: Option<Value>,
) -> Option<Value> {
    let node_id = node
        .get("nodeId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let world_position = node_world_position_vec(node);
    let screen = camera.project_world(world_position)?;
    let mut result = json!({
        "nodeId": node_id,
        "worldPosition": vec3_to_value(world_position),
        "screenPosition": { "x": screen.0.clamp(0.0, 1.0), "y": screen.1.clamp(0.0, 1.0) }
    });
    if let Some(target) = target {
        result["target"] = target;
    }
    Some(result)
}

fn light_helper_anchor_for_node(node: &Value, camera: CameraBasis) -> Option<Value> {
    let node_id = node
        .get("nodeId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let world_position = node_world_position_vec(node);
    let screen = camera.project_world(world_position)?;
    Some(json!({
        "nodeId": node_id,
        "worldPosition": vec3_to_value(world_position),
        "screenPosition": { "x": screen.0.clamp(0.0, 1.0), "y": screen.1.clamp(0.0, 1.0) },
        "target": {
            "kind": "node",
            "nodeId": node_id
        }
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

fn selection_mask(payload: Option<&Value>) -> Vec<String> {
    payload_string_array(payload, "mask")
        .into_iter()
        .map(|value| match value.as_str() {
            "material-slot" => "materialSlot".to_string(),
            "character-region" => "characterRegion".to_string(),
            "morph-control" => "morphControl".to_string(),
            other => other.to_string(),
        })
        .collect()
}

fn unsupported_viewport_command_event(command: &ViewportCommand, revision: u64) -> ViewportEvent {
    ViewportEvent {
        protocol_version: neko_engine_types::VIEWPORT_PROTOCOL_VERSION,
        domain: command.domain,
        event: command.action.clone(),
        scene_id: command.scene_id.clone(),
        viewport_id: command.viewport_id.clone(),
        ack_seq: command.seq,
        revision,
        timestamp: command.timestamp,
        status: Some(neko_engine_types::ViewportEventStatus::Error),
        applied_seq: None,
        error: Some(neko_engine_types::ViewportProtocolError {
            code: "unsupportedViewportCommand".to_string(),
            message: "viewport command action is not supported by scene-control websocket"
                .to_string(),
            retryable: Some(true),
        }),
        payload: Value::Object(Default::default()),
    }
}

fn viewport_metadata_event(
    scene_id: &str,
    viewport_id: &str,
    revision: u64,
    applied_seq: u64,
) -> ViewportMetadataEvent {
    let timestamp = current_timestamp_ms();
    ViewportMetadataEvent {
        protocol_version: neko_engine_types::VIEWPORT_PROTOCOL_VERSION,
        message_type: "viewportMetadata".to_string(),
        scene_id: scene_id.to_string(),
        viewport_id: viewport_id.to_string(),
        revision,
        applied_seq,
        timestamp,
        transport: ViewportMetadataTransport::SceneControl,
        cadence: ViewportMetadataCadence::OnDemand,
        meta: ViewportFrameMeta {
            protocol_version: neko_engine_types::VIEWPORT_PROTOCOL_VERSION,
            stream_id: format!("scene-control:{scene_id}:{viewport_id}"),
            scene_id: scene_id.to_string(),
            viewport_id: viewport_id.to_string(),
            frame_id: 0,
            pts_us: 0,
            duration_us: 0,
            frame_timestamp: timestamp,
            revision,
            scene_revision: Some(revision),
            applied_seq,
            view_transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            projection: None,
            diagnostics: Default::default(),
        },
    }
}

fn current_timestamp_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or_default()
}

async fn send_viewport_event(
    socket: &mut WebSocket,
    request_id: Option<String>,
    event: Value,
    preview_state: Option<Value>,
) -> bool {
    if !send_json(
        socket,
        json!({
            "type": "viewportEvent",
            "requestId": request_id,
            "event": event
        }),
    )
    .await
    {
        return false;
    }
    if let Some(state) = preview_state {
        return send_json(
            socket,
            json!({
                "type": "characterPreviewState",
                "requestId": request_id,
                "state": state
            }),
        )
        .await;
    }
    true
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

async fn send_environment_load_diagnostics(socket: &mut WebSocket, engine: &EngineApi) -> bool {
    let Some(service) = engine.scene_service() else {
        return true;
    };
    let diagnostics = service.take_environment_load_diagnostics();
    if diagnostics.is_empty() {
        return true;
    }
    send_json(
        socket,
        json!({
            "type": "delta",
            "delta": {
                "revision": current_revision(engine),
                "environmentDiagnostics": diagnostics
                    .iter()
                    .map(environment_load_diagnostic_to_json)
                    .collect::<Vec<_>>()
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
    if !delta.added_nodes.is_empty() {
        object.insert(
            "addedNodes".to_string(),
            Value::Array(
                delta
                    .added_nodes
                    .iter()
                    .map(scene_node_patch_to_json)
                    .collect(),
            ),
        );
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
    if !delta.updated_lights.is_empty() {
        object.insert(
            "updatedLights".to_string(),
            Value::Array(
                delta
                    .updated_lights
                    .iter()
                    .map(light_patch_to_json)
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
    if let Some(environment) = &delta.environment {
        object.insert(
            "environment".to_string(),
            environment
                .as_ref()
                .map(environment_patch_to_json)
                .unwrap_or(Value::Null),
        );
    }
    if !delta.environment_diagnostics.is_empty() {
        object.insert(
            "environmentDiagnostics".to_string(),
            Value::Array(
                delta
                    .environment_diagnostics
                    .iter()
                    .map(environment_diagnostic_to_json)
                    .collect(),
            ),
        );
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

    let mut result = Map::new();
    result.insert(
        "sceneId".to_string(),
        Value::String(
            snapshot_object
                .get("sceneId")
                .or_else(|| snapshot_object.get("scene_id"))
                .and_then(Value::as_str)
                .unwrap_or("default")
                .to_string(),
        ),
    );
    result.insert(
        "revision".to_string(),
        Value::from(
            snapshot_object
                .get("revision")
                .and_then(Value::as_u64)
                .unwrap_or(revision),
        ),
    );
    result.insert("nodes".to_string(), Value::Array(nodes));
    result.insert("animations".to_string(), Value::Array(animations));
    if let Some(active_camera) = snapshot_object
        .get("activeCamera")
        .or_else(|| snapshot_object.get("active_camera"))
        .cloned()
    {
        result.insert("activeCamera".to_string(), active_camera);
    }
    if let Some(environment) = snapshot_object
        .get("environment")
        .and_then(environment_value_to_contract)
    {
        result.insert("environment".to_string(), environment);
    }

    Value::Object(result)
}

fn environment_value_to_contract(value: &Value) -> Option<Value> {
    if value.is_null() {
        return None;
    }
    let patch: EnvironmentPatch = serde_json::from_value(value.clone()).ok()?;
    Some(environment_patch_to_json(&patch))
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
    if let Some(primitives) = object.get("primitives").and_then(Value::as_array) {
        result.insert(
            "primitives".to_string(),
            Value::Array(primitives.iter().map(mesh_primitive_to_contract).collect()),
        );
    }
    if let Some(character_id) = object
        .get("characterId")
        .or_else(|| object.get("character_id"))
    {
        result.insert("characterId".to_string(), character_id.clone());
    }
    if let Some(region_descriptors) = object
        .get("regionDescriptors")
        .or_else(|| object.get("region_descriptors"))
    {
        result.insert("regionDescriptors".to_string(), region_descriptors.clone());
    }
    if let Some(light) = object.get("light") {
        result.insert("light".to_string(), light.clone());
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

fn mesh_primitive_to_contract(value: &Value) -> Value {
    let mut object = Map::new();
    if let Some(mesh) = value.get("mesh") {
        object.insert("mesh".to_string(), mesh.clone());
    }
    if let Some(material) = value.get("material") {
        object.insert("material".to_string(), material.clone());
    }
    if let Some(submesh_id) = value.get("submeshId").and_then(Value::as_str) {
        object.insert(
            "submeshId".to_string(),
            Value::String(submesh_id.to_string()),
        );
    }
    if let Some(primitive_id) = value.get("primitiveId").and_then(Value::as_str) {
        object.insert(
            "primitiveId".to_string(),
            Value::String(primitive_id.to_string()),
        );
    }
    if let Some(material_slot_id) = value.get("materialSlotId").and_then(Value::as_str) {
        object.insert(
            "materialSlotId".to_string(),
            Value::String(material_slot_id.to_string()),
        );
    }
    Value::Object(object)
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

fn scene_node_patch_to_json(patch: &SceneNodePatch) -> Value {
    let mut object = Map::new();
    object.insert("nodeId".to_string(), Value::String(patch.node_id.clone()));
    if let Some(parent_id) = &patch.parent_id {
        object.insert("parentId".to_string(), Value::String(parent_id.clone()));
    }
    if let Some(name) = &patch.name {
        object.insert("name".to_string(), Value::String(name.clone()));
    }
    if let Some(transform) = &patch.transform {
        object.insert(
            "transform".to_string(),
            json!({
                "position": vec3_to_json(transform.position),
                "rotation": quat_to_json(transform.rotation),
                "scale": vec3_to_json(transform.scale)
            }),
        );
    }
    if let Some(visible) = patch.visible {
        object.insert("visible".to_string(), Value::Bool(visible));
    }
    if !patch.children.is_empty() {
        object.insert("children".to_string(), json!(patch.children));
    }
    if let Some(kind) = &patch.kind {
        object.insert("kind".to_string(), Value::String(kind.clone()));
    }
    Value::Object(object)
}

fn light_patch_to_json(patch: &LightPatch) -> Value {
    let mut object = Map::new();
    object.insert("nodeId".to_string(), Value::String(patch.node_id.clone()));
    object.insert("kind".to_string(), Value::String(patch.kind.clone()));
    object.insert("color".to_string(), vec3_to_json(patch.color));
    object.insert("intensity".to_string(), json!(patch.intensity));
    if let Some(range) = patch.range {
        object.insert("range".to_string(), json!(range));
    }
    if let Some(inner) = patch.inner_cone_angle {
        object.insert("innerConeAngle".to_string(), json!(inner));
    }
    if let Some(outer) = patch.outer_cone_angle {
        object.insert("outerConeAngle".to_string(), json!(outer));
    }
    if let Some(shadow) = &patch.shadow {
        object.insert(
            "shadow".to_string(),
            json!({
                "enabled": shadow.enabled,
                "resolution": shadow.resolution,
                "bias": shadow.bias
            }),
        );
    }
    Value::Object(object)
}

fn environment_patch_to_json(patch: &EnvironmentPatch) -> Value {
    let mut object = Map::new();
    object.insert(
        "environmentId".to_string(),
        Value::String(patch.environment_id.clone()),
    );
    if let Some(source) = &patch.source {
        object.insert(
            "source".to_string(),
            json!({
                "id": source.id,
                "uri": source.uri,
                "kind": source.kind
            }),
        );
    }
    object.insert(
        "mode".to_string(),
        Value::String(environment_mode_to_str(patch.mode).to_string()),
    );
    object.insert("rotationDeg".to_string(), json!(patch.rotation_deg));
    object.insert("intensity".to_string(), json!(patch.intensity));
    object.insert("exposure".to_string(), json!(patch.exposure));
    object.insert(
        "visibleAsBackground".to_string(),
        Value::Bool(patch.visible_as_background),
    );
    if let Some(color) = patch.background_color {
        object.insert(
            "backgroundColor".to_string(),
            json!({
                "x": color[0],
                "y": color[1],
                "z": color[2],
                "w": color[3]
            }),
        );
    }
    Value::Object(object)
}

fn environment_diagnostic_to_json(diagnostic: &EnvironmentDiagnostic) -> Value {
    json!({
        "code": diagnostic.code,
        "severity": diagnostic.severity,
        "message": diagnostic.message,
        "retryable": diagnostic.retryable
    })
}

fn environment_load_diagnostic_to_json(diagnostic: &EnvironmentLoadDiagnostic) -> Value {
    json!({
        "code": diagnostic.code,
        "severity": diagnostic.severity,
        "message": diagnostic.message,
        "retryable": diagnostic.retryable
    })
}

fn environment_mode_to_str(mode: EnvironmentMode) -> &'static str {
    match mode {
        EnvironmentMode::Skybox => "skybox",
        EnvironmentMode::Ibl => "ibl",
        EnvironmentMode::BackgroundAndIbl => "background-and-ibl",
    }
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
    ViewportCommand {
        #[serde(default, rename = "requestId")]
        request_id: Option<String>,
        command: ViewportProtocolCommand,
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
        #[serde(default, rename = "streamProfile")]
        stream_profile: Option<String>,
        #[serde(default, rename = "profileTtlMs")]
        profile_ttl_ms: Option<u64>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewportProtocolCommand {
    protocol_version: u64,
    domain: String,
    action: String,
    scene_id: String,
    #[serde(default)]
    viewport_id: Option<String>,
    seq: u64,
    correlation_id: String,
    timestamp: f64,
    source: String,
    #[serde(default)]
    base_revision: Option<u64>,
    #[serde(default)]
    payload: Value,
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

impl ViewportProtocolCommand {
    fn into_runtime(self) -> Result<ViewportCommand, String> {
        let domain = match self.domain.as_str() {
            "viewport" => ViewportDomain::Viewport,
            "scene" => ViewportDomain::Scene,
            other => return Err(format!("unsupported viewport command domain: {other}")),
        };
        let source = serde_json::from_value(json!(self.source))
            .map_err(|error| format!("invalid viewport command source: {error}"))?;
        let protocol_version = u16::try_from(self.protocol_version)
            .map_err(|_| "viewport protocol version is out of range".to_string())?;
        Ok(ViewportCommand {
            protocol_version,
            domain,
            action: self.action,
            scene_id: self.scene_id,
            viewport_id: self.viewport_id,
            seq: self.seq,
            correlation_id: self.correlation_id,
            timestamp: self.timestamp,
            source,
            base_revision: self.base_revision,
            payload: self.payload,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ControlSceneCommand {
    #[serde(rename = "type")]
    command_type: String,
    payload_json: String,
    #[serde(default)]
    character_command: Option<CharacterCommandPayload>,
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
            "node-add" => {
                let payload: NodeAddCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid node-add command payload: {error}"))?;
                let kind = payload.kind;
                let payload = normalize_node_add_payload(kind.as_str(), payload.payload)?;
                Ok(SceneCommandEvent::AddNode {
                    kind,
                    payload_json: serde_json::to_string(&payload)
                        .map_err(|error| format!("invalid node-add command payload: {error}"))?,
                })
            }
            "node-remove" => {
                let payload: NodeRemoveCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid node-remove command payload: {error}"))?;
                Ok(SceneCommandEvent::RemoveNode(
                    neko_engine_kernel::contracts::scene::NodeRemoveCommand {
                        node_id: payload.node_id,
                        cascade: payload.cascade,
                    },
                ))
            }
            "light-update" => {
                let patch: LightCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid light-update command payload: {error}"))?;
                Ok(SceneCommandEvent::UpdateLight {
                    patch: patch.into_patch()?,
                })
            }
            "environment-set" => {
                let patch: EnvironmentCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid environment-set command payload: {error}"))?;
                Ok(SceneCommandEvent::SetEnvironment {
                    patch: patch.into_patch()?,
                })
            }
            "environment-update" => {
                let patch: EnvironmentCommandPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| {
                        format!("invalid environment-update command payload: {error}")
                    })?;
                Ok(SceneCommandEvent::UpdateEnvironment {
                    patch: patch.into_patch()?,
                })
            }
            "environment-clear" => {
                let payload: EnvironmentClearCommandPayload =
                    serde_json::from_str(&self.payload_json).map_err(|error| {
                        format!("invalid environment-clear command payload: {error}")
                    })?;
                Ok(SceneCommandEvent::ClearEnvironment {
                    environment_id: payload.environment_id,
                })
            }
            "animation-play" => {
                let payload: AnimationPlaybackPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid animation play command payload: {error}"))?;
                payload.into_event()
            }
            "animation-seek" => {
                let payload: AnimationSeekPayload = serde_json::from_str(&self.payload_json)
                    .map_err(|error| format!("invalid animation seek command payload: {error}"))?;
                Ok(payload.into_event())
            }
            "character" => self
                .character_command
                .ok_or_else(|| "character command payload required".to_string())?
                .into_event(),
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
struct NodeAddCommandPayload {
    kind: String,
    #[serde(flatten)]
    payload: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NodeRemoveCommandPayload {
    #[serde(alias = "node_id")]
    node_id: String,
    #[serde(default)]
    cascade: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LightCommandPayload {
    #[serde(alias = "node_id")]
    node_id: String,
    kind: String,
    color: Vec3Payload,
    intensity: f32,
    #[serde(default)]
    range: Option<f32>,
    #[serde(default)]
    inner_cone_angle: Option<f32>,
    #[serde(default)]
    outer_cone_angle: Option<f32>,
    #[serde(default)]
    shadow: Option<LightShadowCommandPayload>,
}

impl LightCommandPayload {
    fn into_patch(self) -> Result<LightPatch, String> {
        Ok(LightPatch {
            node_id: self.node_id,
            kind: self.kind,
            color: self.color.into_array(),
            intensity: self.intensity,
            range: self.range,
            inner_cone_angle: self.inner_cone_angle,
            outer_cone_angle: self.outer_cone_angle,
            shadow: self.shadow.map(|shadow| shadow.into_patch()),
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LightShadowCommandPayload {
    enabled: bool,
    #[serde(default)]
    resolution: Option<u32>,
    #[serde(default)]
    bias: Option<f32>,
}

impl LightShadowCommandPayload {
    fn into_patch(self) -> neko_engine_kernel::contracts::scene::LightShadowPatch {
        neko_engine_kernel::contracts::scene::LightShadowPatch {
            enabled: self.enabled,
            resolution: self.resolution,
            bias: self.bias,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentCommandPayload {
    #[serde(alias = "environment_id")]
    environment_id: String,
    #[serde(default)]
    source: Option<AssetHandleCommandPayload>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default, alias = "rotation_deg")]
    rotation_deg: Option<f32>,
    #[serde(default)]
    intensity: Option<f32>,
    #[serde(default)]
    exposure: Option<f32>,
    #[serde(default, alias = "visible_as_background")]
    visible_as_background: Option<bool>,
    #[serde(default)]
    background_color: Option<Vec4Payload>,
}

impl EnvironmentCommandPayload {
    fn into_patch(self) -> Result<EnvironmentPatch, String> {
        Ok(EnvironmentPatch {
            environment_id: self.environment_id,
            source: self.source.map(AssetHandleCommandPayload::into_ref),
            mode: parse_environment_mode(self.mode.as_deref())?,
            rotation_deg: self.rotation_deg.unwrap_or_default(),
            intensity: self.intensity.unwrap_or(1.0),
            exposure: self.exposure.unwrap_or_default(),
            visible_as_background: self.visible_as_background.unwrap_or(true),
            background_color: self.background_color.map(Vec4Payload::into_array),
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentClearCommandPayload {
    #[serde(default, alias = "environment_id")]
    environment_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetHandleCommandPayload {
    id: String,
    #[serde(default)]
    uri: Option<String>,
    #[serde(default)]
    kind: Option<String>,
}

impl AssetHandleCommandPayload {
    fn into_ref(self) -> AssetHandleRef {
        AssetHandleRef {
            id: self.id,
            uri: self.uri,
            kind: self.kind,
        }
    }
}

fn validate_scene_command_event_sources(
    engine: &EngineApi,
    event: &SceneCommandEvent,
) -> Result<(), String> {
    match event {
        SceneCommandEvent::SetEnvironment { patch }
        | SceneCommandEvent::UpdateEnvironment { patch } => {
            validate_environment_patch_source(engine, patch)
        }
        _ => Ok(()),
    }
}

fn validate_environment_patch_source(
    engine: &EngineApi,
    patch: &EnvironmentPatch,
) -> Result<(), String> {
    let Some(source) = &patch.source else {
        return Ok(());
    };
    match source.kind.as_deref() {
        Some(ENVIRONMENT_FILE_TOKEN_KIND) => {
            let record = engine
                .file_access_registry()
                .lookup_record(&source.id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "environment.fileTokenNotFound".to_string())?;
            if record.file_size_bytes > ENVIRONMENT_SOFT_LIMIT_BYTES {
                return Err(format!(
                    "environment.resourceTooLarge: {} bytes exceeds {} byte soft limit",
                    record.file_size_bytes, ENVIRONMENT_SOFT_LIMIT_BYTES
                ));
            }
            let service = engine
                .scene_service()
                .ok_or_else(|| "scene service is not available".to_string())?;
            service
                .register_environment_file_token(&source.id, &record.path)
                .map_err(|error| error.to_string())?;
            Ok(())
        }
        Some(ENVIRONMENT_ASSET_HANDLE_KIND) => Ok(()),
        Some(other) => Err(format!("unsupported environment source kind: {other}")),
        None => Err("environment source kind is required".to_string()),
    }
}

fn parse_environment_mode(value: Option<&str>) -> Result<EnvironmentMode, String> {
    match value.unwrap_or("background-and-ibl") {
        "skybox" => Ok(EnvironmentMode::Skybox),
        "ibl" => Ok(EnvironmentMode::Ibl),
        "background-and-ibl" | "backgroundAndIbl" => Ok(EnvironmentMode::BackgroundAndIbl),
        other => Err(format!("unsupported environment mode: {other}")),
    }
}

fn normalize_node_add_payload(
    kind: &str,
    mut payload: Map<String, Value>,
) -> Result<Map<String, Value>, String> {
    if kind != "light" {
        return Ok(payload);
    }

    if let Some(color) = payload.remove("color") {
        payload.insert("color".to_string(), vec3_value_to_array(color)?);
    }

    if let Some(transform) = payload.get_mut("transform").and_then(Value::as_object_mut) {
        normalize_transform_object(transform)?;
    }

    if let Some(light) = payload.get_mut("light").and_then(Value::as_object_mut) {
        if let Some(color) = light.remove("color") {
            light.insert("color".to_string(), vec3_value_to_array(color)?);
        }
    }

    Ok(payload)
}

fn normalize_transform_object(transform: &mut Map<String, Value>) -> Result<(), String> {
    if let Some(position) = transform.remove("position") {
        transform.insert("position".to_string(), vec3_value_to_array(position)?);
    }
    if let Some(rotation) = transform.remove("rotation") {
        transform.insert("rotation".to_string(), quat_value_to_array(rotation)?);
    }
    if let Some(scale) = transform.remove("scale") {
        transform.insert("scale".to_string(), vec3_value_to_array(scale)?);
    }
    Ok(())
}

fn vec3_value_to_array(value: Value) -> Result<Value, String> {
    if let Some(array) = value.as_array() {
        if array.len() >= 3 {
            return Ok(Value::Array(array.iter().take(3).cloned().collect()));
        }
    }
    if let Some(object) = value.as_object() {
        return Ok(json!([
            object.get("x").and_then(Value::as_f64).unwrap_or_default(),
            object.get("y").and_then(Value::as_f64).unwrap_or_default(),
            object.get("z").and_then(Value::as_f64).unwrap_or_default()
        ]));
    }
    Err("expected vec3 array or object".to_string())
}

fn quat_value_to_array(value: Value) -> Result<Value, String> {
    if let Some(array) = value.as_array() {
        if array.len() >= 4 {
            return Ok(Value::Array(array.iter().take(4).cloned().collect()));
        }
    }
    if let Some(object) = value.as_object() {
        return Ok(json!([
            object.get("x").and_then(Value::as_f64).unwrap_or_default(),
            object.get("y").and_then(Value::as_f64).unwrap_or_default(),
            object.get("z").and_then(Value::as_f64).unwrap_or_default(),
            object.get("w").and_then(Value::as_f64).unwrap_or(1.0)
        ]));
    }
    Err("expected quaternion array or object".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnimationPlaybackPayload {
    action: String,
    #[serde(default, alias = "clip_name")]
    clip_name: Option<String>,
    #[serde(default, alias = "fade_duration")]
    fade_duration: Option<f32>,
    #[serde(default, alias = "loop")]
    loop_anim: Option<bool>,
    #[serde(default, alias = "root_motion_enabled")]
    root_motion_enabled: Option<bool>,
    #[serde(default, alias = "root_node_id")]
    root_node_id: Option<String>,
}

impl AnimationPlaybackPayload {
    fn into_event(self) -> Result<SceneCommandEvent, String> {
        let action = match self.action.as_str() {
            "select" => AnimationPlaybackAction::Select,
            "play" => AnimationPlaybackAction::Play,
            "pause" => AnimationPlaybackAction::Pause,
            "stop" => AnimationPlaybackAction::Stop,
            "crossfade" => AnimationPlaybackAction::Crossfade,
            other => return Err(format!("unsupported animation action: {other}")),
        };

        Ok(SceneCommandEvent::SetAnimationPlayback {
            action,
            clip_name: self.clip_name,
            time_ms: None,
            fade_duration: self.fade_duration,
            loop_anim: self.loop_anim.unwrap_or(true),
            root_motion_enabled: self.root_motion_enabled.unwrap_or(true),
            root_node_id: self.root_node_id,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnimationSeekPayload {
    #[serde(default, alias = "clip_name")]
    clip_name: Option<String>,
    #[serde(alias = "time_ms")]
    time_ms: f32,
    #[serde(default, alias = "root_motion_enabled")]
    root_motion_enabled: Option<bool>,
    #[serde(default, alias = "root_node_id")]
    root_node_id: Option<String>,
}

impl AnimationSeekPayload {
    fn into_event(self) -> SceneCommandEvent {
        SceneCommandEvent::SetAnimationPlayback {
            action: AnimationPlaybackAction::Seek,
            clip_name: self.clip_name,
            time_ms: Some(self.time_ms),
            fade_duration: None,
            loop_anim: true,
            root_motion_enabled: self.root_motion_enabled.unwrap_or(true),
            root_node_id: self.root_node_id,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterCommandPayload {
    #[serde(rename = "type")]
    command_type: String,
    #[serde(alias = "character_id")]
    character_id: String,
    #[serde(default, alias = "topology_version")]
    topology_version: Option<u64>,
    #[serde(default, alias = "morph_set")]
    morph_set: Option<CharacterMorphSetPayload>,
    #[serde(default, alias = "material_layer")]
    material_layer: Option<CharacterMaterialLayerPayload>,
    #[serde(default, alias = "expression_preset")]
    expression_preset: Option<CharacterExpressionPresetPayload>,
    #[serde(default, alias = "bone_pose")]
    bone_pose: Option<CharacterBonePosePayload>,
    #[serde(default, alias = "override_edit")]
    override_edit: Option<CharacterOverridePayload>,
}

impl CharacterCommandPayload {
    fn into_event(self) -> Result<SceneCommandEvent, String> {
        match self.command_type.as_str() {
            "morph-set" => {
                let morph = self
                    .morph_set
                    .ok_or_else(|| "morphSet payload required".to_string())?;
                Ok(SceneCommandEvent::SetCharacterMorph {
                    character_id: self.character_id,
                    morph_id: morph.morph_id,
                    weight: morph.weight,
                    topology_version: self.topology_version.unwrap_or_default(),
                })
            }
            "material-layer-set" => {
                let material_layer = self
                    .material_layer
                    .ok_or_else(|| "materialLayer payload required".to_string())?;
                Ok(SceneCommandEvent::SetCharacterMaterialLayer {
                    character_id: self.character_id,
                    slot_id: material_layer.slot_id,
                    params_json: material_layer.params_json,
                    topology_version: self.topology_version.unwrap_or_default(),
                })
            }
            "expression-preset-apply" => {
                let expression = self
                    .expression_preset
                    .ok_or_else(|| "expressionPreset payload required".to_string())?;
                Ok(SceneCommandEvent::ApplyCharacterExpressionPreset {
                    character_id: self.character_id,
                    preset_id: expression.preset_id,
                    weight: expression.weight,
                    topology_version: self.topology_version.unwrap_or_default(),
                })
            }
            "bone-pose-set" => {
                let bone_pose = self
                    .bone_pose
                    .ok_or_else(|| "bonePose payload required".to_string())?;
                let transform = bone_pose.transform.unwrap_or_default();
                Ok(SceneCommandEvent::SetCharacterBonePose {
                    character_id: self.character_id,
                    bone_id: bone_pose.bone_id,
                    position: transform.position.into_array(),
                    rotation: transform.rotation.into_array(),
                    scale: transform.scale.into_array(),
                    topology_version: self.topology_version.unwrap_or_default(),
                })
            }
            "override-apply" => {
                let override_edit = self
                    .override_edit
                    .ok_or_else(|| "overrideEdit payload required".to_string())?;
                let entry = override_edit
                    .entries
                    .into_iter()
                    .next()
                    .ok_or_else(|| "overrideEdit entries required".to_string())?;
                Ok(SceneCommandEvent::ApplyCharacterOverride {
                    character_id: self.character_id,
                    path: entry.path,
                    value_type: entry.value_type,
                    value_json: entry.value_json,
                    topology_version: self.topology_version.unwrap_or_default(),
                })
            }
            other => Err(format!("unsupported character command type: {other}")),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterMorphSetPayload {
    #[serde(alias = "morph_id")]
    morph_id: String,
    weight: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterMaterialLayerPayload {
    #[serde(alias = "slot_id")]
    slot_id: String,
    #[serde(alias = "params_json")]
    params_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterExpressionPresetPayload {
    #[serde(alias = "preset_id")]
    preset_id: String,
    weight: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterBonePosePayload {
    #[serde(alias = "bone_id")]
    bone_id: String,
    #[serde(default)]
    transform: Option<TransformPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterOverridePayload {
    #[serde(default)]
    entries: Vec<CharacterOverrideEntryPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterOverrideEntryPayload {
    path: String,
    #[serde(alias = "value_type")]
    value_type: String,
    #[serde(alias = "value_json")]
    value_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransformPayload {
    position: Vec3Payload,
    rotation: QuatPayload,
    scale: Vec3Payload,
}

impl Default for TransformPayload {
    fn default() -> Self {
        Self {
            position: Vec3Payload::Array([0.0, 0.0, 0.0]),
            rotation: QuatPayload::Array([0.0, 0.0, 0.0, 1.0]),
            scale: Vec3Payload::Array([1.0, 1.0, 1.0]),
        }
    }
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
    stream_profile: Option<String>,
    profile_ttl_ms: Option<u64>,
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

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Vec4Payload {
    Array([f32; 4]),
    Object { x: f32, y: f32, z: f32, w: f32 },
}

impl Vec4Payload {
    fn into_array(self) -> [f32; 4] {
        match self {
            Vec4Payload::Array(value) => value,
            Vec4Payload::Object { x, y, z, w } => [x, y, z, w],
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
    use neko_engine_kernel::contracts::scene::{
        SceneNodePatch, SceneNodeTransformPatch, TransformUpdate,
    };
    use neko_engine_types::FileAccessPurpose;
    use tempfile::tempdir;

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
    fn parses_animation_playback_command_with_root_motion() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":8,"baseRevision":3,"command":{"type":"animation-play","payloadJson":"{\"action\":\"play\",\"clipName\":\"Walk\",\"rootMotionEnabled\":false,\"rootNodeId\":\"hips\"}"}}}"#,
        )
        .unwrap();
        match message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::SetAnimationPlayback {
                        action,
                        clip_name,
                        root_motion_enabled,
                        root_node_id,
                        ..
                    } => {
                        assert_eq!(action, AnimationPlaybackAction::Play);
                        assert_eq!(clip_name.as_deref(), Some("Walk"));
                        assert!(!root_motion_enabled);
                        assert_eq!(root_node_id.as_deref(), Some("hips"));
                    }
                    _ => panic!("expected animation playback event"),
                }
            }
            _ => panic!("expected command message"),
        }
    }

    #[test]
    fn parses_light_authoring_commands() {
        let add_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":12,"baseRevision":3,"command":{"type":"node-add","payloadJson":"{\"kind\":\"light\",\"nodeId\":\"key_light\",\"name\":\"Key Light\",\"transform\":{\"position\":{\"x\":1,\"y\":2,\"z\":3},\"rotation\":{\"x\":0,\"y\":0,\"z\":0,\"w\":1},\"scale\":{\"x\":1,\"y\":1,\"z\":1}},\"color\":{\"x\":1,\"y\":0.8,\"z\":0.6},\"intensity\":4,\"range\":12}"}}}"#,
        )
        .unwrap();
        match add_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::AddNode { kind, payload_json } => {
                        assert_eq!(kind, "light");
                        let payload: Value = serde_json::from_str(&payload_json).unwrap();
                        assert_eq!(payload["nodeId"], "key_light");
                        assert_eq!(payload["color"][1], 0.8);
                        assert_eq!(payload["transform"]["position"][2], 3.0);
                    }
                    _ => panic!("expected add light event"),
                }
            }
            _ => panic!("expected command message"),
        }

        let update_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":13,"baseRevision":4,"command":{"type":"light-update","payloadJson":"{\"nodeId\":\"key_light\",\"kind\":\"spot\",\"color\":{\"x\":0.2,\"y\":0.4,\"z\":1},\"intensity\":6,\"range\":20,\"innerConeAngle\":0.2,\"outerConeAngle\":0.8,\"shadow\":{\"enabled\":true,\"resolution\":2048,\"bias\":0.01}}"}}}"#,
        )
        .unwrap();
        match update_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::UpdateLight { patch } => {
                        assert_eq!(patch.node_id, "key_light");
                        assert_eq!(patch.kind, "spot");
                        assert_eq!(patch.color, [0.2, 0.4, 1.0]);
                        assert_eq!(patch.range, Some(20.0));
                        assert_eq!(patch.shadow.unwrap().resolution, Some(2048));
                    }
                    _ => panic!("expected update light event"),
                }
            }
            _ => panic!("expected command message"),
        }

        let remove_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":14,"baseRevision":5,"command":{"type":"node-remove","payloadJson":"{\"nodeId\":\"key_light\"}"}}}"#,
        )
        .unwrap();
        match remove_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::RemoveNode(command) => {
                        assert_eq!(command.node_id, "key_light");
                        assert_eq!(command.cascade, None);
                    }
                    _ => panic!("expected remove node event"),
                }
            }
            _ => panic!("expected command message"),
        }
    }

    #[test]
    fn parses_environment_commands() {
        let set_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":15,"baseRevision":6,"command":{"type":"environment-set","payloadJson":"{\"environmentId\":\"scene-environment\",\"mode\":\"background-and-ibl\",\"rotationDeg\":45,\"intensity\":1.5,\"exposure\":0.25,\"visibleAsBackground\":true,\"backgroundColor\":{\"x\":0.1,\"y\":0.2,\"z\":0.3,\"w\":1},\"source\":{\"id\":\"token-1\",\"kind\":\"file-token\"}}"}}}"#,
        )
        .unwrap();
        match set_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::SetEnvironment { patch } => {
                        assert_eq!(patch.environment_id, "scene-environment");
                        assert_eq!(patch.mode, EnvironmentMode::BackgroundAndIbl);
                        assert_eq!(patch.background_color, Some([0.1, 0.2, 0.3, 1.0]));
                        assert_eq!(patch.source.unwrap().id, "token-1");
                    }
                    _ => panic!("expected environment set event"),
                }
            }
            _ => panic!("expected command message"),
        }

        let clear_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":16,"baseRevision":7,"command":{"type":"environment-clear","payloadJson":"{\"environmentId\":\"scene-environment\"}"}}}"#,
        )
        .unwrap();
        match clear_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::ClearEnvironment { environment_id } => {
                        assert_eq!(environment_id.as_deref(), Some("scene-environment"));
                    }
                    _ => panic!("expected environment clear event"),
                }
            }
            _ => panic!("expected command message"),
        }
    }

    #[tokio::test]
    async fn environment_source_validation_requires_registered_file_token() {
        let engine = EngineApi::without_gpu().unwrap();
        let patch = EnvironmentPatch {
            environment_id: "scene-environment".to_string(),
            source: Some(AssetHandleRef {
                id: "missing-token".to_string(),
                uri: None,
                kind: Some(ENVIRONMENT_FILE_TOKEN_KIND.to_string()),
            }),
            mode: EnvironmentMode::BackgroundAndIbl,
            rotation_deg: 0.0,
            intensity: 1.0,
            exposure: 0.0,
            visible_as_background: true,
            background_color: None,
        };

        let error = validate_environment_patch_source(&engine, &patch)
            .expect_err("missing file token rejected");
        assert!(error.contains("environment.fileTokenNotFound"));
    }

    #[tokio::test]
    async fn environment_source_validation_rejects_oversized_file_token() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("oversized.png");
        let file = std::fs::File::create(&path).expect("create environment file");
        file.set_len(ENVIRONMENT_SOFT_LIMIT_BYTES + 1)
            .expect("grow environment file");
        let engine = EngineApi::without_gpu().unwrap();
        engine
            .set_file_access_allowed_roots(vec![dir.path().to_path_buf()])
            .unwrap();
        let registered = engine
            .file_access_registry()
            .register(path, FileAccessPurpose::Preview)
            .expect("register file token");
        let patch = EnvironmentPatch {
            environment_id: "scene-environment".to_string(),
            source: Some(AssetHandleRef {
                id: registered.token,
                uri: None,
                kind: Some(ENVIRONMENT_FILE_TOKEN_KIND.to_string()),
            }),
            mode: EnvironmentMode::BackgroundAndIbl,
            rotation_deg: 0.0,
            intensity: 1.0,
            exposure: 0.0,
            visible_as_background: true,
            background_color: None,
        };

        let error = validate_environment_patch_source(&engine, &patch)
            .expect_err("oversized environment token rejected");
        assert!(error.contains("environment.resourceTooLarge"));
    }

    #[tokio::test]
    async fn environment_source_validation_accepts_registered_file_token() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("environment.png");
        std::fs::write(&path, [0x89, b'P', b'N', b'G']).expect("write environment file");
        let engine = EngineApi::without_gpu().unwrap();
        engine
            .set_file_access_allowed_roots(vec![dir.path().to_path_buf()])
            .unwrap();
        let registered = engine
            .file_access_registry()
            .register(path, FileAccessPurpose::Preview)
            .expect("register file token");
        let patch = EnvironmentPatch {
            environment_id: "scene-environment".to_string(),
            source: Some(AssetHandleRef {
                id: registered.token,
                uri: None,
                kind: Some(ENVIRONMENT_FILE_TOKEN_KIND.to_string()),
            }),
            mode: EnvironmentMode::BackgroundAndIbl,
            rotation_deg: 0.0,
            intensity: 1.0,
            exposure: 0.0,
            visible_as_background: true,
            background_color: None,
        };

        validate_environment_patch_source(&engine, &patch)
            .expect("registered environment file token accepted");
    }

    #[test]
    fn parses_character_bone_pose_command() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":9,"baseRevision":3,"command":{"type":"character","payloadJson":"{}","characterCommand":{"type":"bone-pose-set","characterId":"character-a","topologyVersion":3,"bonePose":{"boneId":"jaw","transform":{"position":{"x":0,"y":0,"z":0},"rotation":{"x":0,"y":0,"z":0,"w":1},"scale":{"x":1,"y":1,"z":1}}}}}}}"#,
        )
        .unwrap();
        match message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::SetCharacterBonePose {
                        character_id,
                        bone_id,
                        rotation,
                        topology_version,
                        ..
                    } => {
                        assert_eq!(character_id, "character-a");
                        assert_eq!(bone_id, "jaw");
                        assert_eq!(rotation, [0.0, 0.0, 0.0, 1.0]);
                        assert_eq!(topology_version, 3);
                    }
                    _ => panic!("expected bone pose event"),
                }
            }
            _ => panic!("expected command message"),
        }
    }

    #[test]
    fn parses_character_morph_and_expression_commands() {
        let morph_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":10,"baseRevision":3,"command":{"type":"character","payloadJson":"{}","characterCommand":{"type":"morph-set","characterId":"character-a","topologyVersion":3,"morphSet":{"morphId":"Smile","weight":0.7}}}}}"#,
        )
        .unwrap();
        match morph_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::SetCharacterMorph {
                        character_id,
                        morph_id,
                        weight,
                        topology_version,
                    } => {
                        assert_eq!(character_id, "character-a");
                        assert_eq!(morph_id, "Smile");
                        assert!((weight - 0.7).abs() < f32::EPSILON);
                        assert_eq!(topology_version, 3);
                    }
                    _ => panic!("expected morph event"),
                }
            }
            _ => panic!("expected command message"),
        }

        let expression_message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"command","envelope":{"seq":11,"baseRevision":3,"command":{"type":"character","payloadJson":"{}","characterCommand":{"type":"expression-preset-apply","characterId":"character-a","topologyVersion":3,"expressionPreset":{"presetId":"happy","weight":1}}}}}"#,
        )
        .unwrap();
        match expression_message {
            SceneControlClientMessage::Command { envelope } => {
                match envelope.into_runtime().unwrap().event {
                    SceneCommandEvent::ApplyCharacterExpressionPreset {
                        character_id,
                        preset_id,
                        weight,
                        topology_version,
                    } => {
                        assert_eq!(character_id, "character-a");
                        assert_eq!(preset_id, "happy");
                        assert!((weight - 1.0).abs() < f32::EPSILON);
                        assert_eq!(topology_version, 3);
                    }
                    _ => panic!("expected expression event"),
                }
            }
            _ => panic!("expected command message"),
        }
    }

    #[test]
    fn parses_viewport_camera_message_to_camera_params() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"viewportCamera","sceneId":"scene-a","sceneRevision":8,"viewportId":"main","position":[0,1,5],"target":{"x":0,"y":0,"z":0},"up":[0,1,0],"fovY":45,"resolution":{"width":960,"height":540,"pixelRatio":1.25},"streamProfile":"interactive","profileTtlMs":700}"#,
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
                stream_profile,
                profile_ttl_ms,
                ..
            } => {
                assert_eq!(scene_id.as_deref(), Some("scene-a"));
                assert_eq!(scene_revision, Some(8));
                assert_eq!(viewport_id.as_deref(), Some("main"));
                assert_eq!(resolution.as_ref().map(|value| value.width), Some(960.0));
                assert_eq!(
                    parse_viewport_stream_interaction_profile(stream_profile.as_deref()),
                    Some(ViewportStreamInteractionProfile::Interactive)
                );
                assert_eq!(profile_ttl_ms, Some(700));
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
                    stream_profile,
                    profile_ttl_ms,
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
    fn parses_character_preview_viewport_command() {
        let message: SceneControlClientMessage = serde_json::from_str(
            r#"{"type":"viewportCommand","requestId":"main:preview:12","command":{"protocolVersion":1,"domain":"scene","action":"scene:model:characterPreview:setMode","sceneId":"scene-a","viewportId":"main","seq":12,"correlationId":"main:preview:12","timestamp":100,"source":"user","baseRevision":3,"payload":{"characterId":"character-a","modeId":"voice-pack","viewportId":"main"}}}"#,
        )
        .unwrap();

        match message {
            SceneControlClientMessage::ViewportCommand {
                request_id,
                command,
            } => {
                assert_eq!(request_id.as_deref(), Some("main:preview:12"));
                assert_eq!(command.action, "scene:model:characterPreview:setMode");
                let command = command.into_runtime().unwrap();
                assert_eq!(command.domain, ViewportDomain::Scene);
                assert_eq!(command.payload["characterId"], "character-a");
                assert_eq!(command.payload["modeId"], "voice-pack");
                assert_eq!(command.payload["viewportId"], "main");
            }
            _ => panic!("expected viewport command message"),
        }
    }

    #[test]
    fn routes_character_preview_viewport_command_shape_to_runtime_controller() {
        let command = ViewportProtocolCommand {
            protocol_version: VIEWPORT_PROTOCOL_VERSION,
            domain: "scene".to_string(),
            action: "scene:model:characterPreview:setMode".to_string(),
            scene_id: "scene-a".to_string(),
            viewport_id: Some("main".to_string()),
            seq: 14,
            correlation_id: "main:preview:14".to_string(),
            timestamp: 120.0,
            source: "user".to_string(),
            base_revision: Some(3),
            payload: json!({
                "characterId": "character-a",
                "modeId": "motion",
                "viewportId": "main"
            }),
        };
        let command = command.into_runtime().unwrap();
        assert!(neko_host_api::controllers::is_model_preview_action(
            &command.action
        ));
        assert_eq!(command.base_revision, Some(3));
        assert_eq!(command.payload["modeId"], "motion");
    }

    #[test]
    fn unsupported_viewport_command_event_is_contract_camel_case() {
        let command = ViewportProtocolCommand {
            protocol_version: VIEWPORT_PROTOCOL_VERSION,
            domain: "scene".to_string(),
            action: "scene:model:unsupported".to_string(),
            scene_id: "scene-a".to_string(),
            viewport_id: Some("main".to_string()),
            seq: 15,
            correlation_id: "main:preview:15".to_string(),
            timestamp: 130.0,
            source: "user".to_string(),
            base_revision: Some(99),
            payload: json!({
                "characterId": "character-a",
                "modeId": "face",
                "viewportId": "main"
            }),
        }
        .into_runtime()
        .unwrap();

        let error = serde_json::to_value(unsupported_viewport_command_event(&command, 4)).unwrap();
        assert_eq!(error["status"], "error");
        assert_eq!(error["error"]["code"], "unsupportedViewportCommand");
        assert_eq!(error["ackSeq"], 15);
    }

    #[test]
    fn viewport_metadata_event_serializes_scene_control_p1_contract() {
        let event = viewport_metadata_event("scene-a", "main", 12, 21);
        let value = serde_json::to_value(&event).unwrap();

        assert_eq!(value["protocolVersion"], 1);
        assert_eq!(value["type"], "viewportMetadata");
        assert_eq!(value["transport"], "scene-control");
        assert_eq!(value["cadence"], "on-demand");
        assert_eq!(value["sceneId"], "scene-a");
        assert_eq!(value["viewportId"], "main");
        assert_eq!(value["revision"], 12);
        assert_eq!(value["appliedSeq"], 21);
        assert_eq!(value["meta"]["revision"], 12);
        assert_eq!(value["meta"]["appliedSeq"], 21);

        let round_tripped: ViewportMetadataEvent = serde_json::from_value(value).unwrap();
        assert_eq!(
            round_tripped.transport,
            ViewportMetadataTransport::SceneControl
        );
        assert_eq!(round_tripped.cadence, ViewportMetadataCadence::OnDemand);
        assert_eq!(
            round_tripped.meta.view_transform,
            [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
        );
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
                    stream_profile: None,
                    profile_ttl_ms: None,
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
                    stream_profile: None,
                    profile_ttl_ms: None,
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
                        "has_mesh": true,
                        "primitives": [{
                            "mesh": { "id": "mesh:model.glb#primitive:0", "uri": "model.glb", "kind": "mesh" },
                            "material": { "id": "material:model.glb#index:2", "uri": "model.glb", "kind": "material" },
                            "submeshId": "submesh:0",
                            "primitiveId": "primitive:0",
                            "materialSlotId": "material:2"
                        }]
                    }
                ],
                "animations": [{ "name": "Idle", "duration": 1.5 }]
                ,
                "environment": {
                    "environmentId": "scene-environment",
                    "mode": "background-and-ibl",
                    "rotationDeg": 45.0,
                    "intensity": 1.0,
                    "exposure": 0.0,
                    "visibleAsBackground": true,
                    "backgroundColor": [0.1, 0.2, 0.3, 1.0]
                }
            }),
            12,
        );

        assert_eq!(snapshot["revision"], 12);
        assert_eq!(snapshot["nodes"][0]["nodeId"], "root");
        assert_eq!(snapshot["nodes"][0]["children"][0], "child");
        assert_eq!(snapshot["nodes"][1]["parentId"], "root");
        assert_eq!(snapshot["nodes"][1]["kind"], "mesh");
        assert_eq!(
            snapshot["nodes"][1]["primitives"][0]["materialSlotId"],
            "material:2"
        );
        assert_eq!(snapshot["animations"][0]["name"], "Idle");
        assert_eq!(
            snapshot["environment"]["environmentId"],
            "scene-environment"
        );
        let background_z = snapshot["environment"]["backgroundColor"]["z"]
            .as_f64()
            .unwrap();
        assert!((background_z - 0.3).abs() < 0.000_001);
    }

    #[test]
    fn selection_query_returns_mesh_structure_candidates_without_fabricated_regions() {
        let snapshot = snapshot_to_contract(
            json!({
                "nodes": [{
                    "id": "mesh_1",
                    "name": "Mesh",
                    "position": [0.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0],
                    "visible": true,
                    "has_mesh": true,
                    "primitives": [{
                        "mesh": { "id": "mesh:model.glb#primitive:0", "uri": "model.glb", "kind": "mesh" },
                        "material": { "id": "material:model.glb#index:0", "uri": "model.glb", "kind": "material" },
                        "submeshId": "submesh:0",
                        "primitiveId": "primitive:0",
                        "materialSlotId": "material:0"
                    }]
                }]
            }),
            21,
        );

        let result = selection_query_result(
            &snapshot,
            Some(&json!({
                "x": 0.5,
                "y": 0.5,
                "mask": ["characterRegion", "materialSlot", "submesh", "primitive", "node"]
            })),
            "scene-a",
            "main",
            21,
        );
        let kinds: Vec<&str> = result["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|candidate| candidate["kind"].as_str())
            .collect();

        assert_eq!(kinds, vec!["materialSlot", "submesh", "primitive", "node"]);
        assert_eq!(result["candidates"][0]["materialSlotId"], "material:0");
        assert_eq!(result["candidates"][1]["submeshId"], "submesh:0");
        assert_eq!(result["candidates"][2]["primitiveId"], "primitive:0");
        assert!(!kinds.contains(&"characterRegion"));
    }

    #[test]
    fn selection_query_returns_character_regions_only_for_explicit_nkc_descriptors() {
        let snapshot = snapshot_to_contract(
            json!({
                "nodes": [{
                    "id": "face_mesh",
                    "name": "Face Mesh",
                    "position": [0.0, 0.0, 0.0],
                    "rotation": [0.0, 0.0, 0.0, 1.0],
                    "scale": [1.0, 1.0, 1.0],
                    "visible": true,
                    "has_mesh": true,
                    "characterId": "character-a",
                    "regionDescriptors": {
                        "schemaVersion": 1,
                        "regions": [{
                            "regionId": "face.mouth",
                            "displayName": "Mouth",
                            "schemaVersion": 1,
                            "bindings": [
                                { "kind": "morphControl", "targetId": "Smile" },
                                { "kind": "materialSlot", "targetId": "skin" }
                            ],
                            "tags": ["face"]
                        }]
                    },
                    "primitives": [{
                        "mesh": { "id": "mesh:ava.glb#primitive:0", "uri": "ava.glb", "kind": "mesh" },
                        "material": { "id": "material:ava.glb#index:0", "uri": "ava.glb", "kind": "material" },
                        "submeshId": "submesh:0",
                        "primitiveId": "primitive:0",
                        "materialSlotId": "skin"
                    }]
                }]
            }),
            23,
        );

        let result = selection_query_result(
            &snapshot,
            Some(&json!({
                "x": 0.5,
                "y": 0.5,
                "mask": ["characterRegion", "morphControl", "materialSlot", "node"]
            })),
            "scene-a",
            "main",
            23,
        );
        let candidates = result["candidates"].as_array().unwrap();

        assert_eq!(candidates[0]["kind"], "characterRegion");
        assert_eq!(candidates[0]["characterId"], "character-a");
        assert_eq!(candidates[0]["regionId"], "face.mouth");
        assert_eq!(candidates[1]["kind"], "morphControl");
        assert_eq!(candidates[1]["morphId"], "Smile");
        assert_eq!(candidates[2]["kind"], "materialSlot");
    }

    #[test]
    fn projected_bounds_and_gizmo_anchors_preserve_non_node_targets_when_available() {
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
            22,
        );
        let payload = json!({
            "selectedTargets": [{
                "kind": "materialSlot",
                "nodeId": "mesh_1",
                "materialSlotId": "material:0"
            }]
        });

        let bounds = projected_bounds_result(&snapshot, Some(&payload), "scene-a", "main", 22);
        let anchors = gizmo_anchor_result(&snapshot, Some(&payload), "scene-a", "main", 22);

        assert_eq!(bounds["bounds"][0]["nodeId"], "mesh_1");
        assert_eq!(
            bounds["bounds"][0]["target"]["materialSlotId"],
            "material:0"
        );
        assert_eq!(anchors["anchors"][0]["nodeId"], "mesh_1");
        assert_eq!(anchors["anchors"][0]["target"]["kind"], "materialSlot");
    }

    #[test]
    fn overlay_state_includes_light_helpers_without_mesh_bounds() {
        let snapshot = snapshot_to_contract(
            json!({
                "activeCamera": {
                    "position": { "x": 0.0, "y": 1.0, "z": 5.0 },
                    "target": { "x": 0.0, "y": 1.0, "z": 0.0 },
                    "up": { "x": 0.0, "y": 1.0, "z": 0.0 },
                    "fov": 45.0,
                    "aspect": 1.0
                },
                "nodes": [
                    {
                        "id": "mesh_1",
                        "name": "Mesh",
                        "position": [0.0, 0.0, 0.0],
                        "rotation": [0.0, 0.0, 0.0, 1.0],
                        "scale": [1.0, 1.0, 1.0],
                        "visible": true,
                        "has_mesh": true
                    },
                    {
                        "id": "key_light",
                        "name": "Key Light",
                        "kind": "light",
                        "position": [0.0, 1.0, 0.0],
                        "rotation": [0.0, 0.0, 0.0, 1.0],
                        "scale": [1.0, 1.0, 1.0],
                        "visible": true,
                        "light": {
                            "nodeId": "key_light",
                            "kind": "point",
                            "color": [1.0, 1.0, 1.0],
                            "intensity": 3.0
                        }
                    }
                ]
            }),
            23,
        );

        let overlay = overlay_state_result(
            &snapshot,
            Some(&json!({ "viewportId": "main", "lightNodeIds": ["key_light"] })),
            "scene-a",
            "main",
            23,
        );

        assert_eq!(overlay["projectedBounds"].as_array().unwrap().len(), 0);
        assert_eq!(overlay["gizmoAnchors"].as_array().unwrap().len(), 1);
        assert_eq!(overlay["gizmoAnchors"][0]["nodeId"], "key_light");
        assert_eq!(overlay["gizmoAnchors"][0]["target"]["kind"], "node");
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
            added_nodes: vec![SceneNodePatch {
                node_id: "key_light".to_string(),
                parent_id: None,
                name: Some("Key Light".to_string()),
                transform: Some(SceneNodeTransformPatch {
                    position: [0.0, 2.0, 0.0],
                    rotation: [0.0, 0.0, 0.0, 1.0],
                    scale: [1.0, 1.0, 1.0],
                }),
                visible: Some(true),
                children: Vec::new(),
                kind: Some("light".to_string()),
            }],
            updated_transforms: vec![TransformUpdate {
                node_id: "node_1".to_string(),
                position: [1.0, 0.0, 0.0],
                rotation: [0.0, 0.0, 0.0, 1.0],
                scale: [1.0, 1.0, 1.0],
            }],
            updated_morph_weights: Vec::new(),
            updated_visibility: Vec::new(),
            updated_lights: vec![LightPatch {
                node_id: "key_light".to_string(),
                kind: "point".to_string(),
                color: [1.0, 0.8, 0.6],
                intensity: 4.0,
                range: Some(12.0),
                inner_cone_angle: None,
                outer_cone_angle: None,
                shadow: None,
            }],
            removed_nodes: Vec::new(),
            updated_character_morph_weights: Vec::new(),
            updated_character_materials: Vec::new(),
            updated_skeleton_pose: Vec::new(),
            character_overrides: Vec::new(),
            modeling_sessions: Vec::new(),
            topology_changes: Vec::new(),
            environment: Some(Some(EnvironmentPatch {
                environment_id: "scene-environment".to_string(),
                source: None,
                mode: EnvironmentMode::BackgroundAndIbl,
                rotation_deg: 45.0,
                intensity: 1.0,
                exposure: 0.0,
                visible_as_background: true,
                background_color: Some([0.1, 0.2, 0.3, 1.0]),
            })),
            selected_targets: Vec::new(),
            environment_diagnostics: vec![EnvironmentDiagnostic {
                code: "environment.loadPending".to_string(),
                severity: "info".to_string(),
                message: "Environment loading is pending".to_string(),
                retryable: true,
            }],
        };
        let value = delta_to_json(&delta);
        assert_eq!(value["appliedSeq"], 9);
        assert_eq!(value["addedNodes"][0]["nodeId"], "key_light");
        assert_eq!(value["addedNodes"][0]["kind"], "light");
        assert_eq!(value["updatedTransforms"][0]["nodeId"], "node_1");
        assert_eq!(value["updatedTransforms"][0]["position"]["x"], 1.0);
        assert_eq!(value["updatedLights"][0]["nodeId"], "key_light");
        assert_eq!(value["updatedLights"][0]["range"], 12.0);
        assert_eq!(value["environment"]["environmentId"], "scene-environment");
        let background_z = value["environment"]["backgroundColor"]["z"]
            .as_f64()
            .unwrap();
        assert!((background_z - 0.3).abs() < 0.000_001);
        assert_eq!(
            value["environmentDiagnostics"][0]["code"],
            "environment.loadPending"
        );

        let cleared = SceneDelta {
            revision: 4,
            applied_seq: Some(10),
            added_nodes: Vec::new(),
            updated_transforms: Vec::new(),
            updated_morph_weights: Vec::new(),
            updated_visibility: Vec::new(),
            updated_lights: Vec::new(),
            removed_nodes: Vec::new(),
            updated_character_morph_weights: Vec::new(),
            updated_character_materials: Vec::new(),
            updated_skeleton_pose: Vec::new(),
            character_overrides: Vec::new(),
            modeling_sessions: Vec::new(),
            topology_changes: Vec::new(),
            environment: Some(None),
            selected_targets: Vec::new(),
            environment_diagnostics: Vec::new(),
        };
        assert!(delta_to_json(&cleared)["environment"].is_null());
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
