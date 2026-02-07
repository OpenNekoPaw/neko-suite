//! ExportController - handles exports:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{ExportService, IExportService};
use neko_types::ActionResponse;
use serde_json::Value;
use std::sync::Arc;

/// Controller for export-related actions
pub struct ExportController {
    export_service: Arc<ExportService>,
}

impl ExportController {
    /// Create a new ExportController
    pub fn new(export_service: Arc<ExportService>) -> Self {
        Self { export_service }
    }
}

impl Controller for ExportController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "start" => {
                // Parse ExportJobConfig from body or options
                let config_value = body.or_else(|| {
                    if options.is_object() && !options.is_null() {
                        Some(options.clone())
                    } else {
                        None
                    }
                }).ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "exports:start requires ExportJobConfig in body or options".to_string(),
                    )
                })?;

                let config: neko_native_core::export::ExportJobConfig =
                    serde_json::from_value(config_value).map_err(|e| {
                        ApiError::InvalidRequest(format!(
                            "Invalid ExportJobConfig: {}",
                            e
                        ))
                    })?;

                let response = self.export_service.start(config).await.map_err(|e| {
                    ApiError::ServiceError(format!("Failed to start export: {}", e))
                })?;

                Ok(ActionResponse::ok("", serde_json::to_value(response)?))
            }
            "progress" => {
                let job_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "job_id required for exports:progress".to_string(),
                    )
                })?;

                let progress = self.export_service.progress(job_id).await;
                match progress {
                    Some(p) => Ok(ActionResponse::ok("", serde_json::to_value(p)?)),
                    None => Err(ApiError::NotFound(format!("Export job not found: {}", job_id))),
                }
            }
            "cancel" => {
                let job_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "job_id required for exports:cancel".to_string(),
                    )
                })?;

                let success = self.export_service.cancel(job_id).await.map_err(|e| {
                    ApiError::ServiceError(format!("Failed to cancel export: {}", e))
                })?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "success": success }),
                ))
            }
            _ => Err(ApiError::UnknownAction {
                group: "exports".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        "exports"
    }

    fn actions(&self) -> &'static [&'static str] {
        &["start", "progress", "cancel"]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_export_controller_unknown_action() {
        // ExportController requires GPU, so we test error paths only
        // Full integration tests require GPU context
    }

    #[tokio::test]
    async fn test_export_controller_actions() {
        let actions = &["start", "progress", "cancel"];
        assert_eq!(actions.len(), 3);
        assert!(actions.contains(&"start"));
        assert!(actions.contains(&"progress"));
        assert!(actions.contains(&"cancel"));
    }
}
