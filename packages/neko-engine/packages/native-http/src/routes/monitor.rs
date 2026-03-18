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
        Some(data) => (StatusCode::OK, Json(serde_json::to_value(&data).unwrap())).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Recording stream not found" })),
        )
            .into_response(),
    }
}
