//! Scene modeling WebSocket endpoint.
//!
//! GET /v1/scenes/modeling/:session_id — binary VertexBrushPatch side channel.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use neko_engine_kernel::contracts::scene::VertexBrushPatchMetadata;
use neko_host_api::EngineApi;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

const BRUSH_PROTOCOL: &str = "neko-vertex-brush-v1";
const HEADER_LEN_BYTES: usize = 4;

pub async fn handle_scene_modeling(
    State(engine): State<Arc<EngineApi>>,
    Path(session_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| scene_modeling_loop(socket, engine, session_id))
}

async fn scene_modeling_loop(mut socket: WebSocket, engine: Arc<EngineApi>, session_id: String) {
    tracing::info!(session_id, "Scene modeling WebSocket connected");

    while let Some(message) = socket.recv().await {
        match message {
            Ok(Message::Binary(frame)) => {
                let response = apply_modeling_binary_frame(&engine, &session_id, &frame);
                let message = match response {
                    Ok(value) => value,
                    Err(error) => json!({
                        "type": "brushPatchAck",
                        "sessionId": session_id,
                        "status": "rejected",
                        "error": error
                    }),
                };
                if socket
                    .send(Message::Text(message.to_string()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Ok(Message::Text(_)) => {
                if socket
                    .send(Message::Text(
                        json!({
                            "type": "error",
                            "error": "scene modeling endpoint accepts binary VertexBrushPatch frames only"
                        })
                        .to_string(),
                    ))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => continue,
        }
    }

    tracing::info!(session_id, "Scene modeling WebSocket disconnected");
}

pub(crate) fn apply_modeling_binary_frame(
    engine: &EngineApi,
    session_id: &str,
    frame: &[u8],
) -> Result<Value, String> {
    let decoded = decode_vertex_brush_patch_frame(frame)?;
    if decoded.metadata.session_id != session_id {
        return Err(format!(
            "session id mismatch: route {session_id}, frame {}",
            decoded.metadata.session_id
        ));
    }
    if decoded.payload_len != decoded.metadata.payload_byte_len {
        return Err(format!(
            "payload length mismatch: header {}, frame {}",
            decoded.metadata.payload_byte_len, decoded.payload_len
        ));
    }

    let service = engine
        .scene_service()
        .ok_or_else(|| "scene service is not available".to_string())?;
    let outcome = service
        .apply_vertex_brush_patch(decoded.metadata)
        .map_err(|error| error.to_string())?;

    Ok(json!({
        "type": "brushPatchAck",
        "sessionId": session_id,
        "seq": decoded.seq,
        "status": "applied",
        "dirtyRegion": outcome.dirty_region,
        "coalescedPreviousPatch": outcome.coalesced_previous_patch,
        "queuedPatchCount": outcome.queued_patch_count
    }))
}

#[derive(Debug, Clone)]
struct DecodedBrushPatchFrame {
    metadata: VertexBrushPatchMetadata,
    seq: u64,
    payload_len: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrushPatchHeader {
    protocol: String,
    session_id: String,
    mesh_id: String,
    topology_version: u64,
    stroke_id: String,
    seq: u64,
    encoding: String,
    #[serde(default)]
    sparse_indices: Vec<u32>,
    affected_start: Option<u32>,
    affected_count: Option<u32>,
    payload_byte_length: usize,
}

fn decode_vertex_brush_patch_frame(frame: &[u8]) -> Result<DecodedBrushPatchFrame, String> {
    if frame.len() < HEADER_LEN_BYTES {
        return Err("brush patch frame is too short".to_string());
    }
    let header_len = u32::from_be_bytes([frame[0], frame[1], frame[2], frame[3]]) as usize;
    let header_start = HEADER_LEN_BYTES;
    let payload_start = header_start
        .checked_add(header_len)
        .ok_or_else(|| "brush patch header length overflows".to_string())?;
    if frame.len() < payload_start {
        return Err("brush patch frame header is truncated".to_string());
    }

    let header: BrushPatchHeader = serde_json::from_slice(&frame[header_start..payload_start])
        .map_err(|error| format!("invalid brush patch header: {error}"))?;
    if header.protocol != BRUSH_PROTOCOL {
        return Err(format!(
            "unsupported brush patch protocol: {}",
            header.protocol
        ));
    }
    let payload_len = frame.len() - payload_start;
    let seq = header.seq;

    Ok(DecodedBrushPatchFrame {
        metadata: VertexBrushPatchMetadata {
            session_id: header.session_id,
            mesh_id: header.mesh_id,
            topology_version: header.topology_version,
            stroke_id: header.stroke_id,
            seq,
            encoding: header.encoding,
            sparse_indices: header.sparse_indices,
            affected_start: header.affected_start,
            affected_count: header.affected_count,
            payload_byte_len: header.payload_byte_length,
        },
        seq,
        payload_len,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(session_id: &str, seq: u64) -> Vec<u8> {
        let payload = [1_u8, 2, 3, 4];
        let header = json!({
            "protocol": BRUSH_PROTOCOL,
            "sessionId": session_id,
            "meshId": "mesh-a",
            "topologyVersion": 1,
            "strokeId": "stroke-a",
            "seq": seq,
            "encoding": "f32-delta",
            "sparseIndices": [2, 3],
            "payloadByteLength": payload.len()
        })
        .to_string();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&(header.len() as u32).to_be_bytes());
        bytes.extend_from_slice(header.as_bytes());
        bytes.extend_from_slice(&payload);
        bytes
    }

    #[test]
    fn decodes_vertex_brush_patch_binary_frame() {
        let decoded = decode_vertex_brush_patch_frame(&frame("session-a", 7)).unwrap();

        assert_eq!(decoded.metadata.session_id, "session-a");
        assert_eq!(decoded.metadata.mesh_id, "mesh-a");
        assert_eq!(decoded.metadata.sparse_indices, vec![2, 3]);
        assert_eq!(decoded.payload_len, 4);
    }

    #[tokio::test]
    async fn applies_binary_patch_to_scene_modeling_manager() {
        let engine = EngineApi::without_gpu().unwrap();
        engine
            .scene_service()
            .unwrap()
            .begin_modeling_session(
                "session-a".to_string(),
                "mesh-a".to_string(),
                None,
                true,
                "before".to_string(),
            )
            .unwrap();

        let response =
            apply_modeling_binary_frame(&engine, "session-a", &frame("session-a", 7)).unwrap();

        assert_eq!(response["status"], "applied");
        assert_eq!(response["seq"], 7);
        assert_eq!(response["dirtyRegion"]["meshId"], "mesh-a");
    }
}
