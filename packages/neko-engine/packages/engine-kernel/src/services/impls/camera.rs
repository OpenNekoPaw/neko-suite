//! CameraService implementation
//!
//! Camera capture via FFmpeg avdevice (cross-platform).
//! Placeholder — full implementation requires avdevice integration.

use crate::error::{Error, Result};
use crate::services::camera::{CameraCaptureConfig, CameraDevice, ICameraService};
use neko_engine_types::StreamId;

pub struct CameraService;

impl Default for CameraService {
    fn default() -> Self {
        Self::new()
    }
}

impl CameraService {
    pub fn new() -> Self {
        Self
    }
}

impl ICameraService for CameraService {
    fn list_devices(&self) -> Vec<CameraDevice> {
        // TODO(P2): enumerate via FFmpeg avdevice or nokhwa
        // For now return empty list — camera support requires platform-specific setup
        tracing::info!("Camera device enumeration not yet implemented");
        Vec::new()
    }

    async fn capture_start(
        &self,
        _device_id: Option<&str>,
        _config: CameraCaptureConfig,
    ) -> Result<StreamId> {
        // TODO(P2): implement camera capture pipeline
        Err(Error::Other(
            "Camera capture not yet implemented".to_string(),
        ))
    }

    async fn capture_stop(&self, _stream_id: &str) -> Result<()> {
        Err(Error::Other(
            "Camera capture not yet implemented".to_string(),
        ))
    }
}
