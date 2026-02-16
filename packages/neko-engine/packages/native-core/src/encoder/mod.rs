//! Encoder module - Video encoding with hardware acceleration
//!
//! Provides hardware-accelerated encoding capabilities:
//! - `HwAccelEncoder`: Hardware-accelerated encoding (VideoToolbox, NVENC, VAAPI, QSV)
//! - `IFrameEncoder`: Single-frame H.264 I-frame encoding for static images
//! - `AsyncExportPipeline`: Three-stage concurrent export pipeline
//! - `Muxer`: Container muxing (MP4, MKV, WebM, MOV)

pub mod codec_ext;
pub mod hwaccel;
pub mod iframe;
mod muxer;
pub mod fmp4_muxer;
pub mod pipeline;
mod traits;

pub use hwaccel::HwAccelEncoder;
pub use iframe::{encode_nv12_to_h264_iframe, global_iframe_encoder, IFrameConfig, IFrameEncoder};
pub use muxer::{FfmpegMuxer, Muxer, StreamInfo};
pub use fmp4_muxer::Fmp4Muxer;
pub use pipeline::{
    AsyncExportPipeline, CompositedFrame, PipelineConfig, PipelineFrame, PipelineProgress,
};
pub use traits::{
    ContainerFormat, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwEncoderType,
    VideoCodec,
};
pub use codec_ext::{
    AudioCodecExt, ContainerFormatExt, EncoderPresetExt, HwEncoderTypeExt, VideoCodecExt,
};
