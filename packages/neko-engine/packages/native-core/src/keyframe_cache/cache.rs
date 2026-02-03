//! LRU Cache for Keyframes
//!
//! Implements a memory-based Least Recently Used cache with configurable limits.
//! When the cache exceeds memory or frame limits, the least recently accessed frames are evicted.

use std::collections::{HashMap, VecDeque};

use super::types::{CacheKey, CacheStatus, CachedKeyframe, SourceCacheStatus};

/// Memory-based LRU Cache for NV12 keyframes
///
/// Maintains a cache of keyframes with LRU eviction policy based on memory usage.
/// Thread-safety is handled at the service level with RwLock.
pub struct KeyframeLruCache {
    /// Cached frames indexed by key
    cache: HashMap<CacheKey, CachedKeyframe>,
    /// LRU order (front = oldest, back = newest)
    lru_order: VecDeque<CacheKey>,
    /// Maximum memory usage in bytes
    max_memory_bytes: usize,
    /// Maximum number of frames (backup limit)
    max_frames: usize,
    /// Current memory usage in bytes
    current_memory_bytes: usize,
}

impl KeyframeLruCache {
    /// Create a new LRU cache with memory and frame limits
    ///
    /// # Arguments
    /// * `max_memory_bytes` - Maximum memory usage in bytes (default: 512MB)
    /// * `max_frames` - Maximum number of frames (backup limit)
    pub fn new(max_memory_bytes: usize, max_frames: usize) -> Self {
        Self {
            cache: HashMap::with_capacity(max_frames.min(200)),
            lru_order: VecDeque::with_capacity(max_frames.min(200)),
            max_memory_bytes,
            max_frames,
            current_memory_bytes: 0,
        }
    }

    /// Create with default settings (512MB, 200 frames)
    pub fn with_defaults() -> Self {
        Self::new(512 * 1024 * 1024, 200)
    }

    /// Get a cached frame, updating LRU order
    pub fn get(&mut self, key: &CacheKey) -> Option<&CachedKeyframe> {
        if self.cache.contains_key(key) {
            // Move to back (most recently used)
            self.lru_order.retain(|k| k != key);
            self.lru_order.push_back(key.clone());
            self.cache.get(key)
        } else {
            None
        }
    }

    /// Check if a key exists without updating LRU order
    pub fn contains(&self, key: &CacheKey) -> bool {
        self.cache.contains_key(key)
    }

    /// Insert a frame into the cache
    ///
    /// If the cache exceeds memory or frame limits, evicts the least recently used frames.
    pub fn insert(&mut self, key: CacheKey, frame: CachedKeyframe) {
        let frame_size = frame.size_bytes();

        // If key already exists, update it
        if let Some(existing) = self.cache.get(&key) {
            self.current_memory_bytes -= existing.size_bytes();
            self.cache.insert(key.clone(), frame);
            self.current_memory_bytes += frame_size;
            // Move to back (most recently used)
            self.lru_order.retain(|k| k != &key);
            self.lru_order.push_back(key);
            return;
        }

        // Evict until we have enough space
        while (self.current_memory_bytes + frame_size > self.max_memory_bytes
            || self.cache.len() >= self.max_frames)
            && !self.lru_order.is_empty()
        {
            if let Some(evict_key) = self.lru_order.pop_front() {
                if let Some(evicted) = self.cache.remove(&evict_key) {
                    self.current_memory_bytes -= evicted.size_bytes();
                    tracing::debug!(
                        "Evicted keyframe {} from {} (freed {} bytes)",
                        evict_key.frame_index,
                        evict_key.source_path,
                        evicted.size_bytes()
                    );
                }
            }
        }

        // Insert new frame
        self.current_memory_bytes += frame_size;
        self.cache.insert(key.clone(), frame);
        self.lru_order.push_back(key);
    }

    /// Find the nearest cached keyframe for a given source and target PTS
    ///
    /// Returns the keyframe with the largest PTS that is <= target_pts.
    /// Updates LRU order for the found frame.
    pub fn find_nearest_keyframe(
        &mut self,
        source_path: &str,
        target_pts: i64,
    ) -> Option<&CachedKeyframe> {
        // Find the best matching key
        let mut best_key: Option<CacheKey> = None;
        let mut best_pts: i64 = i64::MIN;

        for key in self.cache.keys() {
            if key.source_path == source_path {
                if let Some(frame) = self.cache.get(key) {
                    let pts = frame.info.pts;
                    if pts <= target_pts && pts > best_pts {
                        best_pts = pts;
                        best_key = Some(key.clone());
                    }
                }
            }
        }

        if let Some(key) = best_key {
            // Update LRU order
            self.lru_order.retain(|k| k != &key);
            self.lru_order.push_back(key.clone());
            return self.cache.get(&key);
        }

        None
    }

    /// Clear all frames for a specific source
    pub fn clear_source(&mut self, source_path: &str) {
        let keys_to_remove: Vec<CacheKey> = self
            .cache
            .keys()
            .filter(|k| k.source_path == source_path)
            .cloned()
            .collect();

        for key in keys_to_remove {
            if let Some(frame) = self.cache.remove(&key) {
                self.current_memory_bytes -= frame.size_bytes();
            }
            self.lru_order.retain(|k| k != &key);
        }
    }

    /// Clear all cached frames
    pub fn clear(&mut self) {
        self.cache.clear();
        self.lru_order.clear();
        self.current_memory_bytes = 0;
    }

    /// Get the number of cached frames
    pub fn len(&self) -> usize {
        self.cache.len()
    }

    /// Check if the cache is empty
    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    /// Get the maximum memory limit
    pub fn max_memory_bytes(&self) -> usize {
        self.max_memory_bytes
    }

    /// Get the maximum frame limit
    pub fn max_frames(&self) -> usize {
        self.max_frames
    }

    /// Get current memory usage in bytes
    pub fn memory_bytes(&self) -> usize {
        self.current_memory_bytes
    }

    /// Get cache status
    pub fn status(&self) -> CacheStatus {
        // Group by source
        let mut source_counts: HashMap<&str, usize> = HashMap::new();

        for key in self.cache.keys() {
            *source_counts.entry(&key.source_path).or_insert(0) += 1;
        }

        let sources: Vec<SourceCacheStatus> = source_counts
            .into_iter()
            .map(|(path, cached)| SourceCacheStatus {
                source_path: path.to_string(),
                cached_frames: cached,
                total_keyframes: 0, // Will be updated by service
            })
            .collect();

        CacheStatus {
            cached_count: self.cache.len(),
            capacity: self.max_frames,
            sources,
            memory_bytes: self.current_memory_bytes,
        }
    }

    /// Get all cached frame indices for a source
    pub fn get_cached_indices(&self, source_path: &str) -> Vec<u64> {
        self.cache
            .keys()
            .filter(|k| k.source_path == source_path)
            .map(|k| k.frame_index)
            .collect()
    }
}

impl Default for KeyframeLruCache {
    fn default() -> Self {
        Self::with_defaults()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gpu::ColorSpace;
    use crate::keyframe_cache::types::{KeyframeInfo, Nv12FrameBuffer};
    use std::time::Instant;

    fn make_frame(source: &str, index: u64, width: u32, height: u32) -> (CacheKey, CachedKeyframe) {
        let key = CacheKey::new(source, index);
        let nv12_data = Nv12FrameBuffer::new(width, height, ColorSpace::Bt709);
        let frame = CachedKeyframe {
            info: KeyframeInfo {
                source_path: source.to_string(),
                timestamp: index as f64 / 30.0,
                frame_index: index,
                width,
                height,
                is_idr: true,
                nal_type: 5,
                pts: index as i64 * 1000,
            },
            nv12_data,
            cached_at: Instant::now(),
        };
        (key, frame)
    }

    #[test]
    fn test_insert_and_get() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 100); // 100MB
        let (key, frame) = make_frame("/video.mp4", 0, 320, 180);

        cache.insert(key.clone(), frame);
        assert_eq!(cache.len(), 1);

        let retrieved = cache.get(&key);
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().info.frame_index, 0);
    }

    #[test]
    fn test_memory_based_eviction() {
        // Create cache with ~1MB limit
        let mut cache = KeyframeLruCache::new(1024 * 1024, 100);

        // Insert frames until we exceed memory limit
        // 320x180 NV12 = 320*180 + 160*90*2 = 57,600 + 28,800 = 86,400 bytes
        // ~12 frames should fit in 1MB
        for i in 0..20 {
            let (key, frame) = make_frame("/video.mp4", i, 320, 180);
            cache.insert(key, frame);
        }

        // Should have evicted some frames
        assert!(cache.len() < 20);
        assert!(cache.memory_bytes() <= 1024 * 1024);
    }

    #[test]
    fn test_frame_count_eviction() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 3); // 100MB, 3 frames max

        // Insert 4 frames
        for i in 0..4 {
            let (key, frame) = make_frame("/video.mp4", i, 320, 180);
            cache.insert(key, frame);
        }

        // Should have exactly 3 frames
        assert_eq!(cache.len(), 3);

        // Frame 0 should be evicted
        let key0 = CacheKey::new("/video.mp4", 0);
        assert!(!cache.contains(&key0));

        // Frames 1, 2, 3 should still exist
        assert!(cache.contains(&CacheKey::new("/video.mp4", 1)));
        assert!(cache.contains(&CacheKey::new("/video.mp4", 2)));
        assert!(cache.contains(&CacheKey::new("/video.mp4", 3)));
    }

    #[test]
    fn test_lru_access_updates_order() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 3);

        // Insert 3 frames
        for i in 0..3 {
            let (key, frame) = make_frame("/video.mp4", i, 320, 180);
            cache.insert(key, frame);
        }

        // Access frame 0 (moves it to most recently used)
        let key0 = CacheKey::new("/video.mp4", 0);
        cache.get(&key0);

        // Insert 4th frame, should evict frame 1 (now oldest)
        let (key, frame) = make_frame("/video.mp4", 3, 320, 180);
        cache.insert(key, frame);

        // Frame 0 should still exist (was accessed)
        assert!(cache.contains(&key0));
        // Frame 1 should be evicted
        assert!(!cache.contains(&CacheKey::new("/video.mp4", 1)));
    }

    #[test]
    fn test_find_nearest_keyframe() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 100);

        // Insert frames at pts 0, 1000, 2000, 3000
        for i in 0..4 {
            let (key, frame) = make_frame("/video.mp4", i, 320, 180);
            cache.insert(key, frame);
        }

        // Find nearest to pts 2500 -> should return frame at pts 2000 (index 2)
        let nearest = cache.find_nearest_keyframe("/video.mp4", 2500);
        assert!(nearest.is_some());
        assert_eq!(nearest.unwrap().info.frame_index, 2);

        // Find nearest to pts 500 -> should return frame at pts 0 (index 0)
        let nearest = cache.find_nearest_keyframe("/video.mp4", 500);
        assert!(nearest.is_some());
        assert_eq!(nearest.unwrap().info.frame_index, 0);

        // Find nearest to pts -100 -> should return None (no frame before target)
        let nearest = cache.find_nearest_keyframe("/video.mp4", -100);
        assert!(nearest.is_none());
    }

    #[test]
    fn test_clear_source() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 100);

        // Insert frames from two sources
        for i in 0..3 {
            let (key, frame) = make_frame("/video1.mp4", i, 320, 180);
            cache.insert(key, frame);
        }
        for i in 0..3 {
            let (key, frame) = make_frame("/video2.mp4", i, 320, 180);
            cache.insert(key, frame);
        }
        assert_eq!(cache.len(), 6);

        let memory_before = cache.memory_bytes();

        // Clear video1
        cache.clear_source("/video1.mp4");
        assert_eq!(cache.len(), 3);
        assert!(cache.memory_bytes() < memory_before);

        // video1 frames should be gone
        assert!(!cache.contains(&CacheKey::new("/video1.mp4", 0)));
        // video2 frames should remain
        assert!(cache.contains(&CacheKey::new("/video2.mp4", 0)));
    }

    #[test]
    fn test_clear_all() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 100);

        for i in 0..5 {
            let (key, frame) = make_frame("/video.mp4", i, 320, 180);
            cache.insert(key, frame);
        }
        assert_eq!(cache.len(), 5);
        assert!(cache.memory_bytes() > 0);

        cache.clear();
        assert_eq!(cache.len(), 0);
        assert!(cache.is_empty());
        assert_eq!(cache.memory_bytes(), 0);
    }

    #[test]
    fn test_status() {
        let mut cache = KeyframeLruCache::new(100 * 1024 * 1024, 100);

        for i in 0..3 {
            let (key, frame) = make_frame("/video.mp4", i, 320, 180);
            cache.insert(key, frame);
        }

        let status = cache.status();
        assert_eq!(status.cached_count, 3);
        assert_eq!(status.capacity, 100);
        assert!(status.memory_bytes > 0);
        assert_eq!(status.sources.len(), 1);
        assert_eq!(status.sources[0].cached_frames, 3);
    }
}
