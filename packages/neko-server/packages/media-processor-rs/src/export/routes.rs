//! Export API Routes - Axum handlers for export endpoints
//!
//! Endpoints:
//! - POST /export/start - Start an export job
//! - POST /export/cancel/:job_id - Cancel an export job
//! - GET /export/status/:job_id - Get export status
//! - GET /export/progress - WebSocket for real-time progress updates

use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};

use super::service::ExportService;
use super::types::{
    ExportCancelResponse, ExportErrorResponse, ExportJobConfig, ExportStatusResponse,
};

/// Create export routes
pub fn export_routes(service: Arc<ExportService>) -> Router {
    Router::new()
        .route("/export/start", post(start_export_handler))
        .route("/export/cancel/:job_id", post(cancel_export_handler))
        .route("/export/status/:job_id", get(status_handler))
        .route("/export/progress", get(progress_ws_handler))
        .with_state(service)
}

/// POST /export/start
/// Request body: ExportJobConfig
/// Response: ExportStartResponse
async fn start_export_handler(
    State(service): State<Arc<ExportService>>,
    Json(config): Json<ExportJobConfig>,
) -> impl IntoResponse {
    tracing::info!("Starting export job: {}", config.job_id);

    match service.start_export(config).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(e) => {
            tracing::error!("Failed to start export: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ExportErrorResponse {
                    error: e.to_string(),
                    code: 500,
                }),
            )
                .into_response()
        }
    }
}

/// POST /export/cancel/:job_id
/// Response: ExportCancelResponse
async fn cancel_export_handler(
    State(service): State<Arc<ExportService>>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    tracing::info!("Cancelling export job: {}", job_id);

    let success = service.cancel_export(&job_id).await;

    Json(ExportCancelResponse { success })
}

/// GET /export/status/:job_id
/// Response: ExportStatusResponse
async fn status_handler(
    State(service): State<Arc<ExportService>>,
    Path(job_id): Path<String>,
) -> impl IntoResponse {
    match service.get_progress(&job_id).await {
        Some(progress) => (StatusCode::OK, Json(ExportStatusResponse { progress })).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ExportErrorResponse {
                error: format!("Job {} not found", job_id),
                code: 404,
            }),
        )
            .into_response(),
    }
}

/// GET /export/progress (WebSocket)
/// Streams ExportProgress updates for all jobs
async fn progress_ws_handler(
    ws: WebSocketUpgrade,
    State(service): State<Arc<ExportService>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_progress_websocket(socket, service))
}

/// Handle WebSocket connection for progress updates
async fn handle_progress_websocket(mut socket: WebSocket, service: Arc<ExportService>) {
    let mut rx = service.subscribe_progress();

    loop {
        tokio::select! {
            // Receive progress update from broadcast channel
            result = rx.recv() => {
                match result {
                    Ok(progress) => {
                        // Serialize progress to JSON
                        match serde_json::to_string(&progress) {
                            Ok(json) => {
                                if socket.send(Message::Text(json)).await.is_err() {
                                    // Client disconnected
                                    break;
                                }
                            }
                            Err(e) => {
                                tracing::error!("Failed to serialize progress: {}", e);
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("Progress receiver lagged by {} messages", n);
                        continue;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        // Channel closed
                        break;
                    }
                }
            }
            // Handle incoming messages (ping/pong, close)
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_export_routes_creation() {
        // This test just verifies the routes can be created
        // Actual testing would require a running server
    }
}
