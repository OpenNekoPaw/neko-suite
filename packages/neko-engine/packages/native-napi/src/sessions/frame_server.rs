//! Frame server session classes - FrameServerSession and FrameServerWithExportSession

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::{Arc, Mutex, OnceLock};

use neko_native_core::frame_server::{FrameServer, FrameServerConfig, FrameServerHandle};

// =============================================================================
// Shared Tokio Runtime
// =============================================================================

static TOKIO_RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

pub fn get_runtime() -> &'static tokio::runtime::Runtime {
    TOKIO_RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

// =============================================================================
// Frame Server Types
// =============================================================================

/// Frame server configuration for N-API
#[napi(object)]
pub struct JsFrameServerConfig {
    /// Preferred port (0 for auto-assign)
    pub port: Option<u16>,
    /// Maximum frame buffer size
    pub max_buffer_size: Option<u32>,
    /// JPEG quality (1-100)
    pub jpeg_quality: Option<u8>,
}

/// Frame server statistics
#[napi(object)]
pub struct JsFrameServerStats {
    pub frames_sent: i64,
    pub is_running: bool,
}

// =============================================================================
// FrameServerSession
// =============================================================================

/// Frame server session for streaming video frames via HTTP/WebSocket
#[deprecated(note = "Use NativeEngine.startFrameServer() + createStream() + pushStreamFrame() instead")]
#[napi]
pub struct FrameServerSession {
    handle: Arc<Mutex<Option<FrameServerHandle>>>,
    port: u16,
}

#[napi]
impl FrameServerSession {
    /// Start a new frame server with export support
    ///
    /// This version includes the export API endpoints for compat mode video export:
    /// - POST /export/start
    /// - POST /export/cancel/:job_id
    /// - GET /export/status/:job_id
    /// - GET /export/progress (WebSocket)
    #[napi(factory)]
    pub fn start(config: Option<JsFrameServerConfig>) -> Result<Self> {
        let rust_config = match config {
            Some(c) => FrameServerConfig {
                port: c.port.unwrap_or(0),
                max_buffer_size: c.max_buffer_size.unwrap_or(3) as usize,
                jpeg_quality: c.jpeg_quality.unwrap_or(85),
            },
            None => FrameServerConfig::default(),
        };

        let runtime = get_runtime();
        let handle = runtime
            .block_on(FrameServer::start_with_export(rust_config))
            .map_err(|e| Error::from_reason(format!("Failed to start frame server: {}", e)))?;

        let port = handle.port();
        tracing::info!("Frame server with export support started on port {}", port);

        Ok(Self {
            handle: Arc::new(Mutex::new(Some(handle))),
            port,
        })
    }

    /// Get the server port
    #[napi]
    pub fn get_port(&self) -> u16 {
        self.port
    }

    /// Get the server URL for MJPEG streaming
    #[napi]
    pub fn get_mjpeg_url(&self) -> String {
        format!("http://127.0.0.1:{}/mjpeg", self.port)
    }

    /// Get the server URL for WebSocket streaming
    #[napi]
    pub fn get_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws", self.port)
    }

    /// Get the server URL for single frame
    #[napi]
    pub fn get_frame_url(&self) -> String {
        format!("http://127.0.0.1:{}/frame", self.port)
    }

    /// Get the server URL for H.264 WebSocket streaming
    #[napi]
    pub fn get_h264_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws/h264", self.port)
    }

    /// Push a JPEG frame to all connected clients
    #[napi]
    pub fn push_frame(
        &self,
        jpeg_data: Buffer,
        timestamp_us: i64,
        width: u32,
        height: u32,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_frame(jpeg_data.to_vec(), timestamp_us as u64, width, height);
        Ok(())
    }

    /// Push an H.264 packet to all connected clients via WebSocket
    #[napi]
    pub fn push_h264_packet(
        &self,
        data: Buffer,
        pts: i64,
        dts: i64,
        is_keyframe: bool,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_h264_packet(data.to_vec(), pts, dts, is_keyframe);
        Ok(())
    }

    /// Get server statistics
    #[napi]
    pub fn get_stats(&self) -> Result<JsFrameServerStats> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        let stats = handle.stats();
        Ok(JsFrameServerStats {
            frames_sent: stats.frames_sent as i64,
            is_running: stats.is_running,
        })
    }

    /// Stop the server
    #[napi]
    pub fn stop(&self) -> Result<()> {
        let mut guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        if let Some(handle) = guard.take() {
            handle.shutdown();
            tracing::info!("Frame server stopped");
        }

        Ok(())
    }
}

// =============================================================================
// FrameServerWithExportSession
// =============================================================================

/// Frame server session with export support
///
/// This server includes export API endpoints for compat mode video export:
/// - POST /export/start - Start an export job
/// - POST /export/cancel/:job_id - Cancel an export job
/// - GET /export/status/:job_id - Get export status
/// - GET /export/progress - WebSocket for real-time progress updates
#[deprecated(note = "Use NativeEngine.startFrameServer() + createStream() + pushStreamFrame() instead")]
#[napi]
pub struct FrameServerWithExportSession {
    handle: Arc<Mutex<Option<FrameServerHandle>>>,
    port: u16,
}

#[napi]
impl FrameServerWithExportSession {
    /// Start a new frame server with export support
    #[napi(factory)]
    pub fn start(config: Option<JsFrameServerConfig>) -> Result<Self> {
        let rust_config = match config {
            Some(c) => FrameServerConfig {
                port: c.port.unwrap_or(0),
                max_buffer_size: c.max_buffer_size.unwrap_or(3) as usize,
                jpeg_quality: c.jpeg_quality.unwrap_or(85),
            },
            None => FrameServerConfig::default(),
        };

        let runtime = get_runtime();
        let handle = runtime
            .block_on(FrameServer::start_with_export(rust_config))
            .map_err(|e| Error::from_reason(format!("Failed to start frame server: {}", e)))?;

        let port = handle.port();
        tracing::info!("Frame server with export support started on port {}", port);

        Ok(Self {
            handle: Arc::new(Mutex::new(Some(handle))),
            port,
        })
    }

    /// Get the server port
    #[napi]
    pub fn get_port(&self) -> u16 {
        self.port
    }

    /// Get the base URL for the server
    #[napi]
    pub fn get_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Get the server URL for MJPEG streaming
    #[napi]
    pub fn get_mjpeg_url(&self) -> String {
        format!("http://127.0.0.1:{}/mjpeg", self.port)
    }

    /// Get the server URL for WebSocket streaming
    #[napi]
    pub fn get_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws", self.port)
    }

    /// Get the export API base URL
    #[napi]
    pub fn get_export_url(&self) -> String {
        format!("http://127.0.0.1:{}/export", self.port)
    }

    /// Get the server URL for H.264 WebSocket streaming
    #[napi]
    pub fn get_h264_websocket_url(&self) -> String {
        format!("ws://127.0.0.1:{}/ws/h264", self.port)
    }

    /// Push a JPEG frame to all connected clients
    #[napi]
    pub fn push_frame(
        &self,
        jpeg_data: Buffer,
        timestamp_us: i64,
        width: u32,
        height: u32,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_frame(jpeg_data.to_vec(), timestamp_us as u64, width, height);
        Ok(())
    }

    /// Push an H.264 packet to all connected clients via WebSocket
    #[napi]
    pub fn push_h264_packet(
        &self,
        data: Buffer,
        pts: i64,
        dts: i64,
        is_keyframe: bool,
    ) -> Result<()> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        handle.push_h264_packet(data.to_vec(), pts, dts, is_keyframe);
        Ok(())
    }

    /// Get server statistics
    #[napi]
    pub fn get_stats(&self) -> Result<JsFrameServerStats> {
        let guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        let handle = guard
            .as_ref()
            .ok_or_else(|| Error::from_reason("Server already stopped"))?;

        let stats = handle.stats();
        Ok(JsFrameServerStats {
            frames_sent: stats.frames_sent as i64,
            is_running: stats.is_running,
        })
    }

    /// Stop the server
    #[napi]
    pub fn stop(&self) -> Result<()> {
        let mut guard = self
            .handle
            .lock()
            .map_err(|_| Error::from_reason("Failed to lock handle"))?;

        if let Some(handle) = guard.take() {
            handle.shutdown();
            tracing::info!("Frame server with export stopped");
        }

        Ok(())
    }
}
