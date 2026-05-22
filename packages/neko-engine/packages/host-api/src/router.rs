//! ActionRouter - Routes ActionRequest to appropriate controllers

use crate::controllers::{
    is_model_preview_action, AudioController, CameraController, CanvasController,
    ColorCorrectionController, Controller, DocumentsController, EffectsController, FilesController,
    GamepadController, ImageController, LiveCompositorController, MidiController,
    ModelPreviewController, ModelsController, NodeController, PluginsController,
    PreviewsController, PuppetsController, ScenesController, StreamController, TaskController,
    TimelineController, VideoController, ViewportController,
};
use crate::error::{ApiError, ApiResult};
use crate::plugin::PluginManager;
use crate::preview::PreviewFileRegistry;
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_engine_kernel::facade::KernelServices;

use neko_engine_types::registry::{self, groups};
use neko_engine_types::{ActionRequest, ActionResponse};
#[cfg(feature = "onnx")]
use neko_runtime_ml::IMlService;
use std::sync::Arc;

/// Action router that dispatches requests to controllers
pub struct ActionRouter {
    node_controller: NodeController,
    task_controller: TaskController,
    video_controller: VideoController,
    audio_controller: AudioController,
    image_controller: ImageController,
    timeline_controller: TimelineController,
    stream_controller: StreamController,
    effects_controller: EffectsController,
    models_controller: ModelsController,
    canvas_controller: CanvasController,
    scenes_controller: ScenesController,
    puppets_controller: PuppetsController,
    camera_controller: CameraController,
    midi_controller: MidiController,
    gamepad_controller: GamepadController,
    color_correction_controller: ColorCorrectionController,
    documents_controller: DocumentsController,
    files_controller: FilesController,
    plugins_controller: PluginsController,
    previews_controller: PreviewsController,
    viewport_controller: ViewportController,
    live_compositor_controller: LiveCompositorController,
    model_preview_controller: Arc<ModelPreviewController>,
}

impl ActionRouter {
    /// Create a new ActionRouter with all controllers
    pub fn new(
        kernel_services: KernelServices,
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
        plugin_manager: Arc<PluginManager>,
        preview_registry: Arc<PreviewFileRegistry>,
        model_preview_controller: Arc<ModelPreviewController>,
        #[cfg(feature = "onnx")] ml_service: Option<Arc<dyn IMlService>>,
    ) -> Self {
        let file_access_registry = preview_registry.file_access().clone();
        Self {
            node_controller: NodeController::new(kernel_services.node_service),
            task_controller: TaskController::new(kernel_services.task_service),
            video_controller: VideoController::new(
                kernel_services.video_service,
                resource_registry.clone(),
                stream_registry.clone(),
            )
            .with_file_access_registry(file_access_registry.clone()),
            audio_controller: AudioController::new(
                kernel_services.audio_service,
                resource_registry.clone(),
                stream_registry.clone(),
            )
            .with_file_access_registry(file_access_registry.clone()),
            image_controller: ImageController::new(
                kernel_services.image_service,
                resource_registry,
            ),
            timeline_controller: TimelineController::new(
                kernel_services.timeline_service.clone(),
                kernel_services.export_service,
                stream_registry.clone(),
            ),
            stream_controller: StreamController::new(
                stream_registry.clone(),
                kernel_services.timeline_service,
            ),
            effects_controller: EffectsController::new(
                kernel_services.effects_service,
                kernel_services.effect_registry,
            ),
            #[cfg(feature = "onnx")]
            models_controller: ModelsController::new(ml_service),
            #[cfg(not(feature = "onnx"))]
            models_controller: ModelsController::new(),
            canvas_controller: CanvasController::new(),
            scenes_controller: ScenesController::with_stream_registry(
                kernel_services.scene_service.clone(),
                stream_registry.clone(),
                model_preview_controller.clone(),
            )
            .with_file_access_registry(file_access_registry.clone()),
            puppets_controller: PuppetsController::new(kernel_services.puppet_service)
                .with_file_access_registry(file_access_registry.clone()),
            camera_controller: CameraController::new(kernel_services.camera_service),
            midi_controller: MidiController::new(kernel_services.midi_service),
            gamepad_controller: GamepadController::new(kernel_services.gamepad_service),
            color_correction_controller: ColorCorrectionController::new(),
            documents_controller: DocumentsController::new(),
            files_controller: FilesController::new(file_access_registry),
            plugins_controller: PluginsController::new(plugin_manager),
            previews_controller: PreviewsController::new(preview_registry),
            viewport_controller: ViewportController::new(kernel_services.scene_service),
            live_compositor_controller: LiveCompositorController::with_stream_registry(
                stream_registry,
            ),
            model_preview_controller,
        }
    }

    /// Route a request to the appropriate controller
    pub async fn route(&self, request: ActionRequest) -> ApiResult<ActionResponse> {
        let resource_id = if request.id.is_empty() {
            None
        } else {
            Some(request.id.as_str())
        };

        tracing::debug!("Routing {}:{} to controller", request.group, request.action);

        match request.group.as_str() {
            groups::NODES => {
                self.node_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::TASKS => {
                self.task_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::VIDEOS => {
                self.video_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::AUDIOS => {
                self.audio_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::IMAGES => {
                self.image_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::TIMELINES => {
                self.timeline_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::MODELS => {
                self.models_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::CANVAS => {
                self.canvas_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::SCENES => {
                self.scenes_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::PUPPETS => {
                self.puppets_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::STREAMS => {
                self.stream_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::EFFECTS => {
                self.effects_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::CAMERAS => {
                self.camera_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::MIDI => {
                self.midi_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::GAMEPAD => {
                self.gamepad_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::COLOR_CORRECTION => {
                self.color_correction_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::DOCUMENTS => {
                self.documents_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::FILES => {
                self.files_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::PLUGINS => {
                self.plugins_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::PREVIEWS => {
                self.previews_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::VIEWPORT => {
                if request.action == "command"
                    && LiveCompositorController::is_live_viewport_command_body(
                        request.body.as_ref(),
                    )
                {
                    return self
                        .live_compositor_controller
                        .handle(&request.action, resource_id, request.options, request.body)
                        .await;
                }
                if request.action == "command"
                    && request
                        .body
                        .as_ref()
                        .and_then(|value| value.get("action"))
                        .and_then(serde_json::Value::as_str)
                        .is_some_and(is_model_preview_action)
                {
                    return self
                        .model_preview_controller
                        .handle(&request.action, resource_id, request.options, request.body)
                        .await;
                }
                self.viewport_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::LIVE_COMPOSITOR => {
                self.live_compositor_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            groups::MODEL_PREVIEW => {
                self.model_preview_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            _ => Err(ApiError::UnknownAction {
                group: request.group.clone(),
                action: request.action.clone(),
            }),
        }
    }

    /// Get list of supported groups
    pub fn groups(&self) -> Vec<&str> {
        registry::groups::ALL.to_vec()
    }

    /// Get list of supported actions for a group
    pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
        match group {
            groups::NODES => Some(self.node_controller.actions()),
            groups::TASKS => Some(self.task_controller.actions()),
            groups::VIDEOS => Some(self.video_controller.actions()),
            groups::AUDIOS => Some(self.audio_controller.actions()),
            groups::IMAGES => Some(self.image_controller.actions()),
            groups::TIMELINES => Some(self.timeline_controller.actions()),
            groups::MODELS => Some(self.models_controller.actions()),
            groups::CANVAS => Some(self.canvas_controller.actions()),
            groups::SCENES => Some(self.scenes_controller.actions()),
            groups::PUPPETS => Some(self.puppets_controller.actions()),
            groups::STREAMS => Some(self.stream_controller.actions()),
            groups::EFFECTS => Some(self.effects_controller.actions()),
            groups::CAMERAS => Some(self.camera_controller.actions()),
            groups::MIDI => Some(self.midi_controller.actions()),
            groups::GAMEPAD => Some(self.gamepad_controller.actions()),
            groups::COLOR_CORRECTION => Some(self.color_correction_controller.actions()),
            groups::DOCUMENTS => Some(self.documents_controller.actions()),
            groups::FILES => Some(self.files_controller.actions()),
            groups::PLUGINS => Some(self.plugins_controller.actions()),
            groups::PREVIEWS => Some(self.previews_controller.actions()),
            groups::VIEWPORT => Some(self.viewport_controller.actions()),
            groups::LIVE_COMPOSITOR => Some(self.live_compositor_controller.actions()),
            groups::MODEL_PREVIEW => Some(self.model_preview_controller.actions()),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_router() -> ActionRouter {
        let kernel_services =
            neko_engine_kernel::facade::ServiceFactory::new().create_with_gpu(None);
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());

        let plugin_manager = Arc::new(PluginManager::new(vec![], "0.1.0"));
        let preview_registry = Arc::new(PreviewFileRegistry::new());
        let model_preview_controller =
            Arc::new(ModelPreviewController::new(kernel_services.scene_service.clone()));

        ActionRouter::new(
            kernel_services,
            resource_registry,
            stream_registry,
            plugin_manager,
            preview_registry,
            model_preview_controller,
        )
    }

    fn live_scene_fixture() -> serde_json::Value {
        let fixture =
            include_str!("../../../../neko-types/src/types/__fixtures__/live-compositor-scene-v1.json");
        let value: serde_json::Value = serde_json::from_str(fixture).unwrap();
        value["scene"].clone()
    }

    #[tokio::test]
    async fn test_route_nodes_health() {
        let router = create_test_router();

        let request = ActionRequest::new("nodes", "health");

        let response = router.route(request).await.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_route_tasks_list() {
        let router = create_test_router();

        let request = ActionRequest::new("tasks", "list");

        let response = router.route(request).await.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_route_unknown_group() {
        let router = create_test_router();

        let request = ActionRequest::new("unknown", "test");

        let result = router.route(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_route_exports_group_removed() {
        let router = create_test_router();

        // "exports" group no longer exists; export is now under "timelines"
        let request = ActionRequest::new("exports", "start");

        let result = router.route(request).await;
        assert!(result.is_err());
        // Should be UnknownAction since "exports" group is removed
    }

    #[test]
    fn test_groups() {
        let router = create_test_router();
        let groups = router.groups();

        assert!(groups.contains(&"nodes"));
        assert!(groups.contains(&"tasks"));
        assert!(groups.contains(&"videos"));
        assert!(groups.contains(&"audios"));
        assert!(groups.contains(&"images"));
        assert!(groups.contains(&"timelines"));
        assert!(groups.contains(&"models"));
        assert!(groups.contains(&"canvas"));
        assert!(groups.contains(&"scenes"));
        assert!(groups.contains(&"puppets"));
        assert!(groups.contains(&"streams"));
        assert!(groups.contains(&"effects"));
        assert!(groups.contains(&"viewport"));
        assert!(groups.contains(&"live-compositor"));
        // "exports" group has been removed; export is now a timelines action
        assert!(!groups.contains(&"exports"));
    }

    #[tokio::test]
    async fn test_route_viewport_controller_registered() {
        let router = create_test_router();

        let request = ActionRequest::new("viewport", "command").with_body(serde_json::json!({
            "protocolVersion": 1,
            "domain": "viewport",
            "action": "viewport:select",
            "sceneId": "scene-a",
            "viewportId": "main",
            "seq": 1,
            "correlationId": "cmd-1",
            "timestamp": 100.0,
            "source": "user",
            "payload": { "x": 0.5, "y": 0.5 }
        }));

        let response = router.route(request).await.unwrap();
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_route_live_compositor_controller_registered() {
        let router = create_test_router();

        let create = ActionRequest::new("live-compositor", "create")
            .with_body(live_scene_fixture());
        let create_response = router.route(create).await.unwrap();
        assert!(create_response.is_ok());

        let get = ActionRequest::new("live-compositor", "get").with_id("live-scene-main");
        let get_response = router.route(get).await.unwrap();
        assert!(get_response.is_ok());
        assert_eq!(
            get_response.data.as_ref().unwrap()["scene"]["sceneId"],
            "live-scene-main"
        );
    }

    #[tokio::test]
    async fn test_route_live_scene_command_through_viewport_entrypoint() {
        let router = create_test_router();

        let create = ActionRequest::new("live-compositor", "create")
            .with_body(live_scene_fixture());
        router.route(create).await.unwrap();

        let command = ActionRequest::new("viewport", "command").with_body(serde_json::json!({
            "protocolVersion": 1,
            "domain": "scene",
            "action": "scene:live:set-preset",
            "sceneId": "live-scene-main",
            "viewportId": "viewport-live-main",
            "seq": 70,
            "correlationId": "live-cmd-70",
            "timestamp": 1810814400100.0,
            "source": "user",
            "baseRevision": 12,
            "payload": { "presetId": "preset-closeup" }
        }));
        let response = router.route(command).await.unwrap();
        let event = response.data.unwrap();

        assert_eq!(event["status"], "ack");
        assert_eq!(event["ackSeq"], 70);
        assert_eq!(event["revision"], 13);
        assert_eq!(event["payload"]["activePresetId"], "preset-closeup");
    }

    #[tokio::test]
    async fn test_route_models_not_implemented() {
        let router = create_test_router();

        let request = ActionRequest::new("models", "probe");
        let result = router.route(request).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not yet implemented"));
    }

    #[tokio::test]
    async fn test_route_canvas_not_implemented() {
        let router = create_test_router();

        let request = ActionRequest::new("canvas", "composite");
        let result = router.route(request).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("not yet implemented"));
    }

    #[tokio::test]
    async fn test_route_scenes_snapshot_works() {
        let router = create_test_router();

        let request = ActionRequest::new("scenes", "snapshot");
        let result = router.route(request).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_route_scenes_composite_requires_gpu() {
        let router = create_test_router();

        let request = ActionRequest::new("scenes", "composite");
        let result = router.route(request).await;
        // Without GPU, render_frame returns an error
        assert!(result.is_err());
    }

    #[test]
    fn test_actions_for_placeholder_controllers() {
        let router = create_test_router();

        let models_actions = router.actions("models").unwrap();
        assert_eq!(
            models_actions,
            &[
                "probe",
                "capture",
                "stream",
                "diff",
                "register",
                "unregister",
                "list",
                "upscale",
                "denoise",
                "clip",
                "transcribe",
                "preprocess",
            ]
        );

        let canvas_actions = router.actions("canvas").unwrap();
        assert_eq!(canvas_actions, &["composite", "capture", "export", "diff"]);

        let scenes_actions = router.actions("scenes").unwrap();
        assert!(scenes_actions.contains(&"load"));
        assert!(scenes_actions.contains(&"graph"));
        assert!(scenes_actions.contains(&"transform"));
        assert!(scenes_actions.contains(&"composite"));

        let viewport_actions = router.actions("viewport").unwrap();
        assert_eq!(viewport_actions, &["command"]);

        let live_compositor_actions = router.actions("live-compositor").unwrap();
        assert_eq!(
            live_compositor_actions,
            &["create", "update", "get", "reset", "list", "command", "stream", "stop"]
        );
    }

    #[test]
    fn test_groups_includes_streams() {
        let router = create_test_router();
        let groups = router.groups();
        assert!(groups.contains(&"streams"));
    }

    #[test]
    fn test_actions_for_streams() {
        let router = create_test_router();
        let actions = router.actions("streams").unwrap();
        assert_eq!(
            actions,
            &[
                "create",
                "activate",
                "pause",
                "resume",
                "destroy",
                "list",
                "stop",
                "seek",
                "speed",
                "loop",
                "stats",
                "update",
                "quality",
                "applyOperation"
            ]
        );
    }
}
