//! NodeController - handles nodes:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{INodeService, NodeService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde_json::Value;
use std::sync::Arc;

/// Controller for node-related actions
pub struct NodeController {
    node_service: Arc<NodeService>,
}

impl NodeController {
    /// Create a new NodeController
    pub fn new(node_service: Arc<NodeService>) -> Self {
        Self { node_service }
    }
}

impl Controller for NodeController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        _options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "health" => {
                let health = self.node_service.health().await?;
                Ok(ActionResponse::ok("", serde_json::to_value(health)?))
            }
            "metric" => {
                let metrics = self.node_service.metrics().await?;
                Ok(ActionResponse::ok("", serde_json::to_value(metrics)?))
            }
            "gpu" => {
                let gpu_info = self.node_service.gpu_info().await?;
                Ok(ActionResponse::ok("", serde_json::to_value(gpu_info)?))
            }
            _ => Err(ApiError::UnknownAction {
                group: "nodes".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::NODES
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::NODES
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_node_controller_health() {
        let node_service = Arc::new(NodeService::new(None));
        let controller = NodeController::new(node_service);

        let response = controller
            .handle("health", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_node_controller_metric() {
        let node_service = Arc::new(NodeService::new(None));
        let controller = NodeController::new(node_service);

        let response = controller
            .handle("metric", None, Value::Null, None)
            .await
            .unwrap();

        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_node_controller_unknown_action() {
        let node_service = Arc::new(NodeService::new(None));
        let controller = NodeController::new(node_service);

        let result = controller
            .handle("unknown", None, Value::Null, None)
            .await;

        assert!(result.is_err());
    }
}
