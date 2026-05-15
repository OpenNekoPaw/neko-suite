//! Decoder module - hardware-accelerated video decoding.
//!
//! Codec implementation lives in `neko-engine-codec`. This module keeps the
//! previous kernel import surface as a temporary migration compatibility layer.

pub use neko_engine_codec::decoder::{
    global_pool, Decoder, GpuTextureHandle, HwAccelDecoder, HwAccelType, IdrScanner, KeyframeInfo,
};
