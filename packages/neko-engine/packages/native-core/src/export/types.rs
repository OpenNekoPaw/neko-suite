//! Export types - Data structures for compat mode video export
//!
//! These types mirror the TypeScript types in packages/shared/src/types/exportProtocol.ts
//! to ensure compatibility between Extension and Rust server.

use serde::{Deserialize, Serialize};

use crate::encoder::{EncoderConfig, EncoderPreset, HwEncoderType, VideoCodec};
use crate::gpu::{BlendMode, Transform2D};

// =============================================================================
// Export Job Configuration
// =============================================================================

/// Export job configuration from Extension
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJobConfig {
    /// Unique job ID
    pub job_id: String,
    /// Output file path
    pub output_path: String,
    /// Export settings
    pub settings: ExportSettings,
    /// Timeline data
    pub timeline: TimelineData,
}

/// Export settings
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Video codec
    #[serde(default)]
    pub video_codec: ExportVideoCodec,
    /// Video bitrate (bps)
    pub video_bitrate: Option<u64>,
    /// Audio codec
    #[serde(default)]
    pub audio_codec: ExportAudioCodec,
    /// Audio bitrate (bps)
    pub audio_bitrate: Option<u64>,
    /// Hardware encoder type
    #[serde(default)]
    pub hw_encoder: ExportHwEncoder,
    /// Time range to export (optional, exports full timeline if not specified)
    pub time_range: Option<TimeRange>,
    /// Encoder preset
    #[serde(default)]
    pub preset: ExportPreset,
    /// Enable zero-copy GPU encoding (macOS VideoToolbox only)
    ///
    /// When enabled, CVPixelBuffer is passed directly to VideoToolbox
    /// without any CPU involvement for maximum performance.
    #[serde(default)]
    pub use_zero_copy_gpu: bool,
}

impl ExportSettings {
    /// Convert to EncoderConfig
    pub fn to_encoder_config(&self) -> EncoderConfig {
        let mut config = EncoderConfig::new(
            self.width,
            self.height,
            self.fps,
            self.video_codec.to_video_codec(),
        );

        if let Some(bitrate) = self.video_bitrate {
            config = config.with_bitrate(bitrate);
        }

        config = config
            .with_preset(self.preset.to_encoder_preset())
            .with_hw_encoder(self.hw_encoder.to_hw_encoder_type())
            .with_zero_copy_gpu(self.use_zero_copy_gpu);

        config
    }
}

/// Video codec enum (JSON-friendly)
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportVideoCodec {
    #[default]
    H264,
    H265,
    Vp9,
    ProRes,
}

impl ExportVideoCodec {
    pub fn to_video_codec(self) -> VideoCodec {
        match self {
            ExportVideoCodec::H264 => VideoCodec::H264,
            ExportVideoCodec::H265 => VideoCodec::H265,
            ExportVideoCodec::Vp9 => VideoCodec::Vp9,
            ExportVideoCodec::ProRes => VideoCodec::ProRes,
        }
    }
}

/// Audio codec enum
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportAudioCodec {
    #[default]
    Aac,
    Mp3,
    Opus,
    Flac,
}

/// Hardware encoder type (JSON-friendly)
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportHwEncoder {
    #[default]
    None,
    Auto,
    VideoToolbox,
    Nvenc,
    Vaapi,
    Qsv,
}

impl ExportHwEncoder {
    pub fn to_hw_encoder_type(self) -> HwEncoderType {
        match self {
            ExportHwEncoder::None => HwEncoderType::None,
            ExportHwEncoder::Auto => HwEncoderType::Auto,
            ExportHwEncoder::VideoToolbox => HwEncoderType::VideoToolbox,
            ExportHwEncoder::Nvenc => HwEncoderType::Nvenc,
            ExportHwEncoder::Vaapi => HwEncoderType::Vaapi,
            ExportHwEncoder::Qsv => HwEncoderType::Qsv,
        }
    }
}

/// Encoder preset (JSON-friendly)
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportPreset {
    Ultrafast,
    Fast,
    #[default]
    Medium,
    Slow,
    Veryslow,
}

impl ExportPreset {
    pub fn to_encoder_preset(self) -> EncoderPreset {
        match self {
            ExportPreset::Ultrafast => EncoderPreset::Ultrafast,
            ExportPreset::Fast => EncoderPreset::Fast,
            ExportPreset::Medium => EncoderPreset::Medium,
            ExportPreset::Slow => EncoderPreset::Slow,
            ExportPreset::Veryslow => EncoderPreset::Veryslow,
        }
    }
}

/// Time range for partial export
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeRange {
    /// Start time in seconds
    pub start: f64,
    /// End time in seconds
    pub end: f64,
}

// =============================================================================
// Timeline Data
// =============================================================================

/// Timeline data structure (mirrors ProjectData)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineData {
    /// Timeline duration in seconds
    pub duration: f64,
    /// Tracks in the timeline
    pub tracks: Vec<TrackData>,
}

impl TimelineData {
    /// Calculate total frames based on fps
    pub fn total_frames(&self, fps: f64) -> u64 {
        (self.duration * fps).ceil() as u64
    }

    /// Get all media sources (file paths) used in the timeline
    pub fn get_media_sources(&self) -> Vec<String> {
        let mut sources = Vec::new();
        for track in &self.tracks {
            for element in &track.elements {
                if let Some(src) = element.source_path() {
                    if !sources.contains(&src) {
                        sources.push(src);
                    }
                }
            }
        }
        sources
    }
}

/// Track data
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackData {
    /// Track ID
    pub id: String,
    /// Track type
    #[serde(rename = "type")]
    pub track_type: TrackType,
    /// Elements in the track
    pub elements: Vec<ElementData>,
    /// Whether the track is muted
    #[serde(default)]
    pub muted: bool,
}

/// Track type
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TrackType {
    Video,
    /// Media track (alias for Video, used in jvi files)
    #[serde(alias = "media")]
    Media,
    Audio,
    Text,
    /// Subtitle track
    Subtitle,
    /// Shape track
    Shape,
    Effect,
}

/// Element data (union of all element types)
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ElementData {
    /// Media element (video/image)
    #[serde(rename = "media")]
    Media(MediaElementData),
    /// Text element
    #[serde(rename = "text")]
    Text(TextElementData),
    /// Audio element
    #[serde(rename = "audio")]
    Audio(AudioElementData),
}

impl ElementData {
    /// Get source file path if applicable
    pub fn source_path(&self) -> Option<String> {
        match self {
            ElementData::Media(m) => Some(m.src.clone()),
            ElementData::Audio(a) => Some(a.src.clone()),
            ElementData::Text(_) => None,
        }
    }

    /// Get element start time on timeline
    pub fn start_time(&self) -> f64 {
        match self {
            ElementData::Media(m) => m.start_time,
            ElementData::Audio(a) => a.start_time,
            ElementData::Text(t) => t.start_time,
        }
    }

    /// Get element duration
    pub fn duration(&self) -> f64 {
        match self {
            ElementData::Media(m) => m.duration,
            ElementData::Audio(a) => a.duration,
            ElementData::Text(t) => t.duration,
        }
    }

    /// Get element end time on timeline
    pub fn end_time(&self) -> f64 {
        self.start_time() + self.duration()
    }

    /// Check if element is visible at a specific time
    pub fn is_visible_at(&self, time: f64) -> bool {
        time >= self.start_time() && time < self.end_time()
    }
}

/// Media element data (video/image)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaElementData {
    /// Element ID
    pub id: String,
    /// Source file path
    pub src: String,
    /// Start time on timeline (seconds)
    pub start_time: f64,
    /// Duration on timeline (seconds)
    pub duration: f64,
    /// Trim start (seconds into source)
    #[serde(default)]
    pub trim_start: f64,
    /// Trim end (seconds from source end)
    #[serde(default)]
    pub trim_end: f64,
    /// 2D transform
    pub transform: Option<ElementTransform>,
    /// Opacity (0.0 - 1.0)
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    /// Blend mode
    #[serde(default)]
    pub blend_mode: Option<String>,
    /// Whether audio is muted
    #[serde(default)]
    pub muted: bool,
    /// Volume (0.0 - 1.0)
    #[serde(default = "default_volume")]
    pub volume: f32,
}

impl MediaElementData {
    /// Get source time for a given timeline time
    pub fn get_source_time(&self, timeline_time: f64) -> f64 {
        let relative_time = timeline_time - self.start_time;
        self.trim_start + relative_time
    }

    /// Convert to GPU Transform2D
    pub fn to_transform_2d(&self) -> Transform2D {
        match &self.transform {
            Some(t) => Transform2D {
                x: t.x,
                y: t.y,
                scale_x: t.scale_x,
                scale_y: t.scale_y,
                rotation: t.rotation,
                anchor_x: t.anchor_x,
                anchor_y: t.anchor_y,
                _padding: 0.0,
            },
            None => Transform2D::default(),
        }
    }

    /// Get blend mode
    pub fn get_blend_mode(&self) -> BlendMode {
        match &self.blend_mode {
            Some(mode) => BlendMode::from_str(mode),
            None => BlendMode::Normal,
        }
    }
}

/// Text element data
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextElementData {
    /// Element ID
    pub id: String,
    /// Text content
    pub text: String,
    /// Start time on timeline (seconds)
    pub start_time: f64,
    /// Duration on timeline (seconds)
    pub duration: f64,
    /// Font family
    #[serde(default = "default_font_family")]
    pub font_family: String,
    /// Font size (pixels)
    #[serde(default = "default_font_size")]
    pub font_size: f32,
    /// Font color (hex string)
    #[serde(default = "default_font_color")]
    pub color: String,
    /// 2D transform
    pub transform: Option<ElementTransform>,
    /// Opacity (0.0 - 1.0)
    #[serde(default = "default_opacity")]
    pub opacity: f32,
}

/// Audio element data
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioElementData {
    /// Element ID
    pub id: String,
    /// Source file path
    pub src: String,
    /// Start time on timeline (seconds)
    pub start_time: f64,
    /// Duration on timeline (seconds)
    pub duration: f64,
    /// Trim start (seconds into source)
    #[serde(default)]
    pub trim_start: f64,
    /// Trim end (seconds from source end)
    #[serde(default)]
    pub trim_end: f64,
    /// Audio settings (nested object from JVI format)
    #[serde(default)]
    pub audio: Option<AudioSettings>,
    /// Volume (0.0 - 1.0) - direct value (legacy format)
    #[serde(default = "default_volume")]
    pub volume: f32,
    /// Pan (-1.0 = left, 0.0 = center, 1.0 = right) - direct value (legacy format)
    #[serde(default)]
    pub pan: f32,
    /// Fade in duration (seconds)
    #[serde(default)]
    pub fade_in: f64,
    /// Fade out duration (seconds)
    #[serde(default)]
    pub fade_out: f64,
}

impl AudioElementData {
    /// Get effective volume (from nested audio settings or direct value)
    pub fn effective_volume(&self) -> f32 {
        if let Some(ref audio) = self.audio {
            if audio.muted {
                return 0.0;
            }
            audio.volume.as_ref().map(|v| v.base_value).unwrap_or(self.volume)
        } else {
            self.volume
        }
    }

    /// Get effective pan (from nested audio settings or direct value)
    pub fn effective_pan(&self) -> f32 {
        if let Some(ref audio) = self.audio {
            audio.pan.as_ref().map(|p| p.base_value).unwrap_or(self.pan)
        } else {
            self.pan
        }
    }

    /// Check if audio is muted
    pub fn is_muted(&self) -> bool {
        self.audio.as_ref().map(|a| a.muted).unwrap_or(false)
    }
}

/// Audio settings (nested object from JVI format)
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioSettings {
    /// Volume setting
    pub volume: Option<AudioValue>,
    /// Pan setting
    pub pan: Option<AudioValue>,
    /// Whether audio is muted
    #[serde(default)]
    pub muted: bool,
}

/// Audio value with baseValue (JVI format)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioValue {
    /// Base value
    pub base_value: f32,
}

/// Element transform
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementTransform {
    /// Position X (pixels)
    #[serde(default)]
    pub x: f32,
    /// Position Y (pixels)
    #[serde(default)]
    pub y: f32,
    /// Scale X (1.0 = 100%)
    #[serde(default = "default_scale")]
    pub scale_x: f32,
    /// Scale Y (1.0 = 100%)
    #[serde(default = "default_scale")]
    pub scale_y: f32,
    /// Rotation (degrees)
    #[serde(default)]
    pub rotation: f32,
    /// Anchor point X (0.0 = left, 0.5 = center, 1.0 = right)
    #[serde(default)]
    pub anchor_x: f32,
    /// Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom)
    #[serde(default)]
    pub anchor_y: f32,
}

// Default value functions
fn default_opacity() -> f32 {
    1.0
}
fn default_volume() -> f32 {
    1.0
}
fn default_scale() -> f32 {
    1.0
}
fn default_font_family() -> String {
    "Arial".to_string()
}
fn default_font_size() -> f32 {
    48.0
}
fn default_font_color() -> String {
    "#ffffff".to_string()
}

// =============================================================================
// Export Progress
// =============================================================================

/// Export progress update
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    /// Job ID
    pub job_id: String,
    /// Current state
    pub state: ExportState,
    /// Progress percentage (0.0 - 100.0)
    pub progress: f64,
    /// Current frame being processed
    pub current_frame: u64,
    /// Total frames to process
    pub total_frames: u64,
    /// Elapsed time in milliseconds
    pub elapsed_ms: u64,
    /// Estimated remaining time in milliseconds
    pub estimated_remaining_ms: u64,
    /// Error message if state is Error
    pub error: Option<String>,
    /// Export metadata (populated after initialization)
    pub metadata: Option<ExportMetadata>,
    /// Performance statistics
    pub stats: Option<ExportStats>,
}

/// Export metadata - basic info about the export
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMetadata {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Video bitrate (bps)
    pub video_bitrate: u64,
    /// Audio bitrate (bps)
    pub audio_bitrate: u64,
    /// Video codec name
    pub video_codec: String,
    /// Audio codec name
    pub audio_codec: String,
    /// Render mode (wgpu)
    pub render_mode: String,
    /// Hardware encoder type (if used)
    pub hw_encoder: Option<String>,
}

/// Export performance statistics
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportStats {
    // === Detailed Pipeline Timing (per-frame average in milliseconds) ===

    /// Hardware decode time (VideoToolbox/NVDEC)
    pub hw_decode_ms: f64,
    /// NV12 texture import to wgpu (CPU→GPU transfer)
    pub nv12_import_ms: f64,
    /// NV12 to RGBA conversion (GPU shader)
    pub nv12_to_rgba_ms: f64,
    /// Layer composition (GPU render)
    pub composite_ms: f64,
    /// RGBA to NV12 conversion for encoder (GPU compute)
    pub rgba_to_nv12_ms: f64,
    /// GPU data readback to CPU (for software encoder)
    pub cpu_readback_ms: f64,
    /// Encoder submission time
    pub encode_submit_ms: f64,

    // === Aggregate Timing (backward compatible, in milliseconds) ===

    /// Total decode time (hw_decode alias)
    pub decode_time_ms: u64,
    /// Total GPU pipeline time (import + nv12→rgba + composite + rgba→nv12 + readback)
    pub composite_time_ms: u64,
    /// Total encode time
    pub encode_time_ms: u64,
    /// Mux time
    pub mux_time_ms: u64,

    // === Performance Metrics ===

    /// Average FPS during export
    pub avg_fps: f64,
    /// Peak memory usage in bytes
    pub peak_memory_bytes: u64,
    /// Average CPU usage percentage (0.0 - 100.0)
    pub cpu_usage_percent: f64,
    /// Average GPU usage percentage (0.0 - 100.0), null if unavailable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_usage_percent: Option<f64>,
    /// Peak VRAM usage in bytes, null if unavailable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vram_usage_bytes: Option<u64>,
}

/// Export state
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExportState {
    /// Job is queued
    Pending,
    /// Initializing decoders and encoders
    Initializing,
    /// Decoding source media
    Decoding,
    /// Compositing frames
    Compositing,
    /// Encoding video
    Encoding,
    /// Muxing audio/video
    Muxing,
    /// Finalizing output file
    Finalizing,
    /// Export completed successfully
    Completed,
    /// Export was cancelled
    Cancelled,
    /// Export failed with error
    Error,
}

// =============================================================================
// API Response Types
// =============================================================================

/// Response for POST /export/start
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStartResponse {
    /// Job ID
    pub job_id: String,
    /// Total frames to export
    pub total_frames: u64,
}

/// Response for POST /export/cancel
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCancelResponse {
    /// Whether cancellation was successful
    pub success: bool,
}

/// Response for GET /export/status
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStatusResponse {
    /// Current progress
    pub progress: ExportProgress,
}

/// Error response
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportErrorResponse {
    /// Error message
    pub error: String,
    /// Error code
    pub code: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_settings_to_encoder_config() {
        let settings = ExportSettings {
            width: 1920,
            height: 1080,
            fps: 30.0,
            video_codec: ExportVideoCodec::H264,
            video_bitrate: Some(5_000_000),
            audio_codec: ExportAudioCodec::Aac,
            audio_bitrate: Some(128_000),
            hw_encoder: ExportHwEncoder::Auto,
            time_range: None,
            preset: ExportPreset::Fast,
            use_zero_copy_gpu: false,
        };

        let config = settings.to_encoder_config();
        assert_eq!(config.width, 1920);
        assert_eq!(config.height, 1080);
    }

    #[test]
    fn test_timeline_total_frames() {
        let timeline = TimelineData {
            duration: 10.0,
            tracks: vec![],
        };

        assert_eq!(timeline.total_frames(30.0), 300);
        assert_eq!(timeline.total_frames(60.0), 600);
    }

    #[test]
    fn test_element_visibility() {
        let element = ElementData::Media(MediaElementData {
            id: "test".to_string(),
            src: "/path/to/video.mp4".to_string(),
            start_time: 5.0,
            duration: 10.0,
            trim_start: 0.0,
            trim_end: 0.0,
            transform: None,
            opacity: 1.0,
            blend_mode: None,
            muted: false,
            volume: 1.0,
        });

        assert!(!element.is_visible_at(4.9));
        assert!(element.is_visible_at(5.0));
        assert!(element.is_visible_at(10.0));
        assert!(element.is_visible_at(14.9));
        assert!(!element.is_visible_at(15.0));
    }

    #[test]
    fn test_media_source_time() {
        let media = MediaElementData {
            id: "test".to_string(),
            src: "/path/to/video.mp4".to_string(),
            start_time: 5.0,
            duration: 10.0,
            trim_start: 2.0,
            trim_end: 0.0,
            transform: None,
            opacity: 1.0,
            blend_mode: None,
            muted: false,
            volume: 1.0,
        };

        // At timeline time 5.0, source time should be trim_start (2.0)
        assert_eq!(media.get_source_time(5.0), 2.0);
        // At timeline time 10.0, source time should be 2.0 + 5.0 = 7.0
        assert_eq!(media.get_source_time(10.0), 7.0);
    }
}
