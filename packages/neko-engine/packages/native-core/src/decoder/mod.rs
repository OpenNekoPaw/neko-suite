//! Decoder module - Zero-copy hardware-accelerated video decoding
//!
//! This module provides the `ZeroCopyDecoder` for hardware-accelerated video decoding
//! that outputs NV12 GPU textures directly importable by wgpu.
//!
//! ## Architecture
//!
//! ```text
//! Video File → FFmpeg HW Decode → NV12 GPU Texture → wgpu Import
//! ```
//!
//! ## Main Types
//!
//! - [`ZeroCopyDecoder`]: Hardware decoder outputting GPU textures
//! - [`HwAccelType`]: Hardware acceleration backend (VideoToolbox/VAAPI/D3D11VA)
//! - [`Nv12GpuTexture`]: Decoded frame as GPU texture handle
//!
//! ## Platform Support
//!
//! - **macOS**: VideoToolbox → CVPixelBuffer → IOSurface → Metal
//! - **Linux**: VAAPI → VASurface → DMA-BUF → Vulkan
//! - **Windows**: D3D11VA → ID3D11Texture2D → SharedHandle
//!
//! ## Example
//!
//! ```ignore
//! use media_processor::decoder::{ZeroCopyDecoder, HwAccelType};
//!
//! let mut decoder = ZeroCopyDecoder::with_hw_accel(HwAccelType::Auto);
//! decoder.open("video.mp4")?;
//!
//! while let Some(texture) = decoder.decode_next_gpu()? {
//!     // texture.handle contains platform-specific GPU handle
//!     // Import into wgpu for compositing
//! }
//! ```

pub mod common;
pub mod pool;
mod traits;
pub mod zerocopy;

// Re-export common types
pub use common::{detect_hw_accel, get_best_hw_accel, HwAccelType};

// Re-export decoder traits
pub use traits::{DecodedFrame, Decoder, FrameData, GpuTextureHandle, MediaInfo, PixelFormat};

// Re-export zero-copy decoder
pub use zerocopy::{Nv12GpuTexture, ZeroCopyConfig, ZeroCopyDecoder};

// Re-export decoder pool
pub use pool::{
    global_pool, init_global_pool, DecoderGuard, DecoderPool, DecoderPoolConfig, DecoderPoolStats,
};
