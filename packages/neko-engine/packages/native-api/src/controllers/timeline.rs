//! TimelineController - handles timelines:* actions

use crate::controllers::utils::base64_encode;
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::StreamRegistry;
use neko_native_core::domain::{StreamConfig, Timeline};
use neko_native_core::jvi::JviLoader;
use neko_native_core::media_service::{diff_media, DiffCategory};
use neko_native_core::services::{ExportService, IExportService, ITimelineService, TimelineService};
use neko_types::registry;
use neko_types::{ActionResponse, LoopRegion, Resolution, StreamId};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Controller for timeline-related actions
pub struct TimelineController {
    timeline_service: Arc<TimelineService>,
    export_service: Option<Arc<ExportService>>,
    stream_registry: Arc<StreamRegistry>,
}

impl TimelineController {
    /// Create a new TimelineController
    pub fn new(
        timeline_service: Arc<TimelineService>,
        export_service: Option<Arc<ExportService>>,
        stream_registry: Arc<StreamRegistry>,
    ) -> Self {
        Self {
            timeline_service,
            export_service,
            stream_registry,
        }
    }
}

/// Options for timelines:probe
#[derive(Debug, Deserialize, Default)]
struct ProbeRequestOptions {
    /// Source .jvi file path
    source: Option<String>,
}

/// Options for timelines:composite
#[derive(Debug, Deserialize, Default)]
struct CompositeRequestOptions {
    /// Frame number to composite
    #[serde(default)]
    frame: u64,
}

/// Options for timelines:stream
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StreamRequestOptions {
    /// Session ID
    session_id: Option<String>,
    /// Output width
    width: Option<u32>,
    /// Output height
    height: Option<u32>,
    /// Frame rate
    fps: Option<f64>,
    /// Start time in seconds
    #[serde(default)]
    start_time: f64,
    /// Base directory for resolving relative media paths (JVI format)
    base_dir: Option<String>,
}

/// Options for stream control actions (stop/pause/resume/seek/speed/loop)
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StreamControlOptions {
    /// Stream ID
    stream_id: Option<String>,
    /// Speed value (for speed action)
    speed: Option<f64>,
    /// Time in seconds (for seek action)
    time: Option<f64>,
    /// Loop in point (for loop action)
    in_point: Option<f64>,
    /// Loop out point (for loop action)
    out_point: Option<f64>,
    /// Whether to clear loop (for loop action)
    #[serde(default)]
    clear: bool,
}

/// Options for timelines:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TimelineDiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
}

impl Controller for TimelineController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "probe" => {
                let opts: ProbeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source = opts.source.as_deref().or(_resource_id).ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "source path required for timelines:probe".to_string(),
                    )
                })?;

                let path = Path::new(source);
                let info = self.timeline_service.probe(path).await?;

                Ok(ActionResponse::ok("", serde_json::to_value(info)?))
            }
            "composite" => {
                let opts: CompositeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                // Timeline must be provided in the body
                let body = body.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "Timeline data required in body for timelines:composite".to_string(),
                    )
                })?;

                let timeline: Timeline = serde_json::from_value(body).map_err(|e| {
                    ApiError::InvalidRequest(format!("Invalid timeline data: {}", e))
                })?;

                let frame_data = self
                    .timeline_service
                    .composite(&timeline, opts.frame)
                    .await?;

                let response = serde_json::json!({
                    "width": frame_data.width,
                    "height": frame_data.height,
                    "format": format!("{:?}", frame_data.format).to_lowercase(),
                    "timestamp": frame_data.timestamp,
                    "size": frame_data.data.len(),
                    "data": base64_encode(&frame_data.data),
                });

                Ok(ActionResponse::ok("", response))
            }
            "stream" => {
                let opts: StreamRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                // Timeline must be provided in the body
                let body = body.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "Timeline data required in body for timelines:stream".to_string(),
                    )
                })?;

                // Try Timeline domain format first, fallback to JVI format
                let base_dir = opts.base_dir.as_deref()
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|| std::path::PathBuf::from("."));
                let timeline: Timeline = serde_json::from_value(body.clone())
                    .or_else(|_| {
                        let json_str = serde_json::to_string(&body)
                            .map_err(|e| ApiError::InvalidRequest(format!("Invalid JSON: {}", e)))?;
                        let loader = JviLoader::new();
                        let (tl, _) = loader
                            .load_from_json(&json_str, base_dir)
                            .map_err(|e| ApiError::InvalidRequest(format!("Invalid timeline/JVI data: {}", e)))?;
                        Ok::<Timeline, ApiError>(tl)
                    })
                    .map_err(|e: ApiError| e)?;

                let session_id = opts.session_id.unwrap_or_else(|| "default".to_string());

                let config = StreamConfig {
                    resolution: Resolution::new(
                        opts.width.unwrap_or(timeline.resolution.width),
                        opts.height.unwrap_or(timeline.resolution.height),
                    ),
                    fps: opts.fps.unwrap_or(timeline.fps),
                    start_time: opts.start_time,
                    ..Default::default()
                };

                let result = self
                    .timeline_service
                    .start_stream(&timeline, &session_id, config.clone())
                    .await?;

                // Register both video and audio streams into StreamRegistry
                let cancel_token = CancellationToken::new();
                self.stream_registry
                    .register_external_stream(
                        result.video_stream_id.clone(),
                        &session_id,
                        "",
                        config.clone(),
                        result.video_rx,
                        cancel_token.clone(),
                    )
                    .await;
                self.stream_registry
                    .register_external_stream(
                        result.audio_stream_id.clone(),
                        &session_id,
                        "",
                        config,
                        result.audio_rx,
                        cancel_token,
                    )
                    .await;

                // Store stats_rx is not needed — TimelineService stores it internally.
                // Clients poll via timelines:stream_stats action.
                drop(result.stats_rx);

                let response = serde_json::json!({
                    "videoStreamId": result.video_stream_id.as_str(),
                    "audioStreamId": result.audio_stream_id.as_str(),
                    "status": "active",
                });

                Ok(ActionResponse::ok("", response))
            }
            "stop" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:stop".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                self.timeline_service.stop_stream(&stream_id).await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "status": "stopped",
                });

                Ok(ActionResponse::ok("", response))
            }
            "pause" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:pause".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                self.timeline_service.pause(&stream_id).await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "status": "paused",
                });

                Ok(ActionResponse::ok("", response))
            }
            "resume" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:resume".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                self.timeline_service.resume(&stream_id).await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "status": "active",
                });

                Ok(ActionResponse::ok("", response))
            }
            "speed" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:speed".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                let speed = opts.speed.ok_or_else(|| {
                    ApiError::InvalidRequest("speed value required for timelines:speed".to_string())
                })?;

                self.timeline_service.set_speed(&stream_id, speed).await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "speed": speed,
                });

                Ok(ActionResponse::ok("", response))
            }
            "loop" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:loop".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                let region = if opts.clear {
                    None
                } else {
                    match (opts.in_point, opts.out_point) {
                        (Some(in_pt), Some(out_pt)) => Some(LoopRegion::new(in_pt, out_pt)),
                        _ => {
                            return Err(ApiError::InvalidRequest(
                                "in_point and out_point required for timelines:loop (or set clear=true)".to_string(),
                            ));
                        }
                    }
                };

                self.timeline_service.set_loop(&stream_id, region.clone()).await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "loop": region.map(|r| serde_json::json!({
                        "inPoint": r.in_point,
                        "outPoint": r.out_point,
                    })),
                });

                Ok(ActionResponse::ok("", response))
            }
            "seek" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:seek".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                let time = opts.time.ok_or_else(|| {
                    ApiError::InvalidRequest("time required for timelines:seek".to_string())
                })?;

                self.timeline_service.seek(&stream_id, time).await?;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "time": time,
                });

                Ok(ActionResponse::ok("", response))
            }
            "stream_stats" => {
                let opts: StreamControlOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let stream_id = opts.stream_id.ok_or_else(|| {
                    ApiError::InvalidRequest("stream_id required for timelines:stream_stats".to_string())
                })?;
                let stream_id = StreamId::from_string(stream_id);

                match self.timeline_service.get_stream_stats(&stream_id).await {
                    Some(stats) => {
                        Ok(ActionResponse::ok(
                            stream_id.as_str(),
                            serde_json::to_value(stats)?,
                        ))
                    }
                    None => Err(ApiError::NotFound(format!(
                        "No stats for stream '{}'",
                        stream_id.as_str()
                    ))),
                }
            }
            "export" => {
                let export_service = self.export_service.as_ref().ok_or_else(|| {
                    ApiError::ServiceError(
                        "Export service not available (GPU required)".to_string(),
                    )
                })?;

                let config_value = body
                    .or_else(|| {
                        if options.is_object() && !options.is_null() {
                            Some(options.clone())
                        } else {
                            None
                        }
                    })
                    .ok_or_else(|| {
                        ApiError::InvalidRequest(
                            "timelines:export requires ExportJobConfig in body or options"
                                .to_string(),
                        )
                    })?;

                let config: neko_native_core::export::ExportJobConfig =
                    serde_json::from_value(config_value).map_err(|e| {
                        ApiError::InvalidRequest(format!("Invalid ExportJobConfig: {}", e))
                    })?;

                let response = export_service.start(config).await.map_err(|e| {
                    ApiError::ServiceError(format!("Failed to start export: {}", e))
                })?;

                Ok(ActionResponse::ok("", serde_json::to_value(response)?))
            }
            "export_progress" => {
                let export_service = self.export_service.as_ref().ok_or_else(|| {
                    ApiError::ServiceError(
                        "Export service not available (GPU required)".to_string(),
                    )
                })?;

                let job_id = _resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "job_id required for timelines:export_progress".to_string(),
                    )
                })?;

                match export_service.progress(job_id).await {
                    Some(progress) => {
                        Ok(ActionResponse::ok(job_id, serde_json::to_value(progress)?))
                    }
                    None => Err(ApiError::NotFound(format!(
                        "Export job '{}' not found",
                        job_id
                    ))),
                }
            }
            "export_cancel" => {
                let export_service = self.export_service.as_ref().ok_or_else(|| {
                    ApiError::ServiceError(
                        "Export service not available (GPU required)".to_string(),
                    )
                })?;

                let job_id = _resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "job_id required for timelines:export_cancel".to_string(),
                    )
                })?;

                let cancelled = export_service.cancel(job_id).await.map_err(|e| {
                    ApiError::ServiceError(format!("Failed to cancel export: {}", e))
                })?;

                Ok(ActionResponse::ok(
                    job_id,
                    serde_json::json!({ "cancelled": cancelled }),
                ))
            }
            "diff" => {
                let opts: TimelineDiffRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for timelines:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for timelines:diff".to_string())
                })?;

                let result = diff_media(&source_a, &source_b, DiffCategory::Timeline)
                    .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))?;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "timelines".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::TIMELINES
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::TIMELINES
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::StreamRegistry;
    use neko_native_core::services::TaskService;

    fn create_test_controller() -> TimelineController {
        let task_service = Arc::new(TaskService::new());
        let timeline_service = Arc::new(TimelineService::new(None, task_service));
        let stream_registry = Arc::new(StreamRegistry::new());
        TimelineController::new(timeline_service, None, stream_registry)
    }

    #[tokio::test]
    async fn test_timeline_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_controller_composite_missing_body() {
        let controller = create_test_controller();

        let result = controller
            .handle("composite", None, Value::Null, None)
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Timeline data required"));
    }

    #[tokio::test]
    async fn test_timeline_controller_composite_invalid_body() {
        let controller = create_test_controller();

        let body = serde_json::json!({ "invalid": true });
        let result = controller
            .handle("composite", None, Value::Null, Some(body))
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Invalid timeline data"));
    }

    #[tokio::test]
    async fn test_timeline_controller_composite_no_gpu() {
        let controller = create_test_controller();

        // Valid timeline body but no GPU context
        let body = serde_json::json!({
            "duration": 10.0,
            "resolution": { "width": 1920, "height": 1080 },
            "fps": 30.0,
            "tracks": []
        });

        let result = controller
            .handle("composite", None, Value::Null, Some(body))
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_timeline_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();

        assert!(actions.contains(&"probe"));
        assert!(actions.contains(&"composite"));
        assert!(actions.contains(&"stream"));
        assert!(actions.contains(&"stop"));
        assert!(actions.contains(&"pause"));
        assert!(actions.contains(&"resume"));
        assert!(actions.contains(&"speed"));
        assert!(actions.contains(&"loop"));
        assert!(actions.contains(&"seek"));
        assert!(actions.contains(&"diff"));
        assert!(actions.contains(&"export"));
        assert!(actions.contains(&"export_progress"));
        assert!(actions.contains(&"export_cancel"));
        assert!(actions.contains(&"stream_stats"));
        assert_eq!(actions.len(), 14);
    }

    #[tokio::test]
    async fn test_timeline_controller_export_no_gpu() {
        let controller = create_test_controller();

        let body = serde_json::json!({
            "timeline": {},
            "output": "/tmp/test.mp4"
        });

        let result = controller
            .handle("export", None, Value::Null, Some(body))
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Export service not available"));
    }

    #[tokio::test]
    async fn test_timeline_controller_export_missing_body() {
        let controller = create_test_controller();

        let result = controller
            .handle("export", None, Value::Null, None)
            .await;

        // Without GPU, it should fail on export_service check first
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_controller_probe_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("probe", None, Value::Null, None)
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("source path required"));
    }

    #[tokio::test]
    async fn test_timeline_controller_probe_nonexistent_file() {
        let controller = create_test_controller();

        let opts = serde_json::json!({ "source": "/nonexistent/file.jvi" });
        let result = controller
            .handle("probe", None, opts, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_controller_export_progress_no_gpu() {
        let controller = create_test_controller();

        let result = controller
            .handle("export_progress", Some("test-job-id"), Value::Null, None)
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Export service not available"));
    }

    #[tokio::test]
    async fn test_timeline_controller_export_cancel_no_gpu() {
        let controller = create_test_controller();

        let result = controller
            .handle("export_cancel", Some("test-job-id"), Value::Null, None)
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Export service not available"));
    }

    #[tokio::test]
    async fn test_timeline_controller_export_progress_missing_id() {
        let controller = create_test_controller();

        // Even without GPU, the service check comes first, so this will fail on service check
        let result = controller
            .handle("export_progress", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_timeline_controller_export_cancel_missing_id() {
        let controller = create_test_controller();

        let result = controller
            .handle("export_cancel", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }
}
