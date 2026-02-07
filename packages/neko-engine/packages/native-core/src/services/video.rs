//! Video service trait

use crate::domain::{CaptureOptions, ExtractOptions, FrameData, TaskHandle, TranscodeOptions};
use crate::error::Result;
use neko_types::{MediaInfo, ResourceId, StreamId};
use std::path::Path;
use tokio::sync::broadcast;

/// Video service interface
///
/// Handles all video-related operations: probing, capture, extraction,
/// streaming, transcoding, keyframe analysis, waveform generation, and proxy creation.
#[allow(async_fn_in_trait)]
pub trait IVideoService: Send + Sync {
    /// Probe video file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Capture a single frame at specified time
    async fn capture(
        &self,
        resource_id: &ResourceId,
        time_seconds: f64,
        options: CaptureOptions,
    ) -> Result<FrameData>;

    /// Extract multiple frames
    async fn extract(
        &self,
        resource_id: &ResourceId,
        options: ExtractOptions,
        task_handle: Option<TaskHandle>,
    ) -> Result<Vec<FrameData>>;

    /// Start a video stream
    async fn start_stream(
        &self,
        resource_id: &ResourceId,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Stop a video stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Transcode video to different format
    async fn transcode(
        &self,
        resource_id: &ResourceId,
        output_path: &Path,
        options: TranscodeOptions,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;

    /// Get keyframe information
    async fn get_keyframes(&self, resource_id: &ResourceId) -> Result<Vec<crate::KeyframeInfo>>;

    /// Generate audio waveform from video
    async fn generate_waveform(
        &self,
        resource_id: &ResourceId,
        task_handle: Option<TaskHandle>,
    ) -> Result<neko_types::WaveformData>;

    /// Generate proxy (lower resolution) version
    async fn generate_proxy(
        &self,
        resource_id: &ResourceId,
        output_path: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;
}
