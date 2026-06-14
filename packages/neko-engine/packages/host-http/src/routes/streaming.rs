//! WebSocket streaming endpoint
//!
//! GET /v1/streams/:stream_id — Upgrade to WebSocket for frame streaming
//!
//! Subscribes to a stream's broadcast channel in the StreamRegistry
//! and pushes binary frames to the WebSocket client.

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use neko_engine_kernel::contracts::domain::FrameData;
use neko_engine_types::{FrameFormat, RenderFrameDiagnostics, RenderFrameMeta, StreamId};
use neko_host_api::EngineApi;
use serde::Serialize;
use std::sync::Arc;

/// GET /v1/streams/:stream_id
///
/// Upgrades to WebSocket and streams frames from the StreamRegistry.
pub async fn handle_stream_websocket(
    State(engine): State<Arc<EngineApi>>,
    Path(stream_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let stream_id = StreamId::from_string(stream_id);

    ws.on_upgrade(move |socket| handle_socket(socket, engine, stream_id))
}

async fn handle_socket(mut socket: WebSocket, engine: Arc<EngineApi>, stream_id: StreamId) {
    let stream_registry = engine.stream_registry();

    // Subscribe to the stream's broadcast channel
    let mut rx = match stream_registry.subscribe(&stream_id).await {
        Some(rx) => rx,
        None => {
            tracing::warn!("Stream {} not found, closing WebSocket", stream_id.as_str());
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4004,
                    reason: "Stream not found".into(),
                })))
                .await;
            return;
        }
    };

    tracing::debug!(
        "WebSocket client connected to stream {}",
        stream_id.as_str()
    );

    // Push frames to the WebSocket client
    loop {
        match rx.recv().await {
            Ok(frame) => {
                if let Some(meta) = create_render_frame_meta_message(&frame) {
                    match serde_json::to_string(&meta) {
                        Ok(payload) => {
                            if socket.send(Message::Text(payload)).await.is_err() {
                                tracing::debug!(
                                    "WebSocket client disconnected from stream {}",
                                    stream_id.as_str()
                                );
                                break;
                            }
                        }
                        Err(error) => {
                            tracing::warn!(
                                "Failed to serialize render frame meta for stream {}: {}",
                                stream_id.as_str(),
                                error
                            );
                        }
                    }
                }
                let diagnostics_message = create_render_frame_diagnostics_message(&frame);
                if let Some(message) = diagnostics_message {
                    match serde_json::to_string(&message) {
                        Ok(payload) => {
                            if socket.send(Message::Text(payload)).await.is_err() {
                                tracing::debug!(
                                    "WebSocket client disconnected from stream {}",
                                    stream_id.as_str()
                                );
                                break;
                            }
                        }
                        Err(error) => {
                            tracing::warn!(
                                "Failed to serialize render diagnostics for stream {}: {}",
                                stream_id.as_str(),
                                error
                            );
                        }
                    }
                }
                // Send frame data as binary WebSocket message
                if socket
                    .send(Message::Binary(frame.data.clone()))
                    .await
                    .is_err()
                {
                    tracing::debug!(
                        "WebSocket client disconnected from stream {}",
                        stream_id.as_str()
                    );
                    break;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!(
                    "WebSocket client lagged {} frames on stream {}",
                    n,
                    stream_id.as_str()
                );
                // Continue receiving — client will catch up
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                tracing::debug!(
                    "Stream {} closed, disconnecting WebSocket",
                    stream_id.as_str()
                );
                break;
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderFrameDiagnosticsMessage<'a> {
    #[serde(rename = "type")]
    message_type: &'static str,
    pts_us: i64,
    diagnostics: &'a RenderFrameDiagnostics,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderFrameMetaMessage<'a> {
    #[serde(rename = "type")]
    message_type: &'static str,
    meta: &'a RenderFrameMeta,
}

fn create_render_frame_meta_message(frame: &FrameData) -> Option<RenderFrameMetaMessage<'_>> {
    frame.meta.as_ref().map(|meta| RenderFrameMetaMessage {
        message_type: "renderFrameMeta",
        meta,
    })
}

fn create_render_frame_diagnostics_message(
    frame: &FrameData,
) -> Option<RenderFrameDiagnosticsMessage<'_>> {
    if frame
        .meta
        .as_ref()
        .and_then(|meta| meta.diagnostics.as_ref())
        .is_some()
    {
        return None;
    }

    let diagnostics = frame.diagnostics.as_ref()?;
    Some(RenderFrameDiagnosticsMessage {
        message_type: "renderFrameDiagnostics",
        pts_us: h264_pts_us(frame).unwrap_or((frame.timestamp * 1_000_000.0) as i64),
        diagnostics,
    })
}

fn h264_pts_us(frame: &FrameData) -> Option<i64> {
    if frame.format != FrameFormat::H264 || frame.data.len() < 8 {
        return None;
    }
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&frame.data[0..8]);
    Some(i64::from_le_bytes(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::GpuRenderPath;

    fn diagnostics() -> RenderFrameDiagnostics {
        RenderFrameDiagnostics {
            render_path: GpuRenderPath::LegacyCpu,
            iosurface_creations: 0,
            texture_allocations: 0,
            render_time_ms: 1.0,
            convert_time_ms: 2.0,
            encode_time_ms: 3.0,
            gpu_wait_time_ms: 4.0,
            dropped_frames_since_last: 0,
            queue_depth: 1,
            ..RenderFrameDiagnostics::default()
        }
    }

    fn frame_with_meta_diagnostics() -> FrameData {
        FrameData {
            data: 123_i64.to_le_bytes().to_vec(),
            width: 1,
            height: 1,
            format: FrameFormat::H264,
            timestamp: 0.123,
            diagnostics: Some(diagnostics()),
            meta: Some(RenderFrameMeta {
                stream_id: "stream-main".to_string(),
                viewport_id: "viewport-main".to_string(),
                frame_id: 1,
                pts_us: 123,
                duration_us: 16_666,
                is_keyframe: true,
                scene_revision: 2,
                applied_seq: 3,
                diagnostics: Some(diagnostics()),
                scene_id: Some("scene-main".to_string()),
                frame_timestamp: 0.123,
                view_transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                projection_json: None,
                active_preview_mode: None,
                preview_playback_clock_ms: None,
            }),
        }
    }

    #[test]
    fn render_frame_meta_message_borrows_metadata() {
        let frame = frame_with_meta_diagnostics();
        let message = create_render_frame_meta_message(&frame).expect("meta message");

        assert_eq!(message.message_type, "renderFrameMeta");
        assert_eq!(message.meta.frame_id, 1);
        assert_eq!(
            message.meta.diagnostics.as_ref().unwrap().encode_time_ms,
            3.0
        );
    }

    #[test]
    fn diagnostics_message_is_suppressed_when_meta_contains_diagnostics() {
        let frame = frame_with_meta_diagnostics();

        assert!(create_render_frame_diagnostics_message(&frame).is_none());
    }

    #[test]
    fn diagnostics_message_falls_back_for_legacy_frames() {
        let mut frame = frame_with_meta_diagnostics();
        frame.meta = None;
        let message = create_render_frame_diagnostics_message(&frame).expect("diagnostics message");

        assert_eq!(message.message_type, "renderFrameDiagnostics");
        assert_eq!(message.pts_us, 123);
        assert_eq!(message.diagnostics.render_time_ms, 1.0);
    }
}
