//! WebSocket streaming endpoint
//!
//! GET /v1/streams/:stream_id — Upgrade to WebSocket for frame streaming
//!
//! Subscribes to a stream's broadcast channel in the StreamRegistry
//! and pushes binary frames to the WebSocket client.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use neko_engine_types::StreamId;
use neko_host_api::EngineApi;
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
