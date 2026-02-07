//! Bridge module - Thin NAPI bridge functions that delegate to EngineApi
//!
//! This module provides standalone NAPI functions that construct ActionRequest
//! and dispatch through the EngineApi singleton. These functions serve as the
//! migration path from the legacy MediaProcessor API to the unified MVC architecture.
//!
//! ## Phase A (current)
//! Stateless functions: probe, extract_subtitles, extract_frame, gpu_info,
//! audio_info, generate_waveform, get_keyframes
//!
//! ## Phase B (future)
//! Stateful Session class migration
//!
//! ## Phase C (future)
//! GPU processing functions migration

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::OnceCell;

use neko_native_api::EngineApi;
use neko_types::ActionRequest;

/// Global engine instance (shared with engine.rs)
///
/// Both NativeEngine and bridge functions share the same EngineApi singleton.
static BRIDGE_ENGINE: OnceCell<Arc<EngineApi>> = OnceCell::const_new();

/// Get or initialize the global engine instance for bridge functions
async fn get_bridge_engine() -> napi::Result<Arc<EngineApi>> {
    BRIDGE_ENGINE
        .get_or_try_init(|| async {
            // Initialize tracing (only once, safe to call multiple times)
            let _ = tracing_subscriber::fmt()
                .with_env_filter(
                    tracing_subscriber::EnvFilter::from_default_env()
                        .add_directive(tracing::Level::INFO.into()),
                )
                .try_init();

            EngineApi::new()
                .await
                .map(Arc::new)
                .map_err(|e| {
                    napi::Error::from_reason(format!("Failed to initialize bridge engine: {}", e))
                })
        })
        .await
        .cloned()
}

/// Helper: dispatch an ActionRequest and return JSON string
async fn dispatch_to_json(request: ActionRequest) -> napi::Result<String> {
    let engine = get_bridge_engine().await?;
    let response = engine.dispatch(request).await;
    serde_json::to_string(&response)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {}", e)))
}

// ============================================================================
// Phase A: Stateless bridge functions
// ============================================================================

/// Probe media file metadata via the unified API
///
/// Maps to: videos:probe
///
/// Returns JSON ActionResponse with media metadata (streams, duration, format, etc.)
#[napi]
pub async fn bridge_probe_media(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "probe")
        .with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

/// Extract all subtitle tracks from a media file via the unified API
///
/// Maps to: videos:extract (type=subtitles)
///
/// Returns JSON ActionResponse with extracted subtitle tracks
#[napi]
pub async fn bridge_extract_subtitles(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "extract")
        .with_options(json!({
            "source": path,
            "type": "subtitles"
        }));

    dispatch_to_json(request).await
}

/// Extract a single frame from video via the unified API
///
/// Maps to: videos:capture
///
/// Returns JSON ActionResponse with base64-encoded frame data
#[napi]
pub async fn bridge_extract_frame(
    path: String,
    time: f64,
    quality: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
) -> napi::Result<String> {
    let mut opts = json!({
        "source": path,
        "time": time,
        "quality": quality.unwrap_or(85),
        "format": "jpeg",
    });

    if let Some(w) = width {
        opts["width"] = json!(w);
    }
    if let Some(h) = height {
        opts["height"] = json!(h);
    }

    let request = ActionRequest::new("videos", "capture")
        .with_options(opts);

    dispatch_to_json(request).await
}

/// Get GPU information via the unified API
///
/// Maps to: nodes:gpu
///
/// Returns JSON ActionResponse with GPU device info
#[napi]
pub async fn bridge_gpu_info() -> napi::Result<String> {
    let request = ActionRequest::new("nodes", "gpu");
    dispatch_to_json(request).await
}

/// Get audio file information via the unified API
///
/// Maps to: audios:probe
///
/// Returns JSON ActionResponse with audio metadata (codec, sample rate, channels, etc.)
#[napi]
pub async fn bridge_audio_info(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("audios", "probe")
        .with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

/// Generate waveform data for a media file via the unified API
///
/// Maps to: videos:waveform
///
/// Returns JSON ActionResponse with waveform sample data
#[napi]
pub async fn bridge_generate_waveform(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "waveform")
        .with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}

/// Get keyframe timestamps from a video file via the unified API
///
/// Maps to: videos:keyframes
///
/// Returns JSON ActionResponse with keyframe timestamp list
#[napi]
pub async fn bridge_get_keyframes(path: String) -> napi::Result<String> {
    let request = ActionRequest::new("videos", "keyframes")
        .with_options(json!({ "source": path }));

    dispatch_to_json(request).await
}
