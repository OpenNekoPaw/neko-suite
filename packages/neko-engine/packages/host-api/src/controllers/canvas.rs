//! CanvasController - handles canvas:* actions (placeholder)

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::contracts::media::{diff_media, DiffCategory};
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;

/// Controller for canvas-related actions (placeholder for future implementation)
pub struct CanvasController;

impl Default for CanvasController {
    fn default() -> Self {
        Self::new()
    }
}

impl CanvasController {
    pub fn new() -> Self {
        Self
    }
}

/// Options for canvas:diff
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CanvasDiffRequestOptions {
    /// Source A file path
    source_a: Option<String>,
    /// Source B file path
    source_b: Option<String>,
}

impl Controller for CanvasController {
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
                let opts: CanvasDiffRequestOptions =
                    serde_json::from_value(options).unwrap_or_default();

                let source_a = opts.source_a.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceA path required for canvas:diff".to_string())
                })?;
                let source_b = opts.source_b.ok_or_else(|| {
                    ApiError::InvalidRequest("sourceB path required for canvas:diff".to_string())
                })?;

                // Run blocking diff on a dedicated thread pool
                // to avoid starving the tokio async executor
                let result = tokio::task::spawn_blocking(move || {
                    diff_media(&source_a, &source_b, DiffCategory::Canvas)
                        .map_err(|e| ApiError::ServiceError(format!("Diff failed: {}", e)))
                })
                .await
                .map_err(|e| ApiError::ServiceError(format!("Diff task failed: {}", e)))??;

                let response = serde_json::to_value(&result)?;
                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::ServiceError(format!(
                "canvas:{} not yet implemented",
                action
            ))),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::CANVAS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::CANVAS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_canvas_controller_not_implemented() {
        let controller = CanvasController::new();

        // Only non-diff actions should be "not yet implemented"
        for action in &["composite", "capture", "export"] {
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
    async fn test_canvas_controller_diff_missing_sources() {
        let controller = CanvasController::new();

        let result = controller.handle("diff", None, Value::Null, None).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("sourceA"));
    }

    #[tokio::test]
    async fn test_canvas_controller_unknown_action() {
        let controller = CanvasController::new();

        let result = controller.handle("unknown", None, Value::Null, None).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            ApiError::UnknownAction { group, action } => {
                assert_eq!(group, "canvas");
                assert_eq!(action, "unknown");
            }
            other => panic!("Expected UnknownAction, got: {}", other),
        }
    }

    #[test]
    fn test_canvas_controller_group() {
        let controller = CanvasController::new();
        assert_eq!(controller.group(), "canvas");
    }

    #[test]
    fn test_canvas_controller_actions() {
        let controller = CanvasController::new();
        assert_eq!(
            controller.actions(),
            &["composite", "capture", "export", "diff"]
        );
    }
}
