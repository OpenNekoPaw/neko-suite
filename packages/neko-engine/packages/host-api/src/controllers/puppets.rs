//! PuppetsController - handles puppets:* actions for 2D puppet management
//!
//! Mirrors ScenesController pattern for 3D scenes.

use crate::controllers::utils::resolve_file_source_ref;
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use crate::file_access::FileAccessRegistry;
use neko_engine_kernel::contracts::services::{IPuppetService, PuppetExportConfig};
use neko_engine_types::registry;
use neko_engine_types::{
    ActionResponse, FileSourceRef, PuppetCommand, PuppetCommandAck, PuppetCommandAckStatus,
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Controller for 2D puppet operations
pub struct PuppetsController {
    puppet_service: Option<Arc<dyn IPuppetService>>,
    file_access_registry: Option<Arc<FileAccessRegistry>>,
}

impl PuppetsController {
    pub fn new(puppet_service: Option<Arc<dyn IPuppetService>>) -> Self {
        Self {
            puppet_service,
            file_access_registry: None,
        }
    }

    pub fn with_file_access_registry(mut self, registry: Arc<FileAccessRegistry>) -> Self {
        self.file_access_registry = Some(registry);
        self
    }

    fn service(&self) -> ApiResult<&dyn IPuppetService> {
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
                // Body should contain base64-encoded puppet data (INP or MOC3, auto-detected)
                #[derive(Debug, Deserialize)]
                struct LoadBody {
                    data: String, // base64-encoded puppet file
                }
                let body = body.ok_or_else(|| {
                    ApiError::InvalidRequest("request body with puppet data required".to_string())
                })?;
                let load_body: LoadBody = serde_json::from_value(body)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let snapshot = apply_alias(
                    service,
                    PuppetCommand::Load {
                        data_base64: load_body.data,
                    },
                )?;

                Ok(ActionResponse::ok("", snapshot))
            }

            "load_source" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct LoadSourceOptions {
                    source: Option<String>,
                    #[serde(default)]
                    source_ref: Option<FileSourceRef>,
                }
                let opts: LoadSourceOptions = serde_json::from_value(options).unwrap_or_default();
                let files = self.file_access_registry.as_deref().ok_or_else(|| {
                    ApiError::InvalidRequest(
                        "puppets:load_source requires file access registry".to_string(),
                    )
                })?;
                let path = resolve_file_source_ref(
                    files,
                    opts.source_ref.as_ref(),
                    opts.source.as_deref(),
                    "puppets:load_source",
                )?;
                let data = std::fs::read(&path).map_err(|error| {
                    ApiError::ServiceError(format!(
                        "Failed to read puppet source {:?}: {error}",
                        path
                    ))
                })?;

                let service = self.service()?;
                let snapshot = service
                    .load_puppet(&data)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", serde_json::to_value(snapshot)?))
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
                apply_alias(
                    service,
                    PuppetCommand::SetParameter {
                        name: opts.name,
                        value: opts.value,
                    },
                )?;

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
                let delta = apply_alias(service, PuppetCommand::Tick { delta_ms })?;

                Ok(ActionResponse::ok("", delta))
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
                apply_alias(
                    service,
                    PuppetCommand::PlayAnimation {
                        name: opts.name,
                        loop_anim: opts.loop_anim,
                    },
                )?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "anim_stop" => {
                let service = self.service()?;
                apply_alias(service, PuppetCommand::StopAnimation)?;

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
                apply_alias(
                    service,
                    PuppetCommand::SeekAnimation {
                        time_ms: opts.time_ms,
                    },
                )?;

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
                let data = apply_alias(
                    service,
                    PuppetCommand::AddKeyframe {
                        clip_name: opts.clip_name,
                        param_name: opts.param_name,
                        time_ms: opts.time_ms,
                        value: opts.value,
                    },
                )?;

                Ok(ActionResponse::ok("", data))
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
                apply_alias(
                    service,
                    PuppetCommand::RemoveKeyframe {
                        clip_name: opts.clip_name,
                        param_name: opts.param_name,
                        keyframe_id: opts.keyframe_id,
                    },
                )?;

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

                let service = self.service()?;
                apply_alias(
                    service,
                    PuppetCommand::UpdateKeyframe {
                        clip_name: opts.clip_name,
                        param_name: opts.param_name,
                        keyframe_id: opts.keyframe_id,
                        time_ms: opts.time_ms,
                        value: opts.value,
                        easing: opts.easing,
                    },
                )?;

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
                apply_alias(
                    service,
                    PuppetCommand::CreateClip {
                        name: opts.name,
                        duration_ms: opts.duration_ms,
                    },
                )?;

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
                apply_alias(
                    service,
                    PuppetCommand::CrossfadeAnimation {
                        clip_name: opts.clip_name,
                        fade_duration_ms: opts.fade_duration_ms,
                        loop_anim: opts.loop_anim,
                    },
                )?;

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
                apply_alias(
                    service,
                    PuppetCommand::SetBlendWeight {
                        clip_name: opts.clip_name,
                        weight: opts.weight,
                    },
                )?;

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

            "set_opacity" => {
                #[derive(Debug, Deserialize)]
                struct SetOpacityOptions {
                    node_id: String,
                    opacity: f32,
                }
                let opts: SetOpacityOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                apply_alias(
                    service,
                    PuppetCommand::SetNodeOpacity {
                        node_id: opts.node_id,
                        opacity: opts.opacity,
                    },
                )?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "expressions" => {
                let service = self.service()?;
                let expressions = service
                    .get_expressions()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(expressions)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "set_expression" => {
                #[derive(Debug, Deserialize)]
                struct SetExpressionOptions {
                    name: String,
                }
                let opts: SetExpressionOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                apply_alias(service, PuppetCommand::SetExpression { name: opts.name })?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "clear_expression" => {
                let service = self.service()?;
                apply_alias(service, PuppetCommand::ClearExpression)?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "load_auxiliary" => {
                #[derive(Debug, Deserialize)]
                struct AuxiliaryBody {
                    #[serde(default)]
                    expressions: Vec<(String, String)>,
                    #[serde(default)]
                    motions: Vec<(String, String)>,
                    #[serde(default)]
                    physics: Option<String>,
                }
                let body = body
                    .ok_or_else(|| ApiError::InvalidRequest("request body required".to_string()))?;
                let aux: AuxiliaryBody = serde_json::from_value(body)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                apply_alias(
                    service,
                    PuppetCommand::LoadMoc3Auxiliary {
                        expressions: aux.expressions,
                        motions: aux.motions,
                        physics_json: aux.physics,
                    },
                )?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "set_texture" => {
                #[derive(Debug, Deserialize)]
                struct SetTextureOptions {
                    node_id: String,
                    texture_index: usize,
                }
                let opts: SetTextureOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                apply_alias(
                    service,
                    PuppetCommand::SetTexture {
                        node_id: opts.node_id,
                        texture_index: opts.texture_index,
                    },
                )?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "export_motion3" => {
                let clip_name = options
                    .get("clip_name")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ApiError::InvalidRequest("clip_name required".to_string()))?;
                let service = self.service()?;
                let json_str = service
                    .export_motion3(clip_name)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "json": json_str }),
                ))
            }

            "export_expression3" => {
                let expression_name = options
                    .get("expression_name")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ApiError::InvalidRequest("expression_name required".to_string())
                    })?;
                let service = self.service()?;
                let json_str = service
                    .export_expression3(expression_name)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "json": json_str }),
                ))
            }

            "export_h264" => {
                #[derive(Debug, Deserialize)]
                struct ExportH264Options {
                    output_path: String,
                    #[serde(default)]
                    width: Option<u32>,
                    #[serde(default)]
                    height: Option<u32>,
                    #[serde(default)]
                    fps: Option<f64>,
                    #[serde(default)]
                    duration_ms: Option<f64>,
                    #[serde(default)]
                    bitrate: Option<u64>,
                    #[serde(default)]
                    gop_size: Option<u32>,
                }
                let opts: ExportH264Options = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;
                let defaults = PuppetExportConfig::default();
                let config = PuppetExportConfig {
                    width: opts.width.unwrap_or(defaults.width),
                    height: opts.height.unwrap_or(defaults.height),
                    fps: opts.fps.unwrap_or(defaults.fps),
                    duration_ms: opts.duration_ms.unwrap_or(defaults.duration_ms),
                    bitrate: opts.bitrate.unwrap_or(defaults.bitrate),
                    gop_size: opts.gop_size.unwrap_or(defaults.gop_size),
                };

                let service = self.service()?;
                let summary = service
                    .export_h264_to_path(&opts.output_path, config)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(summary)
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

fn apply_alias(service: &dyn IPuppetService, command: PuppetCommand) -> ApiResult<Value> {
    let ack = service
        .apply_puppet_command_alias(command)
        .map_err(|e| ApiError::ServiceError(e.to_string()))?;
    ack_data(ack)
}

fn ack_data(ack: PuppetCommandAck) -> ApiResult<Value> {
    if ack.status != PuppetCommandAckStatus::Applied {
        let message = ack
            .error
            .as_ref()
            .map(|error| error.message.clone())
            .unwrap_or_else(|| "puppet command rejected".to_string());
        return Err(ApiError::ServiceError(message));
    }

    Ok(ack.result.unwrap_or(Value::Null))
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_kernel::facade::ServiceFactory;

    fn create_test_controller() -> PuppetsController {
        let services = ServiceFactory::new().create_with_gpu(None);
        PuppetsController::new(services.puppet_service)
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
        let result = controller.handle("snapshot", None, Value::Null, None).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_params_empty_puppet() {
        let controller = create_test_controller();
        let result = controller.handle("params", None, Value::Null, None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_tick_empty_puppet() {
        let controller = create_test_controller();
        let result = controller.handle("tick", None, Value::Null, None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_no_service_returns_error() {
        let controller = create_controller_without_service();
        let result = controller.handle("snapshot", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_load_requires_body() {
        let controller = create_test_controller();
        let result = controller.handle("load", None, Value::Null, None).await;
        assert!(result.is_err());
    }
}
