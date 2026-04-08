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
pub mod pipeline;
pub mod pool;
mod traits;

pub use codec_ext::{
    AudioCodecExt, ContainerFormatExt, EncoderPresetExt, HwEncoderTypeExt, VideoCodecExt,
};
pub use hwaccel::HwAccelEncoder;
pub use iframe::{encode_nv12_to_h264_iframe, global_iframe_encoder, IFrameConfig, IFrameEncoder};
pub use muxer::{FfmpegMuxer, Muxer, StreamInfo};
pub use pipeline::{
    AsyncExportPipeline, CompositedFrame, PipelineConfig, PipelineFrame, PipelineProgress,
};
pub use pool::{global_encoder_pool, EncoderPool};
pub use traits::{
    ContainerFormat, EncodedPacket, Encoder, EncoderConfig, EncoderPreset, HwEncoderType,
    VideoCodec,
};
