//! Frame Server - Localhost HTTP/WebSocket server for streaming video frames
//!
//! This module provides a high-performance frame streaming server that bypasses
//! VSCode's postMessage overhead by using direct TCP loopback connections.
//!
//! ## Endpoints
//!
//! ### Streaming
//! - `GET /ws/h264` - WebSocket H.264 NAL unit streaming
//!
//! ### On-demand Extraction
//! - `GET /frame/extract` - Extract single frame from video as JPEG
//! - `POST /frame/composite` - Composite multiple layers and return as JPEG
//!
//! ### Media Probe
//! - `GET /probe` - Probe media file and return metadata (JSON or text format)

mod extract;
mod probe;
mod server;

pub use extract::{
    extract_routes, CompositeLayerRequest, CompositeRequest, ExtractQuery, ExtractState,
    TransformRequest,
};
pub use probe::{probe_routes, ProbeQuery, ProbeResponse};
pub use server::{FrameServer, FrameServerConfig, FrameServerHandle};
