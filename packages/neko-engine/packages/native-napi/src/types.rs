//! Type conversions between Rust and JavaScript

use napi::bindgen_prelude::*;
use napi_derive::napi;

use neko_native_core::decoder::PixelFormat;
use neko_native_core::gpu::{
    BlurParams as RustBlurParams, BlurType as RustBlurType,
    ChromaticAberrationParams as RustChromaticAberrationParams, EffectParams as RustEffectParams,
    FilmGrainParams as RustFilmGrainParams, GlowParams as RustGlowParams,
    GpuInfo as RustGpuInfo, SharpenParams as RustSharpenParams,
    TextureFormat as RustTextureFormat, TextureHandle as RustTextureHandle,
    TransitionParams as RustTransitionParams, TransitionType as RustTransitionType,
    VignetteParams as RustVignetteParams,
};

/// GPU information for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsGpuInfo {
    pub name: String,
    pub vendor: String,
    pub backend: String,
    pub device_type: String,
}

impl From<&RustGpuInfo> for JsGpuInfo {
    fn from(info: &RustGpuInfo) -> Self {
        Self {
            name: info.name.clone(),
            vendor: info.vendor.clone(),
            backend: info.backend.clone(),
            device_type: info.device_type.clone(),
        }
    }
}

/// Effect parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsEffectParams {
    // Basic adjustments
    pub brightness: Option<f64>,
    pub contrast: Option<f64>,
    pub saturation: Option<f64>,
    pub exposure: Option<f64>,

    // Tone adjustments
    pub gamma: Option<f64>,
    pub hue_shift: Option<f64>,
    pub vibrance: Option<f64>,

    // White balance
    pub temperature: Option<f64>,
    pub tint: Option<f64>,

    // Highlights/Shadows
    pub highlights: Option<f64>,
    pub shadows: Option<f64>,
    pub whites: Option<f64>,
    pub blacks: Option<f64>,
}

impl From<JsEffectParams> for RustEffectParams {
    fn from(params: JsEffectParams) -> Self {
        Self {
            brightness: params.brightness.unwrap_or(0.0) as f32,
            contrast: params.contrast.unwrap_or(1.0) as f32,
            saturation: params.saturation.unwrap_or(1.0) as f32,
            exposure: params.exposure.unwrap_or(0.0) as f32,
            gamma: params.gamma.unwrap_or(1.0) as f32,
            hue_shift: params.hue_shift.unwrap_or(0.0) as f32,
            vibrance: params.vibrance.unwrap_or(0.0) as f32,
            temperature: params.temperature.unwrap_or(0.0) as f32,
            tint: params.tint.unwrap_or(0.0) as f32,
            highlights: params.highlights.unwrap_or(0.0) as f32,
            shadows: params.shadows.unwrap_or(0.0) as f32,
            whites: params.whites.unwrap_or(0.0) as f32,
            blacks: params.blacks.unwrap_or(0.0) as f32,
            _padding: [0.0; 3],
        }
    }
}

/// Blur parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsBlurParams {
    /// Blur type: "box", "gaussian", "directional", "radial", "zoom"
    pub blur_type: Option<String>,
    /// Blur radius in pixels (1-100)
    pub radius: Option<f64>,
    /// Direction X for directional blur (-1.0 to 1.0)
    pub direction_x: Option<f64>,
    /// Direction Y for directional blur (-1.0 to 1.0)
    pub direction_y: Option<f64>,
    /// Center X for radial/zoom blur (0.0 to 1.0)
    pub center_x: Option<f64>,
    /// Center Y for radial/zoom blur (0.0 to 1.0)
    pub center_y: Option<f64>,
    /// Blur strength (0.0 to 1.0)
    pub strength: Option<f64>,
    /// Number of samples for quality (8-64)
    pub samples: Option<u32>,
}

impl From<JsBlurParams> for RustBlurParams {
    fn from(params: JsBlurParams) -> Self {
        let blur_type = match params.blur_type.as_deref() {
            Some("box") => RustBlurType::Box,
            Some("gaussian") => RustBlurType::Gaussian,
            Some("directional") | Some("motion") => RustBlurType::Directional,
            Some("radial") => RustBlurType::Radial,
            Some("zoom") => RustBlurType::Zoom,
            _ => RustBlurType::Gaussian, // Default
        };

        Self {
            blur_type: blur_type as u32,
            radius: params.radius.unwrap_or(5.0) as f32,
            direction_x: params.direction_x.unwrap_or(1.0) as f32,
            direction_y: params.direction_y.unwrap_or(0.0) as f32,
            center_x: params.center_x.unwrap_or(0.5) as f32,
            center_y: params.center_y.unwrap_or(0.5) as f32,
            strength: params.strength.unwrap_or(1.0) as f32,
            samples: params.samples.unwrap_or(16),
        }
    }
}

/// Sharpen parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsSharpenParams {
    /// Sharpen amount (0.0 to 5.0)
    pub amount: Option<f64>,
    /// Radius for unsharp mask (0.5 to 5.0)
    pub radius: Option<f64>,
    /// Threshold to avoid sharpening noise (0.0 to 1.0)
    pub threshold: Option<f64>,
}

impl From<JsSharpenParams> for RustSharpenParams {
    fn from(params: JsSharpenParams) -> Self {
        Self {
            amount: params.amount.unwrap_or(1.0) as f32,
            radius: params.radius.unwrap_or(1.0) as f32,
            threshold: params.threshold.unwrap_or(0.0) as f32,
            _padding: 0.0,
        }
    }
}

// ============================================================================
// Style Effect Parameters
// ============================================================================

/// Vignette effect parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsVignetteParams {
    /// Vignette amount/intensity (0.0 to 1.0)
    pub amount: Option<f64>,
    /// Radius from center where vignette starts (0.0 to 2.0)
    pub radius: Option<f64>,
    /// Softness/feather of the vignette edge (0.0 to 1.0)
    pub softness: Option<f64>,
    /// Roundness of the vignette (0.0 = oval, 1.0 = circular)
    pub roundness: Option<f64>,
}

impl From<JsVignetteParams> for RustVignetteParams {
    fn from(params: JsVignetteParams) -> Self {
        Self::with_options(
            params.amount.unwrap_or(0.5) as f32,
            params.radius.unwrap_or(0.5) as f32,
            params.softness.unwrap_or(0.5) as f32,
            params.roundness.unwrap_or(1.0) as f32,
        )
    }
}

/// Film grain effect parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsFilmGrainParams {
    /// Grain amount/intensity (0.0 to 1.0)
    pub amount: Option<f64>,
    /// Grain size multiplier (0.5 to 3.0)
    pub size: Option<f64>,
    /// Time value for animation (used as random seed)
    pub time: Option<f64>,
    /// Color vs monochrome grain (0.0 = mono, 1.0 = color)
    pub color_amount: Option<f64>,
}

impl From<JsFilmGrainParams> for RustFilmGrainParams {
    fn from(params: JsFilmGrainParams) -> Self {
        Self::with_options(
            params.amount.unwrap_or(0.3) as f32,
            params.size.unwrap_or(1.0) as f32,
            params.time.unwrap_or(0.0) as f32,
            params.color_amount.unwrap_or(0.0) as f32,
        )
    }
}

/// Glow/Bloom effect parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsGlowParams {
    /// Glow intensity (0.0 to 2.0)
    pub intensity: Option<f64>,
    /// Brightness threshold for glow (0.0 to 1.0)
    pub threshold: Option<f64>,
    /// Blur radius for glow (1.0 to 50.0)
    pub radius: Option<f64>,
}

impl From<JsGlowParams> for RustGlowParams {
    fn from(params: JsGlowParams) -> Self {
        Self::with_options(
            params.intensity.unwrap_or(1.0) as f32,
            params.threshold.unwrap_or(0.7) as f32,
            params.radius.unwrap_or(10.0) as f32,
        )
    }
}

/// Chromatic aberration effect parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsChromaticAberrationParams {
    /// Aberration amount/offset (0.0 to 0.1)
    pub amount: Option<f64>,
    /// Angle of aberration in radians
    pub angle: Option<f64>,
    /// Center X (0.0 to 1.0)
    pub center_x: Option<f64>,
    /// Center Y (0.0 to 1.0)
    pub center_y: Option<f64>,
}

impl From<JsChromaticAberrationParams> for RustChromaticAberrationParams {
    fn from(params: JsChromaticAberrationParams) -> Self {
        Self::with_options(
            params.amount.unwrap_or(0.01) as f32,
            params.angle.unwrap_or(0.0) as f32,
            params.center_x.unwrap_or(0.5) as f32,
            params.center_y.unwrap_or(0.5) as f32,
        )
    }
}

// ============================================================================
// Transition Parameters
// ============================================================================

/// Transition effect parameters from JavaScript
#[napi(object)]
#[derive(Debug, Clone, Default)]
pub struct JsTransitionParams {
    /// Transition type: "fade", "wipe_left", "wipe_right", "wipe_up", "wipe_down",
    /// "iris_circle", "iris_rectangle", "clock", "slide_left", "slide_right",
    /// "zoom_in", "zoom_out", "dissolve", "pixelate", "ripple", "swirl", "glitch", "flash"
    pub transition_type: Option<String>,
    /// Transition progress (0.0 to 1.0)
    pub progress: Option<f64>,
    /// Edge feather/softness (0.0 to 1.0)
    pub feather: Option<f64>,
    /// Center X for radial transitions (0.0 to 1.0)
    pub center_x: Option<f64>,
    /// Center Y for radial transitions (0.0 to 1.0)
    pub center_y: Option<f64>,
    /// Angle for directional transitions (radians)
    pub angle: Option<f64>,
}

impl From<JsTransitionParams> for RustTransitionParams {
    fn from(params: JsTransitionParams) -> Self {
        let transition_type = params
            .transition_type
            .as_deref()
            .map(RustTransitionType::from_str)
            .unwrap_or_default();

        RustTransitionParams::with_options(
            transition_type,
            params.progress.unwrap_or(0.0) as f32,
            params.feather.unwrap_or(0.02) as f32,
            params.center_x.unwrap_or(0.5) as f32,
            params.center_y.unwrap_or(0.5) as f32,
            params.angle.unwrap_or(0.0) as f32,
        )
    }
}

/// Decoder configuration from JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsDecoderConfig {
    pub path: String,
    pub hw_accel: Option<String>,
    pub output_format: Option<String>,
}

impl JsDecoderConfig {
    /// Get output pixel format
    pub fn pixel_format(&self) -> PixelFormat {
        match self.output_format.as_deref() {
            Some("rgb") => PixelFormat::Rgb,
            Some("yuv420p") => PixelFormat::Yuv420p,
            Some("nv12") => PixelFormat::Nv12,
            _ => PixelFormat::Rgba, // Default
        }
    }
}

/// Frame data for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsFrameData {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub data: Buffer,
    pub timestamp: f64,
    pub is_keyframe: bool,
}

/// Hardware acceleration info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsHwAccelInfo {
    pub decoders: Vec<String>,
    pub encoders: Vec<String>,
    pub recommended_decoder: String,
    pub recommended_encoder: String,
}

impl Default for JsHwAccelInfo {
    fn default() -> Self {
        // Detect platform-specific hardware acceleration
        #[cfg(target_os = "macos")]
        {
            Self {
                decoders: vec!["videotoolbox".to_string(), "none".to_string()],
                encoders: vec!["videotoolbox".to_string(), "none".to_string()],
                recommended_decoder: "videotoolbox".to_string(),
                recommended_encoder: "videotoolbox".to_string(),
            }
        }

        #[cfg(target_os = "linux")]
        {
            // Check for NVIDIA or VAAPI
            let has_nvidia = std::path::Path::new("/dev/nvidia0").exists();
            let has_vaapi = std::path::Path::new("/dev/dri/renderD128").exists();

            let mut decoders = vec![];
            let mut encoders = vec![];

            if has_nvidia {
                decoders.push("cuda".to_string());
                encoders.push("nvenc".to_string());
            }
            if has_vaapi {
                decoders.push("vaapi".to_string());
                encoders.push("vaapi".to_string());
            }
            decoders.push("none".to_string());
            encoders.push("none".to_string());

            let recommended_decoder = if has_nvidia {
                "cuda"
            } else if has_vaapi {
                "vaapi"
            } else {
                "none"
            };

            let recommended_encoder = if has_nvidia {
                "nvenc"
            } else if has_vaapi {
                "vaapi"
            } else {
                "none"
            };

            Self {
                decoders,
                encoders,
                recommended_decoder: recommended_decoder.to_string(),
                recommended_encoder: recommended_encoder.to_string(),
            }
        }

        #[cfg(target_os = "windows")]
        {
            Self {
                decoders: vec!["d3d11va".to_string(), "none".to_string()],
                encoders: vec!["nvenc".to_string(), "qsv".to_string(), "none".to_string()],
                recommended_decoder: "d3d11va".to_string(),
                recommended_encoder: "nvenc".to_string(),
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Self {
                decoders: vec!["none".to_string()],
                encoders: vec!["none".to_string()],
                recommended_decoder: "none".to_string(),
                recommended_encoder: "none".to_string(),
            }
        }
    }
}

/// Texture handle for JavaScript - represents a GPU texture that can be shared
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsTextureHandle {
    /// Unique texture ID
    pub id: i64,
    /// Texture width
    pub width: u32,
    /// Texture height
    pub height: u32,
    /// Texture format ("rgba8", "bgra8", "nv12")
    pub format: String,
    /// Shared memory key for cross-process sharing (if available)
    pub shared_memory_key: Option<String>,
    /// Texture generation (incremented on each update)
    pub generation: i64,
}

impl From<&RustTextureHandle> for JsTextureHandle {
    fn from(handle: &RustTextureHandle) -> Self {
        Self {
            id: handle.id as i64,
            width: handle.width,
            height: handle.height,
            format: match handle.format {
                RustTextureFormat::Rgba8 => "rgba8".to_string(),
                RustTextureFormat::Bgra8 => "bgra8".to_string(),
                RustTextureFormat::Nv12 => "nv12".to_string(),
                RustTextureFormat::Yuv420p => "yuv420p".to_string(),
            },
            shared_memory_key: handle.shared_memory_key.clone(),
            generation: handle.generation as i64,
        }
    }
}

/// Texture format enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsTextureFormat {
    /// RGBA 8-bit per channel
    Rgba8,
    /// BGRA 8-bit per channel
    Bgra8,
    /// NV12 (Y + UV planes)
    Nv12,
    /// YUV420P (Y + U + V separate planes)
    Yuv420p,
}

impl From<JsTextureFormat> for RustTextureFormat {
    fn from(format: JsTextureFormat) -> Self {
        match format {
            JsTextureFormat::Rgba8 => RustTextureFormat::Rgba8,
            JsTextureFormat::Bgra8 => RustTextureFormat::Bgra8,
            JsTextureFormat::Nv12 => RustTextureFormat::Nv12,
            JsTextureFormat::Yuv420p => RustTextureFormat::Yuv420p,
        }
    }
}

impl From<RustTextureFormat> for JsTextureFormat {
    fn from(format: RustTextureFormat) -> Self {
        match format {
            RustTextureFormat::Rgba8 => JsTextureFormat::Rgba8,
            RustTextureFormat::Bgra8 => JsTextureFormat::Bgra8,
            RustTextureFormat::Nv12 => JsTextureFormat::Nv12,
            RustTextureFormat::Yuv420p => JsTextureFormat::Yuv420p,
        }
    }
}

// ============================================================================
// Encoder Types
// ============================================================================

/// Video codec enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsVideoCodec {
    /// H.264 / AVC
    H264,
    /// H.265 / HEVC
    H265,
    /// VP9
    Vp9,
    /// Apple ProRes
    ProRes,
}

impl From<JsVideoCodec> for neko_native_core::encoder::VideoCodec {
    fn from(codec: JsVideoCodec) -> Self {
        match codec {
            JsVideoCodec::H264 => neko_native_core::encoder::VideoCodec::H264,
            JsVideoCodec::H265 => neko_native_core::encoder::VideoCodec::H265,
            JsVideoCodec::Vp9 => neko_native_core::encoder::VideoCodec::Vp9,
            JsVideoCodec::ProRes => neko_native_core::encoder::VideoCodec::ProRes,
        }
    }
}

/// Container format enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsContainerFormat {
    /// MP4 container
    Mp4,
    /// Matroska container
    Mkv,
    /// WebM container
    WebM,
    /// QuickTime MOV container
    Mov,
}

impl From<JsContainerFormat> for neko_native_core::encoder::ContainerFormat {
    fn from(format: JsContainerFormat) -> Self {
        match format {
            JsContainerFormat::Mp4 => neko_native_core::encoder::ContainerFormat::Mp4,
            JsContainerFormat::Mkv => neko_native_core::encoder::ContainerFormat::Mkv,
            JsContainerFormat::WebM => neko_native_core::encoder::ContainerFormat::WebM,
            JsContainerFormat::Mov => neko_native_core::encoder::ContainerFormat::Mov,
        }
    }
}

/// Encoder preset enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsEncoderPreset {
    /// Fastest encoding, lowest quality
    Ultrafast,
    /// Fast encoding
    Fast,
    /// Balanced
    Medium,
    /// Slower encoding, better quality
    Slow,
    /// Slowest encoding, best quality
    Veryslow,
}

impl From<JsEncoderPreset> for neko_native_core::encoder::EncoderPreset {
    fn from(preset: JsEncoderPreset) -> Self {
        match preset {
            JsEncoderPreset::Ultrafast => neko_native_core::encoder::EncoderPreset::Ultrafast,
            JsEncoderPreset::Fast => neko_native_core::encoder::EncoderPreset::Fast,
            JsEncoderPreset::Medium => neko_native_core::encoder::EncoderPreset::Medium,
            JsEncoderPreset::Slow => neko_native_core::encoder::EncoderPreset::Slow,
            JsEncoderPreset::Veryslow => neko_native_core::encoder::EncoderPreset::Veryslow,
        }
    }
}

/// Video encoder configuration for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsEncoderConfig {
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Frame rate (fps)
    pub fps: f64,
    /// Target bitrate in bits per second
    pub bitrate: Option<i64>,
    /// Video codec ("h264", "h265", "vp9", "prores")
    pub codec: String,
    /// Encoding preset ("ultrafast", "fast", "medium", "slow", "veryslow")
    pub preset: Option<String>,
    /// Codec profile (e.g., "high", "main", "baseline")
    pub profile: Option<String>,
    /// Input pixel format ("rgba", "rgb", "yuv420p", "nv12")
    pub pixel_format: Option<String>,
    /// Hardware encoder type ("auto", "videotoolbox", "nvenc", "vaapi", "qsv", "none")
    /// If not specified or "none", software encoding is used.
    /// "auto" will try to use the best available hardware encoder.
    pub hw_encoder: Option<String>,
}

impl JsEncoderConfig {
    /// Convert to Rust EncoderConfig
    pub fn to_encoder_config(&self) -> neko_native_core::encoder::EncoderConfig {
        let codec = match self.codec.to_lowercase().as_str() {
            "h265" | "hevc" => neko_native_core::encoder::VideoCodec::H265,
            "vp9" => neko_native_core::encoder::VideoCodec::Vp9,
            "prores" => neko_native_core::encoder::VideoCodec::ProRes,
            _ => neko_native_core::encoder::VideoCodec::H264,
        };

        let preset = match self.preset.as_deref() {
            Some("ultrafast") => neko_native_core::encoder::EncoderPreset::Ultrafast,
            Some("fast") => neko_native_core::encoder::EncoderPreset::Fast,
            Some("slow") => neko_native_core::encoder::EncoderPreset::Slow,
            Some("veryslow") => neko_native_core::encoder::EncoderPreset::Veryslow,
            _ => neko_native_core::encoder::EncoderPreset::Medium,
        };

        let pixel_format = match self.pixel_format.as_deref() {
            Some("rgb") => PixelFormat::Rgb,
            Some("yuv420p") => PixelFormat::Yuv420p,
            Some("nv12") => PixelFormat::Nv12,
            _ => PixelFormat::Rgba,
        };

        let hw_encoder = match self.hw_encoder.as_deref() {
            Some("auto") => neko_native_core::encoder::HwEncoderType::Auto,
            Some("videotoolbox") => neko_native_core::encoder::HwEncoderType::VideoToolbox,
            Some("nvenc") => neko_native_core::encoder::HwEncoderType::Nvenc,
            Some("vaapi") => neko_native_core::encoder::HwEncoderType::Vaapi,
            Some("qsv") => neko_native_core::encoder::HwEncoderType::Qsv,
            Some("none") | None => neko_native_core::encoder::HwEncoderType::None,
            Some(other) => {
                tracing::warn!("Unknown hw_encoder type: {}, using software", other);
                neko_native_core::encoder::HwEncoderType::None
            }
        };

        let mut config = neko_native_core::encoder::EncoderConfig::new(self.width, self.height, self.fps, codec)
            .with_pixel_format(pixel_format)
            .with_preset(preset)
            .with_hw_encoder(hw_encoder);

        if let Some(bitrate) = self.bitrate {
            config = config.with_bitrate(bitrate as u64);
        }

        if let Some(ref profile) = self.profile {
            config = config.with_profile(profile.clone());
        }

        config
    }
}

/// Encoded packet for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsEncodedPacket {
    /// Encoded data
    pub data: Buffer,
    /// Presentation timestamp
    pub pts: i64,
    /// Decoding timestamp
    pub dts: i64,
    /// Whether this is a keyframe
    pub is_keyframe: bool,
    /// Duration
    pub duration: i64,
}

impl From<&neko_native_core::encoder::EncodedPacket> for JsEncodedPacket {
    fn from(packet: &neko_native_core::encoder::EncodedPacket) -> Self {
        Self {
            data: Buffer::from(packet.data.clone()),
            pts: packet.pts,
            dts: packet.dts,
            is_keyframe: packet.is_keyframe,
            duration: packet.duration,
        }
    }
}

// ============================================================================
// Audio Types
// ============================================================================

/// Audio codec enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsAudioCodec {
    /// AAC
    Aac,
    /// MP3
    Mp3,
    /// Opus
    Opus,
    /// FLAC (lossless)
    Flac,
    /// PCM (uncompressed)
    Pcm,
}

impl From<JsAudioCodec> for neko_native_core::audio::AudioCodec {
    fn from(codec: JsAudioCodec) -> Self {
        match codec {
            JsAudioCodec::Aac => neko_native_core::audio::AudioCodec::Aac,
            JsAudioCodec::Mp3 => neko_native_core::audio::AudioCodec::Mp3,
            JsAudioCodec::Opus => neko_native_core::audio::AudioCodec::Opus,
            JsAudioCodec::Flac => neko_native_core::audio::AudioCodec::Flac,
            JsAudioCodec::Pcm => neko_native_core::audio::AudioCodec::Pcm,
        }
    }
}

/// Audio sample format enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsSampleFormat {
    /// Unsigned 8-bit
    U8,
    /// Signed 16-bit
    S16,
    /// Signed 32-bit
    S32,
    /// 32-bit float
    F32,
    /// 64-bit float
    F64,
}

impl From<JsSampleFormat> for neko_native_core::audio::SampleFormat {
    fn from(format: JsSampleFormat) -> Self {
        match format {
            JsSampleFormat::U8 => neko_native_core::audio::SampleFormat::U8,
            JsSampleFormat::S16 => neko_native_core::audio::SampleFormat::S16,
            JsSampleFormat::S32 => neko_native_core::audio::SampleFormat::S32,
            JsSampleFormat::F32 => neko_native_core::audio::SampleFormat::F32,
            JsSampleFormat::F64 => neko_native_core::audio::SampleFormat::F64,
        }
    }
}

impl From<neko_native_core::audio::SampleFormat> for JsSampleFormat {
    fn from(format: neko_native_core::audio::SampleFormat) -> Self {
        match format {
            neko_native_core::audio::SampleFormat::U8 => JsSampleFormat::U8,
            neko_native_core::audio::SampleFormat::S16 => JsSampleFormat::S16,
            neko_native_core::audio::SampleFormat::S32 => JsSampleFormat::S32,
            neko_native_core::audio::SampleFormat::F32 => JsSampleFormat::F32,
            neko_native_core::audio::SampleFormat::F64 => JsSampleFormat::F64,
        }
    }
}

/// Audio encoder configuration for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsAudioEncoderConfig {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u32,
    /// Target bitrate in bits per second
    pub bitrate: Option<i64>,
    /// Audio codec ("aac", "mp3", "opus", "flac", "pcm")
    pub codec: Option<String>,
    /// Sample format ("u8", "s16", "s32", "f32", "f64")
    pub sample_format: Option<String>,
}

impl JsAudioEncoderConfig {
    /// Convert to Rust AudioEncoderConfig
    pub fn to_audio_encoder_config(&self) -> neko_native_core::audio::AudioEncoderConfig {
        let codec = match self.codec.as_deref() {
            Some("mp3") => neko_native_core::audio::AudioCodec::Mp3,
            Some("opus") => neko_native_core::audio::AudioCodec::Opus,
            Some("flac") => neko_native_core::audio::AudioCodec::Flac,
            Some("pcm") => neko_native_core::audio::AudioCodec::Pcm,
            _ => neko_native_core::audio::AudioCodec::Aac,
        };

        let sample_format = match self.sample_format.as_deref() {
            Some("u8") => neko_native_core::audio::SampleFormat::U8,
            Some("s16") => neko_native_core::audio::SampleFormat::S16,
            Some("s32") => neko_native_core::audio::SampleFormat::S32,
            Some("f64") => neko_native_core::audio::SampleFormat::F64,
            _ => neko_native_core::audio::SampleFormat::F32,
        };

        let mut config = neko_native_core::audio::AudioEncoderConfig::new(
            self.sample_rate,
            self.channels as u16,
            codec,
        )
        .with_sample_format(sample_format);

        if let Some(bitrate) = self.bitrate {
            config = config.with_bitrate(bitrate as u64);
        }

        config
    }
}

/// Audio info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsAudioInfo {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u32,
    /// Duration in seconds
    pub duration: f64,
    /// Codec name
    pub codec: String,
    /// Bitrate in bps
    pub bitrate: i64,
    /// Total number of samples
    pub total_samples: i64,
}

impl From<&neko_native_core::audio::AudioInfo> for JsAudioInfo {
    fn from(info: &neko_native_core::audio::AudioInfo) -> Self {
        Self {
            sample_rate: info.sample_rate,
            channels: info.channels as u32,
            duration: info.duration,
            codec: info.codec.clone(),
            bitrate: info.bitrate as i64,
            total_samples: info.total_samples as i64,
        }
    }
}

/// Decoded audio frame for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsAudioFrame {
    /// Audio sample data
    pub data: Buffer,
    /// Number of samples per channel
    pub samples: u32,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Sample rate
    pub sample_rate: u32,
    /// Number of channels
    pub channels: u32,
}

impl From<&neko_native_core::audio::DecodedAudioFrame> for JsAudioFrame {
    fn from(frame: &neko_native_core::audio::DecodedAudioFrame) -> Self {
        Self {
            data: Buffer::from(frame.data.clone()),
            samples: frame.samples as u32,
            timestamp: frame.timestamp,
            sample_rate: frame.sample_rate,
            channels: frame.channels as u32,
        }
    }
}

/// Encoded audio packet for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsEncodedAudioPacket {
    /// Encoded data
    pub data: Buffer,
    /// Presentation timestamp
    pub pts: i64,
    /// Duration
    pub duration: i64,
}

impl From<&neko_native_core::audio::EncodedAudioPacket> for JsEncodedAudioPacket {
    fn from(packet: &neko_native_core::audio::EncodedAudioPacket) -> Self {
        Self {
            data: Buffer::from(packet.data.clone()),
            pts: packet.pts,
            duration: packet.duration,
        }
    }
}

// ============================================================================
// Muxer Types
// ============================================================================

/// Muxer configuration for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsMuxerConfig {
    /// Output file path
    pub output_path: String,
    /// Container format ("mp4", "mkv", "webm", "mov")
    pub format: String,
}

impl JsMuxerConfig {
    /// Get container format
    pub fn container_format(&self) -> neko_native_core::encoder::ContainerFormat {
        match self.format.to_lowercase().as_str() {
            "mkv" | "matroska" => neko_native_core::encoder::ContainerFormat::Mkv,
            "webm" => neko_native_core::encoder::ContainerFormat::WebM,
            "mov" => neko_native_core::encoder::ContainerFormat::Mov,
            _ => neko_native_core::encoder::ContainerFormat::Mp4,
        }
    }
}

/// Stream info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsStreamInfo {
    /// Stream index
    pub index: u32,
    /// Time base numerator
    pub time_base_num: i32,
    /// Time base denominator
    pub time_base_den: i32,
}

impl From<&neko_native_core::encoder::StreamInfo> for JsStreamInfo {
    fn from(info: &neko_native_core::encoder::StreamInfo) -> Self {
        Self {
            index: info.index as u32,
            time_base_num: info.time_base.numerator(),
            time_base_den: info.time_base.denominator(),
        }
    }
}

/// Packet for muxing (video or audio)
#[napi(object)]
#[derive(Clone)]
pub struct JsMuxerPacket {
    /// Encoded data
    pub data: Buffer,
    /// Presentation timestamp
    pub pts: i64,
    /// Decoding timestamp
    pub dts: i64,
    /// Duration
    pub duration: i64,
    /// Whether this is a keyframe (video only)
    pub is_keyframe: bool,
}

impl JsMuxerPacket {
    /// Convert to EncodedPacket
    pub fn to_encoded_packet(&self, stream_index: usize) -> neko_native_core::encoder::EncodedPacket {
        neko_native_core::encoder::EncodedPacket {
            data: self.data.to_vec(),
            pts: self.pts,
            dts: self.dts,
            is_keyframe: self.is_keyframe,
            duration: self.duration,
            stream_index,
        }
    }
}

// ============================================================================
// Compositor Types
// ============================================================================

use neko_native_core::gpu::{BlendMode as RustBlendMode, Transform2D as RustTransform2D};

/// Blend mode enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsBlendMode {
    /// Normal blend
    Normal,
    /// Multiply
    Multiply,
    /// Screen
    Screen,
    /// Overlay
    Overlay,
    /// Darken
    Darken,
    /// Lighten
    Lighten,
    /// Color Dodge
    ColorDodge,
    /// Color Burn
    ColorBurn,
    /// Hard Light
    HardLight,
    /// Soft Light
    SoftLight,
    /// Difference
    Difference,
    /// Exclusion
    Exclusion,
    /// Add
    Add,
    /// Subtract
    Subtract,
}

impl From<JsBlendMode> for RustBlendMode {
    fn from(mode: JsBlendMode) -> Self {
        match mode {
            JsBlendMode::Normal => RustBlendMode::Normal,
            JsBlendMode::Multiply => RustBlendMode::Multiply,
            JsBlendMode::Screen => RustBlendMode::Screen,
            JsBlendMode::Overlay => RustBlendMode::Overlay,
            JsBlendMode::Darken => RustBlendMode::Darken,
            JsBlendMode::Lighten => RustBlendMode::Lighten,
            JsBlendMode::ColorDodge => RustBlendMode::ColorDodge,
            JsBlendMode::ColorBurn => RustBlendMode::ColorBurn,
            JsBlendMode::HardLight => RustBlendMode::HardLight,
            JsBlendMode::SoftLight => RustBlendMode::SoftLight,
            JsBlendMode::Difference => RustBlendMode::Difference,
            JsBlendMode::Exclusion => RustBlendMode::Exclusion,
            JsBlendMode::Add => RustBlendMode::LinearDodge, // Add is same as LinearDodge
            JsBlendMode::Subtract => RustBlendMode::Subtract,
        }
    }
}

/// 2D Transform for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsTransform2D {
    /// Position X (pixels)
    pub x: f64,
    /// Position Y (pixels)
    pub y: f64,
    /// Scale X (1.0 = 100%)
    pub scale_x: f64,
    /// Scale Y (1.0 = 100%)
    pub scale_y: f64,
    /// Rotation (degrees)
    pub rotation: f64,
    /// Anchor point X (0.0 = left, 0.5 = center, 1.0 = right)
    pub anchor_x: f64,
    /// Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom)
    pub anchor_y: f64,
}

impl Default for JsTransform2D {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            anchor_x: 0.5,
            anchor_y: 0.5,
        }
    }
}

impl From<JsTransform2D> for RustTransform2D {
    fn from(t: JsTransform2D) -> Self {
        Self {
            x: t.x as f32,
            y: t.y as f32,
            scale_x: t.scale_x as f32,
            scale_y: t.scale_y as f32,
            rotation: t.rotation as f32,
            anchor_x: t.anchor_x as f32,
            anchor_y: t.anchor_y as f32,
            _padding: 0.0,
        }
    }
}

/// Composite layer for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsCompositeLayer {
    /// Layer pixel data (RGBA or YUV420P depending on pixel_format)
    pub data: Buffer,
    /// Layer width
    pub width: u32,
    /// Layer height
    pub height: u32,
    /// Pixel format: "rgba" (default) or "yuv420p"
    pub pixel_format: Option<String>,
    /// Transform (optional, defaults to identity)
    pub transform: Option<JsTransform2D>,
    /// Opacity (0.0 - 1.0)
    pub opacity: Option<f64>,
    /// Blend mode
    pub blend_mode: Option<String>,
    /// Z-index (lower = bottom)
    pub z_index: Option<i32>,
    /// Mask data (optional, grayscale)
    pub mask: Option<Buffer>,
    /// Invert mask
    pub mask_inverted: Option<bool>,
}

impl From<JsCompositeLayer> for neko_native_core::gpu::CompositeLayer {
    fn from(layer: JsCompositeLayer) -> Self {
        use neko_native_core::gpu::LayerPixelFormat;

        let pixel_format = match layer.pixel_format.as_deref() {
            Some("yuv420p") => LayerPixelFormat::Yuv420p,
            _ => LayerPixelFormat::Rgba,
        };

        Self {
            data: layer.data.to_vec(),
            width: layer.width,
            height: layer.height,
            pixel_format,
            transform: layer.transform.map(Into::into).unwrap_or_default(),
            opacity: layer.opacity.unwrap_or(1.0) as f32,
            blend_mode: layer
                .blend_mode
                .as_deref()
                .map(RustBlendMode::from_str)
                .unwrap_or_default(),
            z_index: layer.z_index.unwrap_or(0),
            mask: layer.mask.map(|b| b.to_vec()),
            mask_inverted: layer.mask_inverted.unwrap_or(false),
        }
    }
}

/// Composite result for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsCompositeResult {
    /// Output pixel data (RGBA)
    pub data: Buffer,
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Compositing time in milliseconds
    pub time_ms: f64,
    /// Number of layers composited
    pub layer_count: u32,
}

impl From<neko_native_core::gpu::CompositeResult> for JsCompositeResult {
    fn from(result: neko_native_core::gpu::CompositeResult) -> Self {
        Self {
            data: Buffer::from(result.data),
            width: result.width,
            height: result.height,
            time_ms: result.time_ms,
            layer_count: result.layer_count as u32,
        }
    }
}

// ============================================================================
// Animation Types
// ============================================================================

use neko_native_core::animation::{
    AnimatableValue as RustAnimatableValue,
    EasingType as RustEasingType, EvaluatedProperties as RustEvaluatedProperties,
    InterpolationMode as RustInterpolationMode, Keyframe as RustKeyframe,
    KeyframeTrack as RustKeyframeTrack,
};

/// Easing type enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsEasingType {
    Linear,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
    EaseInCubic,
    EaseOutCubic,
    EaseInOutCubic,
    EaseInQuart,
    EaseOutQuart,
    EaseInOutQuart,
    EaseInQuint,
    EaseOutQuint,
    EaseInOutQuint,
    EaseInSine,
    EaseOutSine,
    EaseInOutSine,
    EaseInExpo,
    EaseOutExpo,
    EaseInOutExpo,
    EaseInCirc,
    EaseOutCirc,
    EaseInOutCirc,
    EaseInBack,
    EaseOutBack,
    EaseInOutBack,
    EaseInElastic,
    EaseOutElastic,
    EaseInOutElastic,
    EaseInBounce,
    EaseOutBounce,
    EaseInOutBounce,
}

impl From<JsEasingType> for RustEasingType {
    fn from(t: JsEasingType) -> Self {
        match t {
            JsEasingType::Linear => RustEasingType::Linear,
            JsEasingType::EaseInQuad => RustEasingType::EaseInQuad,
            JsEasingType::EaseOutQuad => RustEasingType::EaseOutQuad,
            JsEasingType::EaseInOutQuad => RustEasingType::EaseInOutQuad,
            JsEasingType::EaseInCubic => RustEasingType::EaseInCubic,
            JsEasingType::EaseOutCubic => RustEasingType::EaseOutCubic,
            JsEasingType::EaseInOutCubic => RustEasingType::EaseInOutCubic,
            JsEasingType::EaseInQuart => RustEasingType::EaseInQuart,
            JsEasingType::EaseOutQuart => RustEasingType::EaseOutQuart,
            JsEasingType::EaseInOutQuart => RustEasingType::EaseInOutQuart,
            JsEasingType::EaseInQuint => RustEasingType::EaseInQuint,
            JsEasingType::EaseOutQuint => RustEasingType::EaseOutQuint,
            JsEasingType::EaseInOutQuint => RustEasingType::EaseInOutQuint,
            JsEasingType::EaseInSine => RustEasingType::EaseInSine,
            JsEasingType::EaseOutSine => RustEasingType::EaseOutSine,
            JsEasingType::EaseInOutSine => RustEasingType::EaseInOutSine,
            JsEasingType::EaseInExpo => RustEasingType::EaseInExpo,
            JsEasingType::EaseOutExpo => RustEasingType::EaseOutExpo,
            JsEasingType::EaseInOutExpo => RustEasingType::EaseInOutExpo,
            JsEasingType::EaseInCirc => RustEasingType::EaseInCirc,
            JsEasingType::EaseOutCirc => RustEasingType::EaseOutCirc,
            JsEasingType::EaseInOutCirc => RustEasingType::EaseInOutCirc,
            JsEasingType::EaseInBack => RustEasingType::EaseInBack,
            JsEasingType::EaseOutBack => RustEasingType::EaseOutBack,
            JsEasingType::EaseInOutBack => RustEasingType::EaseInOutBack,
            JsEasingType::EaseInElastic => RustEasingType::EaseInElastic,
            JsEasingType::EaseOutElastic => RustEasingType::EaseOutElastic,
            JsEasingType::EaseInOutElastic => RustEasingType::EaseInOutElastic,
            JsEasingType::EaseInBounce => RustEasingType::EaseInBounce,
            JsEasingType::EaseOutBounce => RustEasingType::EaseOutBounce,
            JsEasingType::EaseInOutBounce => RustEasingType::EaseInOutBounce,
        }
    }
}

/// Interpolation mode enum for JavaScript
#[napi(string_enum)]
#[derive(Debug, PartialEq, Eq)]
pub enum JsInterpolationMode {
    /// Linear interpolation
    Linear,
    /// Step/hold interpolation
    Step,
    /// Smooth interpolation
    Smooth,
}

impl From<JsInterpolationMode> for RustInterpolationMode {
    fn from(m: JsInterpolationMode) -> Self {
        match m {
            JsInterpolationMode::Linear => RustInterpolationMode::Linear,
            JsInterpolationMode::Step => RustInterpolationMode::Step,
            JsInterpolationMode::Smooth => RustInterpolationMode::Smooth,
        }
    }
}

/// Animatable value for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsAnimatableValue {
    /// Value type: "number", "point2d", "point3d", "color", "bool"
    pub value_type: String,
    /// For number type
    pub number: Option<f64>,
    /// For point2d type
    pub x: Option<f64>,
    pub y: Option<f64>,
    /// For point3d type
    pub z: Option<f64>,
    /// For color type
    pub r: Option<f64>,
    pub g: Option<f64>,
    pub b: Option<f64>,
    pub a: Option<f64>,
    /// For bool type
    pub bool_value: Option<bool>,
}

impl From<JsAnimatableValue> for RustAnimatableValue {
    fn from(v: JsAnimatableValue) -> Self {
        match v.value_type.as_str() {
            "number" => RustAnimatableValue::Number(v.number.unwrap_or(0.0)),
            "point2d" => RustAnimatableValue::Point2D {
                x: v.x.unwrap_or(0.0),
                y: v.y.unwrap_or(0.0),
            },
            "point3d" => RustAnimatableValue::Point3D {
                x: v.x.unwrap_or(0.0),
                y: v.y.unwrap_or(0.0),
                z: v.z.unwrap_or(0.0),
            },
            "color" => RustAnimatableValue::Color {
                r: v.r.unwrap_or(0.0),
                g: v.g.unwrap_or(0.0),
                b: v.b.unwrap_or(0.0),
                a: v.a.unwrap_or(1.0),
            },
            "bool" => RustAnimatableValue::Bool(v.bool_value.unwrap_or(false)),
            _ => RustAnimatableValue::Number(v.number.unwrap_or(0.0)),
        }
    }
}

impl From<RustAnimatableValue> for JsAnimatableValue {
    fn from(v: RustAnimatableValue) -> Self {
        match v {
            RustAnimatableValue::Number(n) => Self {
                value_type: "number".to_string(),
                number: Some(n),
                x: None,
                y: None,
                z: None,
                r: None,
                g: None,
                b: None,
                a: None,
                bool_value: None,
            },
            RustAnimatableValue::Point2D { x, y } => Self {
                value_type: "point2d".to_string(),
                number: None,
                x: Some(x),
                y: Some(y),
                z: None,
                r: None,
                g: None,
                b: None,
                a: None,
                bool_value: None,
            },
            RustAnimatableValue::Point3D { x, y, z } => Self {
                value_type: "point3d".to_string(),
                number: None,
                x: Some(x),
                y: Some(y),
                z: Some(z),
                r: None,
                g: None,
                b: None,
                a: None,
                bool_value: None,
            },
            RustAnimatableValue::Color { r, g, b, a } => Self {
                value_type: "color".to_string(),
                number: None,
                x: None,
                y: None,
                z: None,
                r: Some(r),
                g: Some(g),
                b: Some(b),
                a: Some(a),
                bool_value: None,
            },
            RustAnimatableValue::Bool(b) => Self {
                value_type: "bool".to_string(),
                number: None,
                x: None,
                y: None,
                z: None,
                r: None,
                g: None,
                b: None,
                a: None,
                bool_value: Some(b),
            },
        }
    }
}

/// Keyframe for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsKeyframe {
    /// Time in seconds
    pub time: f64,
    /// Value at this keyframe
    pub value: JsAnimatableValue,
    /// Easing type (optional, defaults to linear)
    pub easing: Option<String>,
    /// Interpolation mode (optional, defaults to linear)
    pub interpolation: Option<String>,
}

impl From<JsKeyframe> for RustKeyframe {
    fn from(kf: JsKeyframe) -> Self {
        let easing = kf
            .easing
            .as_deref()
            .map(RustEasingType::from_str)
            .unwrap_or_default();
        let interpolation = match kf.interpolation.as_deref() {
            Some("step") => RustInterpolationMode::Step,
            Some("smooth") => RustInterpolationMode::Smooth,
            _ => RustInterpolationMode::Linear,
        };

        RustKeyframe {
            time: kf.time,
            value: kf.value.into(),
            easing,
            interpolation,
        }
    }
}

/// Keyframe track for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsKeyframeTrack {
    /// Property name
    pub property: String,
    /// Keyframes
    pub keyframes: Vec<JsKeyframe>,
    /// Default value (optional)
    pub default_value: Option<JsAnimatableValue>,
}

impl From<JsKeyframeTrack> for RustKeyframeTrack {
    fn from(track: JsKeyframeTrack) -> Self {
        let mut rust_track = RustKeyframeTrack::new(&track.property);
        if let Some(default) = track.default_value {
            rust_track = rust_track.with_default(default.into());
        }
        for kf in track.keyframes {
            rust_track.add_keyframe(kf.into());
        }
        rust_track
    }
}

/// Evaluated properties for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsEvaluatedProperties {
    /// Property name -> value mapping
    pub values: std::collections::HashMap<String, JsAnimatableValue>,
}

impl From<RustEvaluatedProperties> for JsEvaluatedProperties {
    fn from(props: RustEvaluatedProperties) -> Self {
        Self {
            values: props
                .values
                .into_iter()
                .map(|(k, v)| (k, v.into()))
                .collect(),
        }
    }
}

// ============================================================================
// Export Pipeline Types
// ============================================================================

/// Export pipeline configuration for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsPipelineConfig {
    /// Output file path
    pub output_path: String,
    /// Container format ("mp4", "mkv", "webm", "mov")
    pub container: Option<String>,
    /// Video encoder configuration
    pub encoder_config: JsEncoderConfig,
    /// Compose stage buffer size (default: 3)
    pub compose_buffer_size: Option<u32>,
    /// Encode stage buffer size (default: 4)
    pub encode_buffer_size: Option<u32>,
    /// Mux stage buffer size (default: 8)
    pub mux_buffer_size: Option<u32>,
    /// Total expected frames (for progress reporting)
    pub total_frames: Option<i64>,
}

impl JsPipelineConfig {
    /// Convert to Rust PipelineConfig
    pub fn to_pipeline_config(&self) -> neko_native_core::encoder::PipelineConfig {
        let container = match self.container.as_deref() {
            Some("mkv") | Some("matroska") => neko_native_core::encoder::ContainerFormat::Mkv,
            Some("webm") => neko_native_core::encoder::ContainerFormat::WebM,
            Some("mov") => neko_native_core::encoder::ContainerFormat::Mov,
            _ => neko_native_core::encoder::ContainerFormat::Mp4,
        };

        neko_native_core::encoder::PipelineConfig {
            compose_buffer_size: self.compose_buffer_size.unwrap_or(3) as usize,
            encode_buffer_size: self.encode_buffer_size.unwrap_or(4) as usize,
            mux_buffer_size: self.mux_buffer_size.unwrap_or(8) as usize,
            encoder_config: self.encoder_config.to_encoder_config(),
            container,
            output_path: self.output_path.clone(),
            total_frames: self.total_frames.unwrap_or(0) as u64,
        }
    }
}

/// Export pipeline progress for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsPipelineProgress {
    /// Frames submitted to pipeline
    pub frames_submitted: i64,
    /// Frames composited (GPU)
    pub frames_composited: i64,
    /// Frames encoded
    pub frames_encoded: i64,
    /// Frames muxed (written to file)
    pub frames_muxed: i64,
    /// Total frames expected
    pub total_frames: i64,
    /// Progress ratio (0.0 - 1.0)
    pub progress_ratio: f64,
    /// Whether pipeline is complete
    pub is_complete: bool,
    /// Error message if pipeline failed
    pub error: Option<String>,
}

impl From<&neko_native_core::encoder::PipelineProgress> for JsPipelineProgress {
    fn from(progress: &neko_native_core::encoder::PipelineProgress) -> Self {
        use std::sync::atomic::Ordering;
        Self {
            frames_submitted: progress.frames_submitted.load(Ordering::Relaxed) as i64,
            frames_composited: progress.frames_composited.load(Ordering::Relaxed) as i64,
            frames_encoded: progress.frames_encoded.load(Ordering::Relaxed) as i64,
            frames_muxed: progress.frames_muxed.load(Ordering::Relaxed) as i64,
            total_frames: progress.total_frames as i64,
            progress_ratio: progress.progress_ratio(),
            is_complete: progress.is_complete(),
            error: progress.get_error(),
        }
    }
}

/// Pipeline frame input for JavaScript
#[napi(object)]
#[derive(Clone)]
pub struct JsPipelineFrame {
    /// Frame index (sequential, for ordering)
    pub index: i64,
    /// Presentation timestamp (time base units)
    pub pts: i64,
    /// Layers to composite
    pub layers: Vec<JsCompositeLayer>,
    /// Output width
    pub output_width: u32,
    /// Output height
    pub output_height: u32,
    /// Background color [r, g, b, a] (0.0-1.0)
    pub background_color: Option<Vec<f64>>,
}

impl From<JsPipelineFrame> for neko_native_core::encoder::PipelineFrame {
    fn from(frame: JsPipelineFrame) -> Self {
        let bg = frame.background_color.unwrap_or_else(|| vec![0.0, 0.0, 0.0, 1.0]);
        let background_color = [
            bg.first().copied().unwrap_or(0.0) as f32,
            bg.get(1).copied().unwrap_or(0.0) as f32,
            bg.get(2).copied().unwrap_or(0.0) as f32,
            bg.get(3).copied().unwrap_or(1.0) as f32,
        ];

        neko_native_core::encoder::PipelineFrame {
            index: frame.index as u64,
            pts: frame.pts,
            layers: frame.layers.into_iter().map(Into::into).collect(),
            output_width: frame.output_width,
            output_height: frame.output_height,
            background_color,
        }
    }
}

// ============================================================================
// Media Service Types (probe, subtitles)
// ============================================================================

use neko_native_core::media_service::{
    ExtractedSubtitleTrack as RustExtractedSubtitleTrack,
    MediaInfo as RustProbeMediaInfo, SubtitleCue as RustSubtitleCue,
    SubtitleStream as RustSubtitleStream,
};

/// Probed media information for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsProbeMediaInfo {
    /// Duration in seconds
    pub duration: f64,
    /// Video width
    pub width: u32,
    /// Video height
    pub height: u32,
    /// Frame rate
    pub fps: f64,
    /// Video codec name
    pub codec: String,
    /// Container format
    pub format: String,
    /// Video bitrate (bps)
    pub bitrate: Option<i64>,
    /// Has audio stream
    pub has_audio: bool,
    /// Audio codec name
    pub audio_codec: Option<String>,
    /// Audio sample rate
    pub audio_sample_rate: Option<u32>,
    /// Audio channels
    pub audio_channels: Option<u32>,
    /// Audio bitrate (bps)
    pub audio_bitrate: Option<i64>,
    /// Has subtitle streams
    pub has_subtitles: bool,
    /// Subtitle stream info
    pub subtitle_streams: Vec<JsProbeSubtitleStream>,
}

impl From<RustProbeMediaInfo> for JsProbeMediaInfo {
    fn from(info: RustProbeMediaInfo) -> Self {
        Self {
            duration: info.duration,
            width: info.width,
            height: info.height,
            fps: info.fps,
            codec: info.codec,
            format: info.format,
            bitrate: info.bitrate.map(|b| b as i64),
            has_audio: info.has_audio,
            audio_codec: info.audio_codec,
            audio_sample_rate: info.audio_sample_rate,
            audio_channels: info.audio_channels,
            audio_bitrate: info.audio_bitrate.map(|b| b as i64),
            has_subtitles: info.has_subtitles,
            subtitle_streams: info.subtitle_streams.into_iter().map(Into::into).collect(),
        }
    }
}

/// Subtitle stream info for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsProbeSubtitleStream {
    /// Stream index
    pub index: u32,
    /// Codec name
    pub codec: String,
    /// Language code
    pub language: Option<String>,
    /// Stream title
    pub title: Option<String>,
    /// Is default stream
    pub is_default: bool,
    /// Is forced stream
    pub is_forced: bool,
}

impl From<RustSubtitleStream> for JsProbeSubtitleStream {
    fn from(stream: RustSubtitleStream) -> Self {
        Self {
            index: stream.index as u32,
            codec: stream.codec,
            language: stream.language,
            title: stream.title,
            is_default: stream.is_default,
            is_forced: stream.is_forced,
        }
    }
}

/// Subtitle cue for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsSubtitleCue {
    /// Unique identifier
    pub id: String,
    /// Start time in seconds
    pub start_time: f64,
    /// End time in seconds
    pub end_time: f64,
    /// Subtitle text
    pub text: String,
}

impl From<RustSubtitleCue> for JsSubtitleCue {
    fn from(cue: RustSubtitleCue) -> Self {
        Self {
            id: cue.id,
            start_time: cue.start_time,
            end_time: cue.end_time,
            text: cue.text,
        }
    }
}

/// Extracted subtitle track for JavaScript
#[napi(object)]
#[derive(Debug, Clone)]
pub struct JsExtractedSubtitleTrack {
    /// Stream index
    pub stream_index: u32,
    /// Language code
    pub language: Option<String>,
    /// Track title
    pub title: Option<String>,
    /// Is default track
    pub is_default: bool,
    /// Subtitle cues
    pub cues: Vec<JsSubtitleCue>,
}

impl From<RustExtractedSubtitleTrack> for JsExtractedSubtitleTrack {
    fn from(track: RustExtractedSubtitleTrack) -> Self {
        Self {
            stream_index: track.stream_index as u32,
            language: track.language,
            title: track.title,
            is_default: track.is_default,
            cues: track.cues.into_iter().map(Into::into).collect(),
        }
    }
}
