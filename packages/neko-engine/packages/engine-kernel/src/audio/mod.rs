//! Audio compatibility module.
//!
//! Audio infrastructure lives in `neko-engine-audio`. This module preserves the
//! historical `neko_engine_kernel::audio::*` import surface while host facade
//! narrowing and remaining crate extractions continue.

pub use neko_engine_audio::dsp;
pub use neko_engine_audio::mic_capture;
pub use neko_engine_audio::{
    AudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig, AudioInfo, FfmpegAudioDecoder,
    FfmpegAudioEncoder, SampleFormat, SoftLimiter,
};
