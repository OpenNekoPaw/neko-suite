//! ModelsController - handles models:* actions (placeholder)

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::media_service::{diff_media, DiffCategory};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;

/// Controller for model-related actions (placeholder for future implementation)
pub struct ModelsController;

impl ModelsController {
    pub fn new() -> Self {
        Self
    }
}

/// Options for models:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ModelsDiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
}

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
            "diff" => {
                let opts: ModelsDiffRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for models:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for models:diff".to_string())
                })?;

                // Run blocking diff on a dedicated thread pool
                // to avoid starving the tokio async executor
                let result = tokio::task::spawn_blocking(move || {
                    diff_media(&source_a, &source_b, DiffCategory::Model)
                        .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Diff task failed: {}", e)))??;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
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

    #[tokio::test]
    async fn test_models_controller_not_implemented() {
        let controller = ModelsController::new();

        // Only non-diff actions should be "not yet implemented"
        for action in &["probe", "capture", "stream"] {
            let result = controller.handle(action, None, Value::Null, None).await;
            assert!(result.is_err());
            let err = result.unwrap_err();
            assert!(
                err.to_string().contains("not yet implemented"),
                "Expected 'not yet implemented' for action '{}', got: {}",
                action,
                err
            );
        }
    }

    #[tokio::test]
    async fn test_models_controller_diff_missing_sources() {
        let controller = ModelsController::new();

        let result = controller.handle("diff", None, Value::Null, None).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("sourceA"));
    }

    #[tokio::test]
    async fn test_models_controller_unknown_action() {
        let controller = ModelsController::new();

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

    #[test]
    fn test_models_controller_group() {
        let controller = ModelsController::new();
        assert_eq!(controller.group(), "models");
    }

    #[test]
    fn test_models_controller_actions() {
        let controller = ModelsController::new();
        assert_eq!(
            controller.actions(),
            &["probe", "capture", "stream", "diff"]
        );
    }
}
