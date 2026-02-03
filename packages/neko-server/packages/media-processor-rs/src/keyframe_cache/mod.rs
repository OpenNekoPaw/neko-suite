//! Keyframe Cache Module - LRU cache for IDR frames (NV12 format)
//!
//! This module provides server-side caching of video keyframes (IDR frames)
//! for efficient timeline preview and fast seek operations.
//!
//! ## Architecture
//!
//! ```text
//! Timeline → Scanner (IDR detection) → Decoder → NV12 → LRU Cache (512MB)
//!                                                              ↓
//!                                                       API Endpoints
//! ```
//!
//! ## Features
//!
//! - **IDR Frame Detection**: Parses NAL unit types to identify true IDR frames
//!   - H.264: NAL type = 5
//!   - H.265: NAL type = 19 or 20
//! - **NV12 Caching**: Stores raw NV12 frame data for fast GPU upload
//! - **Memory-based LRU**: 512MB default capacity with automatic eviction
//! - **Warmup API**: Pre-cache frames based on playhead position
//! - **Seek API**: Find nearest cached keyframe for fast seek
//!
//! ## API Endpoints
//!
//! - `POST /keyframes/warmup` - Pre-cache keyframes from playhead position
//! - `GET /keyframes/status` - Get cache status
//! - `POST /keyframes/seek` - Find nearest cached keyframe for seek
//! - `GET /keyframes/nv12` - Get cached NV12 frame data
//! - `POST /keyframes/clear` - Clear all cached frames
//! - `GET /keyframes/idr` - Get IDR frame list for a source

mod cache;
pub mod routes;
mod scanner;
mod service;
mod types;

pub use cache::KeyframeLruCache;
pub use routes::keyframe_cache_routes;
pub use scanner::{IdrScanner, VideoCodecType};
pub use service::{KeyframeCacheConfig, KeyframeCacheService};
pub use types::{
    CacheKey, CacheRequest, CacheStatus, CachedKeyframe, KeyframeInfo, Nv12FrameBuffer,
    SeekRequest, SeekResponse, SeekResult, SourceCacheStatus, WarmupResponse,
};
