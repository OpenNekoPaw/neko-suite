//! Decoder module - Hardware-accelerated video decoding
//!
//! This module provides the `HwAccelDecoder` for hardware-accelerated video decoding
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
//! - [`HwAccelDecoder`]: Hardware decoder outputting GPU textures
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
//! use media_processor::decoder::{HwAccelDecoder, HwAccelType};
//!
//! let mut decoder = HwAccelDecoder::with_hw_accel(HwAccelType::Auto);
//! decoder.open("video.mp4")?;
//!
//! while let Some(texture) = decoder.decode_next_gpu()? {
//!     // texture.handle contains platform-specific GPU handle
//!     // Import into wgpu for compositing
//! }
//! ```

pub mod common;
pub mod idr_scanner;
pub mod pool;
mod traits;
pub mod hwaccel;

// Re-export common types
pub use common::{detect_hw_accel, get_best_hw_accel, HwAccelType};

// Re-export decoder traits
pub use traits::{DecodedFrame, Decoder, FrameData, GpuTextureHandle, MediaInfo, PixelFormat};

// Re-export hardware-accelerated decoder
pub use hwaccel::{HwAccelDecoder, HwAccelDecoderConfig, Nv12GpuTexture};

// Re-export IDR scanner
pub use idr_scanner::{IdrScanner, KeyframeInfo, VideoCodecType};

// Re-export decoder pool
pub use pool::{
    global_pool, init_global_pool, DecoderGuard, DecoderPool, DecoderPoolConfig, DecoderPoolStats,
};
