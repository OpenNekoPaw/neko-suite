//! EffectsController - handles effects:* actions

use crate::controllers::utils::{base64_decode, base64_encode};
use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_native_core::gpu::custom_shader_processor::ParamDef;
use neko_native_core::services::{EffectsService, IEffectsService};
use neko_types::registry;
use neko_types::ActionResponse;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

/// Controller for custom shader effect actions
pub struct EffectsController {
    effects_service: Option<Arc<EffectsService>>,
}

impl EffectsController {
    /// Create a new EffectsController
    pub fn new(effects_service: Option<Arc<EffectsService>>) -> Self {
        Self { effects_service }
    }

    fn require_service(&self) -> ApiResult<&EffectsService> {
        self.effects_service
            .as_ref()
            .map(|s| s.as_ref())
            .ok_or_else(|| {
                ApiError::ServiceError("Effects service unavailable (no GPU)".to_string())
            })
    }
}

/// Options for effects:apply
#[derive(Debug, Deserialize, Default)]
struct ApplyOptions {
    /// Base64-encoded RGBA frame data
    data: Option<String>,
    /// Frame width
    width: Option<u32>,
    /// Frame height
    height: Option<u32>,
    /// Shader ID (preset or custom)
    shader_id: Option<String>,
    /// Shader-specific parameters
    #[serde(default)]
    params: Value,
}

/// Options for effects:info
#[derive(Debug, Deserialize, Default)]
struct InfoOptions {
    shader_id: Option<String>,
}

/// Options for effects:register
#[derive(Debug, Deserialize, Default)]
struct RegisterOptions {
    /// Unique shader ID
    id: Option<String>,
    /// WGSL shader source code
    code: Option<String>,
    /// Parameter definitions
    #[serde(default)]
    params: Vec<ParamDefInput>,
}

#[derive(Debug, Deserialize, Default)]
struct ParamDefInput {
    name: String,
    #[serde(default)]
    default: f64,
    #[serde(default)]
    min: f64,
    #[serde(default = "default_max")]
    max: f64,
}

fn default_max() -> f64 {
    1.0
}

impl Controller for EffectsController {
    async fn handle(
        &self,
        action: &str,
        _resource_id: Option<&str>,
        options: Value,
        _body: Option<Value>,
    ) -> ApiResult<ActionResponse> {
        match action {
            "list" => {
                let service = self.require_service()?;
                let presets = service.list_presets();
                let response = serde_json::to_value(&presets)?;
                Ok(ActionResponse::ok("", response))
            }
            "info" => {
                let opts: InfoOptions = serde_json::from_value(options).unwrap_or_default();
                let shader_id = opts.shader_id.ok_or_else(|| {
                    ApiError::InvalidRequest("shader_id required for effects:info".to_string())
                })?;

                let service = self.require_service()?;
                let info = service.get_shader_info(&shader_id).ok_or_else(|| {
                    ApiError::NotFound(format!("Shader not found: {}", shader_id))
                })?;

                let response = serde_json::to_value(&info)?;
                Ok(ActionResponse::ok("", response))
            }
            "apply" => {
                let opts: ApplyOptions = serde_json::from_value(options).unwrap_or_default();

                let data_b64 = opts.data.ok_or_else(|| {
                    ApiError::InvalidRequest("data required for effects:apply".to_string())
                })?;
                let width = opts.width.ok_or_else(|| {
                    ApiError::InvalidRequest("width required for effects:apply".to_string())
                })?;
                let height = opts.height.ok_or_else(|| {
                    ApiError::InvalidRequest("height required for effects:apply".to_string())
                })?;
                let shader_id = opts.shader_id.ok_or_else(|| {
                    ApiError::InvalidRequest("shader_id required for effects:apply".to_string())
                })?;

                let rgba_data = base64_decode(&data_b64).map_err(|e| {
                    ApiError::InvalidRequest(format!("Invalid base64 data: {}", e))
                })?;

                let service = self.require_service()?;
                let result = service.apply_effect(&rgba_data, width, height, &shader_id, &opts.params)?;

                let response = serde_json::json!({
                    "width": width,
                    "height": height,
                    "shaderId": shader_id,
                    "size": result.len(),
                    "data": base64_encode(&result),
                });

                Ok(ActionResponse::ok("", response))
            }
            "register" => {
                let opts: RegisterOptions = serde_json::from_value(options).unwrap_or_default();

                let id = opts.id.ok_or_else(|| {
                    ApiError::InvalidRequest("id required for effects:register".to_string())
                })?;
                let code = opts.code.ok_or_else(|| {
                    ApiError::InvalidRequest("code required for effects:register".to_string())
                })?;

                let param_defs: Vec<ParamDef> = opts
                    .params
                    .into_iter()
                    .map(|p| ParamDef {
                        name: p.name,
                        default: p.default as f32,
                        min: p.min as f32,
                        max: p.max as f32,
                    })
                    .collect();

                let service = self.require_service()?;
                service.register_shader(&id, &code, param_defs).map_err(|e| {
                    ApiError::ServiceError(format!("Shader registration failed: {}", e))
                })?;

                let response = serde_json::json!({
                    "id": id,
                    "registered": true,
                });

                Ok(ActionResponse::ok("", response))
            }
            _ => Err(ApiError::UnknownAction {
                group: "effects".to_string(),
                action: action.to_string(),
            }),
        }
    }

    fn group(&self) -> &'static str {
        registry::groups::EFFECTS
    }

    fn actions(&self) -> &'static [&'static str] {
        registry::actions::EFFECTS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_controller() -> EffectsController {
        EffectsController::new(None)
    }

    #[tokio::test]
    async fn test_effects_controller_list_no_gpu() {
        let controller = create_test_controller();
        let result = controller.handle("list", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_effects_controller_unknown_action() {
        let controller = create_test_controller();
        let result = controller.handle("unknown", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_effects_controller_actions() {
        let controller = create_test_controller();
        let actions = controller.actions();
        assert!(actions.contains(&"apply"));
        assert!(actions.contains(&"list"));
        assert!(actions.contains(&"info"));
        assert!(actions.contains(&"register"));
    }
}
