//! Codec types — video and audio codec enumerations

use serde::{Deserialize, Serialize};

/// Video codec
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec {
    #[default]
    H264,
    H265,
    Vp9,
    Av1,
    ProRes,
}

impl VideoCodec {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::H264 => "h264",
            Self::H265 => "h265",
            Self::Vp9 => "vp9",
            Self::Av1 => "av1",
            Self::ProRes => "prores",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "h264" | "avc" => Some(Self::H264),
            "h265" | "hevc" => Some(Self::H265),
            "vp9" => Some(Self::Vp9),
            "av1" => Some(Self::Av1),
            "prores" => Some(Self::ProRes),
            _ => None,
        }
    }
}

/// Audio codec
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioCodec {
    #[default]
    Aac,
    Mp3,
    Opus,
    Flac,
    Pcm,
    Vorbis,
}

impl AudioCodec {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Aac => "aac",
            Self::Mp3 => "mp3",
            Self::Opus => "opus",
            Self::Flac => "flac",
            Self::Pcm => "pcm",
            Self::Vorbis => "vorbis",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "aac" => Some(Self::Aac),
            "mp3" => Some(Self::Mp3),
            "opus" => Some(Self::Opus),
            "flac" => Some(Self::Flac),
            "pcm" | "pcm_s16le" | "pcm_s24le" | "pcm_f32le" => Some(Self::Pcm),
            "vorbis" => Some(Self::Vorbis),
            _ => None,
        }
    }
}

/// Encoder preset (speed vs quality tradeoff)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EncoderPreset {
    Ultrafast,
    Fast,
    #[default]
    Medium,
    Slow,
    Veryslow,
}

impl EncoderPreset {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ultrafast => "ultrafast",
            Self::Fast => "fast",
            Self::Medium => "medium",
            Self::Slow => "slow",
            Self::Veryslow => "veryslow",
        }
    }
}

/// Hardware encoder type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HwEncoderType {
    #[default]
    None,
    Auto,
    VideoToolbox,
    Nvenc,
    Vaapi,
    Qsv,
    Amf,
}

impl HwEncoderType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Auto => "auto",
            Self::VideoToolbox => "videotoolbox",
            Self::Nvenc => "nvenc",
            Self::Vaapi => "vaapi",
            Self::Qsv => "qsv",
            Self::Amf => "amf",
        }
    }

    pub fn is_hardware(&self) -> bool {
        !matches!(self, Self::None)
    }
}

/// Hardware decoder/accelerator type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HwAccelType {
    #[default]
    None,
    Auto,
    VideoToolbox,
    Cuda,
    Vaapi,
    D3d11va,
    Dxva2,
    Qsv,
}

impl HwAccelType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Auto => "auto",
            Self::VideoToolbox => "videotoolbox",
            Self::Cuda => "cuda",
            Self::Vaapi => "vaapi",
            Self::D3d11va => "d3d11va",
            Self::Dxva2 => "dxva2",
            Self::Qsv => "qsv",
        }
    }

    pub fn is_hardware(&self) -> bool {
        !matches!(self, Self::None)
    }
}

/// Pixel format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PixelFormat {
    #[default]
    Nv12,
    Yuv420p,
    Yuv422p,
    Yuv444p,
    Rgba,
    Bgra,
    Rgb24,
    P010le,
}

impl PixelFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Nv12 => "nv12",
            Self::Yuv420p => "yuv420p",
            Self::Yuv422p => "yuv422p",
            Self::Yuv444p => "yuv444p",
            Self::Rgba => "rgba",
            Self::Bgra => "bgra",
            Self::Rgb24 => "rgb24",
            Self::P010le => "p010le",
        }
    }

    pub fn bytes_per_pixel(&self) -> f32 {
        match self {
            Self::Nv12 | Self::Yuv420p => 1.5,
            Self::Yuv422p => 2.0,
            Self::Yuv444p | Self::Rgb24 => 3.0,
            Self::Rgba | Self::Bgra => 4.0,
            Self::P010le => 3.0, // 10-bit 4:2:0
        }
    }
}

/// Container format
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContainerFormat {
    #[default]
    Mp4,
    Mov,
    Mkv,
    Webm,
    Avi,
    Ts,
}

impl ContainerFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Mov => "mov",
            Self::Mkv => "mkv",
            Self::Webm => "webm",
            Self::Avi => "avi",
            Self::Ts => "ts",
        }
    }

    pub fn extension(&self) -> &'static str {
        self.as_str()
    }
}

/// Video codec type for keyframe scanning
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodecType {
    H264,
    H265,
    Vp9,
    Av1,
}

impl VideoCodecType {
    pub fn from_codec_name(name: &str) -> Option<Self> {
        match name.to_lowercase().as_str() {
            "h264" | "avc" | "avc1" => Some(Self::H264),
            "h265" | "hevc" | "hev1" | "hvc1" => Some(Self::H265),
            "vp9" | "vp09" => Some(Self::Vp9),
            "av1" | "av01" => Some(Self::Av1),
            _ => None,
        }
    }
}
