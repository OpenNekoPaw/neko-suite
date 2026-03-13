//! Route definitions and router builder

pub mod dispatch;
pub mod health;
pub mod puppet_stream;
pub mod streaming;

use axum::routing::{get, post};
use axum::Router;
use neko_native_api::EngineApi;
use std::sync::Arc;

/// Build the complete HTTP router with all routes
pub fn build_router(engine: Arc<EngineApi>) -> Router {
    Router::new()
        // Health check
        .route("/health", get(health::health_handler))
        // Generic dispatch
        .route("/v1/dispatch", post(dispatch::handle_dispatch))
        // Group-level dispatch (action in body)
        .route("/v1/:group", post(dispatch::handle_group_dispatch))
        // Resource-level RESTful dispatch
        .route(
            "/v1/:group/:id/:action",
            post(dispatch::handle_resource_dispatch),
        )
        // WebSocket media streaming
        .route(
            "/v1/streams/:stream_id",
            get(streaming::handle_stream_websocket),
        )
        // WebSocket puppet delta stream (60fps PuppetDelta push for neko-live)
        .route(
            "/v1/puppets/stream",
            get(puppet_stream::handle_puppet_stream),
        )
        .with_state(engine)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_build_router() {
        let engine = Arc::new(EngineApi::without_gpu().unwrap());
        let _router = build_router(engine);
        // Router builds without panic
    }
}
