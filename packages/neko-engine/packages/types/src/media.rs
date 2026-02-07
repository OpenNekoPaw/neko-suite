//! Media information types — probe response DTOs

use serde::{Deserialize, Serialize};

/// Media file information (videos:probe / audios:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    /// Total duration in seconds
    pub duration: f64,
    /// Container format (mp4, mkv, etc.)
    pub format: String,
    /// File size in bytes
    pub file_size: u64,
    /// Video streams
    #[serde(default)]
    pub video_streams: Vec<VideoStreamInfo>,
    /// Audio streams
    #[serde(default)]
    pub audio_streams: Vec<AudioStreamInfo>,
    /// Subtitle streams
    #[serde(default)]
    pub subtitle_streams: Vec<SubtitleStreamInfo>,
}

impl MediaInfo {
    /// Get the primary video stream (first one)
    pub fn primary_video(&self) -> Option<&VideoStreamInfo> {
        self.video_streams.first()
    }

    /// Get the primary audio stream (first one)
    pub fn primary_audio(&self) -> Option<&AudioStreamInfo> {
        self.audio_streams.first()
    }

    /// Check if media has video
    pub fn has_video(&self) -> bool {
        !self.video_streams.is_empty()
    }

    /// Check if media has audio
    pub fn has_audio(&self) -> bool {
        !self.audio_streams.is_empty()
    }
}

/// Video stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name (h264, hevc, vp9, etc.)
    pub codec: String,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Bitrate in bps (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    /// Pixel format
    pub pixel_format: String,
    /// Hardware acceleration used for decoding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hw_accel: Option<String>,
    /// Total frame count (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame_count: Option<u64>,
    /// Color space
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    /// Color range (limited/full)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_range: Option<String>,
}

/// Audio stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name (aac, mp3, opus, etc.)
    pub codec: String,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Bitrate in bps (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    /// Channel layout (stereo, 5.1, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_layout: Option<String>,
    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

/// Subtitle stream information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleStreamInfo {
    /// Stream index
    pub index: usize,
    /// Codec name (srt, ass, mov_text, etc.)
    pub codec: String,
    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Title/description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Audio file information (audios:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    /// Duration in seconds
    pub duration: f64,
    /// Codec name
    pub codec: String,
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u16,
    /// Bitrate in bps
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    /// Container format
    pub format: String,
    /// Channel layout
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_layout: Option<String>,
}

/// Image file information (images:probe response)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    /// Image width
    pub width: u32,
    /// Image height
    pub height: u32,
    /// Format (jpeg, png, webp, psd, etc.)
    pub format: String,
    /// Color space
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,
    /// Whether image has alpha channel
    pub has_alpha: bool,
    /// Bit depth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<u8>,
}

/// Extracted subtitle track
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedSubtitleTrack {
    /// Stream index
    pub index: usize,
    /// Language code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Subtitle cues
    pub cues: Vec<SubtitleCue>,
}

/// Single subtitle cue
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleCue {
    /// Start time in seconds
    pub start_time: f64,
    /// End time in seconds
    pub end_time: f64,
    /// Subtitle text
    pub text: String,
}
