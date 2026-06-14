//! ExportService implementation
//!
//! Wraps the infrastructure-layer `export::ExportService` to implement
//! the `IExportService` trait for the MVC architecture.

use std::sync::Arc;

use crate::error::Result;
use crate::export::{
    ExportJobConfig, ExportProgress, ExportRenderServicePorts, ExportStartResponse, QueueEntry,
};
use crate::services::{IExportService, IPuppetService, ISceneService};
use async_trait::async_trait;
use neko_engine_gpu::GpuContext;

/// Export service implementation
///
/// Delegates to the infrastructure-layer `export::ExportService` for actual
/// GPU-accelerated export pipeline execution.
pub struct ExportService {
    inner: Arc<crate::export::ExportService>,
}

impl ExportService {
    /// Create a new export service with GPU context
    #[allow(dead_code)]
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Self {
        let inner = Arc::new(crate::export::ExportService::with_gpu_context(gpu_ctx));
        Self { inner }
    }

    /// Create a new export service with injected domain render services.
    pub fn with_render_services(
        gpu_ctx: Arc<GpuContext>,
        scene_service: Option<Arc<dyn ISceneService>>,
        puppet_service: Option<Arc<dyn IPuppetService>>,
    ) -> Self {
        let inner = Arc::new(
            crate::export::ExportService::with_gpu_context_and_render_services(
                gpu_ctx,
                ExportRenderServicePorts {
                    scene: scene_service,
                    puppet: puppet_service,
                },
            ),
        );
        Self { inner }
    }
}

#[async_trait]
impl IExportService for ExportService {
    async fn start(&self, config: ExportJobConfig) -> Result<ExportStartResponse> {
        self.inner.start_export(config).await
    }

    async fn enqueue(&self, config: ExportJobConfig) -> Result<String> {
        self.inner.enqueue_export(config).await
    }

    async fn progress(&self, job_id: &str) -> Option<ExportProgress> {
        self.inner.get_progress(job_id).await
    }

    async fn cancel(&self, job_id: &str) -> Result<bool> {
        Ok(self.inner.cancel_export(job_id).await)
    }

    async fn list_queue(&self) -> Vec<QueueEntry> {
        self.inner.list_queue().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ExportService requires GPU context, so we can only test construction logic
    // in integration tests. Unit tests verify the type relationships.

    #[test]
    fn test_export_service_trait_object() {
        // Verify ExportService implements IExportService (compile-time check)
        fn _assert_impl<T: IExportService>() {}
        _assert_impl::<ExportService>();
    }
}
