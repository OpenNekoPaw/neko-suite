//! EngineApi - Main facade for all engine operations

use crate::error::{ApiError, ApiResult};
use crate::registry::{ResourceRegistry, StreamRegistry};
use crate::router::ActionRouter;
use crate::session::SessionManager;
use neko_native_core::gpu::GpuContext;
use neko_native_core::services::{
    AudioService, ExportService, ImageService, NodeService, TaskService, TimelineService,
    VideoService,
};
use neko_types::{ActionRequest, ActionResponse};
use std::sync::Arc;

/// Main facade for the Neko Engine API
///
/// Provides a unified interface for all engine operations.
/// This is the primary entry point for View layer adapters.
pub struct EngineApi {
    /// Action router
    router: ActionRouter,
    /// Resource registry
    resource_registry: Arc<ResourceRegistry>,
    /// Stream registry
    stream_registry: Arc<StreamRegistry>,
    /// Session manager
    session_manager: Arc<SessionManager>,
    /// GPU context (if available)
    gpu_ctx: Option<Arc<GpuContext>>,
}

impl EngineApi {
    /// Create a new EngineApi with GPU support
    pub async fn new() -> ApiResult<Self> {
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

    /// Create EngineApi with optional GPU context
    pub fn with_gpu(gpu_ctx: Option<Arc<GpuContext>>) -> ApiResult<Self> {
        // Create services
        let task_service = Arc::new(TaskService::new());
        let mut node_service = NodeService::new(gpu_ctx.clone());
        node_service.set_task_service(task_service.clone());
        let node_service = Arc::new(node_service);
        let video_service = Arc::new(VideoService::new(gpu_ctx.clone(), task_service.clone()));
        let audio_service = Arc::new(AudioService::new(gpu_ctx.clone(), task_service.clone()));
        let image_service = Arc::new(ImageService::new(gpu_ctx.clone()));
        let timeline_service = Arc::new(TimelineService::new(gpu_ctx.clone(), task_service.clone()));

        // Export service requires GPU
        let export_service = gpu_ctx.as_ref().map(|ctx| {
            Arc::new(ExportService::new(Arc::clone(ctx)))
        });

        // Create registries
        let resource_registry = Arc::new(ResourceRegistry::new());
        let stream_registry = Arc::new(StreamRegistry::new());

        // Create session manager
        let session_manager = Arc::new(SessionManager::new(stream_registry.clone()));

        // Wire up stream count into NodeService for metrics reporting
        let active_streams_counter = node_service.active_streams_counter();
        let stream_registry_for_sync = stream_registry.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
            loop {
                interval.tick().await;
                let count = stream_registry_for_sync.active_count().await;
                active_streams_counter.store(count, std::sync::atomic::Ordering::Relaxed);
            }
        });

        // Create router
        let router = ActionRouter::new(
            task_service,
            node_service,
            video_service,
            audio_service,
            image_service,
            timeline_service,
            export_service,
            resource_registry.clone(),
            stream_registry.clone(),
        );

        Ok(Self {
            router,
            resource_registry,
            stream_registry,
            session_manager,
            gpu_ctx,
        })
    }

    /// Create EngineApi without GPU (for testing)
    pub fn without_gpu() -> ApiResult<Self> {
        Self::with_gpu(None)
    }

    /// Dispatch an action request
    ///
    /// This is the main entry point for all operations.
    pub async fn dispatch(&self, request: ActionRequest) -> ActionResponse {
        let request_id = request.id.clone();

        tracing::debug!(
            "Dispatching {}:{}",
            request.group,
            request.action
        );

        match self.router.route(request).await {
            Ok(mut response) => {
                // Echo back the request ID
                if response.id.is_empty() && !request_id.is_empty() {
                    response.id = request_id;
                }
                response
            }
            Err(e) => {
                tracing::error!("Action failed: {}", e);
                ActionResponse::from_error(request_id, e.to_response())
            }
        }
    }

    /// Dispatch with JSON input/output (convenience method)
    pub async fn dispatch_json(&self, request_json: &str) -> String {
        let request: ActionRequest = match serde_json::from_str(request_json) {
            Ok(r) => r,
            Err(e) => {
                let error = ApiError::SerializationError(e.to_string());
                let response = ActionResponse::from_error("", error.to_response());
                return serde_json::to_string(&response).unwrap_or_default();
            }
        };

        let response = self.dispatch(request).await;
        serde_json::to_string(&response).unwrap_or_default()
    }

    /// Get the resource registry
    pub fn resource_registry(&self) -> &Arc<ResourceRegistry> {
        &self.resource_registry
    }

    /// Get the stream registry
    pub fn stream_registry(&self) -> &Arc<StreamRegistry> {
        &self.stream_registry
    }

    /// Get the session manager
    pub fn session_manager(&self) -> &Arc<SessionManager> {
        &self.session_manager
    }

    /// Check if GPU is available
    pub fn has_gpu(&self) -> bool {
        self.gpu_ctx.is_some()
    }

    /// Get list of supported groups
    pub fn groups(&self) -> Vec<&str> {
        self.router.groups()
    }

    /// Get list of supported actions for a group
    pub fn actions(&self, group: &str) -> Option<&'static [&'static str]> {
        self.router.actions(group)
    }

    /// Start background cleanup tasks
    pub fn start_background_tasks(&self) -> Vec<tokio::task::JoinHandle<()>> {
        let mut handles = Vec::new();

        // Start stream cleanup task
        let stream_registry = self.stream_registry.clone();
        handles.push(stream_registry.start_cleanup_task());

        handles
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_engine_api_creation() {
        let api = EngineApi::without_gpu().unwrap();
        assert!(!api.has_gpu());
    }

    #[tokio::test]
    async fn test_engine_api_dispatch_health() {
        let api = EngineApi::without_gpu().unwrap();

        let request = ActionRequest::new("nodes", "health");

        let response = api.dispatch(request).await;
        assert!(response.is_ok());
    }

    #[tokio::test]
    async fn test_engine_api_dispatch_json() {
        let api = EngineApi::without_gpu().unwrap();

        let request_json = r#"{"group":"nodes","action":"health","options":null}"#;
        let response_json = api.dispatch_json(request_json).await;

        assert!(response_json.contains("\"status\":\"ok\""));
    }

    #[tokio::test]
    async fn test_engine_api_groups() {
        let api = EngineApi::without_gpu().unwrap();
        let groups = api.groups();

        assert!(groups.contains(&"nodes"));
        assert!(groups.contains(&"tasks"));
        assert!(groups.contains(&"videos"));
        assert!(groups.contains(&"audios"));
        assert!(groups.contains(&"images"));
        assert!(groups.contains(&"timelines"));
    }

    #[tokio::test]
    async fn test_engine_api_actions() {
        let api = EngineApi::without_gpu().unwrap();

        let node_actions = api.actions("nodes").unwrap();
        assert!(node_actions.contains(&"health"));
        assert!(node_actions.contains(&"metric"));
    }
}
