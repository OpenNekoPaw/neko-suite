//! CameraController - handles cameras:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{CameraService, ICameraService};
use neko_native_core::services::camera::CameraCaptureConfig;
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

pub struct CameraController {
    camera_service: Arc<CameraService>,
}

impl CameraController {
    pub fn new(camera_service: Arc<CameraService>) -> Self {
        Self { camera_service }
    }
}

impl Controller for CameraController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "list_devices" => {
                let devices = self.camera_service.list_devices();
                let response = serde_json::to_value(&devices)?;
                Ok(ActionResponse::ok("", response))
            }
            "capture_start" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct CaptureStartOptions {
                    device_id: Option<String>,
                    resolution_width: Option<u32>,
                    resolution_height: Option<u32>,
                    fps: Option<f64>,
                }

                let opts: CaptureStartOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let config = CameraCaptureConfig {
                    resolution_width: opts.resolution_width.unwrap_or(1280),
                    resolution_height: opts.resolution_height.unwrap_or(720),
                    fps: opts.fps.unwrap_or(30.0),
                };

                let stream_id = self
                    .camera_service
                    .capture_start(opts.device_id.as_deref(), config)
                    .await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                });
                Ok(ActionResponse::ok("", response))
            }
            "capture_stop" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct CaptureStopOptions {
                    stream_id: Option<String>,
                }

                let opts: CaptureStopOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("streamId required".to_string())
                })?;

                self.camera_service.capture_stop(&stream_id).await?;
                Ok(ActionResponse::ok("", serde_json::json!({ "success": true })))
            }
            _ => Err(ApiError::UnknownAction {
                group: "cameras".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::CAMERAS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::CAMERAS
    }
}
