//! DocumentsController - handles documents:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;

/// Controller for document-related actions.
pub struct DocumentsController;

impl DocumentsController {
    pub fn new() -> Self {
        Self
    }
}

/// Options for documents:probe
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProbeOptions {
    /// File path to probe.
    path: Option<String>,
}

impl Controller for DocumentsController {
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
            "probe" => {
                let opts: ProbeOptions = serde_json::from_value(options).unwrap_or_default();
                let path = opts.path.ok_or_else(|| {
                    ApiError::InvalidRequest("path required for documents:probe".to_string())
                })?;

                // TODO(P1): implement document probing (format detection, metadata extraction)
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "path": path, "status": "not_implemented" }),
                ))
            }
            _ => Err(ApiError::ServiceError(format!(
                "documents:{} not yet implemented",
                action
            ))),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::DOCUMENTS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::DOCUMENTS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_unknown_action() {
        let controller = DocumentsController::new();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ApiError::UnknownAction { group, action } => {
                assert_eq!(group, "documents");
                assert_eq!(action, "unknown");
            }
            other => panic!("Expected UnknownAction, got: {}", other),
        }
    }

    #[tokio::test]
    async fn test_probe_missing_path() {
        let controller = DocumentsController::new();
        let result = controller.handle("probe", None, Value::Null, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("path required"));
    }

    #[test]
    fn test_group() {
        let controller = DocumentsController::new();
        assert_eq!(controller.group(), "documents");
    }
}
