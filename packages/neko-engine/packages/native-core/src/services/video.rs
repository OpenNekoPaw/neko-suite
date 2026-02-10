//! Video service trait

use crate::domain::{CaptureOptions, ExtractOptions, FrameData, TaskHandle, TranscodeOptions};
use crate::error::Result;
use neko_types::{LoopRegion, MediaInfo, StreamId};
use std::path::Path;
use tokio::sync::broadcast;

/// Video service interface
///
/// Handles all video-related operations: probing, capture, extraction,
/// streaming, playback control, transcoding, keyframe analysis,
/// waveform generation, and proxy creation.
#[allow(async_fn_in_trait)]
pub trait IVideoService: Send + Sync {
    /// Probe video file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Capture a single frame at specified time
    async fn capture(
        &self,
        source: &Path,
        time_seconds: f64,
        options: CaptureOptions,
    ) -> Result<FrameData>;

    /// Extract multiple frames
    async fn extract(
        &self,
        source: &Path,
        options: ExtractOptions,
        task_handle: Option<TaskHandle>,
    ) -> Result<Vec<FrameData>>;

    /// Start a video stream
    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Stop a video stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Pause video stream playback
    async fn pause(&self, stream_id: &StreamId) -> Result<()>;

    /// Resume video stream playback
    async fn resume(&self, stream_id: &StreamId) -> Result<()>;

    /// Set video stream playback speed
    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()>;

    /// Seek video stream to exact time
    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()>;

    /// Set loop region for video stream playback
    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()>;

    /// Transcode video to different format
    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: TranscodeOptions,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;

    /// Get keyframe information
    async fn get_keyframes(&self, source: &Path) -> Result<Vec<crate::keyframe_cache::KeyframeInfo>>;

    /// Generate audio waveform from video
    async fn generate_waveform(
        &self,
        source: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<neko_types::WaveformData>;

    /// Generate proxy (lower resolution) version
    async fn generate_proxy(
        &self,
        source: &Path,
        output_path: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;
}
