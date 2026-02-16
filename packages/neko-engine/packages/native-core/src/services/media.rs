//! Media stream service trait - unified A/V fMP4 streaming

use crate::domain::FrameData;
use crate::error::Result;
use neko_types::StreamId;
use std::path::Path;
use tokio::sync::broadcast;

/// Unified media stream service interface (fMP4 A/V muxed streaming)
#[allow(async_fn_in_trait)]
pub trait IMediaStreamService: Send + Sync {
    /// Start a unified A/V fMP4 stream
    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Stop a stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Pause stream playback
    async fn pause(&self, stream_id: &StreamId) -> Result<()>;

    /// Resume stream playback
    async fn resume(&self, stream_id: &StreamId) -> Result<()>;

    /// Seek to a specific time
    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()>;

    /// Set playback speed
    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()>;
}
