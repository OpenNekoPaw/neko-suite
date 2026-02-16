//! MediaController - handles media:* actions
//!
//! Unified A/V fMP4 streaming for media files.
//! - start: Start fMP4 stream for a media file
//! - stop: Stop a running stream
//! - pause: Pause playback
//! - resume: Resume playback
//! - seek: Seek to a specific time
//! - speed: Set playback speed

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::StreamRegistry;
use neko_native_core::domain::{StreamCodec, StreamConfig};
use neko_native_core::services::{IMediaStreamService, MediaStreamService};
use neko_types::{ActionResponse, Resolution, StreamId};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// Controller for unified A/V fMP4 media streaming
pub struct MediaController {
    media_service: Arc<MediaStreamService>,
    stream_registry: Arc<StreamRegistry>,
}

impl MediaController {
    pub fn new(
        media_service: Arc<MediaStreamService>,
        stream_registry: Arc<StreamRegistry>,
    ) -> Self {
        Self {
            media_service,
            stream_registry,
        }
    }
}

/// Options for media:start
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StartOptions {
    /// Session ID (required)
    session_id: Option<String>,
    /// Source file path (required)
    source: Option<String>,
    /// Resource ID to associate
    resource_id: Option<String>,
}

/// Options for media:seek
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SeekOptions {
    /// Time in seconds
    time: Option<f64>,
}

/// Options for media:speed
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SpeedOptions {
    /// Playback speed multiplier
    speed: Option<f64>,
}

impl Controller for MediaController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "start" => {
                let opts: StartOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let session_id = opts.session_id.ok_or_else(|| {
                    ApiError::InvalidRequest("sessionId is required for media:start".into())
                })?;

                let source = opts.source.ok_or_else(|| {
                    ApiError::InvalidRequest("source is required for media:start".into())
                })?;

                let res_id = opts
                    .resource_id
                    .or_else(|| resource_id.map(|s| s.to_string()))
                    .unwrap_or_else(|| format!("media_{}", &session_id));

                // Start the fMP4 stream via MediaStreamService
                let (stream_id, rx) = self
                    .media_service
                    .start_stream(Path::new(&source), &session_id)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to start media stream: {}", e)))?;

                // Register in StreamRegistry so WebSocket can subscribe
                let config = StreamConfig {
                    resolution: Resolution::new(0, 0), // fMP4 carries its own resolution
                    fps: 0.0,
                    start_time: 0.0,
                    codec: StreamCodec::H264,
                };

                let cancel_token = tokio_util::sync::CancellationToken::new();
                let _registry_rx = self
                    .stream_registry
                    .register_external_stream(
                        stream_id.clone(),
                        &session_id,
                        &res_id,
                        config,
                        rx,
                        cancel_token,
                    )
                    .await;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "sessionId": session_id,
                    "resourceId": res_id,
                    "wsEndpoint": format!("/v1/streams/{}", stream_id.as_str()),
                    "format": "fmp4",
                    "state": "active",
                });

                Ok(ActionResponse::ok("", response))
            }

            "stop" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id is required for media:stop".into())
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.media_service
                    .stop_stream(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to stop: {}", e)))?;

                self.stream_registry
                    .destroy(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                Ok(ActionResponse::ok("", serde_json::json!({
                    "streamId": stream_id,
                    "state": "destroyed",
                })))
            }

            "pause" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id is required for media:pause".into())
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.media_service
                    .pause(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to pause: {}", e)))?;

                self.stream_registry
                    .pause(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                Ok(ActionResponse::ok("", serde_json::json!({
                    "streamId": stream_id,
                    "state": "paused",
                })))
            }

            "resume" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id is required for media:resume".into())
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.media_service
                    .resume(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to resume: {}", e)))?;

                self.stream_registry
                    .resume(&sid)
                    .await
                    .map_err(|e| ApiError::StreamError(e.to_string()))?;

                Ok(ActionResponse::ok("", serde_json::json!({
                    "streamId": stream_id,
                    "state": "active",
                })))
            }

            "seek" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id is required for media:seek".into())
                })?;

                let opts: SeekOptions =
                    serde_json::from_value(options).unwrap_or_default();
                let time = opts.time.ok_or_else(|| {
                    ApiError::InvalidRequest("time is required for media:seek".into())
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.media_service
                    .seek(&sid, time)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to seek: {}", e)))?;

                Ok(ActionResponse::ok("", serde_json::json!({
                    "streamId": stream_id,
                    "time": time,
                })))
            }

            "speed" => {
                let stream_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id is required for media:speed".into())
                })?;

                let opts: SpeedOptions =
                    serde_json::from_value(options).unwrap_or_default();
                let speed = opts.speed.ok_or_else(|| {
                    ApiError::InvalidRequest("speed is required for media:speed".into())
                })?;

                let sid = StreamId::from_string(stream_id.to_string());
                self.media_service
                    .set_speed(&sid, speed)
                    .await
                    .map_err(|e| ApiError::StreamError(format!("Failed to set speed: {}", e)))?;

                Ok(ActionResponse::ok("", serde_json::json!({
                    "streamId": stream_id,
                    "speed": speed,
                })))
            }

            _ => Err(ApiError::UnknownAction {
                group: "media".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "media"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["start", "stop", "pause", "resume", "seek", "speed"]
    }
}
