//! Monitor endpoint - real-time audio level data for recording meters
//!
//! GET /v1/monitor/{stream_id} → JSON { rms, peak, clipping }
//!
//! Reads AtomicF32 values from MicCaptureService — zero-lock, ~0.1ms.
//! Webview polls at 60fps via requestAnimationFrame + fetch().
//! This avoids AudioStreamClient's 500ms prebuffer latency.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use neko_native_api::EngineApi;
use std::sync::Arc;

/// Handle GET /v1/monitor/{stream_id}
pub async fn handle_monitor(
    State(engine): State<Arc<EngineApi>>,
    Path(stream_id): Path<String>,
) -> impl IntoResponse {
    let audio_service = engine.audio_service();

    match audio_service.mic_capture().get_monitor_data(&stream_id) {
        Some(data) => match serde_json::to_value(&data) {
            Ok(value) => (StatusCode::OK, Json(value)).into_response(),
            Err(error) => {
                tracing::error!("Failed to serialize monitor data: {}", error);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Recording stream not found" })),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_handle_monitor_returns_not_found_for_unknown_stream() {
        let engine = Arc::new(EngineApi::without_gpu().expect("create test engine"));
        let response = handle_monitor(State(engine), Path("missing-stream".to_string()))
            .await
            .into_response();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
