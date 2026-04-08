//! Gamepad event WebSocket stream endpoint
//!
//! GET /v1/gamepad/{stream_id} — Upgrade to WebSocket for real-time gamepad event JSON push
//!
//! Protocol:
//!   Server → Client: JSON GamepadEvent per button/axis change
//!   Client → Server: any message closes the stream

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use neko_host_api::EngineApi;
use std::sync::Arc;

/// GET /v1/gamepad/{stream_id}
pub async fn handle_gamepad_stream(
    State(engine): State<Arc<EngineApi>>,
    Path(stream_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| gamepad_stream_loop(socket, engine, stream_id))
}

async fn gamepad_stream_loop(mut socket: WebSocket, engine: Arc<EngineApi>, stream_id: String) {
    let mut rx = match engine.gamepad_service().subscribe(&stream_id) {
        Some(rx) => rx,
        None => {
            tracing::warn!("Gamepad stream not found: {stream_id}");
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4404,
                    reason: "Gamepad stream not found".into(),
                })))
                .await;
            return;
        }
    };

    tracing::info!("Gamepad WebSocket connected: {stream_id}");

    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(gp_event) => {
                        let json = match serde_json::to_string(&gp_event) {
                            Ok(j) => j,
                            Err(e) => {
                                tracing::error!("Gamepad event serialization error: {e}");
                                break;
                            }
                        };
                        if socket.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::debug!("Gamepad stream lagged by {n} events");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }

    tracing::info!("Gamepad WebSocket disconnected: {stream_id}");
}
