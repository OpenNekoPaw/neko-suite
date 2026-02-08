//! Frame streaming server implementation
//!
//! Provides H.264 WebSocket streaming for real-time preview and export endpoints.
//!
//! ## Streaming Endpoints
//! - GET /ws/h264 - WebSocket H.264 NAL unit streaming (primary preview channel)
//! - GET /frame - Single JPEG frame (for thumbnails/debugging)
//!
//! ## Export Endpoints (when started with export support)
//! - POST /export/start - Start an export job
//! - POST /export/cancel/:job_id - Cancel an export job
//! - GET /export/status/:job_id - Get export status
//! - GET /export/progress - WebSocket for real-time progress updates

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, Response, StatusCode},
    response::IntoResponse,
    routing::get,
    Router,
};
use bytes::Bytes;
use std::{
    net::{SocketAddr, TcpListener},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tokio::sync::{broadcast, watch, RwLock};
use tower_http::cors::{Any, CorsLayer};

use crate::export::{export_routes, ExportService};
use crate::frame_server::extract::{extract_routes, ExtractState};
use crate::frame_server::probe::probe_routes;
use crate::gpu::GpuContext;
use crate::keyframe_cache::{keyframe_cache_routes, KeyframeCacheService};

/// Frame server configuration
#[derive(Debug, Clone)]
pub struct FrameServerConfig {
    /// Preferred port (0 for auto-assign)
    pub port: u16,
    /// Maximum frame buffer size (frames will be dropped if exceeded)
    pub max_buffer_size: usize,
    /// JPEG quality for MJPEG mode (1-100)
    pub jpeg_quality: u8,
}

impl Default for FrameServerConfig {
    fn default() -> Self {
        Self {
            port: 0,
            max_buffer_size: 3,
            jpeg_quality: 85,
        }
    }
}

/// Frame data with metadata
#[derive(Clone)]
pub struct FrameData {
    /// JPEG-encoded frame data
    pub jpeg_data: Bytes,
    /// Frame timestamp in microseconds
    pub timestamp_us: u64,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
}

/// H.264 packet data for streaming
#[derive(Clone)]
pub struct H264PacketData {
    /// H.264 NAL unit data
    pub data: Bytes,
    /// Presentation timestamp in microseconds
    pub pts: i64,
    /// Decode timestamp in microseconds
    pub dts: i64,
    /// Whether this is a keyframe (IDR)
    pub is_keyframe: bool,
}

/// Shared server state
struct ServerState {
    /// Latest frame for new connections
    latest_frame: RwLock<Option<FrameData>>,
    /// Broadcast channel for frame updates
    frame_tx: broadcast::Sender<FrameData>,
    /// Broadcast channel for H.264 packets
    h264_tx: broadcast::Sender<H264PacketData>,
    /// Server running flag
    running: AtomicBool,
    /// Frame counter for stats
    frame_count: AtomicU64,
    /// H.264 packet counter for stats
    h264_packet_count: AtomicU64,
    /// Shutdown signal
    shutdown_tx: watch::Sender<bool>,
}

/// Handle to control the frame server
pub struct FrameServerHandle {
    state: Arc<ServerState>,
    port: u16,
    #[allow(dead_code)]
    shutdown_rx: watch::Receiver<bool>,
}

impl FrameServerHandle {
    /// Get the server port
    pub fn port(&self) -> u16 {
        self.port
    }

    /// Push a new frame to all connected clients
    pub fn push_frame(&self, jpeg_data: Vec<u8>, timestamp_us: u64, width: u32, height: u32) {
        let frame = FrameData {
            jpeg_data: Bytes::from(jpeg_data),
            timestamp_us,
            width,
            height,
        };

        // Update latest frame for new connections
        if let Ok(mut latest) = self.state.latest_frame.try_write() {
            *latest = Some(frame.clone());
        }

        // Broadcast to all connected clients (ignore if no receivers)
        let _ = self.state.frame_tx.send(frame);
        self.state.frame_count.fetch_add(1, Ordering::Relaxed);
    }

    /// Push an H.264 packet to all connected clients
    pub fn push_h264_packet(&self, data: Vec<u8>, pts: i64, dts: i64, is_keyframe: bool) {
        let packet = H264PacketData {
            data: Bytes::from(data),
            pts,
            dts,
            is_keyframe,
        };

        // Broadcast to all connected clients (ignore if no receivers)
        let _ = self.state.h264_tx.send(packet);
        self.state.h264_packet_count.fetch_add(1, Ordering::Relaxed);
    }

    /// Get frame statistics
    pub fn stats(&self) -> FrameServerStats {
        FrameServerStats {
            frames_sent: self.state.frame_count.load(Ordering::Relaxed),
            is_running: self.state.running.load(Ordering::Relaxed),
        }
    }

    /// Shutdown the server
    pub fn shutdown(&self) {
        self.state.running.store(false, Ordering::Relaxed);
        let _ = self.state.shutdown_tx.send(true);
    }
}

/// Server statistics
#[derive(Debug, Clone)]
pub struct FrameServerStats {
    pub frames_sent: u64,
    pub is_running: bool,
}

/// Frame server for streaming video frames via HTTP/WebSocket
#[deprecated(note = "Use neko_native_http::start_server_with_frame_server() instead")]
pub struct FrameServer;

impl FrameServer {
    /// Start the frame server on the specified port (or auto-assign if 0)
    pub async fn start(config: FrameServerConfig) -> Result<FrameServerHandle, std::io::Error> {
        // Find available port
        let port = if config.port == 0 {
            Self::find_available_port()?
        } else {
            config.port
        };

        let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();

        // Create broadcast channels for frame and H.264 distribution
        let (frame_tx, _) = broadcast::channel::<FrameData>(config.max_buffer_size);
        let (h264_tx, _) = broadcast::channel::<H264PacketData>(config.max_buffer_size * 2);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let state = Arc::new(ServerState {
            latest_frame: RwLock::new(None),
            frame_tx,
            h264_tx,
            running: AtomicBool::new(true),
            frame_count: AtomicU64::new(0),
            h264_packet_count: AtomicU64::new(0),
            shutdown_tx,
        });

        // Build router
        let app = Router::new()
            .route("/health", get(health_handler))
            .route("/ws/h264", get(h264_websocket_handler))
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any),
            )
            .with_state(state.clone());

        // Spawn server task
        let state_clone = state.clone();
        let mut shutdown_rx_clone = shutdown_rx.clone();
        tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            tracing::info!("Frame server started on http://{}", addr);

            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx_clone.changed().await;
                    tracing::info!("Frame server shutting down");
                })
                .await
                .ok();

            state_clone.running.store(false, Ordering::Relaxed);
        });

        Ok(FrameServerHandle {
            state,
            port,
            shutdown_rx,
        })
    }

    fn find_available_port() -> Result<u16, std::io::Error> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        Ok(listener.local_addr()?.port())
    }

    /// Start the frame server with export service enabled
    ///
    /// This version includes the export API endpoints for compat mode video export.
    #[deprecated(note = "Use neko_native_http::start_server_with_frame_server() instead")]
    pub async fn start_with_export(
        config: FrameServerConfig,
    ) -> Result<FrameServerHandle, Box<dyn std::error::Error + Send + Sync>> {
        // Find available port
        let port = if config.port == 0 {
            Self::find_available_port()?
        } else {
            config.port
        };

        let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();

        // Create broadcast channels for frame and H.264 distribution
        let (frame_tx, _) = broadcast::channel::<FrameData>(config.max_buffer_size);
        let (h264_tx, _) = broadcast::channel::<H264PacketData>(config.max_buffer_size * 2);
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let state = Arc::new(ServerState {
            latest_frame: RwLock::new(None),
            frame_tx,
            h264_tx,
            running: AtomicBool::new(true),
            frame_count: AtomicU64::new(0),
            h264_packet_count: AtomicU64::new(0),
            shutdown_tx,
        });

        // Create GPU context for export service
        let gpu_ctx = Arc::new(GpuContext::new().await.map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create GPU context: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?);

        // Create export service
        let export_service = Arc::new(ExportService::with_gpu_context(Arc::clone(&gpu_ctx)));

        // Create keyframe cache service
        let keyframe_cache_service = Arc::new(KeyframeCacheService::new());

        // Create extract state for frame extraction endpoints
        let extract_state = Arc::new(ExtractState::new(Arc::clone(&gpu_ctx)).map_err(|e| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to create extract state: {}", e),
            )) as Box<dyn std::error::Error + Send + Sync>
        })?);

        // Build frame streaming routes with state
        let frame_routes = Router::new()
            .route("/health", get(health_handler))
            .route("/ws/h264", get(h264_websocket_handler))
            .with_state(state.clone());

        // Build combined router (export routes have their own state)
        let app = Router::new()
            .merge(frame_routes)
            .merge(export_routes(export_service))
            .merge(keyframe_cache_routes(keyframe_cache_service))
            .merge(extract_routes(extract_state))
            .merge(probe_routes())
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any),
            );

        // Spawn server task
        let state_clone = state.clone();
        let mut shutdown_rx_clone = shutdown_rx.clone();
        tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            tracing::info!(
                "Frame server with export support started on http://{}",
                addr
            );

            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx_clone.changed().await;
                    tracing::info!("Frame server shutting down");
                })
                .await
                .ok();

            state_clone.running.store(false, Ordering::Relaxed);
        });

        Ok(FrameServerHandle {
            state,
            port,
            shutdown_rx,
        })
    }
}

// Health check endpoint
async fn health_handler() -> impl IntoResponse {
    "OK"
}

// H.264 WebSocket endpoint for binary H.264 packet streaming
async fn h264_websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_h264_websocket(socket, state))
}

/// Build binary message for H.264 packet
/// Format: [pts: i64 LE][dts: i64 LE][is_keyframe: u8][data...]
fn build_h264_packet_message(packet: &H264PacketData) -> Vec<u8> {
    let header_size = 8 + 8 + 1; // i64 + i64 + u8
    let mut message = Vec::with_capacity(header_size + packet.data.len());

    // Write header (little-endian)
    message.extend_from_slice(&packet.pts.to_le_bytes());
    message.extend_from_slice(&packet.dts.to_le_bytes());
    message.push(if packet.is_keyframe { 1 } else { 0 });

    // Write H.264 NAL unit data
    message.extend_from_slice(&packet.data);

    message
}

async fn handle_h264_websocket(mut socket: WebSocket, state: Arc<ServerState>) {
    let mut rx = state.h264_tx.subscribe();

    // H.264 streaming doesn't use backpressure - we send all packets
    // The client should buffer and handle timing
    while state.running.load(Ordering::Relaxed) {
        tokio::select! {
            // Receive H.264 packet from broadcast channel
            result = rx.recv() => {
                match result {
                    Ok(packet) => {
                        let message = build_h264_packet_message(&packet);
                        if socket.send(Message::Binary(message.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("H.264 WebSocket lagged {} packets", n);
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
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
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn test_server_start_stop() {
        let handle = FrameServer::start(FrameServerConfig::default())
            .await
            .unwrap();

        assert!(handle.port() > 0);
        assert!(handle.stats().is_running);

        handle.shutdown();
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    #[tokio::test]
    async fn test_push_frame() {
        let handle = FrameServer::start(FrameServerConfig::default())
            .await
            .unwrap();

        // Push a test frame
        let test_jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0]; // JPEG magic bytes
        handle.push_frame(test_jpeg, 0, 1920, 1080);

        assert_eq!(handle.stats().frames_sent, 1);

        handle.shutdown();
    }
}