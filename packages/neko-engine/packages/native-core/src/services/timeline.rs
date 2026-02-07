//! Timeline service trait

use crate::domain::{FrameData, StreamConfig, Timeline};
use crate::error::Result;
use neko_types::{LoopRegion, StreamId};
use tokio::sync::broadcast;

/// Timeline service interface
///
/// Handles timeline composition and playback: compositing frames,
/// stream management, playback control.
#[allow(async_fn_in_trait)]
pub trait ITimelineService: Send + Sync {
    /// Composite a single frame at specified time
    async fn composite(
        &self,
        timeline: &Timeline,
        frame_number: u64,
    ) -> Result<FrameData>;

    /// Start a timeline stream for preview
    async fn start_stream(
        &self,
        timeline: &Timeline,
        session_id: &str,
        config: StreamConfig,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Stop a timeline stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Pause stream playback
    async fn pause(&self, stream_id: &StreamId) -> Result<()>;

    /// Resume stream playback
    async fn resume(&self, stream_id: &StreamId) -> Result<()>;

    /// Set playback speed
    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()>;

    /// Set loop region for playback
    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()>;

    /// Seek to nearest keyframe
    async fn seek_keyframe(
        &self,
        stream_id: &StreamId,
        time_seconds: f64,
        direction: SeekDirection,
    ) -> Result<f64>;

    /// Seek to exact time
    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()>;
}

/// Direction for keyframe seeking
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeekDirection {
    /// Seek to previous keyframe
    Backward,
    /// Seek to next keyframe
    Forward,
    /// Seek to nearest keyframe
    Nearest,
}
