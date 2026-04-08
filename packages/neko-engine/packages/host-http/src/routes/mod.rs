//! Route definitions and router builder

pub mod dispatch;
pub mod gamepad_stream;
pub mod health;
pub mod midi_stream;
pub mod monitor;
pub mod preview_file;
pub mod puppet_stream;
pub mod streaming;

use axum::routing::{delete, get, post};
use axum::Router;
use neko_native_api::EngineApi;
use preview_file::PreviewFileRegistry;
use std::sync::Arc;

/// Build the complete HTTP router with all routes.
pub fn build_router(engine: Arc<EngineApi>) -> Router {
    // Shared token registry — injected as an axum Extension so it does not
    // require changes to EngineApi.
    let file_registry = Arc::new(PreviewFileRegistry::new());

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
        // Audio recording monitor (RMS/Peak level data)
        .route("/v1/monitor/:stream_id", get(monitor::handle_monitor))
        // WebSocket puppet delta stream (60fps PuppetDelta push for neko-live)
        .route(
            "/v1/puppets/stream",
            get(puppet_stream::handle_puppet_stream),
        )
        // WebSocket MIDI event stream (JSON push per MIDI message)
        .route("/v1/midi/:stream_id", get(midi_stream::handle_midi_stream))
        // WebSocket Gamepad event stream (JSON push per button/axis change)
        .route(
            "/v1/gamepad/:stream_id",
            get(gamepad_stream::handle_gamepad_stream),
        )
        // Document preview — Range-capable static file serving (PDF / CBZ)
        .route("/v1/preview/register", post(preview_file::handle_register))
        .route(
            "/v1/preview/unregister/:token",
            delete(preview_file::handle_unregister),
        )
        .route("/v1/preview/file/:token", get(preview_file::handle_file))
        // EPUB on-demand entry serving (directory mode — avoids full-archive download)
        .route(
            "/v1/preview/epub/:token/*path",
            get(preview_file::handle_epub_entry),
        )
        .layer(axum::Extension(file_registry))
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
