//! CanvasController - handles canvas:* actions (placeholder)

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_types::ActionResponse;
use serde_json::Value;

/// Controller for canvas-related actions (placeholder for future implementation)
pub struct CanvasController;

impl CanvasController {
    pub fn new() -> Self {
        Self
    }
}

impl Controller for CanvasController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        _options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        Err(ApiError::ServiceError(format!(
            "canvas:{} not yet implemented",
            action
        )))
    }

    fn group(&self) -> &'static str {
        "canvas"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["composite", "capture", "export"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_canvas_controller_not_implemented() {
        let controller = CanvasController::new();

        for action in controller.actions() {
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
    async fn test_canvas_controller_unknown_action() {
        let controller = CanvasController::new();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

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
        assert_eq!(controller.actions(), &["composite", "capture", "export"]);
    }
}
