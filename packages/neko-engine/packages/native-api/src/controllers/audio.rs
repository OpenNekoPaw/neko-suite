//! AudioController - handles audios:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::registry::ResourceRegistry;
use neko_native_core::services::{AudioService, IAudioService};
use neko_types::{ActionResponse, ResourceId};
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// Controller for audio-related actions
pub struct AudioController {
    audio_service: Arc<AudioService>,
    resource_registry: Arc<ResourceRegistry>,
}

impl AudioController {
    /// Create a new AudioController
    pub fn new(
        audio_service: Arc<AudioService>,
        resource_registry: Arc<ResourceRegistry>,
    ) -> Self {
        Self {
            audio_service,
            resource_registry,
        }
    }

    /// Resolve resource: either by ID or by source path (self-healing)
    async fn resolve_resource(
        &self,
        id: Option<&str>,
        source: Option<&str>,
    ) -> ApiResult<ResourceId> {
        if let Some(id_str) = id {
            let resource_id = ResourceId::from_string(id_str.to_string());
            if self.resource_registry.resolve(&resource_id).await.is_some() {
                return Ok(resource_id);
            }
        }

        if let Some(source_path) = source {
            let path = Path::new(source_path);
            let resource_id = self.resource_registry.register(path).await;
            return Ok(resource_id);
        }

        Err(ApiError::InvalidRequest(
            "Either resource_id or source path required".to_string(),
        ))
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

/// Options for audios:extract
#[derive(Debug, Deserialize, Default)]
struct ExtractRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Output file path
    output: Option<String>,
}

/// Options for audios:stream
#[derive(Debug, Deserialize, Default)]
struct StreamRequestOptions {
    /// Source path (alternative to resource_id)
    source: Option<String>,
    /// Session ID for the stream
    session_id: Option<String>,
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
            "extract" => {
                let opts: ExtractRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let output_path = opts.output.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "output path required for audios:extract".to_string(),
                    )
                })?;

                self.audio_service
                    .extract(&res_id, Path::new(&output_path), None)
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

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let session_id = opts.session_id.unwrap_or_else(|| "default".to_string());

                let (stream_id, _rx) = self
                    .audio_service
                    .start_stream(&res_id, &session_id)
                    .await?;

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

                let res_id = self
                    .resolve_resource(resource_id, opts.source.as_deref())
                    .await?;

                let waveform = self
                    .audio_service
                    .generate_waveform(&res_id, None)
                    .await?;

                let response = serde_json::json!({
                    "resourceId": res_id.as_str(),
                    "waveform": serde_json::to_value(&waveform)?,
                });

                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "audios".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "audios"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["probe", "extract", "stream", "waveform"]
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
        AudioController::new(audio_service, resource_registry)
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
    async fn test_audio_controller_extract_missing_source() {
        let controller = create_test_controller();

        let result = controller
            .handle("extract", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_audio_controller_extract_missing_output() {
        let controller = create_test_controller();

        let opts = serde_json::json!({ "source": "/some/file.mp3" });
        let result = controller
            .handle("extract", None, opts, None)
            .await;

        // Should fail because output path is missing
        assert!(result.is_err());
    }

    #[test]
    fn test_audio_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();

        assert!(actions.contains(&"probe"));
        assert!(actions.contains(&"extract"));
        assert!(actions.contains(&"stream"));
        assert!(actions.contains(&"waveform"));
        assert_eq!(actions.len(), 4);
    }
}
