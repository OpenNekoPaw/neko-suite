//! Neko Native HTTP - RESTful API and WebSocket streaming server
//!
//! This crate provides an HTTP server that exposes the EngineApi over REST and WebSocket:
//!
//! - `POST /v1/dispatch` — Generic ActionRequest dispatch
//! - `POST /v1/:group` — Group-level dispatch (action in body)
//! - `POST /v1/:group/:id/:action` — RESTful resource-level dispatch
//! - `GET /v1/streams/:stream_id` — WebSocket frame streaming
//! - `GET /health` — Health check
//!
//! # Usage
//!
//! ```rust,no_run
//! use neko_native_api::EngineApi;
//! use neko_native_http::start_server;
//! use std::sync::Arc;
//!
//! #[tokio::main]
//! async fn main() {
//!     let engine = Arc::new(EngineApi::new().await.unwrap());
//!     start_server(engine, 3000).await.unwrap();
//! }
//! ```

#![deny(clippy::all)]

mod middleware;
pub mod routes;

use neko_native_api::EngineApi;
use std::sync::Arc;
use tokio::sync::watch;

/// Start the HTTP server on the given port
///
/// This blocks until the server is shut down.
pub async fn start_server(engine: Arc<EngineApi>, port: u16) -> std::io::Result<()> {
    let app = routes::build_router(engine);
    let app = middleware::apply_middleware(app);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!("Neko HTTP server started on http://{}", addr);

    axum::serve(listener, app).await
}

/// Start the HTTP server with a shutdown signal
///
/// Returns the actual bound address (useful when port=0 for auto-assign).
pub async fn start_server_with_shutdown(
    engine: Arc<EngineApi>,
    port: u16,
) -> std::io::Result<(std::net::SocketAddr, watch::Sender<()>)> {
    let app = routes::build_router(engine);
    let app = middleware::apply_middleware(app);

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let local_addr = listener.local_addr()?;

    let (shutdown_tx, mut shutdown_rx) = watch::channel(());

    tracing::info!("Neko HTTP server started on http://{}", local_addr);

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.changed().await;
                tracing::info!("HTTP server shutting down");
            })
            .await
            .ok();
    });

    Ok((local_addr, shutdown_tx))
}
