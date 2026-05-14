//! Puppet control WebSocket endpoint.
//!
//! GET /v1/puppets/control — JSON control plane for 2D puppet editing.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use neko_engine_types::{PuppetCommandAck, PuppetCommandEnvelope};
use neko_host_api::EngineApi;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

const PROTOCOL: &str = "neko-puppet-control-v1";

/// Upgrade to the puppet control WebSocket protocol.
pub async fn handle_puppet_control(
    State(engine): State<Arc<EngineApi>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| puppet_control_loop(socket, engine))
}

async fn puppet_control_loop(mut socket: WebSocket, engine: Arc<EngineApi>) {
    tracing::info!("Puppet control WebSocket connected");

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

        let client_message = match serde_json::from_str::<PuppetControlClientMessage>(&message) {
            Ok(message) => message,
            Err(error) => {
                if !send_error(
                    &mut socket,
                    &format!("invalid puppet control message: {error}"),
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

    tracing::info!("Puppet control WebSocket disconnected");
}

async fn handle_client_message(
    socket: &mut WebSocket,
    engine: &EngineApi,
    message: PuppetControlClientMessage,
) -> bool {
    match message {
        PuppetControlClientMessage::Hello { last_revision } => {
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
        PuppetControlClientMessage::Command { envelope } => {
            let service = match engine.puppet_service() {
                Some(service) => service,
                None => return send_error(socket, "puppet service is not available").await,
            };
            let ack = match service.apply_puppet_command(envelope) {
                Ok(ack) => ack,
                Err(error) => return send_error(socket, &error.to_string()).await,
            };
            send_json(socket, json!({ "type": "ack", "ack": ack_to_json(&ack) })).await
        }
        PuppetControlClientMessage::Snapshot { request_id } => {
            let service = match engine.puppet_service() {
                Some(service) => service,
                None => return send_error(socket, "puppet service is not available").await,
            };
            let snapshot = match service.get_snapshot() {
                Ok(snapshot) => snapshot,
                Err(error) => return send_error(socket, &error.to_string()).await,
            };
            send_json(
                socket,
                json!({
                    "type": "snapshot",
                    "requestId": request_id,
                    "revision": current_revision(engine),
                    "snapshot": snapshot
                }),
            )
            .await
        }
        PuppetControlClientMessage::Heartbeat { nonce } => {
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

fn current_revision(engine: &EngineApi) -> u64 {
    engine
        .puppet_service()
        .and_then(|service| service.current_revision().ok())
        .unwrap_or(0)
}

fn ack_to_json(ack: &PuppetCommandAck) -> Value {
    serde_json::to_value(ack).unwrap_or_else(|error| {
        json!({
            "seq": ack.seq,
            "appliedSeq": ack.applied_seq,
            "baseRevision": ack.base_revision,
            "revision": ack.revision,
            "status": "rejected",
            "error": {
                "code": "applyFailed",
                "message": format!("failed to serialize puppet ack: {error}")
            }
        })
    })
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
            tracing::error!("Puppet control serialization error: {error}");
            false
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum PuppetControlClientMessage {
    Hello {
        #[serde(default, rename = "lastRevision")]
        last_revision: Option<u64>,
    },
    Command {
        envelope: PuppetCommandEnvelope,
    },
    Snapshot {
        #[serde(default, rename = "requestId")]
        request_id: Option<String>,
    },
    Heartbeat {
        #[serde(default)]
        nonce: Option<String>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::{PuppetCommandAckStatus, PuppetCommandError, PuppetCommandErrorCode};

    #[test]
    fn ack_json_uses_camel_case_contract() {
        let ack = PuppetCommandAck {
            seq: 7,
            applied_seq: 0,
            base_revision: 2,
            revision: 3,
            status: PuppetCommandAckStatus::Rejected,
            result: None,
            error: Some(PuppetCommandError::revision_conflict("stale revision")),
        };

        let json = ack_to_json(&ack);

        assert_eq!(json["seq"], 7);
        assert_eq!(json["appliedSeq"], 0);
        assert_eq!(json["baseRevision"], 2);
        assert_eq!(json["revision"], 3);
        assert_eq!(json["status"], "rejected");
        assert_eq!(json["error"]["code"], "revisionConflict");
        assert_eq!(
            ack.error.as_ref().map(|error| error.code),
            Some(PuppetCommandErrorCode::RevisionConflict)
        );
    }
}
