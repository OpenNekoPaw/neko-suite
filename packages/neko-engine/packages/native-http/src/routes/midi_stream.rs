//! MIDI event WebSocket stream endpoint
//!
//! GET /v1/midi/{stream_id} — Upgrade to WebSocket for real-time MIDI event JSON push
//!
//! Protocol:
//!   Server → Client: JSON MidiEvent per MIDI message
//!   Client → Server: any message closes the stream

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use neko_native_api::EngineApi;
use std::sync::Arc;

/// GET /v1/midi/{stream_id}
pub async fn handle_midi_stream(
    State(engine): State<Arc<EngineApi>>,
    Path(stream_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| midi_stream_loop(socket, engine, stream_id))
}

async fn midi_stream_loop(mut socket: WebSocket, engine: Arc<EngineApi>, stream_id: String) {
    let mut rx = match engine.midi_service().subscribe(&stream_id) {
        Some(rx) => rx,
        None => {
            tracing::warn!("MIDI stream not found: {stream_id}");
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4404,
                    reason: "MIDI stream not found".into(),
                })))
                .await;
            return;
        }
    };

    tracing::info!("MIDI WebSocket connected: {stream_id}");

    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(midi_event) => {
                        let json = match serde_json::to_string(&midi_event) {
                            Ok(j) => j,
                            Err(e) => {
                                tracing::error!("MIDI event serialization error: {e}");
                                break;
                            }
                        };
                        if socket.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::debug!("MIDI stream lagged by {n} events");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {} // ignore pings etc
                    Some(Err(_)) => break,
                }
            }
        }
    }

    tracing::info!("MIDI WebSocket disconnected: {stream_id}");
}
