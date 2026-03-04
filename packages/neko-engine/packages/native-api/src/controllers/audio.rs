//! AudioController - handles audios:* actions

use crate::controllers::utils::{handle_stream_control, resolve_resource};
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_native_core::domain::StreamConfig;
use neko_native_core::media_service::{diff_media, DiffCategory};
use neko_native_core::services::{AudioService, IAudioService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Controller for audio-related actions
pub struct AudioController {
    audio_service: Arc<AudioService>,
    resource_registry: Arc<ResourceRegistry>,
    stream_registry: Arc<StreamRegistry>,
}

impl AudioController {
    /// Create a new AudioController
    pub fn new(
        audio_service: Arc<AudioService>,
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
    ) -> Self {
        Self {
            audio_service,
            resource_registry,
            stream_registry,
        }
    }
}

/// Options for audios:probe
#[derive(Debug, Deserialize, Default)]
struct ProbeOptions {
    source: Option<String>,
}

/// Options for audios:waveform
#[derive(Debug, Deserialize, Default)]
struct WaveformRequestOptions {
    source: Option<String>,
}

/// Options for audios:transcode
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TranscodeRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Output file path
    output: Option<String>,
    /// Force codec (overrides output extension inference)
    codec: Option<String>,
    /// Target bitrate in bps
    bitrate: Option<u64>,
    /// Target sample rate
    sample_rate: Option<u32>,
    /// Target channels
    channels: Option<u16>,
}

/// Options for audios:stream
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StreamRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Session ID for the stream
    session_id: Option<String>,
}

/// Options for audios:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AudioDiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
}

/// Options for audios:analyze_loudness
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AnalyzeLoudnessOptions {
    /// Source file path (audio or video)
    source: Option<String>,
    /// Target LUFS for recommended gain calculation (default: -14.0)
    target_lufs: Option<f64>,
}

impl Controller for AudioController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "probe" => {
                let opts: ProbeOptions = serde_json::from_value(options).unwrap_or_default();

                let source = opts.source.as_deref().or(resource_id).ok_or_else(|| {
                    ApiError::InvalidRequest("source path required for audios:probe".to_string())
                })?;

                let path = Path::new(source);
                let media_info = self.audio_service.probe(path).await?;

                // Register the resource
                let id = self.resource_registry.register(path).await;

                // Include resource_id in response
                let mut response = serde_json::to_value(media_info)?;
                if let Value::Object(ref mut map) = response {
                    map.insert(
                        "resourceId".to_string(),
                        Value::String(id.as_str().to_string()),
                    );
                }

                Ok(ActionResponse::ok("", response))
            }
            "transcode" => {
                let opts: TranscodeRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = resolve_resource(
                    &self.resource_registry, resource_id, opts.source.as_deref(),
                )
                    .await?;

                let output_path = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "output path required for audios:transcode".to_string(),
                    )
                })?;

                // Build AudioTranscodeOptions from request
                use neko_native_core::domain::{AudioOutputFormat, AudioTranscodeOptions};

                let format = opts.codec.as_deref().map(|c| match c.to_lowercase().as_str() {
                    "aac" | "m4a" => AudioOutputFormat::Aac,
                    "mp3" => AudioOutputFormat::Mp3,
                    "opus" | "ogg" => AudioOutputFormat::Opus,
                    "flac" => AudioOutputFormat::Flac,
                    "pcm" | "wav" => AudioOutputFormat::Pcm,
                    _ => AudioOutputFormat::Aac,
                });

                let transcode_opts = AudioTranscodeOptions {
                    format,
                    bitrate: opts.bitrate,
                    sample_rate: opts.sample_rate,
                    channels: opts.channels,
                    ..Default::default()
                };

                self.audio_service
                    .transcode(&file_path, Path::new(&output_path), transcode_opts)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "output": output_path,
                    "success": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            "stream" => {
                let opts: StreamRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = resolve_resource(
                    &self.resource_registry, resource_id, opts.source.as_deref(),
                )
                    .await?;

                let session_id = opts.session_id.unwrap_or_else(|| "default".to_string());

                let (stream_id, rx) = self
                    .audio_service
                    .start_stream(&file_path, &session_id)
                    .await?;

                // Register the stream into StreamRegistry so WebSocket subscribers can find it
                let cancel_token = CancellationToken::new();
                self.stream_registry
                    .register_external_stream(
                        stream_id.clone(),
                        &session_id,
                        res_id.as_str(),
                        StreamConfig::default(),
                        rx,
                        cancel_token,
                    )
                    .await;

                let response = serde_json::json!({
                    "streamId": stream_id.as_str(),
                    "resourceId": res_id.as_str(),
                    "status": "active",
                });

                Ok(ActionResponse::ok("", response))
            }
            "waveform" => {
                let opts: WaveformRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = resolve_resource(
                    &self.resource_registry, resource_id, opts.source.as_deref(),
                )
                    .await?;

                let waveform = self
                    .audio_service
                    .generate_waveform(&file_path)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "waveform": serde_json::to_value(&waveform)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            "stop" | "pause" | "resume" | "speed" | "seek" | "loop" => {
                handle_stream_control(
                    self.audio_service.as_ref(),
                    action,
                    options,
                    "audios",
                )
                .await
            }
            "diff" => {
                let opts: AudioDiffRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for audios:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for audios:diff".to_string())
                })?;

                // Run blocking diff on a dedicated thread pool
                // to avoid starving the tokio async executor
                let result = tokio::task::spawn_blocking(move || {
                    diff_media(&source_a, &source_b, DiffCategory::Audio)
                        .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Diff task failed: {}", e)))??;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
            "analyze_loudness" => {
                let opts: AnalyzeLoudnessOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let (res_id, file_path) = resolve_resource(
                    &self.resource_registry, resource_id, opts.source.as_deref(),
                )
                    .await?;

                let target_lufs = opts.target_lufs.unwrap_or(-14.0);

                let analysis = self.audio_service
                    .analyze_loudness(&file_path, target_lufs)
                    .await?;

                let mut response = serde_json::to_value(&analysis)?;
                if let Value::Object(ref mut map) = response {
                    map.insert(
                        "resourceId".to_string(),
                        Value::String(res_id.as_str().to_string()),
                    );
                }

                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "audios".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::AUDIOS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::AUDIOS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_native_core::services::TaskService;

    fn create_test_controller() -> AudioController {
        let task_service = Arc::new(TaskService::new());
        let audio_service = Arc::new(AudioService::new(None, task_service));
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());
        AudioController::new(audio_service, resource_registry, stream_registry)
    }

    #[tokio::test]
    async fn test_audio_controller_probe_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("probe", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_unknown_action() {
        let controller = create_test_controller();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_waveform_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("waveform", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_transcode_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("transcode", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_transcode_missing_output() {
        let controller = create_test_controller();

        let opts = serde_json::json!({ "source": "/some/file.mp3" });
        let result = controller
            .handle("transcode", None, opts, None)
            .await;

        // Should fail because output path is missing
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_analyze_loudness_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("analyze_loudness", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_audio_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();

        assert!(actions.contains(&"probe"));
        assert!(actions.contains(&"transcode"));
        assert!(actions.contains(&"stream"));
        assert!(actions.contains(&"waveform"));
        assert!(actions.contains(&"diff"));
        assert!(actions.contains(&"stop"));
        assert!(actions.contains(&"pause"));
        assert!(actions.contains(&"resume"));
        assert!(actions.contains(&"speed"));
        assert!(actions.contains(&"seek"));
        assert!(actions.contains(&"loop"));
        assert!(actions.contains(&"analyze_loudness"));
        assert_eq!(actions.len(), 12);
    }
}
