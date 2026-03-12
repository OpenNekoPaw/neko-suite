//! ServiceContainer - Factory for creating and managing service instances
//!
//! Provides dependency injection and service lifecycle management.

use crate::gpu::GpuContext;
use crate::services::impls::{
    AudioService, ExportService, ImageService, NodeService, SceneService, TaskService,
    TimelineService, VideoService,
};
use std::sync::Arc;

/// Service container for dependency injection
///
/// Creates and manages service instances with shared dependencies.
pub struct ServiceContainer {
    /// GPU context (shared across services)
    gpu_ctx: Option<Arc<GpuContext>>,
    /// Task service (shared for task management)
    task_service: Arc<TaskService>,
    /// Node service
    node_service: Arc<NodeService>,
    /// Video service
    video_service: Arc<VideoService>,
    /// Audio service
    audio_service: Arc<AudioService>,
    /// Image service
    image_service: Arc<ImageService>,
    /// Timeline service
    timeline_service: Arc<TimelineService>,
    /// Export service (requires GPU)
    export_service: Option<Arc<ExportService>>,
    /// Scene service (3D scene management)
    scene_service: Arc<SceneService>,
}

impl ServiceContainer {
    /// Create a new service container with GPU context
    pub async fn new() -> crate::error::Result<Self> {
        // Initialize GPU context
        let gpu_ctx = match GpuContext::new().await {
            Ok(ctx) => Some(Arc::new(ctx)),
            Err(e) => {
                tracing::warn!("GPU initialization failed, running in CPU-only mode: {}", e);
                None
            }
        };

        Self::with_gpu(gpu_ctx)
    }

    /// Create a service container with optional GPU context
    pub fn with_gpu(gpu_ctx: Option<Arc<GpuContext>>) -> crate::error::Result<Self> {
        let task_service = Arc::new(TaskService::new());
        let mut node_service = NodeService::new(gpu_ctx.clone());
        node_service.set_task_service(task_service.clone());
        let node_service = Arc::new(node_service);
        let video_service = Arc::new(VideoService::new(gpu_ctx.clone(), task_service.clone()));
        let audio_service = Arc::new(AudioService::new(gpu_ctx.clone(), task_service.clone()));
        let image_service = Arc::new(ImageService::new(gpu_ctx.clone()));
        let timeline_service =
            Arc::new(TimelineService::new(gpu_ctx.clone(), task_service.clone()));
        let scene_service = Arc::new(SceneService::new());

        // Export service requires GPU
        let export_service = gpu_ctx
            .as_ref()
            .map(|ctx| Arc::new(ExportService::new(Arc::clone(ctx))));

        Ok(Self {
            gpu_ctx,
            task_service,
            node_service,
            video_service,
            audio_service,
            image_service,
            timeline_service,
            export_service,
            scene_service,
        })
    }

    /// Create a service container without GPU (for testing)
    pub fn without_gpu() -> Self {
        let task_service = Arc::new(TaskService::new());
        let mut node_service = NodeService::new(None);
        node_service.set_task_service(task_service.clone());
        let node_service = Arc::new(node_service);
        let video_service = Arc::new(VideoService::new(None, task_service.clone()));
        let audio_service = Arc::new(AudioService::new(None, task_service.clone()));
        let image_service = Arc::new(ImageService::new(None));
        let timeline_service = Arc::new(TimelineService::new(None, task_service.clone()));
        let scene_service = Arc::new(SceneService::new());

        Self {
            gpu_ctx: None,
            task_service,
            node_service,
            video_service,
            audio_service,
            image_service,
            timeline_service,
            export_service: None,
            scene_service,
        }
    }

    /// Get the GPU context
    pub fn gpu_context(&self) -> Option<&Arc<GpuContext>> {
        self.gpu_ctx.as_ref()
    }

    /// Get the task service
    pub fn task_service(&self) -> &Arc<TaskService> {
        &self.task_service
    }

    /// Get the node service
    pub fn node_service(&self) -> &Arc<NodeService> {
        &self.node_service
    }

    /// Get the video service
    pub fn video_service(&self) -> &Arc<VideoService> {
        &self.video_service
    }

    /// Get the audio service
    pub fn audio_service(&self) -> &Arc<AudioService> {
        &self.audio_service
    }

    /// Get the image service
    pub fn image_service(&self) -> &Arc<ImageService> {
        &self.image_service
    }

    /// Get the timeline service
    pub fn timeline_service(&self) -> &Arc<TimelineService> {
        &self.timeline_service
    }

    /// Get the export service (requires GPU)
    pub fn export_service(&self) -> Option<&Arc<ExportService>> {
        self.export_service.as_ref()
    }

    /// Get the scene service
    pub fn scene_service(&self) -> &Arc<SceneService> {
        &self.scene_service
    }

    /// Check if GPU is available
    pub fn has_gpu(&self) -> bool {
        self.gpu_ctx.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_container_without_gpu() {
        let container = ServiceContainer::without_gpu();
        assert!(!container.has_gpu());
        assert!(container.gpu_context().is_none());
        assert!(container.export_service().is_none());
    }

    #[test]
    fn test_service_container_services() {
        let container = ServiceContainer::without_gpu();

        // Services should be accessible
        let _task = container.task_service();
        let _node = container.node_service();
        let _video = container.video_service();
        let _audio = container.audio_service();
        let _image = container.image_service();
        let _timeline = container.timeline_service();
    }
}
