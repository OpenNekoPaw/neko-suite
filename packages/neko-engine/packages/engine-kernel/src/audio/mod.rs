//! Audio module - Audio encoding, decoding, and DSP processing with FFmpeg.
//!
//! Provides audio processing capabilities:
//! - `FfmpegAudioDecoder`: Audio decoding
//! - `FfmpegAudioEncoder`: Audio encoding (AAC, MP3, Opus, FLAC)
//! - `SoftLimiter`: Soft-knee limiter for clipping prevention
//! - `dsp`: Composable audio effect processors (EQ, compressor, reverb, etc.)

mod decoder;
pub mod dsp;
mod encoder;
pub mod mic_capture;
pub mod soft_limiter;
mod traits;

pub use decoder::FfmpegAudioDecoder;
pub use encoder::FfmpegAudioEncoder;
pub use mic_capture::MicCaptureService;
pub use soft_limiter::SoftLimiter;
pub use traits::{
    AudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig, AudioInfo, DecodedAudioFrame,
    EncodedAudioPacket, SampleFormat,
};
