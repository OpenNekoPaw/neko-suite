//! PuppetsController - handles puppets:* actions for 2D puppet management
//!
//! Mirrors ScenesController pattern for 3D scenes.

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::services::{IPuppetService, PuppetService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Controller for 2D puppet operations (Inochi2D/inox2d)
pub struct PuppetsController {
    puppet_service: Option<Arc<PuppetService>>,
}

impl PuppetsController {
    pub fn new(puppet_service: Option<Arc<PuppetService>>) -> Self {
        Self { puppet_service }
    }

    fn service(&self) -> ApiResult<&PuppetService> {
        self.puppet_service
            .as_deref()
            .ok_or_else(|| ApiError::ServiceError("Puppet service not available".to_string()))
    }
}

impl Controller for PuppetsController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        if !self.actions().contains(&action) {
            return Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            });
        }

        match action {
            "load" => {
                // Body should contain base64-encoded INP data
                #[derive(Debug, Deserialize)]
                struct LoadBody {
                    data: String, // base64-encoded INP file
                }
                let body = body.ok_or_else(|| {
                    ApiError::InvalidRequest("request body with INP data required".to_string())
                })?;
                let load_body: LoadBody = serde_json::from_value(body)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                // Decode base64
                use base64::Engine;
                let data = base64::engine::general_purpose::STANDARD
                    .decode(&load_body.data)
                    .map_err(|e| ApiError::InvalidRequest(format!("Invalid base64: {}", e)))?;

                let service = self.service()?;
                let snapshot = service
                    .load_puppet(&data)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "snapshot" => {
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

            "param" => {
                #[derive(Debug, Deserialize)]
                struct ParamOptions {
                    name: String,
                    value: f32,
                }
                let opts: ParamOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_parameter(&opts.name, opts.value)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "params" => {
                let service = self.service()?;
                let params = service
                    .get_parameters()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(params)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "tick" => {
                #[derive(Debug, Deserialize, Default)]
                struct TickOptions {
                    delta_ms: Option<f32>,
                }
                let opts: TickOptions = serde_json::from_value(options).unwrap_or_default();
                let delta_ms = opts.delta_ms.unwrap_or(16.0); // ~60fps default

                let service = self.service()?;
                let delta = service
                    .tick(delta_ms)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(delta)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "meshes" => {
                let service = self.service()?;
                let meshes = service
                    .get_deformed_meshes()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(meshes)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "anims" => {
                let service = self.service()?;
                let anims = service
                    .get_animations()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(anims)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "anim_play" => {
                #[derive(Debug, Deserialize)]
                struct AnimPlayOptions {
                    name: String,
                    #[serde(default)]
                    loop_anim: bool,
                }
                let opts: AnimPlayOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .play_animation(&opts.name, opts.loop_anim)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "anim_stop" => {
                let service = self.service()?;
                service
                    .stop_animation()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "anim_seek" => {
                #[derive(Debug, Deserialize)]
                struct AnimSeekOptions {
                    time_ms: f32,
                }
                let opts: AnimSeekOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .seek_animation(opts.time_ms)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "keyframe_tracks" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeTracksOptions {
                    clip_name: String,
                }
                let opts: KeyframeTracksOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let tracks = service
                    .get_keyframe_tracks(&opts.clip_name)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(tracks)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "keyframe_add" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeAddOptions {
                    clip_name: String,
                    param_name: String,
                    time_ms: f32,
                    value: f32,
                }
                let opts: KeyframeAddOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let id = service
                    .add_keyframe(&opts.clip_name, &opts.param_name, opts.time_ms, opts.value)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(serde_json::json!({ "id": id }))
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "keyframe_remove" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeRemoveOptions {
                    clip_name: String,
                    param_name: String,
                    keyframe_id: String,
                }
                let opts: KeyframeRemoveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .remove_keyframe(&opts.clip_name, &opts.param_name, &opts.keyframe_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "keyframe_update" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeUpdateOptions {
                    clip_name: String,
                    param_name: String,
                    keyframe_id: String,
                    time_ms: Option<f32>,
                    value: Option<f32>,
                    easing: Option<String>,
                }
                let opts: KeyframeUpdateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                // Parse easing string to EasingType
                let easing = opts
                    .easing
                    .map(|s| neko_types::easing::EasingType::from_str(&s));

                let service = self.service()?;
                service
                    .update_keyframe(
                        &opts.clip_name,
                        &opts.param_name,
                        &opts.keyframe_id,
                        opts.time_ms,
                        opts.value,
                        easing,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "clip_create" => {
                #[derive(Debug, Deserialize)]
                struct ClipCreateOptions {
                    name: String,
                    duration_ms: f32,
                }
                let opts: ClipCreateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .create_clip(&opts.name, opts.duration_ms)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "anim_crossfade" => {
                #[derive(Debug, Deserialize)]
                struct CrossfadeOptions {
                    clip_name: String,
                    fade_duration_ms: f32,
                    #[serde(default)]
                    loop_anim: bool,
                }
                let opts: CrossfadeOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .crossfade_animation(&opts.clip_name, opts.fade_duration_ms, opts.loop_anim)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "blend_weight" => {
                #[derive(Debug, Deserialize)]
                struct BlendWeightOptions {
                    clip_name: String,
                    weight: f32,
                }
                let opts: BlendWeightOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_blend_weight(&opts.clip_name, opts.weight)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "blend_state" => {
                let service = self.service()?;
                let state = service
                    .get_blend_state()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(state)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            _ => Err(ApiError::UnknownAction {
                group: self.group().to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::PUPPETS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::PUPPETS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> PuppetsController {
        PuppetsController::new(Some(Arc::new(PuppetService::new())))
    }

    fn create_controller_without_service() -> PuppetsController {
        PuppetsController::new(None)
    }

    #[tokio::test]
    async fn test_puppets_controller_unknown_action() {
        let controller = create_test_controller();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            ApiError::UnknownAction { group, action } => {
                assert_eq!(group, "puppets");
                assert_eq!(action, "unknown");
            }
            other => panic!("Expected UnknownAction, got: {}", other),
        }
    }

    #[test]
    fn test_puppets_controller_group() {
        let controller = create_test_controller();
        assert_eq!(controller.group(), "puppets");
    }

    #[test]
    fn test_puppets_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();
        assert!(actions.contains(&"load"));
        assert!(actions.contains(&"snapshot"));
        assert!(actions.contains(&"param"));
        assert!(actions.contains(&"params"));
        assert!(actions.contains(&"tick"));
        assert!(actions.contains(&"meshes"));
        assert!(actions.contains(&"anims"));
        assert!(actions.contains(&"anim_play"));
        assert!(actions.contains(&"anim_stop"));
        assert!(actions.contains(&"anim_seek"));
    }

    #[tokio::test]
    async fn test_snapshot_empty_puppet() {
        let controller = create_test_controller();
        let result = controller
            .handle("snapshot", None, Value::Null, None)
            .await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_params_empty_puppet() {
        let controller = create_test_controller();
        let result = controller
            .handle("params", None, Value::Null, None)
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_tick_empty_puppet() {
        let controller = create_test_controller();
        let result = controller
            .handle("tick", None, Value::Null, None)
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
    async fn test_load_requires_body() {
        let controller = create_test_controller();
        let result = controller
            .handle("load", None, Value::Null, None)
            .await;
        assert!(result.is_err());
    }
}
