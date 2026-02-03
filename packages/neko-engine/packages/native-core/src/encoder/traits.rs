//! Encoder trait and types

use crate::decoder::PixelFormat;
use crate::error::Result;

// =============================================================================
// Hardware Encoder Type
// =============================================================================

/// Hardware encoder acceleration type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HwEncoderType {
    /// Unspecified (treated as Auto, no software encoding)
    #[default]
    None,
    /// macOS VideoToolbox
    VideoToolbox,
    /// NVIDIA NVENC
    Nvenc,
    /// Linux VAAPI
    Vaapi,
    /// Intel Quick Sync Video
    Qsv,
    /// Auto-detect best available hardware encoder
    Auto,
}

impl HwEncoderType {
    /// Get FFmpeg encoder name for this hardware type and codec combination
    ///
    /// Returns `None` if the codec is not supported by this hardware encoder.
    pub fn encoder_name(&self, codec: VideoCodec) -> Option<&'static str> {
        match (self, codec) {
            // VideoToolbox (macOS)
            (HwEncoderType::VideoToolbox, VideoCodec::H264) => Some("h264_videotoolbox"),
            (HwEncoderType::VideoToolbox, VideoCodec::H265) => Some("hevc_videotoolbox"),
            // NVENC (NVIDIA)
            (HwEncoderType::Nvenc, VideoCodec::H264) => Some("h264_nvenc"),
            (HwEncoderType::Nvenc, VideoCodec::H265) => Some("hevc_nvenc"),
            // VAAPI (Linux)
            (HwEncoderType::Vaapi, VideoCodec::H264) => Some("h264_vaapi"),
            (HwEncoderType::Vaapi, VideoCodec::H265) => Some("hevc_vaapi"),
            // QSV (Intel)
            (HwEncoderType::Qsv, VideoCodec::H264) => Some("h264_qsv"),
            (HwEncoderType::Qsv, VideoCodec::H265) => Some("hevc_qsv"),
            // ProRes and VP9 have no common hardware encoders
            _ => None,
        }
    }

    /// Check if this hardware encoder type supports the given codec
    pub fn supports_codec(&self, codec: VideoCodec) -> bool {
        self.encoder_name(codec).is_some()
    }

    /// Get the FFmpeg device type string for hardware context creation
    pub fn device_type(&self) -> Option<&'static str> {
        match self {
            HwEncoderType::VideoToolbox => Some("videotoolbox"),
            HwEncoderType::Nvenc => Some("cuda"),
            HwEncoderType::Vaapi => Some("vaapi"),
            HwEncoderType::Qsv => Some("qsv"),
            HwEncoderType::None | HwEncoderType::Auto => None,
        }
    }
}

// =============================================================================
// Video Codec
// =============================================================================

/// Video codec format
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodec {
    /// H.264 / AVC
    H264,
    /// H.265 / HEVC
    H265,
    /// VP9
    Vp9,
    /// Apple ProRes
    ProRes,
}

impl VideoCodec {
    /// Get FFmpeg codec name
    pub fn ffmpeg_name(&self) -> &'static str {
        match self {
            VideoCodec::H264 => "libx264",
            VideoCodec::H265 => "libx265",
            VideoCodec::Vp9 => "libvpx-vp9",
            VideoCodec::ProRes => "prores_ks",
        }
    }

    /// Get default bitrate for this codec (in bps)
    pub fn default_bitrate(&self, width: u32, height: u32) -> u64 {
        let pixels = (width * height) as u64;
        match self {
            VideoCodec::H264 => pixels * 4,      // ~4 bits per pixel
            VideoCodec::H265 => pixels * 3,      // ~3 bits per pixel (more efficient)
            VideoCodec::Vp9 => pixels * 3,       // Similar to H.265
            VideoCodec::ProRes => pixels * 12,   // Higher quality
        }
    }
}

/// Container format for output
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainerFormat {
    /// MP4 container
    Mp4,
    /// Matroska container
    Mkv,
    /// WebM container
    WebM,
    /// QuickTime MOV container
    Mov,
}

impl ContainerFormat {
    /// Get FFmpeg format name
    pub fn ffmpeg_name(&self) -> &'static str {
        match self {
            ContainerFormat::Mp4 => "mp4",
            ContainerFormat::Mkv => "matroska",
            ContainerFormat::WebM => "webm",
            ContainerFormat::Mov => "mov",
        }
    }

    /// Get file extension
    pub fn extension(&self) -> &'static str {
        match self {
            ContainerFormat::Mp4 => "mp4",
            ContainerFormat::Mkv => "mkv",
            ContainerFormat::WebM => "webm",
            ContainerFormat::Mov => "mov",
        }
    }

    /// Check if codec is compatible with this container
    pub fn supports_codec(&self, codec: VideoCodec) -> bool {
        match self {
            ContainerFormat::Mp4 | ContainerFormat::Mov => {
                matches!(codec, VideoCodec::H264 | VideoCodec::H265 | VideoCodec::ProRes)
            }
            ContainerFormat::Mkv => true, // MKV supports all codecs
            ContainerFormat::WebM => matches!(codec, VideoCodec::Vp9),
        }
    }
}

/// Encoder preset (speed/quality tradeoff)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EncoderPreset {
    /// Fastest encoding, lowest quality
    Ultrafast,
    /// Fast encoding
    Fast,
    /// Balanced (default)
    #[default]
    Medium,
    /// Slower encoding, better quality
    Slow,
    /// Slowest encoding, best quality
    Veryslow,
}

impl EncoderPreset {
    /// Get FFmpeg preset string
    pub fn ffmpeg_name(&self) -> &'static str {
        match self {
            EncoderPreset::Ultrafast => "ultrafast",
            EncoderPreset::Fast => "fast",
            EncoderPreset::Medium => "medium",
            EncoderPreset::Slow => "slow",
            EncoderPreset::Veryslow => "veryslow",
        }
    }
}

/// Encoder configuration
#[derive(Debug, Clone)]
pub struct EncoderConfig {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Target bitrate in bits per second
    pub bitrate: u64,
    /// Video codec
    pub codec: VideoCodec,
    /// Input pixel format
    pub pixel_format: PixelFormat,
    /// Encoding preset
    pub preset: EncoderPreset,
    /// Codec profile (e.g., "high", "main", "baseline" for H.264)
    pub profile: Option<String>,
    /// GOP size (keyframe interval)
    pub gop_size: Option<u32>,
    /// Maximum B-frames
    pub max_b_frames: Option<u32>,
    /// Hardware encoder type (None = software only, Auto = try hw first)
    pub hw_encoder: HwEncoderType,
}

impl EncoderConfig {
    /// Create a new encoder config with defaults
    ///
    /// Note: Default pixel format is NV12 for hardware encoder compatibility.
    /// Use GPU-based RgbaToNv12Converter if your source is RGBA.
    pub fn new(width: u32, height: u32, fps: f64, codec: VideoCodec) -> Self {
        Self {
            width,
            height,
            fps,
            bitrate: codec.default_bitrate(width, height),
            codec,
            pixel_format: PixelFormat::Nv12, // NV12 for hardware encoders
            preset: EncoderPreset::default(),
            profile: None,
            gop_size: None,
            max_b_frames: None,
            hw_encoder: HwEncoderType::default(),
        }
    }

    /// Set bitrate
    pub fn with_bitrate(mut self, bitrate: u64) -> Self {
        self.bitrate = bitrate;
        self
    }

    /// Set pixel format
    pub fn with_pixel_format(mut self, format: PixelFormat) -> Self {
        self.pixel_format = format;
        self
    }

    /// Set preset
    pub fn with_preset(mut self, preset: EncoderPreset) -> Self {
        self.preset = preset;
        self
    }

    /// Set profile
    pub fn with_profile(mut self, profile: impl Into<String>) -> Self {
        self.profile = Some(profile.into());
        self
    }

    /// Set hardware encoder type
    pub fn with_hw_encoder(mut self, hw_encoder: HwEncoderType) -> Self {
        self.hw_encoder = hw_encoder;
        self
    }

    /// Set GOP size (keyframe interval)
    pub fn with_gop_size(mut self, gop_size: u32) -> Self {
        self.gop_size = Some(gop_size);
        self
    }

    /// Set maximum B-frames
    pub fn with_max_b_frames(mut self, max_b_frames: u32) -> Self {
        self.max_b_frames = Some(max_b_frames);
        self
    }
}

/// Encoded video packet
#[derive(Debug)]
pub struct EncodedPacket {
    /// Encoded data
    pub data: Vec<u8>,
    /// Presentation timestamp
    pub pts: i64,
    /// Decoding timestamp
    pub dts: i64,
    /// Whether this is a keyframe
    pub is_keyframe: bool,
    /// Duration in time base units
    pub duration: i64,
    /// Stream index (for muxing)
    pub stream_index: usize,
}

/// Video encoder trait
pub trait Encoder {
    /// Initialize the encoder with configuration
    fn open(&mut self, config: &EncoderConfig) -> Result<()>;

    /// Encode a single frame from CPU buffer
    /// Returns encoded packets (may be empty if encoder is buffering)
    fn encode_frame(&mut self, data: &[u8], pts: i64) -> Result<Vec<EncodedPacket>>;

    /// Encode a frame from GPU texture handle (zero-copy path)
    ///
    /// On macOS, `gpu_handle` is an IOSurface handle.
    /// On Linux, `gpu_handle` is a DMA-BUF file descriptor.
    /// On Windows, `gpu_handle` is a D3D11 shared handle.
    ///
    /// Default implementation falls back to CPU path (not recommended).
    fn encode_frame_gpu(&mut self, gpu_handle: usize, pts: i64) -> Result<Vec<EncodedPacket>> {
        let _ = (gpu_handle, pts);
        Err(crate::error::Error::Other(
            "GPU frame encoding not supported by this encoder".to_string(),
        ))
    }

    /// Check if this encoder supports zero-copy GPU input
    fn supports_gpu_input(&self) -> bool {
        false
    }

    /// Flush the encoder and get remaining packets
    fn flush(&mut self) -> Result<Vec<EncodedPacket>>;

    /// Close the encoder and release resources
    fn close(&mut self);

    /// Get current encoder configuration
    fn config(&self) -> Option<&EncoderConfig>;

    /// Check if encoder is open
    fn is_open(&self) -> bool {
        self.config().is_some()
    }
}
