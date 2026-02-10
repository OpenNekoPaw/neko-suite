//! Keyframe Cache Types - Data structures for keyframe caching

use serde::{Deserialize, Serialize};
use std::time::Instant;

use crate::domain::Timeline;
use crate::gpu::ColorSpace;

/// Unique key for cached keyframes
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct CacheKey {
    /// Source file path
    pub source_path: String,
    /// Frame index in the source video
    pub frame_index: u64,
}

impl CacheKey {
    pub fn new(source_path: impl Into<String>, frame_index: u64) -> Self {
        Self {
            source_path: source_path.into(),
            frame_index,
        }
    }
}

/// Information about a keyframe in the source video
#[derive(Debug, Clone)]
pub struct KeyframeInfo {
    /// Source file path
    pub source_path: String,
    /// Timestamp in seconds
    pub timestamp: f64,
    /// Frame index in the source video
    pub frame_index: u64,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Whether this is a true IDR frame
    pub is_idr: bool,
    /// NAL unit type (for debugging)
    pub nal_type: u8,
    /// Presentation timestamp (pts)
    pub pts: i64,
}

/// NV12 frame buffer stored in CPU memory
///
/// NV12 is a YUV 4:2:0 semi-planar format:
/// - Y plane: Full resolution (width × height), 1 byte per pixel
/// - UV plane: Half resolution (width/2 × height/2), 2 bytes per pixel (interleaved U and V)
#[derive(Debug, Clone)]
pub struct Nv12FrameBuffer {
    /// Y plane data (luma, full resolution)
    pub y_data: Vec<u8>,
    /// UV plane data (chroma, half resolution, interleaved)
    pub uv_data: Vec<u8>,
    /// Y plane linesize (bytes per row, may include padding)
    pub y_linesize: u32,
    /// UV plane linesize (bytes per row, may include padding)
    pub uv_linesize: u32,
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Color space for YUV conversion
    pub color_space: ColorSpace,
}

impl Nv12FrameBuffer {
    /// Calculate memory usage in bytes
    pub fn size_bytes(&self) -> usize {
        self.y_data.len() + self.uv_data.len()
    }

    /// Create a new NV12 frame buffer with the given dimensions
    pub fn new(width: u32, height: u32, color_space: ColorSpace) -> Self {
        let y_size = (width * height) as usize;
        let uv_size = ((width / 2) * (height / 2) * 2) as usize;

        Self {
            y_data: vec![0u8; y_size],
            uv_data: vec![0u8; uv_size],
            y_linesize: width,
            uv_linesize: width, // NV12 UV is interleaved, same width as Y
            width,
            height,
            color_space,
        }
    }

    /// Create from raw Y and UV data with linesize handling
    pub fn from_planes(
        y_data: Vec<u8>,
        uv_data: Vec<u8>,
        y_linesize: u32,
        uv_linesize: u32,
        width: u32,
        height: u32,
        color_space: ColorSpace,
    ) -> Self {
        Self {
            y_data,
            uv_data,
            y_linesize,
            uv_linesize,
            width,
            height,
            color_space,
        }
    }
}

/// Cached keyframe with NV12 data
#[derive(Debug, Clone)]
pub struct CachedKeyframe {
    /// Keyframe metadata
    pub info: KeyframeInfo,
    /// NV12 frame data
    pub nv12_data: Nv12FrameBuffer,
    /// When this frame was cached
    pub cached_at: Instant,
}

impl CachedKeyframe {
    /// Get the size of this cached frame in bytes
    pub fn size_bytes(&self) -> usize {
        self.nv12_data.size_bytes()
    }
}

/// Request to warm up the cache
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheRequest {
    /// Timeline data containing video elements
    pub timeline: Timeline,
    /// Current playhead position in seconds
    pub playhead: f64,
    /// Maximum number of frames to cache (default: 80)
    #[serde(default = "default_max_frames")]
    pub max_frames: usize,
}

fn default_max_frames() -> usize {
    80
}

/// Status of a single source in the cache
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCacheStatus {
    /// Source file path
    pub source_path: String,
    /// Number of frames cached for this source
    pub cached_frames: usize,
    /// Total keyframes detected in this source
    pub total_keyframes: usize,
}

/// Overall cache status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStatus {
    /// Total number of cached frames
    pub cached_count: usize,
    /// Cache capacity
    pub capacity: usize,
    /// Per-source status
    pub sources: Vec<SourceCacheStatus>,
    /// Total memory usage in bytes
    pub memory_bytes: usize,
}

/// Response for warmup request
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WarmupResponse {
    /// Number of frames cached in this warmup
    pub frames_cached: usize,
    /// Number of frames that were already cached
    pub frames_hit: usize,
    /// Current cache status
    pub status: CacheStatus,
}

/// Seek request to find nearest cached keyframe
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekRequest {
    /// Source file path
    pub source_path: String,
    /// Target time in seconds
    pub target_time: f64,
}

/// Seek response with nearest keyframe info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekResponse {
    /// Whether a cached keyframe was found
    pub cache_hit: bool,
    /// Nearest keyframe timestamp (seconds)
    pub keyframe_timestamp: f64,
    /// Nearest keyframe PTS
    pub keyframe_pts: i64,
    /// Nearest keyframe frame index
    pub keyframe_frame_index: u64,
    /// Estimated frames to decode from keyframe to target
    pub frames_to_decode: u32,
}

/// Result of seek operation (internal use)
#[derive(Debug, Clone)]
pub struct SeekResult {
    /// Whether a cached keyframe was found
    pub cache_hit: bool,
    /// The cached keyframe (if found)
    pub cached_frame: Option<CachedKeyframe>,
    /// Nearest IDR frame info (if cache miss)
    pub nearest_idr: Option<KeyframeInfo>,
    /// Estimated frames to decode
    pub frames_to_decode: u32,
}

/// Error response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheErrorResponse {
    /// Error message
    pub error: String,
    /// Error code
    pub code: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_equality() {
        let key1 = CacheKey::new("/path/to/video.mp4", 100);
        let key2 = CacheKey::new("/path/to/video.mp4", 100);
        let key3 = CacheKey::new("/path/to/video.mp4", 200);

        assert_eq!(key1, key2);
        assert_ne!(key1, key3);
    }

    #[test]
    fn test_cache_key_hash() {
        use std::collections::HashMap;

        let mut map = HashMap::new();
        let key = CacheKey::new("/path/to/video.mp4", 100);
        map.insert(key.clone(), "test");

        assert_eq!(map.get(&key), Some(&"test"));
    }

    #[test]
    fn test_nv12_frame_buffer_size() {
        // 1920x1080 NV12: Y = 1920*1080 = 2,073,600, UV = 960*540*2 = 1,036,800
        let buffer = Nv12FrameBuffer::new(1920, 1080, ColorSpace::Bt709);
        assert_eq!(buffer.y_data.len(), 1920 * 1080);
        assert_eq!(buffer.uv_data.len(), 960 * 540 * 2);
        assert_eq!(buffer.size_bytes(), 1920 * 1080 + 960 * 540 * 2);
    }

    #[test]
    fn test_nv12_frame_buffer_720p() {
        // 1280x720 NV12
        let buffer = Nv12FrameBuffer::new(1280, 720, ColorSpace::Bt709);
        assert_eq!(buffer.y_data.len(), 1280 * 720);
        assert_eq!(buffer.uv_data.len(), 640 * 360 * 2);
    }
}
