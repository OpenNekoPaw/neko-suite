//! Decoder module - hardware-accelerated video decoding.
//!
//! Codec implementation lives in `neko-engine-codec`. This module keeps the
//! previous kernel import surface as a temporary migration compatibility layer.

#![allow(unused_imports)]

pub use neko_engine_codec::decoder::common;
pub use neko_engine_codec::decoder::hwaccel;
pub use neko_engine_codec::decoder::idr_scanner;
pub use neko_engine_codec::decoder::pool;
pub use neko_engine_codec::decoder::{
    detect_hw_accel, get_best_hw_accel, global_pool, init_global_pool, DecodedFrame, Decoder,
    DecoderGuard, DecoderPool, DecoderPoolConfig, DecoderPoolStats, FrameData, GpuTextureHandle,
    HwAccelDecoder, HwAccelDecoderConfig, HwAccelType, HwAccelTypeExt, IdrScanner, KeyframeInfo,
    MediaInfo, Nv12GpuTexture, PixelFormat, VideoCodecType,
};
