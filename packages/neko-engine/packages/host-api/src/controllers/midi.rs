//! MidiController - handles midi:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::services::IMidiService;
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use neko_runtime_device::MidiService;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

pub struct MidiController {
    midi_service: Arc<MidiService>,
}

impl MidiController {
    pub fn new(midi_service: Arc<MidiService>) -> Self {
        Self { midi_service }
    }

    /// Get the midi service for WebSocket stream subscription
    pub fn midi_service(&self) -> &Arc<MidiService> {
        &self.midi_service
    }
}

impl Controller for MidiController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "list_ports" => {
                let ports = self.midi_service.list_ports();
                let response = serde_json::to_value(&ports)?;
                Ok(ActionResponse::ok("", response))
            }
            "connect" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct ConnectOptions {
                    port_id: Option<String>,
                }

                let opts: ConnectOptions = serde_json::from_value(options).unwrap_or_default();

                let port_id = opts.port_id.ok_or_else(|| {
                    ApiError::InvalidRequest("portId required for midi:connect".to_string())
                })?;

                let stream_id = self.midi_service.connect(&port_id).await?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "wsUrl": format!("/v1/midi/{stream_id}"),
                });
                Ok(ActionResponse::ok("", response))
            }
            "disconnect" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct DisconnectOptions {
                    stream_id: Option<String>,
                }

                let opts: DisconnectOptions = serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts
                    .stream_id
                    .ok_or_else(|| ApiError::InvalidRequest("streamId required".to_string()))?;

                self.midi_service.disconnect(&stream_id).await?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "success": true }),
                ))
            }
            _ => Err(ApiError::UnknownAction {
                group: "midi".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::MIDI
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::MIDI
    }
}
