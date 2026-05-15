//! Audio compatibility module.
//!
//! Audio infrastructure lives in `neko-engine-audio`. This module preserves the
//! historical `neko_engine_kernel::audio::*` import surface while host facade
//! narrowing and remaining crate extractions continue.

#![allow(unused_imports)]

pub use neko_engine_audio::decoder;
pub use neko_engine_audio::dsp;
pub use neko_engine_audio::encoder;
pub use neko_engine_audio::mic_capture;
pub use neko_engine_audio::soft_limiter;
pub use neko_engine_audio::traits;
pub use neko_engine_audio::{
    AudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig, AudioInfo, DecodedAudioFrame,
    EncodedAudioPacket, FfmpegAudioDecoder, FfmpegAudioEncoder, MicCaptureService, SampleFormat,
    SoftLimiter,
};
