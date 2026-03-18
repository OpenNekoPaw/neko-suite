//! Audio module - Audio encoding and decoding with FFmpeg
//!
//! Provides audio processing capabilities:
//! - `FfmpegAudioDecoder`: Audio decoding
//! - `FfmpegAudioEncoder`: Audio encoding (AAC, MP3, Opus, FLAC)

mod decoder;
mod encoder;
pub mod mic_capture;
mod traits;

pub use decoder::FfmpegAudioDecoder;
pub use encoder::FfmpegAudioEncoder;
pub use mic_capture::MicCaptureService;
pub use traits::{
    AudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig, AudioInfo, DecodedAudioFrame,
    EncodedAudioPacket, SampleFormat,
};
