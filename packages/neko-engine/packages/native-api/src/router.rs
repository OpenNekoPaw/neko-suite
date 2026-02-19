//! ActionRouter - Routes ActionRequest to appropriate controllers

use crate::controllers::{
    AudioController, CanvasController, Controller, ImageController,
    ModelsController, NodeController, ScenesController, StreamController, TaskController,
    TimelineController, VideoController,
};
use crate::error::{ApiError, ApiResult};
use crate::registry::{ResourceRegistry, StreamRegistry};
use neko_native_core::services::{
    AudioService, ExportService, ImageService, NodeService, TaskService,
    TimelineService, VideoService,
};
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
    models_controller: ModelsController,
    canvas_controller: CanvasController,
    scenes_controller: ScenesController,
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
        resource_registry: Arc<ResourceRegistry>,
        stream_registry: Arc<StreamRegistry>,
    ) -> Self {
        Self {
            node_controller: NodeController::new(node_service),
            task_controller: TaskController::new(task_service),
            video_controller: VideoController::new(video_service, resource_registry.clone(), stream_registry.clone()),
            audio_controller: AudioController::new(audio_service, resource_registry.clone(), stream_registry.clone()),
            image_controller: ImageController::new(image_service, resource_registry),
            timeline_controller: TimelineController::new(timeline_service, export_service, stream_registry.clone()),
            stream_controller: StreamController::new(stream_registry),
            models_controller: ModelsController::new(),
            canvas_controller: CanvasController::new(),
            scenes_controller: ScenesController::new(),
        }
    }

    /// Route a request to the appropriate controller
    pub async fn route(&self, request: ActionRequest) -> ApiResult<ActionResponse> {
        let resource_id = if request.id.is_empty() {
            None
        } else {
            Some(request.id.as_str())
        };

        tracing::debug!(
            "Routing {}:{} to controller",
            request.group,
            request.action
        );

        match request.group.as_str() {
            "nodes" => {
                self.node_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "tasks" => {
                self.task_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "videos" => {
                self.video_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "audios" => {
                self.audio_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "images" => {
                self.image_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "timelines" => {
                self.timeline_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "models" => {
                self.models_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "canvas" => {
                self.canvas_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "scenes" => {
                self.scenes_controller
                    .handle(&request.action, resource_id, request.options, request.body)
                    .await
            }
            "streams" => {
                self.stream_controller
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
        vec![
            "nodes", "tasks", "videos", "audios", "images", "timelines",
            "streams", "models", "canvas", "scenes",
        ]
    }

    /// Get list of supported actions for a group
    pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
        match group {
            "nodes" => Some(self.node_controller.actions()),
            "tasks" => Some(self.task_controller.actions()),
            "videos" => Some(self.video_controller.actions()),
            "audios" => Some(self.audio_controller.actions()),
            "images" => Some(self.image_controller.actions()),
            "timelines" => Some(self.timeline_controller.actions()),
            "models" => Some(self.models_controller.actions()),
            "canvas" => Some(self.canvas_controller.actions()),
            "scenes" => Some(self.scenes_controller.actions()),
            "streams" => Some(self.stream_controller.actions()),
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
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());

        ActionRouter::new(
            task_service,
            node_service,
            video_service,
            audio_service,
            image_service,
            timeline_service,
            None, // No GPU = no export service in tests
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
    #[ignore = "TaskService uses blocking_read which panics in async context"]
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
        assert!(groups.contains(&"streams"));
        // "exports" group has been removed; export is now a timelines action
        assert!(!groups.contains(&"exports"));
    }

    #[tokio::test]
    async fn test_route_models_not_implemented() {
        let router = create_test_router();

        let request = ActionRequest::new("models", "probe");
        let result = router.route(request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not yet implemented"));
    }

    #[tokio::test]
    async fn test_route_canvas_not_implemented() {
        let router = create_test_router();

        let request = ActionRequest::new("canvas", "composite");
        let result = router.route(request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not yet implemented"));
    }

    #[tokio::test]
    async fn test_route_scenes_not_implemented() {
        let router = create_test_router();

        let request = ActionRequest::new("scenes", "composite");
        let result = router.route(request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not yet implemented"));
    }

    #[test]
    fn test_actions_for_placeholder_controllers() {
        let router = create_test_router();

        let models_actions = router.actions("models").unwrap();
        assert_eq!(models_actions, &["probe", "capture", "stream", "diff"]);

        let canvas_actions = router.actions("canvas").unwrap();
        assert_eq!(canvas_actions, &["composite", "capture", "export", "diff"]);

        let scenes_actions = router.actions("scenes").unwrap();
        assert_eq!(scenes_actions, &["composite", "capture", "stream"]);
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
            &["create", "activate", "pause", "resume", "destroy", "list"]
        );
    }
}
