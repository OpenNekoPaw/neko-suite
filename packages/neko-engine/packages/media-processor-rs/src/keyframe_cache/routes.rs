//! Keyframe Cache API Routes
//!
//! Axum handlers for keyframe cache endpoints.
//!
//! ## Endpoints
//!
//! - `POST /keyframes/warmup` - Pre-cache keyframes from playhead position
//! - `GET /keyframes/status` - Get cache status
//! - `POST /keyframes/seek` - Find nearest cached keyframe for seek
//! - `GET /keyframes/nv12` - Get cached NV12 frame data
//! - `POST /keyframes/clear` - Clear all cached frames
//! - `GET /keyframes/idr` - Get IDR frame list for a source

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use super::service::KeyframeCacheService;
use super::types::{CacheErrorResponse, CacheRequest, CacheStatus, SeekRequest, SeekResponse};

/// Create keyframe cache routes
pub fn keyframe_cache_routes(service: Arc<KeyframeCacheService>) -> Router {
    Router::new()
        .route("/keyframes/warmup", post(warmup_handler))
        .route("/keyframes/status", get(status_handler))
        .route("/keyframes/seek", post(seek_handler))
        .route("/keyframes/nv12", get(get_nv12_handler))
        .route("/keyframes/clear", post(clear_handler))
        .route("/keyframes/clear/:source", post(clear_source_handler))
        .route("/keyframes/idr", get(get_idr_frames_handler))
        .with_state(service)
}

/// POST /keyframes/warmup
///
/// Pre-cache keyframes based on timeline and playhead position.
async fn warmup_handler(
    State(service): State<Arc<KeyframeCacheService>>,
    Json(request): Json<CacheRequest>,
) -> impl IntoResponse {
    tracing::info!(
        "Warming up keyframe cache: playhead={}, max_frames={}",
        request.playhead,
        request.max_frames
    );

    match service.warmup(request).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(e) => {
            tracing::error!("Failed to warm up cache: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(CacheErrorResponse {
                    error: e.to_string(),
                    code: 500,
                }),
            )
                .into_response()
        }
    }
}

/// GET /keyframes/status
///
/// Get current cache status.
async fn status_handler(State(service): State<Arc<KeyframeCacheService>>) -> Json<CacheStatus> {
    Json(service.status().await)
}

/// POST /keyframes/seek
///
/// Find the nearest cached keyframe for seek operations.
/// Returns information about the keyframe and estimated frames to decode.
async fn seek_handler(
    State(service): State<Arc<KeyframeCacheService>>,
    Json(request): Json<SeekRequest>,
) -> impl IntoResponse {
    tracing::debug!(
        "Seeking keyframe: source={}, target_time={}",
        request.source_path,
        request.target_time
    );

    match service
        .seek_to_keyframe(&request.source_path, request.target_time)
        .await
    {
        Ok(result) => {
            let response = if result.cache_hit {
                let frame = result.cached_frame.as_ref().unwrap();
                SeekResponse {
                    cache_hit: true,
                    keyframe_timestamp: frame.info.timestamp,
                    keyframe_pts: frame.info.pts,
                    keyframe_frame_index: frame.info.frame_index,
                    frames_to_decode: result.frames_to_decode,
                }
            } else {
                let idr = result.nearest_idr.as_ref().unwrap();
                SeekResponse {
                    cache_hit: false,
                    keyframe_timestamp: idr.timestamp,
                    keyframe_pts: idr.pts,
                    keyframe_frame_index: idr.frame_index,
                    frames_to_decode: result.frames_to_decode,
                }
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!(
                "Failed to seek keyframe for {}: {}",
                request.source_path,
                e
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(CacheErrorResponse {
                    error: e.to_string(),
                    code: 500,
                }),
            )
                .into_response()
        }
    }
}

/// Query parameters for getting NV12 data
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetNv12Query {
    /// Source file path (URL encoded)
    source: String,
    /// Frame index
    frame_index: u64,
}

/// GET /keyframes/nv12?source=...&frameIndex=...
///
/// Get cached NV12 frame data as binary.
/// Response headers include frame metadata:
/// - X-Width: Frame width
/// - X-Height: Frame height
/// - X-Y-Linesize: Y plane linesize
/// - X-UV-Linesize: UV plane linesize
/// - X-Color-Space: Color space (0=BT.601, 1=BT.709, 2=BT.2020)
async fn get_nv12_handler(
    State(service): State<Arc<KeyframeCacheService>>,
    axum::extract::Query(query): axum::extract::Query<GetNv12Query>,
) -> impl IntoResponse {
    match service
        .get_cached_frame(&query.source, query.frame_index)
        .await
    {
        Some(frame) => {
            // Combine Y and UV data into a single buffer
            let nv12 = &frame.nv12_data;
            let mut data = Vec::with_capacity(nv12.size_bytes());
            data.extend_from_slice(&nv12.y_data);
            data.extend_from_slice(&nv12.uv_data);

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .header(header::CACHE_CONTROL, "max-age=3600")
                .header("X-Frame-Index", frame.info.frame_index.to_string())
                .header("X-Frame-Timestamp", frame.info.timestamp.to_string())
                .header("X-Frame-PTS", frame.info.pts.to_string())
                .header("X-Width", nv12.width.to_string())
                .header("X-Height", nv12.height.to_string())
                .header("X-Y-Linesize", nv12.y_linesize.to_string())
                .header("X-UV-Linesize", nv12.uv_linesize.to_string())
                .header("X-Color-Space", (nv12.color_space as u32).to_string())
                .body(Body::from(data))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::to_string(&CacheErrorResponse {
                    error: format!(
                        "Frame {} not found in cache for source: {}",
                        query.frame_index, query.source
                    ),
                    code: 404,
                })
                .unwrap(),
            ))
            .unwrap(),
    }
}

/// POST /keyframes/clear
///
/// Clear all cached frames.
async fn clear_handler(State(service): State<Arc<KeyframeCacheService>>) -> impl IntoResponse {
    tracing::info!("Clearing all keyframe cache");
    service.clear().await;
    Json(ClearResponse { success: true })
}

/// POST /keyframes/clear/:source
///
/// Clear cached frames for a specific source.
/// Note: The source path should be URL-encoded when passed as a path parameter.
async fn clear_source_handler(
    State(service): State<Arc<KeyframeCacheService>>,
    Path(source): Path<String>,
) -> impl IntoResponse {
    tracing::info!("Clearing keyframe cache for source: {}", source);
    service.clear_source(&source).await;
    Json(ClearResponse { success: true })
}

/// Query parameters for getting IDR frames
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetIdrQuery {
    /// Source file path (URL encoded)
    source: String,
}

/// GET /keyframes/idr?source=...
///
/// Get list of IDR frames for a source.
async fn get_idr_frames_handler(
    State(service): State<Arc<KeyframeCacheService>>,
    axum::extract::Query(query): axum::extract::Query<GetIdrQuery>,
) -> impl IntoResponse {
    match service.get_idr_frames(&query.source).await {
        Ok(frames) => {
            let response: Vec<IdrFrameResponse> = frames
                .into_iter()
                .map(|f| IdrFrameResponse {
                    frame_index: f.frame_index,
                    timestamp: f.timestamp,
                    pts: f.pts,
                    nal_type: f.nal_type,
                    width: f.width,
                    height: f.height,
                })
                .collect();
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get IDR frames for {}: {}", query.source, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(CacheErrorResponse {
                    error: e.to_string(),
                    code: 500,
                }),
            )
                .into_response()
        }
    }
}

/// Response for clear operations
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClearResponse {
    success: bool,
}

/// IDR frame info response
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct IdrFrameResponse {
    frame_index: u64,
    timestamp: f64,
    pts: i64,
    nal_type: u8,
    width: u32,
    height: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_routes_creation() {
        let service = Arc::new(KeyframeCacheService::default());
        let _router = keyframe_cache_routes(service);
        // Routes created successfully
    }
}
