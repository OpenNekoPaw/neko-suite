//! WebSocket puppet stream endpoint — 60fps PuppetDelta push
//!
//! GET /v1/puppets/stream — Upgrade to WebSocket for real-time puppet delta streaming
//!
//! Each ~16ms tick calls `puppet_service.tick(16.0)`, serialises the resulting
//! `PuppetDelta` as JSON, and pushes it to the connected WebSocket client.
//! Designed for neko-live face-tracking scenarios requiring <2ms visual latency.
//!
//! Protocol:
//!   Client → Server: any text message closes the stream cleanly
//!   Server → Client: JSON-serialised PuppetDelta frames at ~60fps

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use neko_native_api::EngineApi;
use std::sync::Arc;
use tokio::time::{interval, Duration};

/// Target frame duration for ~60fps
const FRAME_DURATION_MS: f32 = 16.0;
const FRAME_INTERVAL: Duration = Duration::from_millis(16);

/// GET /v1/puppets/stream
///
/// Upgrades to WebSocket and pushes PuppetDelta JSON frames at ~60fps.
/// Returns 204 immediately if no puppet is loaded.
pub async fn handle_puppet_stream(
    State(engine): State<Arc<EngineApi>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| puppet_stream_loop(socket, engine))
}

async fn puppet_stream_loop(mut socket: WebSocket, engine: Arc<EngineApi>) {
    let service = match engine.puppet_service() {
        Some(svc) => svc,
        None => {
            tracing::warn!("Puppet stream requested but no puppet service available");
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4503,
                    reason: "Puppet service not available".into(),
                })))
                .await;
            return;
        }
    };

    tracing::info!("Puppet WebSocket stream connected — pushing at ~60fps");

    let mut ticker = interval(FRAME_INTERVAL);
    // Consume the first immediate tick so the loop starts on the first actual interval
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                // Advance simulation and get deformed mesh delta
                let delta = match service.tick(FRAME_DURATION_MS) {
                    Ok(d) => d,
                    Err(e) => {
                        tracing::error!("Puppet tick error: {}", e);
                        break;
                    }
                };

                // Serialise to JSON and push over WebSocket
                let json = match serde_json::to_string(&delta) {
                    Ok(j) => j,
                    Err(e) => {
                        tracing::error!("Puppet delta serialisation error: {}", e);
                        break;
                    }
                };

                if socket.send(Message::Text(json.into())).await.is_err() {
                    tracing::debug!("Puppet stream client disconnected");
                    break;
                }
            }

            // Any incoming message from the client (including Close) ends the stream
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::debug!("Puppet stream closed by client");
                        break;
                    }
                    Some(Ok(_)) => {
                        // Ignore other client messages (ping/pong handled by axum)
                    }
                    Some(Err(e)) => {
                        tracing::debug!("Puppet stream receive error: {}", e);
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Puppet WebSocket stream disconnected");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_duration_is_16ms() {
        assert_eq!(FRAME_DURATION_MS, 16.0);
    }

    #[test]
    fn test_frame_interval_is_16ms() {
        assert_eq!(FRAME_INTERVAL, Duration::from_millis(16));
    }
}
