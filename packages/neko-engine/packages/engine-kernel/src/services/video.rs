//! Video service trait

use crate::domain::{CaptureOptions, ExtractOptions, FrameData, TaskHandle, TranscodeOptions};
use crate::error::Result;
use crate::services::IStreamPlayback;
use async_trait::async_trait;
use neko_engine_types::{MediaInfo, StreamId};
use neko_runtime_media::PanoramaViewState;
use std::path::Path;
use tokio::sync::broadcast;

/// Video service interface
///
/// Handles video-specific operations: probing, capture, extraction,
/// streaming, transcoding, keyframe analysis, waveform generation, and proxy creation.
/// Stream playback control (stop/pause/resume/speed/seek/loop) is inherited from `IStreamPlayback`.
#[async_trait]
pub trait IVideoService: IStreamPlayback {
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

    /// Start a panoramic video stream projected by the GPU renderer.
    async fn start_panoramic_stream(
        &self,
        source: &Path,
        session_id: &str,
        view_state: PanoramaViewState,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Update panoramic stream view state without restarting decode.
    async fn update_panoramic_view_state(
        &self,
        stream_id: &StreamId,
        view_state: PanoramaViewState,
    ) -> Result<()>;

    /// Transcode video to different format
    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: TranscodeOptions,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;

    /// Get keyframe information
    async fn get_keyframes(&self, source: &Path) -> Result<Vec<crate::decoder::KeyframeInfo>>;

    /// Generate audio waveform from video
    async fn generate_waveform(
        &self,
        source: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<neko_engine_types::WaveformData>;

    /// Generate proxy (lower resolution) version
    async fn generate_proxy(
        &self,
        source: &Path,
        output_path: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;
}
