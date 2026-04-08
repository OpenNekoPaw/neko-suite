//! GamepadController - handles gamepad:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{GamepadService, IGamepadService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

pub struct GamepadController {
    gamepad_service: Arc<GamepadService>,
}

impl GamepadController {
    pub fn new(gamepad_service: Arc<GamepadService>) -> Self {
        Self { gamepad_service }
    }

    /// Get the gamepad service for WebSocket stream subscription
    pub fn gamepad_service(&self) -> &Arc<GamepadService> {
        &self.gamepad_service
    }
}

impl Controller for GamepadController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "list" => {
                let gamepads = self.gamepad_service.list();
                let response = serde_json::to_value(&gamepads)?;
                Ok(ActionResponse::ok("", response))
            }
            "connect" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct ConnectOptions {
                    gamepad_id: Option<String>,
                }

                let opts: ConnectOptions = serde_json::from_value(options).unwrap_or_default();

                let gamepad_id = opts
                    .gamepad_id
                    .ok_or_else(|| ApiError::InvalidRequest("gamepadId required".to_string()))?;

                let stream_id = self.gamepad_service.connect(&gamepad_id).await?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "wsUrl": format!("/v1/gamepad/{stream_id}"),
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

                self.gamepad_service.disconnect(&stream_id).await?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "success": true }),
                ))
            }
            _ => Err(ApiError::UnknownAction {
                group: "gamepad".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::GAMEPAD
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::GAMEPAD
    }
}
