//! Encoder module - video encoding with hardware acceleration.
//!
//! Codec implementation lives in `neko-engine-codec`. This module keeps the
//! previous kernel import surface as a temporary migration compatibility layer,
//! while `pipeline` remains kernel-owned because it still mixes GPU/export
//! orchestration with encode/mux workers.

#![allow(unused_imports)]

pub mod pipeline;

pub use neko_engine_codec::encoder::codec_ext;
pub use neko_engine_codec::encoder::hwaccel;
pub use neko_engine_codec::encoder::iframe;
pub use neko_engine_codec::encoder::muxer;
pub use neko_engine_codec::encoder::pool;
pub use neko_engine_codec::encoder::{
    encode_nv12_to_h264_iframe, global_encoder_pool, global_iframe_encoder, AudioCodecExt,
    ContainerFormatExt, EncoderPresetExt, FfmpegMuxer, HwAccelEncoder, HwEncoderTypeExt,
    IFrameConfig, IFrameEncoder, Muxer, StreamInfo, VideoCodecExt,
};
pub use neko_engine_codec::encoder::{
    ContainerFormat, EncodedPacket, Encoder, EncoderConfig, EncoderPool, EncoderPreset,
    HwEncoderType, PixelFormat, VideoCodec,
};
pub use pipeline::{
    AsyncExportPipeline, CompositedFrame, PipelineConfig, PipelineFrame, PipelineProgress,
};
