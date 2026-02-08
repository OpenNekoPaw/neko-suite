//! StreamController - handles streams:* actions
//!
//! Manages stream lifecycle through the StreamRegistry:
//! - create: Create a new stream + auto-activate
//! - activate: Created → Active
//! - pause: Active → Paused
//! - resume: Paused → Active
//! - destroy: Any → Destroyed
//! - list: List all streams for a session

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::StreamRegistry;
use neko_native_core::domain::{StreamCodec, StreamConfig};
use neko_types::{ActionResponse, Resolution, StreamId};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Controller for stream lifecycle management
pub struct StreamController {
    stream_registry: Arc<StreamRegistry>,
}

impl StreamController {
    /// Create a new StreamController
    pub fn new(stream_registry: Arc<StreamRegistry>) -> Self {
        Self { stream_registry }
    }
}

/// Options for streams:create
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CreateOptions {
    /// Session ID (required)
    session_id: Option<String>,
    /// Resource ID to associate with the stream
    resource_id: Option<String>,
    /// Output width
    width: Option<u32>,
    /// Output height
    height: Option<u32>,
    /// Frame rate
    fps: Option<f64>,
    /// Codec: "h264" | "raw"
    codec: Option<String>,
}

/// Options for streams:list
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListOptions {
    /// Session ID to filter by
    session_id: Option<String>,
}

impl Controller for StreamController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "create" => {
                let opts: CreateOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let session_id = opts.session_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "sessionId is required for streams:create".to_string(),
                    )
                })?;

                let res_id = opts
                    .resource_id
                    .or_else(|| resource_id.map(|s| s.to_string()))
                    .unwrap_or_else(|| format!("res_{}", &session_id));

                let width = opts.width.unwrap_or(1920);
                let height = opts.height.unwrap_or(1080);
                let fps = opts.fps.unwrap_or(30.0);
                let codec = match opts.codec.as_deref() {
                    Some("raw") => StreamCodec::Raw,
                    _ => StreamCodec::H264,
                };

                let config = StreamConfig {
                    resolution: Resolution::new(width, height),
                    fps,
                    start_time: 0.0,
                    codec,
                };

                // Create the stream
                let (stream_id, _rx) = self
                    .stream_registry
                    .create_stream(&session_id, &res_id, config)
                    .await;

                // Auto-activate
                self.stream_registry.activate(&stream_id).await.map_err(
                    |e| ApiError::StreamError(format!("Failed to activate stream: {}", e)),
                )?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "sessionId": session_id,
                    "resourceId": res_id,
                    "wsEndpoint": format!("/v1/streams/{}", stream_id.as_str()),
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "activate" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "stream_id (resource_id) is required for streams:activate".to_string(),
                    )
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.stream_registry
                    .activate(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "pause" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "stream_id (resource_id) is required for streams:pause".to_string(),
                    )
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.stream_registry
                    .pause(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "paused",
                });

                Ok(ActionResponse::ok("", response))
            }

            "resume" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "stream_id (resource_id) is required for streams:resume".to_string(),
                    )
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.stream_registry
                    .resume(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "destroy" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "stream_id (resource_id) is required for streams:destroy".to_string(),
                    )
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.stream_registry
                    .destroy(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                let response = serde_json::json!({
                    "streamId": stream_id,
                    "state": "destroyed",
                });

                Ok(ActionResponse::ok("", response))
            }

            "list" => {
                let opts: ListOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let session_id = opts.session_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "sessionId is required for streams:list".to_string(),
                    )
                })?;

                let stream_ids = self
                    .stream_registry
                    .get_session_streams(&session_id)
                    .await;

                let ids: Vec<&str> = stream_ids.iter().map(|id| id.as_str()).collect();

                let response = serde_json::json!({
                    "sessionId": session_id,
                    "streams": ids,
                    "count": ids.len(),
                });

                Ok(ActionResponse::ok("", response))
            }

            _ => Err(ApiError::UnknownAction {
                group: "streams".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "streams"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["create", "activate", "pause", "resume", "destroy", "list"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> StreamController {
        let stream_registry = Arc::new(StreamRegistry::new());
        StreamController::new(stream_registry)
    }

    #[tokio::test]
    async fn test_create_stream() {
        let controller = create_test_controller();

        let options = serde_json::json!({
            "sessionId": "test-session",
            "resourceId": "vid_abc123",
            "width": 1280,
            "height": 720,
            "fps": 30.0,
        });

        let result = controller
            .handle("create", None, options, None)
            .await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());

        let data = response.data.unwrap();
        assert!(data["streamId"].as_str().unwrap().starts_with("strm_"));
        assert_eq!(data["state"], "active");
        assert!(data["wsEndpoint"].as_str().unwrap().starts_with("/v1/streams/strm_"));
    }

    #[tokio::test]
    async fn test_stream_lifecycle() {
        let controller = create_test_controller();

        // Create
        let options = serde_json::json!({
            "sessionId": "test-session",
            "resourceId": "vid_abc123",
        });
        let result = controller.handle("create", None, options, None).await.unwrap();
        let stream_id = result.data.as_ref().unwrap()["streamId"]
            .as_str()
            .unwrap()
            .to_string();

        // Pause
        let result = controller
            .handle("pause", Some(&stream_id), Value::Null, None)
            .await;
        assert!(result.is_ok());
        let data = result.unwrap().data.unwrap();
        assert_eq!(data["state"], "paused");

        // Resume
        let result = controller
            .handle("resume", Some(&stream_id), Value::Null, None)
            .await;
        assert!(result.is_ok());
        let data = result.unwrap().data.unwrap();
        assert_eq!(data["state"], "active");

        // Destroy
        let result = controller
            .handle("destroy", Some(&stream_id), Value::Null, None)
            .await;
        assert!(result.is_ok());
        let data = result.unwrap().data.unwrap();
        assert_eq!(data["state"], "destroyed");
    }

    #[tokio::test]
    async fn test_list_session_streams() {
        let controller = create_test_controller();

        // Create two streams for the same session
        let options1 = serde_json::json!({
            "sessionId": "session-1",
            "resourceId": "vid_1",
        });
        let options2 = serde_json::json!({
            "sessionId": "session-1",
            "resourceId": "vid_2",
        });

        controller.handle("create", None, options1, None).await.unwrap();
        controller.handle("create", None, options2, None).await.unwrap();

        // List
        let list_opts = serde_json::json!({ "sessionId": "session-1" });
        let result = controller
            .handle("list", None, list_opts, None)
            .await
            .unwrap();

        let data = result.data.unwrap();
        assert_eq!(data["count"], 2);
        assert_eq!(data["streams"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_create_stream_missing_session_id() {
        let controller = create_test_controller();

        let result = controller
            .handle("create", None, Value::Null, None)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.to_string().contains("sessionId"));
    }

    #[tokio::test]
    async fn test_unknown_action() {
        let controller = create_test_controller();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }
}
