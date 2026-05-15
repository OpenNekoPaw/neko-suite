//! Gamepad service contracts for runtime-device.

use crate::error::Result;
use async_trait::async_trait;
use serde::Serialize;
use tokio::sync::broadcast;

/// Gamepad info.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamepadInfo {
    pub id: String,
    pub name: String,
    pub connected: bool,
}

/// Gamepad event pushed via WebSocket JSON.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamepadEvent {
    pub timestamp_us: i64,
    pub gamepad_id: String,
    pub kind: String,
    pub button: Option<String>,
    pub axis: Option<String>,
    pub value: f32,
}

/// Gamepad service interface.
#[async_trait]
pub trait IGamepadService: Send + Sync {
    /// List connected gamepads.
    fn list(&self) -> Vec<GamepadInfo>;

    /// Subscribe to events for a connected gamepad stream.
    fn subscribe(&self, stream_id: &str) -> Option<broadcast::Receiver<GamepadEvent>>;

    /// Start listening to a gamepad, returns stream ID.
    async fn connect(&self, gamepad_id: &str) -> Result<String>;

    /// Stop listening to a gamepad.
    async fn disconnect(&self, stream_id: &str) -> Result<()>;
}
