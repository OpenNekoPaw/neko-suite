//! Service method options types
//!
//! These types are parameters for Service trait methods.
//! They are consumed only by the Service layer.

use neko_types::{
    AudioCodec, EncoderPreset, FrameFormat, HwEncoderType, Resolution, VideoCodec, WaveformFormat,
};

/// Options for single frame capture (videos:capture / images:capture)
#[derive(Debug, Clone)]
pub struct CaptureOptions {
    /// JPEG quality 1-100
    pub quality: u32,
    /// Output format
    pub format: FrameFormat,
    /// Resize width (None = original)
    pub width: Option<u32>,
    /// Resize height (None = original)
    pub height: Option<u32>,
}

impl Default for CaptureOptions {
    fn default() -> Self {
        Self {
            quality: 85,
            format: FrameFormat::Jpeg,
            width: None,
            height: None,
        }
    }
}

impl CaptureOptions {
    pub fn jpeg(quality: u32) -> Self {
        Self {
            quality,
            format: FrameFormat::Jpeg,
            ..Default::default()
        }
    }

    pub fn png() -> Self {
        Self {
            format: FrameFormat::Png,
            ..Default::default()
        }
    }

    pub fn with_size(mut self, width: u32, height: u32) -> Self {
        self.width = Some(width);
        self.height = Some(height);
        self
    }
}

/// Options for frame range extraction (videos:extract)
#[derive(Debug, Clone)]
pub struct ExtractOptions {
    /// What to extract
    pub extract_type: ExtractType,
    /// Time range (None = full duration)
    pub time_range: Option<(f64, f64)>,
}

/// What to extract
#[derive(Debug, Clone)]
pub enum ExtractType {
    /// Single frame at time
    Frame { time: f64 },
    /// Range of frames
    FrameRange { start: f64, end: f64, fps: f64 },
    /// Extract subtitles
    Subtitles,
}

impl Default for ExtractOptions {
    fn default() -> Self {
        Self {
            extract_type: ExtractType::Frame { time: 0.0 },
            time_range: None,
        }
    }
}

/// Options for video transcoding (videos:transcode)
#[derive(Debug, Clone)]
pub struct TranscodeOptions {
    /// Target video codec
    pub video_codec: VideoCodec,
    /// Target resolution (None = original)
    pub resolution: Option<Resolution>,
    /// Target bitrate (None = auto)
    pub bitrate: Option<u64>,
    /// Hardware encoder to use
    pub hw_encoder: HwEncoderType,
    /// Encoder preset
    pub preset: EncoderPreset,
    /// Audio codec (None = no audio, Some = transcode audio)
    pub audio_codec: Option<AudioCodec>,
    /// Audio bitrate in bps (None = codec default)
    pub audio_bitrate: Option<u64>,
}

impl Default for TranscodeOptions {
    fn default() -> Self {
        Self {
            video_codec: VideoCodec::H264,
            resolution: None,
            bitrate: None,
            hw_encoder: HwEncoderType::Auto,
            preset: EncoderPreset::Medium,
            audio_codec: Some(AudioCodec::Opus),
            audio_bitrate: None,
        }
    }
}

/// Options for stream creation (videos:stream / timelines:stream)
#[derive(Debug, Clone)]
pub struct StreamOptions {
    /// Stream resolution (None = source resolution)
    pub resolution: Option<Resolution>,
    /// Stream frame rate (None = source fps)
    pub fps: Option<f64>,
    /// Start time in seconds
    pub start_time: f64,
}

impl Default for StreamOptions {
    fn default() -> Self {
        Self {
            resolution: None,
            fps: None,
            start_time: 0.0,
        }
    }
}

/// Options for waveform generation (videos:waveform / audios:waveform)
#[derive(Debug, Clone)]
pub struct WaveformOptions {
    /// Peaks per second (resolution)
    pub peaks_per_second: u32,
    /// Specific channel (None = all channels)
    pub channel: Option<u16>,
    /// Time range (None = full duration)
    pub time_range: Option<(f64, f64)>,
    /// Output format
    pub format: WaveformFormat,
}

impl Default for WaveformOptions {
    fn default() -> Self {
        Self {
            peaks_per_second: 100,
            channel: None,
            time_range: None,
            format: WaveformFormat::Json,
        }
    }
}

/// Options for proxy generation (videos:proxy)
#[derive(Debug, Clone)]
pub struct ProxyOptions {
    /// Target resolution ("720p", "480p", etc.)
    pub resolution: String,
    /// Codec to use
    pub codec: String,
    /// Target bitrate
    pub bitrate: Option<String>,
}

impl Default for ProxyOptions {
    fn default() -> Self {
        Self {
            resolution: "720p".to_string(),
            codec: "h264".to_string(),
            bitrate: Some("2M".to_string()),
        }
    }
}

/// Options for timeline composite (timelines:composite)
#[derive(Debug, Clone)]
pub struct CompositeOptions {
    /// Background color [r, g, b, a] (0.0-1.0)
    pub background_color: [f64; 4],
    /// Output format
    pub output_format: FrameFormat,
}

impl Default for CompositeOptions {
    fn default() -> Self {
        Self {
            background_color: [0.0, 0.0, 0.0, 1.0],
            output_format: FrameFormat::Rgba,
        }
    }
}

/// Options for audio transcoding (audios:transcode)
#[derive(Debug, Clone)]
pub struct AudioTranscodeOptions {
    /// Time range (None = full duration)
    pub time_range: Option<(f64, f64)>,
    /// Target sample rate (None = original)
    pub sample_rate: Option<u32>,
    /// Target channels (None = original)
    pub channels: Option<u16>,
    /// Output format / codec (None = infer from output file extension)
    pub format: Option<AudioOutputFormat>,
    /// Target bitrate in bps (None = codec default)
    pub bitrate: Option<u64>,
}

impl Default for AudioTranscodeOptions {
    fn default() -> Self {
        Self {
            time_range: None,
            sample_rate: None,
            channels: None,
            format: None,
            bitrate: None,
        }
    }
}

/// Audio output format
#[derive(Debug, Clone, Copy)]
pub enum AudioOutputFormat {
    Pcm,
    Aac,
    Mp3,
    Opus,
    Flac,
}

impl From<AudioCodec> for AudioOutputFormat {
    fn from(codec: AudioCodec) -> Self {
        match codec {
            AudioCodec::Aac => Self::Aac,
            AudioCodec::Mp3 => Self::Mp3,
            AudioCodec::Opus => Self::Opus,
            AudioCodec::Flac => Self::Flac,
            AudioCodec::Pcm | AudioCodec::Vorbis => Self::Pcm,
        }
    }
}

/// Options for image capture (images:capture)
#[derive(Debug, Clone)]
pub struct ImageCaptureOptions {
    /// Output format
    pub format: FrameFormat,
    /// Compression quality
    pub quality: u32,
    /// Scale factor (None = original size)
    pub scale: Option<f64>,
    /// Target width (None = original)
    pub width: Option<u32>,
    /// Target height (None = original)
    pub height: Option<u32>,
}

impl Default for ImageCaptureOptions {
    fn default() -> Self {
        Self {
            format: FrameFormat::Jpeg,
            quality: 85,
            scale: None,
            width: None,
            height: None,
        }
    }
}
