//! Audio service trait

use crate::domain::TaskHandle;
use crate::error::Result;
use neko_types::{MediaInfo, ResourceId, StreamId, WaveformData};
use std::path::Path;
use tokio::sync::broadcast;

use super::super::domain::FrameData;

/// Audio service interface
///
/// Handles audio-related operations: probing, extraction, streaming, and waveform generation.
#[allow(async_fn_in_trait)]
pub trait IAudioService: Send + Sync {
    /// Probe audio file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Extract audio from media file
    async fn extract(
        &self,
        resource_id: &ResourceId,
        output_path: &Path,
        task_handle: Option<TaskHandle>,
    ) -> Result<()>;

    /// Start an audio stream
    async fn start_stream(
        &self,
        resource_id: &ResourceId,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Stop an audio stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Generate waveform visualization data
    async fn generate_waveform(
        &self,
        resource_id: &ResourceId,
        task_handle: Option<TaskHandle>,
    ) -> Result<WaveformData>;
}
