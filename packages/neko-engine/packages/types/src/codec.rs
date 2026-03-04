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

#[cfg(test)]
mod tests {
    use super::*;

    // ---- VideoCodec ----

    #[test]
    fn test_video_codec_roundtrip() {
        for codec in [
            VideoCodec::H264,
            VideoCodec::H265,
            VideoCodec::Vp9,
            VideoCodec::Av1,
            VideoCodec::ProRes,
        ] {
            let s = codec.as_str();
            assert_eq!(
                VideoCodec::from_str(s),
                Some(codec),
                "roundtrip failed for {s}"
            );
        }
    }

    #[test]
    fn test_video_codec_aliases() {
        assert_eq!(VideoCodec::from_str("avc"), Some(VideoCodec::H264));
        assert_eq!(VideoCodec::from_str("hevc"), Some(VideoCodec::H265));
        assert_eq!(VideoCodec::from_str("H264"), Some(VideoCodec::H264));
        assert_eq!(VideoCodec::from_str("unknown"), None);
    }

    #[test]
    fn test_video_codec_default() {
        assert_eq!(VideoCodec::default(), VideoCodec::H264);
    }

    #[test]
    fn test_video_codec_serde() {
        let json = serde_json::to_string(&VideoCodec::H265).unwrap();
        assert_eq!(json, "\"h265\"");
        let parsed: VideoCodec = serde_json::from_str("\"h264\"").unwrap();
        assert_eq!(parsed, VideoCodec::H264);
    }

    // ---- AudioCodec ----

    #[test]
    fn test_audio_codec_roundtrip() {
        for codec in [
            AudioCodec::Aac,
            AudioCodec::Mp3,
            AudioCodec::Opus,
            AudioCodec::Flac,
            AudioCodec::Pcm,
            AudioCodec::Vorbis,
        ] {
            let s = codec.as_str();
            assert_eq!(
                AudioCodec::from_str(s),
                Some(codec),
                "roundtrip failed for {s}"
            );
        }
    }

    #[test]
    fn test_audio_codec_pcm_aliases() {
        assert_eq!(AudioCodec::from_str("pcm_s16le"), Some(AudioCodec::Pcm));
        assert_eq!(AudioCodec::from_str("pcm_s24le"), Some(AudioCodec::Pcm));
        assert_eq!(AudioCodec::from_str("pcm_f32le"), Some(AudioCodec::Pcm));
    }

    // ---- EncoderPreset ----

    #[test]
    fn test_encoder_preset_roundtrip() {
        for preset in [
            EncoderPreset::Ultrafast,
            EncoderPreset::Fast,
            EncoderPreset::Medium,
            EncoderPreset::Slow,
            EncoderPreset::Veryslow,
        ] {
            let s = preset.as_str();
            assert!(s.len() > 0, "empty string for preset {:?}", preset);
        }
    }

    // ---- HwEncoderType ----

    #[test]
    fn test_hw_encoder_is_hardware() {
        assert!(HwEncoderType::VideoToolbox.is_hardware());
        assert!(HwEncoderType::Nvenc.is_hardware());
        assert!(HwEncoderType::Vaapi.is_hardware());
        assert!(HwEncoderType::Qsv.is_hardware());
        assert!(HwEncoderType::Amf.is_hardware());
        assert!(HwEncoderType::Auto.is_hardware());
        assert!(!HwEncoderType::None.is_hardware());
    }

    // ---- HwAccelType ----

    #[test]
    fn test_hw_accel_is_hardware() {
        assert!(HwAccelType::VideoToolbox.is_hardware());
        assert!(HwAccelType::Cuda.is_hardware());
        assert!(HwAccelType::Auto.is_hardware());
        assert!(!HwAccelType::None.is_hardware());
    }

    // ---- PixelFormat ----

    #[test]
    fn test_pixel_format_bytes_per_pixel() {
        assert_eq!(PixelFormat::Nv12.bytes_per_pixel(), 1.5);
        assert_eq!(PixelFormat::Rgba.bytes_per_pixel(), 4.0);
        assert_eq!(PixelFormat::Yuv420p.bytes_per_pixel(), 1.5);
    }

    // ---- ContainerFormat ----

    #[test]
    fn test_container_format_extension() {
        assert_eq!(ContainerFormat::Mp4.extension(), "mp4");
        assert_eq!(ContainerFormat::Mov.extension(), "mov");
        assert_eq!(ContainerFormat::Mkv.extension(), "mkv");
    }

    // ---- VideoCodecType ----

    #[test]
    fn test_video_codec_type_aliases() {
        assert_eq!(
            VideoCodecType::from_codec_name("avc1"),
            Some(VideoCodecType::H264)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("hev1"),
            Some(VideoCodecType::H265)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("hvc1"),
            Some(VideoCodecType::H265)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("vp09"),
            Some(VideoCodecType::Vp9)
        );
        assert_eq!(
            VideoCodecType::from_codec_name("av01"),
            Some(VideoCodecType::Av1)
        );
        assert_eq!(VideoCodecType::from_codec_name("unknown"), None);
    }
}
