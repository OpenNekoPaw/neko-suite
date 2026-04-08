//! PluginsController - handles plugins:* actions

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::plugin::PluginManager;
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

pub struct PluginsController {
    plugin_manager: Arc<PluginManager>,
}

impl PluginsController {
    pub fn new(plugin_manager: Arc<PluginManager>) -> Self {
        Self { plugin_manager }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PluginIdOptions {
    id: Option<String>,
}

impl Controller for PluginsController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "list" => {
                let plugins = self.plugin_manager.list();
                let response = serde_json::to_value(&plugins)?;
                Ok(ActionResponse::ok("", response))
            }
            "inspect" => {
                let opts: PluginIdOptions = serde_json::from_value(options).unwrap_or_default();
                let id = opts
                    .id
                    .ok_or_else(|| ApiError::InvalidRequest("id required".to_string()))?;

                let plugin = self.plugin_manager.get(&id).ok_or_else(|| {
                    ApiError::NotFound(format!("Plugin not found: {id}"))
                })?;

                let response = serde_json::to_value(&plugin)?;
                Ok(ActionResponse::ok("", response))
            }
            "enable" => {
                let opts: PluginIdOptions = serde_json::from_value(options).unwrap_or_default();
                let id = opts
                    .id
                    .ok_or_else(|| ApiError::InvalidRequest("id required".to_string()))?;

                self.plugin_manager.enable(&id).map_err(|e| {
                    ApiError::ServiceError(format!("Failed to enable plugin: {e}"))
                })?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "id": id, "enabled": true }),
                ))
            }
            "disable" => {
                let opts: PluginIdOptions = serde_json::from_value(options).unwrap_or_default();
                let id = opts
                    .id
                    .ok_or_else(|| ApiError::InvalidRequest("id required".to_string()))?;

                self.plugin_manager.disable(&id).map_err(|e| {
                    ApiError::ServiceError(format!("Failed to disable plugin: {e}"))
                })?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "id": id, "enabled": false }),
                ))
            }
            "reload" => {
                let count = self.plugin_manager.reload();
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "reloaded": count }),
                ))
            }
            _ => Err(ApiError::UnknownAction {
                group: "plugins".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::PLUGINS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::PLUGINS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> PluginsController {
        let mgr = Arc::new(PluginManager::new(vec![], "0.1.0"));
        PluginsController::new(mgr)
    }

    #[tokio::test]
    async fn test_list_empty() {
        let ctrl = create_test_controller();
        let result = ctrl.handle("list", None, Value::Null, None).await;
        assert!(result.is_ok());
        let resp = result.unwrap();
        assert!(resp.data.as_ref().unwrap().is_array());
    }

    #[tokio::test]
    async fn test_inspect_not_found() {
        let ctrl = create_test_controller();
        let opts = serde_json::json!({ "id": "nonexistent" });
        let result = ctrl.handle("inspect", None, opts, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_enable_not_found() {
        let ctrl = create_test_controller();
        let opts = serde_json::json!({ "id": "nonexistent" });
        let result = ctrl.handle("enable", None, opts, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_unknown_action() {
        let ctrl = create_test_controller();
        let result = ctrl.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_actions_list() {
        let ctrl = create_test_controller();
        let actions = ctrl.actions();
        assert!(actions.contains(&"list"));
        assert!(actions.contains(&"inspect"));
        assert!(actions.contains(&"enable"));
        assert!(actions.contains(&"disable"));
        assert!(actions.contains(&"reload"));
    }
}
