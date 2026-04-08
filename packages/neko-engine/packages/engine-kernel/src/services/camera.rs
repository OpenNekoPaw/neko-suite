//! Camera service trait

use crate::error::Result;
use neko_types::StreamId;
use serde::Serialize;

/// Camera device info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Camera capture config
#[derive(Debug, Clone)]
pub struct CameraCaptureConfig {
    pub resolution_width: u32,
    pub resolution_height: u32,
    pub fps: f64,
}

impl Default for CameraCaptureConfig {
    fn default() -> Self {
        Self {
            resolution_width: 1280,
            resolution_height: 720,
            fps: 30.0,
        }
    }
}

/// Camera service interface
#[allow(async_fn_in_trait)]
pub trait ICameraService: Send + Sync {
    /// List available camera devices
    fn list_devices(&self) -> Vec<CameraDevice>;

    /// Start camera capture, returns stream ID for WebSocket subscription
    async fn capture_start(
        &self,
        device_id: Option<&str>,
        config: CameraCaptureConfig,
    ) -> Result<StreamId>;

    /// Stop camera capture
    async fn capture_stop(&self, stream_id: &str) -> Result<()>;
}
