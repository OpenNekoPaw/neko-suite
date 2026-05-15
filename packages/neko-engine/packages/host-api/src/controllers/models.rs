//! ModelsController - handles models:* actions (diff + ML inference)

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::media::{diff_media, DiffCategory};
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;

#[cfg(feature = "onnx")]
use neko_runtime_ml::IMlService;
#[cfg(feature = "onnx")]
use std::sync::Arc;

/// Controller for model-related actions: diff, register, unregister, list, upscale, denoise, clip, transcribe.
pub struct ModelsController {
    #[cfg(feature = "onnx")]
    ml_service: Option<Arc<dyn IMlService>>,
}

impl ModelsController {
    #[cfg(feature = "onnx")]
    pub fn new(ml_service: Option<Arc<dyn IMlService>>) -> Self {
        Self { ml_service }
    }

    #[cfg(not(feature = "onnx"))]
    pub fn new() -> Self {
        Self {}
    }

    #[cfg(feature = "onnx")]
    fn require_ml(&self) -> ApiResult<&dyn IMlService> {
        self.ml_service
            .as_deref()
            .ok_or_else(|| ApiError::ServiceError("ML service not available".to_string()))
    }
}

#[cfg(not(feature = "onnx"))]
impl Default for ModelsController {
    fn default() -> Self {
        Self::new()
    }
}

// =============================================================================
// Request option structs
// =============================================================================

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DiffOptions {
    source_a: Option<String>,
    source_b: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RegisterOptions {
    name: Option<String>,
    path: Option<String>,
    framework: Option<String>,
    task: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UnregisterOptions {
    name: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UpscaleOptions {
    model: Option<String>,
    input: Option<String>,
    output: Option<String>,
    scale: Option<u32>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DenoiseOptions {
    model: Option<String>,
    input: Option<String>,
    output: Option<String>,
    strength: Option<f32>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PreprocessOptions {
    clip_id: Option<String>,
    track_id: Option<String>,
    operation: Option<String>,
    model: Option<String>,
    input: Option<String>,
    output: Option<String>,
    scale: Option<u32>,
    strength: Option<f32>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClipOptions {
    model: Option<String>,
    image: Option<String>,
    text: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct TranscribeOptions {
    model: Option<String>,
    audio: Option<String>,
}

// =============================================================================
// Controller implementation
// =============================================================================

impl Controller for ModelsController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        match action {
            // ------------------------------------------------------------------
            // Existing: diff
            // ------------------------------------------------------------------
            "diff" => {
                let opts: DiffOptions = serde_json::from_value(options).unwrap_or_default();
                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for models:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for models:diff".to_string())
                })?;

                let result = tokio::task::spawn_blocking(move || {
                    diff_media(&source_a, &source_b, DiffCategory::Model)
                        .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Diff task failed: {}", e)))??;

                Ok(ActionResponse::ok("", serde_json::to_value(&result)?))
            }

            // ------------------------------------------------------------------
            // ML: register / unregister / list
            // ------------------------------------------------------------------
            #[cfg(feature = "onnx")]
            "register" => {
                let opts: RegisterOptions = serde_json::from_value(options).unwrap_or_default();
                let name = opts
                    .name
                    .ok_or_else(|| ApiError::InvalidRequest("name required".to_string()))?;
                let path = opts
                    .path
                    .ok_or_else(|| ApiError::InvalidRequest("path required".to_string()))?;
                let framework = opts.framework.unwrap_or_else(|| "onnx".to_string());
                let task = opts.task.unwrap_or_else(|| "unknown".to_string());

                let ml = self.require_ml()?;
                ml.register_model(&name, &path, &framework, &task)
                    .map_err(|e| ApiError::ServiceError(format!("Register failed: {}", e)))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "registered": name }),
                ))
            }

            #[cfg(feature = "onnx")]
            "unregister" => {
                let opts: UnregisterOptions = serde_json::from_value(options).unwrap_or_default();
                let name = opts
                    .name
                    .ok_or_else(|| ApiError::InvalidRequest("name required".to_string()))?;

                let ml = self.require_ml()?;
                ml.unregister_model(&name)
                    .map_err(|e| ApiError::ServiceError(format!("Unregister failed: {}", e)))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "unregistered": name }),
                ))
            }

            #[cfg(feature = "onnx")]
            "list" => {
                let ml = self.require_ml()?;
                let models = ml.list_models();
                Ok(ActionResponse::ok("", serde_json::to_value(&models)?))
            }

            // ------------------------------------------------------------------
            // ML: inference actions
            // ------------------------------------------------------------------
            #[cfg(feature = "onnx")]
            "upscale" => {
                let opts: UpscaleOptions = serde_json::from_value(options).unwrap_or_default();
                let model = opts
                    .model
                    .ok_or_else(|| ApiError::InvalidRequest("model required".to_string()))?;
                let input = opts
                    .input
                    .ok_or_else(|| ApiError::InvalidRequest("input required".to_string()))?;
                let output = opts
                    .output
                    .ok_or_else(|| ApiError::InvalidRequest("output required".to_string()))?;
                let scale = opts.scale.unwrap_or(4);
                let output_path = output.clone();

                self.require_ml()?;
                let ml: Arc<dyn IMlService> = self.ml_service.as_ref().unwrap().clone();
                tokio::task::spawn_blocking(move || {
                    ml.upscale(&model, &input, &output, scale)
                        .map_err(|e| ApiError::ServiceError(format!("Upscale failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Task failed: {}", e)))??;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "output": output_path }),
                ))
            }

            #[cfg(feature = "onnx")]
            "denoise" => {
                let opts: DenoiseOptions = serde_json::from_value(options).unwrap_or_default();
                let model = opts
                    .model
                    .ok_or_else(|| ApiError::InvalidRequest("model required".to_string()))?;
                let input = opts
                    .input
                    .ok_or_else(|| ApiError::InvalidRequest("input required".to_string()))?;
                let output = opts
                    .output
                    .ok_or_else(|| ApiError::InvalidRequest("output required".to_string()))?;
                let strength = opts.strength.unwrap_or(0.5);
                let output_path = output.clone();

                self.require_ml()?;
                let ml: Arc<dyn IMlService> = self.ml_service.as_ref().unwrap().clone();
                tokio::task::spawn_blocking(move || {
                    ml.denoise(&model, &input, &output, strength)
                        .map_err(|e| ApiError::ServiceError(format!("Denoise failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Task failed: {}", e)))??;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "output": output_path }),
                ))
            }

            #[cfg(feature = "onnx")]
            "preprocess" => {
                let opts: PreprocessOptions = serde_json::from_value(options).unwrap_or_default();
                let operation = opts
                    .operation
                    .ok_or_else(|| ApiError::InvalidRequest("operation required".to_string()))?;
                let model = opts
                    .model
                    .ok_or_else(|| ApiError::InvalidRequest("model required".to_string()))?;
                let input = opts
                    .input
                    .ok_or_else(|| ApiError::InvalidRequest("input required".to_string()))?;
                let output = opts
                    .output
                    .ok_or_else(|| ApiError::InvalidRequest("output required".to_string()))?;
                let output_path = output.clone();
                self.require_ml()?;
                let ml: Arc<dyn IMlService> = self.ml_service.as_ref().unwrap().clone();

                match operation.as_str() {
                    "upscale" => {
                        let scale = opts.scale.unwrap_or(4);
                        let model = model.clone();
                        let input_for_task = input.clone();
                        let output = output.clone();
                        let ml = Arc::clone(&ml);
                        tokio::task::spawn_blocking(move || {
                            ml.upscale(&model, &input_for_task, &output, scale)
                                .map_err(|e| {
                                    ApiError::ServiceError(format!(
                                        "Upscale preprocess failed: {}",
                                        e
                                    ))
                                })
                        })
                        .await
                        .map_err(|e| ApiError::ServiceError(format!("Task failed: {}", e)))??;
                    }
                    "denoise" => {
                        let strength = opts.strength.unwrap_or(0.5);
                        let model = model.clone();
                        let input_for_task = input.clone();
                        let output = output.clone();
                        let ml = Arc::clone(&ml);
                        tokio::task::spawn_blocking(move || {
                            ml.denoise(&model, &input_for_task, &output, strength)
                                .map_err(|e| {
                                    ApiError::ServiceError(format!(
                                        "Denoise preprocess failed: {}",
                                        e
                                    ))
                                })
                        })
                        .await
                        .map_err(|e| ApiError::ServiceError(format!("Task failed: {}", e)))??;
                    }
                    other => {
                        return Err(ApiError::InvalidRequest(format!(
                            "Unsupported preprocess operation: {other}"
                        )));
                    }
                }

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({
                        "operation": operation,
                        "input": input,
                        "output": output_path,
                        "sourceReplacement": {
                            "trackId": opts.track_id,
                            "elementId": opts.clip_id,
                            "src": output_path,
                            "resourceId": null
                        }
                    }),
                ))
            }

            #[cfg(feature = "onnx")]
            "clip" => {
                let opts: ClipOptions = serde_json::from_value(options).unwrap_or_default();
                let model = opts
                    .model
                    .ok_or_else(|| ApiError::InvalidRequest("model required".to_string()))?;
                let image = opts
                    .image
                    .ok_or_else(|| ApiError::InvalidRequest("image required".to_string()))?;
                let text = opts
                    .text
                    .ok_or_else(|| ApiError::InvalidRequest("text required".to_string()))?;

                let ml: Arc<dyn IMlService> = self.ml_service.as_ref().unwrap().clone();
                let score = tokio::task::spawn_blocking(move || {
                    ml.clip_score(&model, &image, &text)
                        .map_err(|e| ApiError::ServiceError(format!("CLIP failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Task failed: {}", e)))??;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "score": score }),
                ))
            }

            #[cfg(feature = "onnx")]
            "transcribe" => {
                let opts: TranscribeOptions = serde_json::from_value(options).unwrap_or_default();
                let model = opts
                    .model
                    .ok_or_else(|| ApiError::InvalidRequest("model required".to_string()))?;
                let audio = opts
                    .audio
                    .ok_or_else(|| ApiError::InvalidRequest("audio required".to_string()))?;

                let ml: Arc<dyn IMlService> = self.ml_service.as_ref().unwrap().clone();
                let result = tokio::task::spawn_blocking(move || {
                    ml.transcribe(&model, &audio)
                        .map_err(|e| ApiError::ServiceError(format!("Transcribe failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Task failed: {}", e)))??;

                Ok(ActionResponse::ok("", serde_json::json!(result)))
            }

            // ------------------------------------------------------------------
            // Fallback: not yet implemented or feature disabled
            // ------------------------------------------------------------------
            _ => Err(ApiError::ServiceError(format!(
                "models:{} not yet implemented",
                action
            ))),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::MODELS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::MODELS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_controller() -> ModelsController {
        #[cfg(feature = "onnx")]
        {
            ModelsController::new(None)
        }
        #[cfg(not(feature = "onnx"))]
        {
            ModelsController::new()
        }
    }

    #[tokio::test]
    async fn test_unknown_action() {
        let controller = make_controller();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ApiError::UnknownAction { group, action } => {
                assert_eq!(group, "models");
                assert_eq!(action, "unknown");
            }
            other => panic!("Expected UnknownAction, got: {}", other),
        }
    }

    #[tokio::test]
    async fn test_diff_missing_sources() {
        let controller = make_controller();
        let result = controller.handle("diff", None, Value::Null, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("sourceA"));
    }

    #[test]
    fn test_group() {
        let controller = make_controller();
        assert_eq!(controller.group(), "models");
    }

    #[test]
    fn test_actions_include_ml() {
        let controller = make_controller();
        let actions = controller.actions();
        assert!(actions.contains(&"register"));
        assert!(actions.contains(&"upscale"));
        assert!(actions.contains(&"preprocess"));
        assert!(actions.contains(&"diff"));
    }

    #[cfg(feature = "onnx")]
    #[tokio::test]
    async fn test_register_without_ml_service() {
        let controller = ModelsController::new(None);
        let opts = serde_json::json!({ "name": "test", "path": "." });
        let result = controller.handle("register", None, opts, None).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("ML service not available"));
    }
}
