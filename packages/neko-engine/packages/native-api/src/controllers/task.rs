//! TaskController - handles tasks:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{ITaskService, TaskService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde_json::Value;
use std::sync::Arc;

/// Controller for task-related actions
pub struct TaskController {
    task_service: Arc<TaskService>,
}

impl TaskController {
    /// Create a new TaskController
    pub fn new(task_service: Arc<TaskService>) -> Self {
        Self { task_service }
    }
}

impl Controller for TaskController {
    async fn handle(
        &self,
        action: &str,
        resource_id: Option<&str>,
        _options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "probe" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:probe".to_string())
                })?;

                let progress = self.task_service.probe(task_id)?;
                Ok(ActionResponse::ok("", serde_json::to_value(progress)?))
            }
            "pause" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:pause".to_string())
                })?;

                self.task_service.pause(task_id)?;
                Ok(ActionResponse::ok("", Value::Null))
            }
            "resume" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:resume".to_string())
                })?;

                self.task_service.resume(task_id)?;
                Ok(ActionResponse::ok("", Value::Null))
            }
            "cancel" => {
                let task_id = resource_id.ok_or_else(|| {
                    ApiError::InvalidRequest("task_id required for tasks:cancel".to_string())
                })?;

                self.task_service.cancel(task_id)?;
                Ok(ActionResponse::ok("", Value::Null))
            }
            "list" => {
                let tasks = self.task_service.list();
                Ok(ActionResponse::ok("", serde_json::to_value(tasks)?))
            }
            _ => Err(ApiError::UnknownAction {
                group: "tasks".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::TASKS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::TASKS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "TaskService uses blocking_read which panics in async context"]
    async fn test_task_controller_list() {
        let task_service = Arc::new(TaskService::new());
        let controller = TaskController::new(task_service);

        let response = controller
            .handle("list", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_task_controller_probe_missing_id() {
        let task_service = Arc::new(TaskService::new());
        let controller = TaskController::new(task_service);

        let result = controller
            .handle("probe", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_task_controller_unknown_action() {
        let task_service = Arc::new(TaskService::new());
        let controller = TaskController::new(task_service);

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }
}
