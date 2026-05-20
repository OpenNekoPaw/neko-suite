//! WebSocket streaming endpoint
//!
//! GET /v1/streams/:stream_id — Upgrade to WebSocket for frame streaming
//!
//! Subscribes to a stream's broadcast channel in the StreamRegistry
//! and pushes binary frames to the WebSocket client.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use neko_engine_kernel::contracts::domain::FrameData;
use neko_engine_types::{FrameFormat, RenderFrameDiagnostics, StreamId};
use neko_host_api::EngineApi;
use serde::Serialize;
use std::sync::Arc;

/// GET /v1/streams/:stream_id
///
/// Upgrades to WebSocket and streams frames from the StreamRegistry.
pub async fn handle_stream_websocket(
    State(engine): State<Arc<EngineApi>>,
    Path(stream_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let stream_id = StreamId::from_string(stream_id);

    ws.on_upgrade(move |socket| handle_socket(socket, engine, stream_id))
}

async fn handle_socket(mut socket: WebSocket, engine: Arc<EngineApi>, stream_id: StreamId) {
    let stream_registry = engine.stream_registry();

    // Subscribe to the stream's broadcast channel
    let mut rx = match stream_registry.subscribe(&stream_id).await {
        Some(rx) => rx,
        None => {
            tracing::warn!("Stream {} not found, closing WebSocket", stream_id.as_str());
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4004,
                    reason: "Stream not found".into(),
                })))
                .await;
            return;
        }
    };

    tracing::debug!(
        "WebSocket client connected to stream {}",
        stream_id.as_str()
    );

    // Push frames to the WebSocket client
    loop {
        match rx.recv().await {
            Ok(frame) => {
                let diagnostics_message = create_render_frame_diagnostics_message(&frame);
                if let Some(message) = diagnostics_message {
                    match serde_json::to_string(&message) {
                        Ok(payload) => {
                            if socket.send(Message::Text(payload)).await.is_err() {
                                tracing::debug!(
                                    "WebSocket client disconnected from stream {}",
                                    stream_id.as_str()
                                );
                                break;
                            }
                        }
                        Err(error) => {
                            tracing::warn!(
                                "Failed to serialize render diagnostics for stream {}: {}",
                                stream_id.as_str(),
                                error
                            );
                        }
                    }
                }
                // Send frame data as binary WebSocket message
                if socket
                    .send(Message::Binary(frame.data.clone()))
                    .await
                    .is_err()
                {
                    tracing::debug!(
                        "WebSocket client disconnected from stream {}",
                        stream_id.as_str()
                    );
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!(
                    "WebSocket client lagged {} frames on stream {}",
                    n,
                    stream_id.as_str()
                );
                // Continue receiving — client will catch up
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                tracing::debug!(
                    "Stream {} closed, disconnecting WebSocket",
                    stream_id.as_str()
                );
                break;
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderFrameDiagnosticsMessage {
    #[serde(rename = "type")]
    message_type: &'static str,
    pts_us: i64,
    diagnostics: RenderFrameDiagnostics,
}

fn create_render_frame_diagnostics_message(
    frame: &FrameData,
) -> Option<RenderFrameDiagnosticsMessage> {
    let diagnostics = frame.diagnostics.clone()?;
    Some(RenderFrameDiagnosticsMessage {
        message_type: "renderFrameDiagnostics",
        pts_us: h264_pts_us(frame).unwrap_or_else(|| (frame.timestamp * 1_000_000.0) as i64),
        diagnostics,
    })
}

fn h264_pts_us(frame: &FrameData) -> Option<i64> {
    if frame.format != FrameFormat::H264 || frame.data.len() < 8 {
        return None;
    }
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&frame.data[0..8]);
    Some(i64::from_le_bytes(bytes))
}
