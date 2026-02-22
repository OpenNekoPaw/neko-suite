//! Keyframe Cache - Internal LRU cache for IDR frames (NV12 format)
//!
//! Provides server-side caching of video keyframes (IDR frames)
//! for efficient timeline preview and fast seek operations.
//!
//! This module is an internal infrastructure component — it does not
//! expose HTTP endpoints. The cache is used automatically by timeline
//! rendering and compositing services.
//!
//! ## Architecture
//!
//! ```text
//! Timeline → Scanner (IDR detection) → Decoder → NV12 → LRU Cache (512MB)
//! ```

mod cache;
mod scanner;
mod service;
mod types;

pub use cache::KeyframeLruCache;
pub use scanner::{IdrScanner, VideoCodecType};
pub use service::{KeyframeCacheConfig, KeyframeCacheService};
pub use types::{
    CacheKey, CacheStatus, CachedKeyframe, KeyframeInfo, Nv12FrameBuffer,
    SeekResult, SourceCacheStatus, WarmupResponse,
    CacheRequest, SeekRequest, SeekResponse, CacheErrorResponse,
};
