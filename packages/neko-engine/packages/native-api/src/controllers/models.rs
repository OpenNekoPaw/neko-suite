//! ModelsController - handles models:* actions (placeholder)

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_types::ActionResponse;
use serde_json::Value;

/// Controller for model-related actions (placeholder for future implementation)
pub struct ModelsController;

impl ModelsController {
    pub fn new() -> Self {
        Self
    }
}

impl Controller for ModelsController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        _options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        // Validate action is known before returning not-implemented error
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        Err(ApiError::ServiceError(format!(
            "models:{} not yet implemented",
            action
        )))
    }

    fn group(&self) -> &'static str {
        "models"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["probe", "capture", "stream"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_models_controller_not_implemented() {
        let controller = ModelsController::new();

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
    async fn test_models_controller_unknown_action() {
        let controller = ModelsController::new();

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

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
        assert_eq!(controller.actions(), &["probe", "capture", "stream"]);
    }
}
