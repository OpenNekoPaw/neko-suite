//! WebSocket puppet stream endpoint.
//!
//! GET /v1/puppets/stream — Upgrade to WebSocket for puppet preview streaming.
//!
//! Default format stays JSON PuppetDelta for debugging and compatibility.
//! `?format=h264` renders PuppetRenderer frames through StreamSink and pushes
//! the same binary H.264 packet format used by `/v1/streams/:stream_id`.
//!
//! Protocol:
//!   Client → Server: any text message closes the stream cleanly
//!   Server → Client: JSON PuppetDelta frames or binary H.264 packets at ~60fps

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use neko_host_api::{
    EngineApi, PipelineSink, PreviewPipelineConfig, PuppetRenderTiming, StreamSink,
};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};

/// Target frame duration for ~60fps
const FRAME_DURATION_MS: f32 = 16.0;
const FRAME_INTERVAL: Duration = Duration::from_millis(16);
const DEFAULT_H264_WIDTH: u32 = 512;
const DEFAULT_H264_HEIGHT: u32 = 512;
const DEFAULT_H264_FPS: f64 = 60.0;
const DEFAULT_H264_BITRATE: u64 = 2_000_000;
const H264_CHANNEL_CAPACITY: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PuppetStreamFormat {
    Json,
    H264,
}

#[derive(Debug, Deserialize)]
pub struct PuppetStreamQuery {
    format: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    bitrate: Option<u64>,
}

#[derive(Debug, Clone, Copy)]
struct PuppetH264StreamConfig {
    width: u32,
    height: u32,
    fps: f64,
    bitrate: u64,
}

/// GET /v1/puppets/stream
///
/// Upgrades to WebSocket and pushes puppet preview frames at ~60fps.
/// Returns 204 immediately if no puppet is loaded.
pub async fn handle_puppet_stream(
    State(engine): State<Arc<EngineApi>>,
    Query(query): Query<PuppetStreamQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let format = parse_stream_format(query.format.as_deref());
    match format {
        PuppetStreamFormat::Json => {
            ws.on_upgrade(move |socket| puppet_json_stream_loop(socket, engine))
        }
        PuppetStreamFormat::H264 => {
            let config = h264_stream_config(&query);
            ws.on_upgrade(move |socket| puppet_h264_stream_loop(socket, engine, config))
        }
    }
}

async fn puppet_json_stream_loop(mut socket: WebSocket, engine: Arc<EngineApi>) {
    let service = match engine.puppet_service() {
        Some(svc) => svc,
        None => {
            tracing::warn!("Puppet stream requested but no puppet service available");
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code: 4503,
                    reason: "Puppet service not available".into(),
                })))
                .await;
            return;
        }
    };

    tracing::info!("Puppet WebSocket stream connected — pushing at ~60fps");

    let mut ticker = interval(FRAME_INTERVAL);
    // Consume the first immediate tick so the loop starts on the first actual interval
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                // Advance simulation and get deformed mesh delta
                let delta = match service.tick(FRAME_DURATION_MS) {
                    Ok(d) => d,
                    Err(e) => {
                        tracing::error!("Puppet tick error: {}", e);
                        break;
                    }
                };

                // Serialise to JSON and push over WebSocket
                let json = match serde_json::to_string(&delta) {
                    Ok(j) => j,
                    Err(e) => {
                        tracing::error!("Puppet delta serialisation error: {}", e);
                        break;
                    }
                };

                if socket.send(Message::Text(json)).await.is_err() {
                    tracing::debug!("Puppet stream client disconnected");
                    break;
                }
            }

            // Any incoming message from the client (including Close) ends the stream
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::debug!("Puppet stream closed by client");
                        break;
                    }
                    Some(Ok(_)) => {
                        // Ignore other client messages (ping/pong handled by axum)
                    }
                    Some(Err(e)) => {
                        tracing::debug!("Puppet stream receive error: {}", e);
                        break;
                    }
                }
            }
        }
    }

    tracing::info!("Puppet WebSocket stream disconnected");
}

async fn puppet_h264_stream_loop(
    mut socket: WebSocket,
    engine: Arc<EngineApi>,
    config: PuppetH264StreamConfig,
) {
    let service = match engine.puppet_service() {
        Some(svc) => svc,
        None => {
            close_socket(&mut socket, 4503, "Puppet service not available").await;
            return;
        }
    };

    let (tx, mut rx) = broadcast::channel(H264_CHANNEL_CAPACITY);
    let sink = match StreamSink::new(config.into_preview_config(), tx) {
        Ok(sink) => sink,
        Err(error) => {
            tracing::warn!("Puppet H.264 StreamSink unavailable: {}", error);
            close_socket(
                &mut socket,
                4510,
                "Puppet H.264 stream requires zero-copy GPU encoder support",
            )
            .await;
            return;
        }
    };

    tracing::info!("Puppet H.264 WebSocket stream connected — pushing at ~60fps");

    let mut ticker = interval(FRAME_INTERVAL);
    let mut frame_index = 0u64;
    ticker.tick().await;

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                if let Err(error) = service.tick(FRAME_DURATION_MS) {
                    tracing::error!("Puppet H.264 tick error: {}", error);
                    break;
                }

                let timing = PuppetRenderTiming {
                    pts: frame_index as i64 * frame_duration_us(config.fps),
                    duration: frame_duration_us(config.fps),
                    frame_index,
                };

                if let Err(error) = service.submit_rendered_frame_to_sink(
                    &sink,
                    config.width,
                    config.height,
                    timing,
                ) {
                    tracing::warn!("Puppet H.264 render/sink error: {}", error);
                    close_socket(
                        &mut socket,
                        4511,
                        "Puppet H.264 stream is unsupported on this platform or encoder",
                    )
                    .await;
                    break;
                }

                frame_index = frame_index.saturating_add(1);

                loop {
                    match rx.try_recv() {
                        Ok(frame) => {
                            if socket.send(Message::Binary(frame.data)).await.is_err() {
                                tracing::debug!("Puppet H.264 stream client disconnected");
                                let _ = sink.close();
                                return;
                            }
                        }
                        Err(broadcast::error::TryRecvError::Empty) => break,
                        Err(broadcast::error::TryRecvError::Lagged(n)) => {
                            tracing::warn!("Puppet H.264 stream client lagged {} frames", n);
                        }
                        Err(broadcast::error::TryRecvError::Closed) => {
                            tracing::debug!("Puppet H.264 stream channel closed");
                            let _ = sink.close();
                            return;
                        }
                    }
                }
            }

            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::debug!("Puppet H.264 stream closed by client");
                        break;
                    }
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        tracing::debug!("Puppet H.264 stream receive error: {}", error);
                        break;
                    }
                }
            }
        }
    }

    let _ = sink.close();
    tracing::info!("Puppet H.264 WebSocket stream disconnected");
}

fn parse_stream_format(format: Option<&str>) -> PuppetStreamFormat {
    match format.unwrap_or("json").to_ascii_lowercase().as_str() {
        "h264" | "h.264" | "video" => PuppetStreamFormat::H264,
        _ => PuppetStreamFormat::Json,
    }
}

fn h264_stream_config(query: &PuppetStreamQuery) -> PuppetH264StreamConfig {
    PuppetH264StreamConfig {
        width: query.width.unwrap_or(DEFAULT_H264_WIDTH).max(1),
        height: query.height.unwrap_or(DEFAULT_H264_HEIGHT).max(1),
        fps: query
            .fps
            .filter(|fps| fps.is_finite() && *fps > 0.0)
            .unwrap_or(DEFAULT_H264_FPS),
        bitrate: query.bitrate.unwrap_or(DEFAULT_H264_BITRATE).max(1),
    }
}

impl PuppetH264StreamConfig {
    fn into_preview_config(self) -> PreviewPipelineConfig {
        PreviewPipelineConfig {
            width: self.width,
            height: self.height,
            fps: self.fps,
            bitrate: self.bitrate,
            gop_size: self.fps.round().max(1.0) as u32,
        }
    }
}

fn frame_duration_us(fps: f64) -> i64 {
    (1_000_000.0 / fps.max(1.0)).round() as i64
}

async fn close_socket(socket: &mut WebSocket, code: u16, reason: &'static str) {
    let _ = socket
        .send(Message::Close(Some(axum::extract::ws::CloseFrame {
            code,
            reason: reason.into(),
        })))
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_duration_is_16ms() {
        assert_eq!(FRAME_DURATION_MS, 16.0);
    }

    #[test]
    fn test_frame_interval_is_16ms() {
        assert_eq!(FRAME_INTERVAL, Duration::from_millis(16));
    }

    #[test]
    fn defaults_to_json_stream_format() {
        assert_eq!(parse_stream_format(None), PuppetStreamFormat::Json);
        assert_eq!(parse_stream_format(Some("json")), PuppetStreamFormat::Json);
    }

    #[test]
    fn parses_h264_stream_format_aliases() {
        assert_eq!(parse_stream_format(Some("h264")), PuppetStreamFormat::H264);
        assert_eq!(parse_stream_format(Some("H.264")), PuppetStreamFormat::H264);
        assert_eq!(parse_stream_format(Some("video")), PuppetStreamFormat::H264);
    }

    #[test]
    fn h264_stream_config_sanitizes_query() {
        let config = h264_stream_config(&PuppetStreamQuery {
            format: Some("h264".to_string()),
            width: Some(0),
            height: Some(720),
            fps: Some(-1.0),
            bitrate: Some(0),
        });

        assert_eq!(config.width, 1);
        assert_eq!(config.height, 720);
        assert_eq!(config.fps, DEFAULT_H264_FPS);
        assert_eq!(config.bitrate, 1);
    }
}
