//! NativeEngine - NAPI bridge to EngineApi
//!
//! This module provides a Node.js-friendly interface to the EngineApi.
//! It handles JSON serialization/deserialization and async bridging.
//!
//! Features:
//! - `dispatch` / `dispatch_action` — unified ActionRequest/ActionResponse protocol
//! - `start_frame_server` / `stop_frame_server` — embedded HTTP/WS server lifecycle
//! - Convenience methods for common operations (probe, capture, tasks, etc.)

use napi_derive::napi;
use std::sync::Arc;
use tokio::sync::OnceCell;

use neko_native_api::EngineApi;
use neko_types::{ActionRequest, EngineConfig};

/// Global engine instance (singleton)
static ENGINE: OnceCell<Arc<EngineApi>> = OnceCell::const_new();

/// Get or initialize the global engine instance with optional config path
async fn get_engine_with_config(config_path: Option<String>) -> napi::Result<Arc<EngineApi>> {
    ENGINE
        .get_or_try_init(|| async {
            let config = EngineConfig::load(
                config_path.as_ref().map(|s| std::path::Path::new(s.as_str())),
                None,
            )
            .map_err(|e| napi::Error::from_reason(format!("Config error: {}", e)))?;

            EngineApi::with_config(config)
                .await
                .map(Arc::new)
                .map_err(|e| {
                    napi::Error::from_reason(format!("Failed to initialize engine: {}", e))
                })
        })
        .await
        .cloned()
}

/// Internal state for the embedded HTTP/WebSocket server
struct HttpServerState {
    addr: std::net::SocketAddr,
    shutdown_tx: tokio::sync::watch::Sender<()>,
}

/// NativeEngine - Main entry point for all engine operations
///
/// This class provides a unified interface to the Neko Engine through
/// the ActionRequest/ActionResponse protocol.
///
/// It also manages an optional embedded HTTP/WebSocket server for
/// per-stream frame delivery to webview consumers.
#[napi]
pub struct NativeEngine {
    engine: Arc<EngineApi>,
    http_server: std::sync::Mutex<Option<HttpServerState>>,
}

#[napi]
impl NativeEngine {
    /// Create a new NativeEngine instance
    ///
    /// @param config_path - Optional path to engine.toml config file.
    ///   If omitted, loads from ~/.neko/engine.toml and .neko/engine.toml.
    #[napi(factory)]
    pub async fn create(config_path: Option<String>) -> napi::Result<Self> {
        // Initialize tracing (only once)
        let _ = tracing_subscriber::fmt()
            .with_env_filter(
                tracing_subscriber::EnvFilter::from_default_env()
                    .add_directive(tracing::Level::INFO.into()),
            )
            .try_init();

        tracing::info!("Creating NativeEngine...");

        let engine = get_engine_with_config(config_path).await?;

        tracing::info!(
            "NativeEngine created (GPU: {})",
            if engine.has_gpu() {
                "enabled"
            } else {
                "disabled"
            }
        );

        Ok(Self {
            engine,
            http_server: std::sync::Mutex::new(None),
        })
    }

    /// Dispatch an action request
    ///
    /// This is the main entry point for all operations.
    /// Takes a JSON string representing an ActionRequest and returns
    /// a JSON string representing an ActionResponse.
    #[napi]
    pub async fn dispatch(&self, request_json: String) -> napi::Result<String> {
        let response = self.engine.dispatch_json(&request_json).await;
        Ok(response)
    }

    /// Dispatch an action request with typed parameters
    ///
    /// Convenience method that takes individual parameters instead of JSON.
    /// All ActionRequest fields are supported for full parity with `dispatch()`.
    #[napi]
    pub async fn dispatch_action(
        &self,
        group: String,
        action: String,
        id: Option<String>,
        options: Option<String>,
        source: Option<String>,
        session_id: Option<String>,
        stream_id: Option<String>,
        body: Option<String>,
    ) -> napi::Result<String> {
        let options_value: serde_json::Value = options
            .map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null))
            .unwrap_or(serde_json::Value::Null);

        let body_value: Option<serde_json::Value> =
            body.map(|s| serde_json::from_str(&s).unwrap_or(serde_json::Value::Null));

        let request = ActionRequest {
            group,
            action,
            id: id.unwrap_or_default(),
            source,
            session_id,
            stream_id,
            options: options_value,
            body: body_value,
        };

        let response = self.engine.dispatch(request).await;
        serde_json::to_string(&response)
            .map_err(|e| napi::Error::from_reason(format!("Serialization error: {}", e)))
    }

    /// Check if GPU is available
    #[napi]
    pub fn has_gpu(&self) -> bool {
        self.engine.has_gpu()
    }

    /// Get list of supported action groups
    #[napi]
    pub fn groups(&self) -> Vec<String> {
        self.engine
            .groups()
            .into_iter()
            .map(|s| s.to_string())
            .collect()
    }

    /// Get list of supported actions for a group
    #[napi]
    pub fn actions(&self, group: String) -> Option<Vec<String>> {
        self.engine
            .actions(&group)
            .map(|actions| actions.iter().map(|s| s.to_string()).collect())
    }

    // ========== Convenience methods for common operations ==========

    /// Get system health status
    #[napi]
    pub async fn health(&self) -> napi::Result<String> {
        self.dispatch_action(
            "nodes".to_string(),
            "health".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Get system metrics (CPU, memory, GPU usage)
    #[napi]
    pub async fn metrics(&self) -> napi::Result<String> {
        self.dispatch_action(
            "nodes".to_string(),
            "metric".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Get GPU information
    #[napi]
    pub async fn gpu_info(&self) -> napi::Result<String> {
        self.dispatch_action(
            "nodes".to_string(),
            "gpu".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Probe a video file for metadata
    #[napi]
    pub async fn probe_video(&self, source: String) -> napi::Result<String> {
        let options = serde_json::json!({ "source": source });
        self.dispatch_action(
            "videos".to_string(),
            "probe".to_string(),
            None,
            Some(options.to_string()),
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// List all active tasks
    #[napi]
    pub async fn list_tasks(&self) -> napi::Result<String> {
        self.dispatch_action(
            "tasks".to_string(),
            "list".to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Get task progress
    #[napi]
    pub async fn get_task_progress(&self, task_id: String) -> napi::Result<String> {
        self.dispatch_action(
            "tasks".to_string(),
            "probe".to_string(),
            Some(task_id),
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Cancel a task
    #[napi]
    pub async fn cancel_task(&self, task_id: String) -> napi::Result<String> {
        self.dispatch_action(
            "tasks".to_string(),
            "cancel".to_string(),
            Some(task_id),
            None,
            None,
            None,
            None,
            None,
        )
        .await
    }

    /// Capture a single frame from video
    ///
    /// Returns JSON with base64-encoded frame data
    #[napi]
    pub async fn capture_frame(
        &self,
        source: String,
        time: f64,
        quality: Option<u32>,
        format: Option<String>,
    ) -> napi::Result<String> {
        let options = serde_json::json!({
            "source": source,
            "time": time,
            "quality": quality.unwrap_or(85),
            "format": format.unwrap_or_else(|| "jpeg".to_string()),
        });
        self.dispatch_action(
            "videos".to_string(),
            "capture".to_string(),
            None,
            Some(options.to_string()),
            None,
            None,
            None,
            None,
        )
        .await
    }

    // ========== Frame Server Management ==========

    /// Start the embedded HTTP/WebSocket server (full neko-native-http router).
    ///
    /// The server provides:
    /// - `ws://127.0.0.1:{port}/v1/streams/{stream_id}` — per-stream WebSocket
    /// - `POST http://127.0.0.1:{port}/v1/dispatch` — ActionRequest dispatch
    /// - `GET http://127.0.0.1:{port}/health` — health check
    /// - `POST http://127.0.0.1:{port}/v1/preview/register` — register file for Range serving
    /// - `GET http://127.0.0.1:{port}/v1/preview/file/:token` — serve file with Range support
    ///
    /// Returns the actual bound port (useful when port=0 for auto-assign).
    #[napi]
    pub async fn start_frame_server(&self, port: Option<u16>) -> napi::Result<u16> {
        // Check if already running
        {
            let guard = self
                .http_server
                .lock()
                .map_err(|_| napi::Error::from_reason("Failed to lock http_server state"))?;
            if guard.is_some() {
                return Err(napi::Error::from_reason(
                    "Frame server is already running. Call stopFrameServer() first.",
                ));
            }
        }

        let bind_port = port.unwrap_or(0);

        let (addr, shutdown_tx) =
            neko_native_http::start_server_with_shutdown(self.engine.clone(), bind_port)
                .await
                .map_err(|e| {
                    napi::Error::from_reason(format!("Failed to start frame server: {}", e))
                })?;

        let actual_port = addr.port();

        tracing::info!("Frame server started on http://127.0.0.1:{}", actual_port);

        // Store the server state
        {
            let mut guard = self
                .http_server
                .lock()
                .map_err(|_| napi::Error::from_reason("Failed to lock http_server state"))?;
            *guard = Some(HttpServerState { addr, shutdown_tx });
        }

        Ok(actual_port)
    }

    /// Stop the embedded HTTP/WebSocket server
    #[napi]
    pub async fn stop_frame_server(&self) -> napi::Result<()> {
        let state = {
            let mut guard = self
                .http_server
                .lock()
                .map_err(|_| napi::Error::from_reason("Failed to lock http_server state"))?;
            guard.take()
        };

        if let Some(server_state) = state {
            let _ = server_state.shutdown_tx.send(());
            tracing::info!("Frame server on port {} stopped", server_state.addr.port());
        }

        Ok(())
    }

    /// Get the frame server port, or null if not running
    #[napi]
    pub fn get_frame_server_port(&self) -> Option<u16> {
        self.http_server
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|s| s.addr.port()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_native_engine_creation() {
        // Note: This test requires GPU, may fail in CI
        // let engine = NativeEngine::create().await;
        // assert!(engine.is_ok());
    }
}
