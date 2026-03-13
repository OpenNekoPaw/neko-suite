//! ScenesController - handles scenes:* actions for 3D scene management

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{ISceneService, SceneService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// Controller for 3D scene operations
pub struct ScenesController {
    scene_service: Option<Arc<SceneService>>,
}

impl ScenesController {
    pub fn new(scene_service: Option<Arc<SceneService>>) -> Self {
        Self { scene_service }
    }

    fn service(&self) -> ApiResult<&SceneService> {
        self.scene_service
            .as_deref()
            .ok_or_else(|| ApiError::ServiceError("Scene service not available".to_string()))
    }
}

impl Controller for ScenesController {
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
            "load" => {
                #[derive(Debug, Deserialize, Default)]
                struct LoadOptions {
                    source: Option<String>,
                }
                let opts: LoadOptions = serde_json::from_value(options).unwrap_or_default();
                let source = opts.source.ok_or_else(|| {
                    ApiError::InvalidRequest("source path required".to_string())
                })?;

                let service = self.service()?;
                let snapshot = service
                    .load_model(Path::new(&source))
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "graph" | "snapshot" => {
                let service = self.service()?;
                let snapshot = service
                    .get_snapshot()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "transform" => {
                #[derive(Debug, Deserialize)]
                struct TransformOptions {
                    node_id: String,
                    position: [f32; 3],
                    rotation: [f32; 4],
                    scale: [f32; 3],
                }
                let opts: TransformOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .update_transform(&opts.node_id, opts.position, opts.rotation, opts.scale)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "animate" => {
                let service = self.service()?;
                let clips = service
                    .get_animation_clips()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(clips)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "tick" => {
                #[derive(Debug, Deserialize, Default)]
                struct TickOptions {
                    clip_name: Option<String>,
                    time: Option<f32>,
                }
                let opts: TickOptions = serde_json::from_value(options).unwrap_or_default();
                let clip_name = opts.clip_name.ok_or_else(|| {
                    ApiError::InvalidRequest("clip_name required".to_string())
                })?;
                let time = opts.time.unwrap_or(0.0);

                let service = self.service()?;
                let delta = service
                    .tick(&clip_name, time)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(delta)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "latency_test" => {
                // Immediately return success for latency measurement
                // No service call needed - just echo back
                Ok(ActionResponse::ok("", Value::Null))
            }

            // Placeholder actions (future phases)
            "composite" | "capture" | "stream" => Err(ApiError::ServiceError(format!(
                "scenes:{} not yet implemented",
                action
            ))),

            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::SCENES
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::SCENES
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> ScenesController {
        ScenesController::new(Some(Arc::new(SceneService::new())))
    }

    fn create_controller_without_service() -> ScenesController {
        ScenesController::new(None)
    }

    #[tokio::test]
    async fn test_scenes_controller_unknown_action() {
        let controller = create_test_controller();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ApiError::UnknownAction { group, action } => {
                assert_eq!(group, "scenes");
                assert_eq!(action, "unknown");
            }
            other => panic!("Expected UnknownAction, got: {}", other),
        }
    }

    #[test]
    fn test_scenes_controller_group() {
        let controller = create_test_controller();
        assert_eq!(controller.group(), "scenes");
    }

    #[test]
    fn test_scenes_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();
        assert!(actions.contains(&"load"));
        assert!(actions.contains(&"graph"));
        assert!(actions.contains(&"transform"));
        assert!(actions.contains(&"animate"));
        assert!(actions.contains(&"tick"));
        assert!(actions.contains(&"snapshot"));
        assert!(actions.contains(&"composite"));
        assert!(actions.contains(&"capture"));
        assert!(actions.contains(&"stream"));
        assert!(actions.contains(&"latency_test"));
    }

    #[tokio::test]
    async fn test_load_requires_source() {
        let controller = create_test_controller();
        let result = controller.handle("load", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_snapshot_empty_scene() {
        let controller = create_test_controller();
        let result = controller
            .handle("snapshot", None, Value::Null, None)
            .await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_animate_empty_scene() {
        let controller = create_test_controller();
        let result = controller
            .handle("animate", None, Value::Null, None)
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_no_service_returns_error() {
        let controller = create_controller_without_service();
        let result = controller
            .handle("snapshot", None, Value::Null, None)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_composite_not_yet_implemented() {
        let controller = create_test_controller();
        let result = controller
            .handle("composite", None, Value::Null, None)
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not yet implemented"));
    }

    #[tokio::test]
    async fn test_latency_test_returns_immediately() {
        let controller = create_test_controller();
        let result = controller
            .handle("latency_test", None, Value::Null, None)
            .await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }
}
