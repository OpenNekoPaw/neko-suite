//! Frame server route assembly
//!
//! This module composes frame server routes from native-core's route builders
//! (export, keyframe cache, extract, probe) into a single Axum Router.
//!
//! The actual route handlers and services live in native-core; this module
//! only handles initialization and composition — keeping HTTP concerns in
//! the View layer while delegating business logic to the Model layer.

use std::sync::Arc;

use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use neko_native_core::export::{export_routes, ExportService};
use neko_native_core::frame_server::{extract_routes, probe_routes, ExtractState};
use neko_native_core::gpu::GpuContext;
use neko_native_core::keyframe_cache::{keyframe_cache_routes, KeyframeCacheService};

/// Build frame server routes (export, keyframe cache, extract, probe).
///
/// Creates a shared GPU context and initializes all required services,
/// then merges their route trees into a single `Router` with CORS enabled.
pub async fn build_frame_server_routes(
) -> Result<Router, Box<dyn std::error::Error + Send + Sync>> {
    // Create GPU context (shared across services)
    let gpu_ctx = Arc::new(GpuContext::new().await.map_err(|e| {
        Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to create GPU context: {}", e),
        )) as Box<dyn std::error::Error + Send + Sync>
    })?);

    // Create services
    let export_service = Arc::new(ExportService::with_gpu_context(Arc::clone(&gpu_ctx)));
    let keyframe_cache_service = Arc::new(KeyframeCacheService::new());
    let extract_state = Arc::new(ExtractState::new(Arc::clone(&gpu_ctx)).map_err(|e| {
        Box::new(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to create extract state: {}", e),
        )) as Box<dyn std::error::Error + Send + Sync>
    })?);

    // Compose routes from native-core route builders
    let router = Router::new()
        .merge(export_routes(export_service))
        .merge(keyframe_cache_routes(keyframe_cache_service))
        .merge(extract_routes(extract_state))
        .merge(probe_routes())
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        );

    Ok(router)
}
