//! ScenesController - handles scenes:* actions for 3D scene management

use crate::controllers::Controller;
use crate::error::{ApiError, ApiResult};
use neko_engine_kernel::gpu::scene_renderer::CameraParams;
use neko_engine_kernel::services::{ISceneService, SceneService};
use neko_engine_types::registry;
use neko_engine_types::ActionResponse;
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
                let source = opts
                    .source
                    .ok_or_else(|| ApiError::InvalidRequest("source path required".to_string()))?;

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
                let clip_name = opts
                    .clip_name
                    .ok_or_else(|| ApiError::InvalidRequest("clip_name required".to_string()))?;
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

            "capture" => {
                #[derive(Debug, Deserialize, Default)]
                #[serde(rename_all = "camelCase")]
                struct CaptureOptions {
                    width: Option<u32>,
                    height: Option<u32>,
                    clip_name: Option<String>,
                    time: Option<f32>,
                    background_color: Option<[f32; 4]>,
                    camera_override: Option<CameraOverrideOptions>,
                }
                #[derive(Debug, Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct CameraOverrideOptions {
                    position: [f32; 3],
                    target: [f32; 3],
                    #[serde(default = "default_up")]
                    up: [f32; 3],
                    #[serde(default = "default_fov")]
                    fov_y: f32,
                }
                fn default_up() -> [f32; 3] {
                    [0.0, 1.0, 0.0]
                }
                fn default_fov() -> f32 {
                    45.0_f32.to_radians()
                }

                let opts: CaptureOptions = serde_json::from_value(options).unwrap_or_default();
                let width = opts.width.unwrap_or(1920);
                let height = opts.height.unwrap_or(1080);
                let time = opts.time.unwrap_or(0.0);

                let camera = opts.camera_override.map(|c| CameraParams {
                    position: glam::Vec3::from(c.position),
                    target: glam::Vec3::from(c.target),
                    up: glam::Vec3::from(c.up),
                    fov_y: c.fov_y,
                    ..CameraParams::default()
                });

                let service = self.service()?;
                let output = service
                    .render_frame(
                        opts.clip_name.as_deref(),
                        time,
                        (width, height),
                        camera.as_ref(),
                        opts.background_color,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                // Return render metadata (CPU readback + PNG encoding is a future step)
                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({
                        "width": output.width,
                        "height": output.height,
                        "status": "rendered"
                    }),
                ))
            }

            "composite" => {
                // Internal pipeline call — returns render stats
                let service = self.service()?;
                let _output = service
                    .render_frame(None, 0.0, (1920, 1080), None, None)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::json!({ "status": "composited" }),
                ))
            }

            // Stream requires WebSocket setup (future phase)
            "stream" => Err(ApiError::ServiceError(
                "scenes:stream not yet implemented (requires WebSocket)".to_string(),
            )),

            "create_shape" => {
                let service = self.service()?;
                let snapshot = service
                    .create_shape(options)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Shape created",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "create_text" => {
                let service = self.service()?;
                let snapshot = service
                    .create_text_mesh(options)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Text mesh created",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "csg_boolean" => {
                #[derive(Debug, Deserialize)]
                struct CsgOptions {
                    entity_a: String,
                    entity_b: String,
                    operation: String,
                }
                let opts: CsgOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let snapshot = service
                    .csg_boolean(&opts.entity_a, &opts.entity_b, &opts.operation)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "CSG operation complete",
                    serde_json::to_value(snapshot)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "export_gltf" => {
                let service = self.service()?;
                let glb_data = service
                    .export_glb()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                // Return GLB as base64-encoded string
                use base64::Engine;
                let encoded = base64::engine::general_purpose::STANDARD.encode(&glb_data);

                Ok(ActionResponse::ok(
                    "GLB exported",
                    serde_json::json!({
                        "format": "glb",
                        "encoding": "base64",
                        "data": encoded,
                        "byteLength": glb_data.len()
                    }),
                ))
            }

            "save_project" => {
                #[derive(Debug, Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct SaveOptions {
                    path: String,
                    editor_state: Option<serde_json::Value>,
                }
                let opts: SaveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .save_project(
                        &opts.path,
                        opts.editor_state.unwrap_or(serde_json::Value::Null),
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Project saved",
                    serde_json::json!({ "path": opts.path }),
                ))
            }

            "load_project" => {
                #[derive(Debug, Deserialize)]
                struct LoadProjectOptions {
                    path: String,
                }
                let opts: LoadProjectOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let (snapshot, editor_state) = service
                    .load_project(&opts.path)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "Project loaded",
                    serde_json::json!({
                        "snapshot": serde_json::to_value(&snapshot)
                            .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                        "editorState": editor_state
                    }),
                ))
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
                    node_id: String,
                    property: String,
                    timestamp: f32,
                    values: Vec<f32>,
                }
                let opts: KeyframeAddOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let id = service
                    .add_keyframe(
                        &opts.clip_name,
                        &opts.node_id,
                        &opts.property,
                        opts.timestamp,
                        opts.values,
                    )
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
                    keyframe_id: String,
                }
                let opts: KeyframeRemoveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .remove_keyframe(&opts.clip_name, &opts.keyframe_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "keyframe_update" => {
                #[derive(Debug, Deserialize)]
                struct KeyframeUpdateOptions {
                    clip_name: String,
                    keyframe_id: String,
                    timestamp: Option<f32>,
                    values: Option<Vec<f32>>,
                    easing: Option<String>,
                }
                let opts: KeyframeUpdateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let easing = opts
                    .easing
                    .map(|s| neko_engine_types::easing::EasingType::from_name(&s));

                let service = self.service()?;
                service
                    .update_keyframe(
                        &opts.clip_name,
                        &opts.keyframe_id,
                        opts.timestamp,
                        opts.values,
                        easing,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "clip_create" => {
                #[derive(Debug, Deserialize)]
                struct ClipCreateOptions {
                    name: String,
                    duration: f32,
                }
                let opts: ClipCreateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .create_clip(&opts.name, opts.duration)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "anim_crossfade" => {
                #[derive(Debug, Deserialize)]
                struct CrossfadeOptions {
                    clip_name: String,
                    fade_duration: f32,
                    #[serde(default)]
                    loop_anim: bool,
                }
                let opts: CrossfadeOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .crossfade_animation(&opts.clip_name, opts.fade_duration, opts.loop_anim)
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

            "ik_create" => {
                #[derive(Debug, Deserialize)]
                struct IkCreateOptions {
                    root_joint: String,
                    end_effector: String,
                    solver: Option<String>,
                    iterations: Option<u32>,
                    tolerance: Option<f32>,
                }
                let opts: IkCreateOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                let id = service
                    .create_ik_chain(
                        &opts.root_joint,
                        &opts.end_effector,
                        opts.solver.as_deref().unwrap_or("fabrik"),
                        opts.iterations.unwrap_or(10),
                        opts.tolerance.unwrap_or(0.001),
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", serde_json::json!({ "id": id })))
            }

            "ik_remove" => {
                #[derive(Debug, Deserialize)]
                struct IkRemoveOptions {
                    chain_id: String,
                }
                let opts: IkRemoveOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .remove_ik_chain(&opts.chain_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "ik_target" => {
                #[derive(Debug, Deserialize)]
                struct IkTargetOptions {
                    chain_id: String,
                    position: [f32; 3],
                    rotation: Option<[f32; 4]>,
                    pole: Option<[f32; 3]>,
                }
                let opts: IkTargetOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_ik_target(&opts.chain_id, opts.position, opts.rotation, opts.pole)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "ik_enable" => {
                #[derive(Debug, Deserialize)]
                struct IkEnableOptions {
                    chain_id: String,
                    enabled: bool,
                }
                let opts: IkEnableOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_ik_enabled(&opts.chain_id, opts.enabled)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "ik_list" => {
                let service = self.service()?;
                let chains = service
                    .get_ik_chains()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(chains)
                        .map_err(|e| ApiError::SerializationError(e.to_string()))?,
                ))
            }

            "set_visible" => {
                #[derive(Debug, Deserialize)]
                struct SetVisibleOptions {
                    node_id: String,
                    visible: bool,
                }
                let opts: SetVisibleOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_visible(&opts.node_id, opts.visible)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "morph_weights" => {
                #[derive(Debug, Deserialize)]
                struct MorphWeightsOptions {
                    node_id: String,
                    weights: Vec<f32>,
                }
                let opts: MorphWeightsOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .set_morph_weights(&opts.node_id, opts.weights)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "set_face_params" => {
                let params: std::collections::HashMap<String, f32> =
                    serde_json::from_value(options)
                        .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;
                let service = self.service()?;
                service
                    .set_face_params(params)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                Ok(ActionResponse::ok("", Value::Null))
            }

            "get_face_params" => {
                let service = self.service()?;
                let params = service
                    .get_face_params()
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;
                Ok(ActionResponse::ok(
                    "",
                    serde_json::to_value(params).unwrap_or_default(),
                ))
            }

            "update_material" => {
                #[derive(Debug, Deserialize)]
                struct UpdateMaterialOptions {
                    node_id: String,
                    base_color: Option<[f32; 4]>,
                    metallic: Option<f32>,
                    roughness: Option<f32>,
                    emissive: Option<[f32; 3]>,
                    occlusion_strength: Option<f32>,
                }
                let opts: UpdateMaterialOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .update_material(
                        &opts.node_id,
                        opts.base_color,
                        opts.metallic,
                        opts.roughness,
                        opts.emissive,
                        opts.occlusion_strength,
                    )
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

            "delete_node" => {
                #[derive(Debug, Deserialize)]
                struct DeleteNodeOptions {
                    node_id: String,
                }
                let opts: DeleteNodeOptions = serde_json::from_value(options)
                    .map_err(|e| ApiError::InvalidRequest(e.to_string()))?;

                let service = self.service()?;
                service
                    .delete_node(&opts.node_id)
                    .map_err(|e| ApiError::ServiceError(e.to_string()))?;

                Ok(ActionResponse::ok("", Value::Null))
            }

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
        assert!(actions.contains(&"create_shape"));
        assert!(actions.contains(&"create_text"));
        assert!(actions.contains(&"csg_boolean"));
        assert!(actions.contains(&"export_gltf"));
        assert!(actions.contains(&"save_project"));
        assert!(actions.contains(&"load_project"));
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
        let result = controller.handle("snapshot", None, Value::Null, None).await;
        assert!(result.is_ok());
        let response = result.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_animate_empty_scene() {
        let controller = create_test_controller();
        let result = controller.handle("animate", None, Value::Null, None).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_no_service_returns_error() {
        let controller = create_controller_without_service();
        let result = controller.handle("snapshot", None, Value::Null, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_capture_empty_scene() {
        // Without GPU, render_frame returns error
        let controller = create_test_controller();
        let result = controller.handle("capture", None, Value::Null, None).await;
        assert!(result.is_err());
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
