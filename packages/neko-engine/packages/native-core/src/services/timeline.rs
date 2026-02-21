//! Timeline service trait

use crate::domain::{FrameData, StreamConfig, Timeline, TimelineProjectInfo};
use crate::error::Result;
use crate::export::ExportStats;
use neko_types::{LoopRegion, StreamId};
use serde::Serialize;
use std::path::Path;
use tokio::sync::{broadcast, watch};

/// Stream performance statistics (updated periodically, polled on demand)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStats {
    /// Video pipeline performance metrics
    pub video: ExportStats,
    /// Audio mix average time in milliseconds
    pub audio_mix_ms: f64,
    /// Audio average FPS
    pub audio_fps: f64,
    /// Current playback position in seconds
    pub current_time: f64,
    /// Total timeline duration in seconds
    pub total_duration: f64,
    /// System resource: peak memory bytes
    pub peak_memory_bytes: u64,
    /// System resource: average CPU usage percent
    pub cpu_usage_percent: f64,
}

impl Default for StreamStats {
    fn default() -> Self {
        Self {
            video: ExportStats::default(),
            audio_mix_ms: 0.0,
            audio_fps: 0.0,
            current_time: 0.0,
            total_duration: 0.0,
            peak_memory_bytes: 0,
            cpu_usage_percent: 0.0,
        }
    }
}

/// Result of starting a timeline stream (video + audio paired streams)
pub struct TimelineStreamResult {
    pub video_stream_id: StreamId,
    pub video_rx: broadcast::Receiver<FrameData>,
    pub audio_stream_id: StreamId,
    pub audio_rx: broadcast::Receiver<FrameData>,
    /// Watch receiver for latest stats snapshot (poll on demand)
    pub stats_rx: watch::Receiver<StreamStats>,
}

impl std::fmt::Debug for TimelineStreamResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TimelineStreamResult")
            .field("video_stream_id", &self.video_stream_id)
            .field("audio_stream_id", &self.audio_stream_id)
            .finish()
    }
}

/// Timeline service interface
///
/// Handles timeline composition and playback: compositing frames,
/// stream management, playback control, and project probing.
#[allow(async_fn_in_trait)]
pub trait ITimelineService: Send + Sync {
    /// Probe a .jvi project file and return metadata without rendering
    async fn probe(&self, jvi_path: &Path) -> Result<TimelineProjectInfo>;

    /// Composite a single frame at specified time
    async fn composite(
        &self,
        timeline: &Timeline,
        frame_number: u64,
    ) -> Result<FrameData>;

    /// Start a timeline stream for preview (returns paired video + audio streams)
    async fn start_stream(
        &self,
        timeline: &Timeline,
        session_id: &str,
        config: StreamConfig,
    ) -> Result<TimelineStreamResult>;

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

    /// Seek to exact time
    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()>;

    /// Get stream performance statistics
    async fn get_stream_stats(&self, stream_id: &StreamId) -> Option<StreamStats>;
}
