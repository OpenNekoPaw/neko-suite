//! ActionRouter - Routes ActionRequest to appropriate controllers

use crate::controllers::{
    AudioController, CameraController, CanvasController, ColorCorrectionController, Controller,
    DocumentsController, EffectsController, GamepadController, ImageController, MidiController,
    ModelsController, NodeController, PuppetsController, ScenesController, StreamController,
    TaskController, TimelineController, VideoController,
};
use crate::error::{ApiError, ApiResult};
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_native_core::services::{
    AudioService, CameraService, EffectsService, ExportService, GamepadService, ImageService,
    MidiService, NodeService, PuppetService, SceneService, TaskService, TimelineService,
    VideoService,
};

#[cfg(feature = "onnx")]
use neko_native_core::services::IMlService;
use neko_types::registry::{self, groups};
use neko_types::{ActionRequest, ActionResponse};
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
}

impl ActionRouter {
    /// Create a new ActionRouter with all controllers
    pub fn new(
        task_service: Arc<TaskService>,
        node_service: Arc<NodeService>,
        video_service: Arc<VideoService>,
        audio_service: Arc<AudioService>,
        image_service: Arc<ImageService>,
        timeline_service: Arc<TimelineService>,
        export_service: Option<Arc<ExportService>>,
        effects_service: Option<Arc<EffectsService>>,
        scene_service: Option<Arc<SceneService>>,
        puppet_service: Option<Arc<PuppetService>>,
        camera_service: Arc<CameraService>,
        midi_service: Arc<MidiService>,
        gamepad_service: Arc<GamepadService>,
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
        #[cfg(feature = "onnx")] ml_service: Option<Arc<dyn IMlService>>,
    ) -> Self {
        Self {
            node_controller: NodeController::new(node_service),
            task_controller: TaskController::new(task_service),
            video_controller: VideoController::new(
                video_service,
                resource_registry.clone(),
                stream_registry.clone(),
            ),
            audio_controller: AudioController::new(
                audio_service,
                resource_registry.clone(),
                stream_registry.clone(),
            ),
            image_controller: ImageController::new(image_service, resource_registry),
            timeline_controller: TimelineController::new(
                timeline_service.clone(),
                export_service,
                stream_registry.clone(),
            ),
            stream_controller: StreamController::new(stream_registry, timeline_service),
            effects_controller: EffectsController::new(effects_service),
            #[cfg(feature = "onnx")]
            models_controller: ModelsController::new(ml_service),
            #[cfg(not(feature = "onnx"))]
            models_controller: ModelsController::new(),
            canvas_controller: CanvasController::new(),
            scenes_controller: ScenesController::new(scene_service),
            puppets_controller: PuppetsController::new(puppet_service),
            camera_controller: CameraController::new(camera_service),
            midi_controller: MidiController::new(midi_service),
            gamepad_controller: GamepadController::new(gamepad_service),
            color_correction_controller: ColorCorrectionController::new(),
            documents_controller: DocumentsController::new(),
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
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_router() -> ActionRouter {
        let task_service = Arc::new(TaskService::new());
        let node_service = Arc::new(NodeService::new(None));
        let video_service = Arc::new(VideoService::new(None, task_service.clone()));
        let audio_service = Arc::new(AudioService::new(None, task_service.clone()));
        let image_service = Arc::new(ImageService::new(None));
        let timeline_service = Arc::new(TimelineService::new(None, task_service.clone()));
        let scene_service = Some(Arc::new(SceneService::new()));
        let puppet_service = Some(Arc::new(PuppetService::new()));
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());

        let camera_service = Arc::new(CameraService::new());
        let midi_service = Arc::new(MidiService::new());
        let gamepad_service = Arc::new(GamepadService::new());

        ActionRouter::new(
            task_service,
            node_service,
            video_service,
            audio_service,
            image_service,
            timeline_service,
            None, // No GPU = no export service in tests
            None, // No GPU = no effects service in tests
            scene_service,
            puppet_service,
            camera_service,
            midi_service,
            gamepad_service,
            resource_registry,
            stream_registry,
        )
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
        // "exports" group has been removed; export is now a timelines action
        assert!(!groups.contains(&"exports"));
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
            ]
        );

        let canvas_actions = router.actions("canvas").unwrap();
        assert_eq!(canvas_actions, &["composite", "capture", "export", "diff"]);

        let scenes_actions = router.actions("scenes").unwrap();
        assert!(scenes_actions.contains(&"load"));
        assert!(scenes_actions.contains(&"graph"));
        assert!(scenes_actions.contains(&"transform"));
        assert!(scenes_actions.contains(&"composite"));
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
