//! Audio service trait

use crate::domain::AudioTranscodeOptions;
use crate::error::Result;
use neko_types::{LoopRegion, MediaInfo, StreamId, WaveformData};
use std::path::Path;
use tokio::sync::broadcast;

use super::super::domain::FrameData;

/// Audio service interface
///
/// Handles audio-related operations: probing, transcoding, streaming,
/// playback control, and waveform generation.
#[allow(async_fn_in_trait)]
pub trait IAudioService: Send + Sync {
    /// Probe audio file metadata
    async fn probe(&self, path: &Path) -> Result<MediaInfo>;

    /// Transcode audio file to a different format/codec/bitrate
    async fn transcode(
        &self,
        source: &Path,
        output_path: &Path,
        options: AudioTranscodeOptions,
    ) -> Result<()>;

    /// Start an audio stream
    async fn start_stream(
        &self,
        source: &Path,
        session_id: &str,
    ) -> Result<(StreamId, broadcast::Receiver<FrameData>)>;

    /// Stop an audio stream
    async fn stop_stream(&self, stream_id: &StreamId) -> Result<()>;

    /// Pause audio stream playback
    async fn pause(&self, stream_id: &StreamId) -> Result<()>;

    /// Resume audio stream playback
    async fn resume(&self, stream_id: &StreamId) -> Result<()>;

    /// Set audio stream playback speed
    async fn set_speed(&self, stream_id: &StreamId, speed: f64) -> Result<()>;

    /// Seek audio stream to a specific time
    async fn seek(&self, stream_id: &StreamId, time_seconds: f64) -> Result<()>;

    /// Set loop region for audio stream playback
    async fn set_loop(&self, stream_id: &StreamId, region: Option<LoopRegion>) -> Result<()>;

    /// Generate waveform visualization data
    async fn generate_waveform(
        &self,
        source: &Path,
    ) -> Result<WaveformData>;
}
