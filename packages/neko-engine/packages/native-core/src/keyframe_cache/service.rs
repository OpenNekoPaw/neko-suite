//! Keyframe Cache Service
//!
//! Provides high-level API for keyframe caching operations.
//! Handles scanning, decoding, and caching of IDR frames as NV12 data.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use tokio::sync::RwLock;

use super::cache::KeyframeLruCache;
use super::scanner::IdrScanner;
use super::types::{
    CacheKey, CacheRequest, CacheStatus, CachedKeyframe, KeyframeInfo, Nv12FrameBuffer,
    SeekResult, WarmupResponse,
};
use crate::error::{Error, Result};
use crate::domain::{ElementType, Timeline};
use neko_types::TrackType;
use crate::gpu::ColorSpace;

use ffmpeg_next as ffmpeg;
use ffmpeg_next::format::input;
use ffmpeg_next::media::Type;
use ffmpeg_next::software::scaling::{Context as ScalingContext, Flags as ScalingFlags};
use ffmpeg_next::util::frame::video::Video as VideoFrame;

/// Configuration for keyframe cache service
#[derive(Debug, Clone)]
pub struct KeyframeCacheConfig {
    /// Maximum memory usage in bytes (default: 512MB)
    pub max_memory_bytes: usize,
    /// Maximum number of frames (backup limit)
    pub max_frames: usize,
    /// Maximum frames to cache in a single warmup
    pub max_warmup_frames: usize,
}

impl Default for KeyframeCacheConfig {
    fn default() -> Self {
        Self {
            max_memory_bytes: 512 * 1024 * 1024, // 512MB
            max_frames: 200,
            max_warmup_frames: 80,
        }
    }
}

/// Shared keyframe cache type
pub type SharedKeyframeCache = Arc<RwLock<KeyframeLruCache>>;

/// Keyframe Cache Service
///
/// Manages keyframe scanning, decoding, and caching for timeline preview.
/// Caches NV12 frame data for fast seek operations.
pub struct KeyframeCacheService {
    /// LRU cache for keyframes
    cache: SharedKeyframeCache,
    /// Service configuration
    config: KeyframeCacheConfig,
    /// Cached IDR frame indices per source
    idr_indices: Arc<RwLock<HashMap<String, Vec<KeyframeInfo>>>>,
}

impl KeyframeCacheService {
    /// Create a new cache service with default configuration
    pub fn new() -> Self {
        Self::with_config(KeyframeCacheConfig::default())
    }

    /// Create a new cache service with custom configuration
    pub fn with_config(config: KeyframeCacheConfig) -> Self {
        Self {
            cache: Arc::new(RwLock::new(KeyframeLruCache::new(
                config.max_memory_bytes,
                config.max_frames,
            ))),
            config,
            idr_indices: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Warm up the cache based on timeline and playhead position
    ///
    /// Scans video sources for IDR frames after the playhead and caches them as NV12.
    pub async fn warmup(&self, request: CacheRequest) -> Result<WarmupResponse> {
        let max_frames = request.max_frames.min(self.config.max_warmup_frames);
        let playhead = request.playhead;

        // Get video sources from timeline
        let video_sources = self.get_video_sources(&request.timeline, playhead);

        if video_sources.is_empty() {
            let cache = self.cache.read().await;
            return Ok(WarmupResponse {
                frames_cached: 0,
                frames_hit: 0,
                status: cache.status(),
            });
        }

        let mut total_cached = 0;
        let mut total_hit = 0;
        let frames_per_source = max_frames / video_sources.len().max(1);

        for (source_path, source_start_time) in video_sources {
            // Calculate the time offset within the source
            let source_time = (playhead - source_start_time).max(0.0);

            let (cached, hit) = self
                .warmup_source(&source_path, source_time, frames_per_source)
                .await?;

            total_cached += cached;
            total_hit += hit;
        }

        let cache = self.cache.read().await;
        Ok(WarmupResponse {
            frames_cached: total_cached,
            frames_hit: total_hit,
            status: cache.status(),
        })
    }

    /// Warm up cache for a single source
    async fn warmup_source(
        &self,
        source_path: &str,
        start_time: f64,
        max_frames: usize,
    ) -> Result<(usize, usize)> {
        // Get or scan IDR frames for this source
        let idr_frames = self.get_or_scan_idr_frames(source_path).await?;

        // Filter frames after start_time
        let frames_to_cache: Vec<&KeyframeInfo> = idr_frames
            .iter()
            .filter(|f| f.timestamp >= start_time)
            .take(max_frames)
            .collect();

        let mut cached = 0;
        let mut hit = 0;

        for frame_info in frames_to_cache {
            let key = CacheKey::new(&frame_info.source_path, frame_info.frame_index);

            // Check if already cached
            {
                let cache = self.cache.read().await;
                if cache.contains(&key) {
                    hit += 1;
                    continue;
                }
            }

            // Decode and cache the frame
            match self.decode_and_cache_nv12(frame_info).await {
                Ok(_) => cached += 1,
                Err(e) => {
                    tracing::warn!(
                        "Failed to cache frame {} from {}: {}",
                        frame_info.frame_index,
                        source_path,
                        e
                    );
                }
            }
        }

        Ok((cached, hit))
    }

    /// Get or scan IDR frames for a source
    async fn get_or_scan_idr_frames(&self, source_path: &str) -> Result<Vec<KeyframeInfo>> {
        // Check if we already have the IDR indices
        {
            let indices = self.idr_indices.read().await;
            if let Some(frames) = indices.get(source_path) {
                return Ok(frames.clone());
            }
        }

        // Scan for IDR frames
        let scanner = IdrScanner::new(source_path)?;
        let frames = scanner.scan_idr_frames()?;

        // Cache the indices
        {
            let mut indices = self.idr_indices.write().await;
            indices.insert(source_path.to_string(), frames.clone());
        }

        Ok(frames)
    }

    /// Decode a frame and cache it as NV12 data
    async fn decode_and_cache_nv12(&self, frame_info: &KeyframeInfo) -> Result<()> {
        let source_path = &frame_info.source_path;
        let pts = frame_info.pts;

        // Open video file
        let mut input_ctx = input(source_path)?;

        // Get stream info before seeking
        let (stream_index, time_base_f64, codec_params, colorspace) = {
            let stream = input_ctx
                .streams()
                .best(Type::Video)
                .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

            let stream_index = stream.index();
            let time_base = stream.time_base();
            let time_base_f64 = time_base.numerator() as f64 / time_base.denominator() as f64;
            let codec_params = stream.parameters();

            // Get color space from stream
            let colorspace = unsafe {
                let params_ptr = codec_params.as_ptr();
                (*params_ptr).color_space
            };

            (stream_index, time_base_f64, codec_params, colorspace)
        };

        // Seek to the frame
        let seek_ts = (frame_info.timestamp / time_base_f64) as i64;
        input_ctx.seek(seek_ts, ..seek_ts)?;

        // Create decoder
        let context = ffmpeg::codec::context::Context::from_parameters(codec_params)?;
        let mut decoder = context.decoder().video()?;

        // Find and decode the target frame
        let mut decoded_frame: Option<VideoFrame> = None;

        'packet_loop: for (stream, packet) in input_ctx.packets() {
            if stream.index() != stream_index {
                continue;
            }

            decoder.send_packet(&packet)?;

            let mut frame = VideoFrame::empty();
            while decoder.receive_frame(&mut frame).is_ok() {
                let frame_pts = frame.pts().unwrap_or(0);
                if frame_pts >= pts {
                    decoded_frame = Some(frame);
                    break 'packet_loop;
                }
                frame = VideoFrame::empty();
            }
        }

        let frame = decoded_frame.ok_or_else(|| {
            Error::DecodeFailed(format!(
                "Could not find frame at pts {} in {}",
                pts, source_path
            ))
        })?;

        // Convert to NV12 format
        let nv12_buffer = self.convert_to_nv12(&frame, colorspace as i32)?;

        // Create cached frame
        let cached_frame = CachedKeyframe {
            info: frame_info.clone(),
            nv12_data: nv12_buffer,
            cached_at: Instant::now(),
        };

        // Add to cache
        let key = CacheKey::new(&frame_info.source_path, frame_info.frame_index);
        let mut cache = self.cache.write().await;
        cache.insert(key, cached_frame);

        Ok(())
    }

    /// Convert a frame to NV12 format and extract data
    fn convert_to_nv12(&self, frame: &VideoFrame, colorspace: i32) -> Result<Nv12FrameBuffer> {
        let src_format = frame.format();
        let width = frame.width();
        let height = frame.height();
        let color_space = ColorSpace::from_ffmpeg(colorspace);

        // If already NV12, extract directly
        if src_format == ffmpeg::format::Pixel::NV12 {
            return self.extract_nv12_data(frame, color_space);
        }

        // Convert to NV12 using swscale
        let mut scaler = ScalingContext::get(
            src_format,
            width,
            height,
            ffmpeg::format::Pixel::NV12,
            width,
            height,
            ScalingFlags::BILINEAR,
        )?;

        let mut nv12_frame = VideoFrame::new(ffmpeg::format::Pixel::NV12, width, height);
        scaler.run(frame, &mut nv12_frame)?;

        self.extract_nv12_data(&nv12_frame, color_space)
    }

    /// Extract NV12 data from a frame into a buffer
    fn extract_nv12_data(
        &self,
        frame: &VideoFrame,
        color_space: ColorSpace,
    ) -> Result<Nv12FrameBuffer> {
        let width = frame.width();
        let height = frame.height();

        // Get Y plane data
        let y_stride = frame.stride(0);
        let y_data_raw = frame.data(0);

        // Get UV plane data
        let uv_stride = frame.stride(1);
        let uv_data_raw = frame.data(1);

        // Calculate expected sizes
        let y_size = (width * height) as usize;
        let uv_height = height / 2;
        let uv_size = ((width / 2) * uv_height * 2) as usize;

        // Extract Y plane (handle stride padding)
        let y_data = if y_stride == width as usize {
            // No padding, direct copy
            y_data_raw[..y_size].to_vec()
        } else {
            // Has padding, strip it row by row
            let mut data = Vec::with_capacity(y_size);
            for row in 0..height as usize {
                let start = row * y_stride;
                let end = start + width as usize;
                if end <= y_data_raw.len() {
                    data.extend_from_slice(&y_data_raw[start..end]);
                }
            }
            data
        };

        // Extract UV plane (handle stride padding)
        let uv_bytes_per_row = width as usize; // NV12 UV is interleaved, width bytes per row
        let uv_data = if uv_stride == uv_bytes_per_row {
            // No padding, direct copy
            uv_data_raw[..uv_size].to_vec()
        } else {
            // Has padding, strip it row by row
            let mut data = Vec::with_capacity(uv_size);
            for row in 0..uv_height as usize {
                let start = row * uv_stride;
                let end = start + uv_bytes_per_row;
                if end <= uv_data_raw.len() {
                    data.extend_from_slice(&uv_data_raw[start..end]);
                }
            }
            data
        };

        Ok(Nv12FrameBuffer::from_planes(
            y_data,
            uv_data,
            width,
            width, // linesize = width (no padding after extraction)
            width,
            height,
            color_space,
        ))
    }

    /// Seek to find the nearest cached keyframe
    ///
    /// Returns information about the nearest keyframe for seek operations.
    pub async fn seek_to_keyframe(
        &self,
        source_path: &str,
        target_time: f64,
    ) -> Result<SeekResult> {
        // Get IDR frame list
        let idr_frames = self.get_or_scan_idr_frames(source_path).await?;

        // Get time base for PTS calculation
        let time_base = self.get_time_base(source_path)?;
        let target_pts = (target_time / time_base) as i64;

        // Try to find in cache first
        let mut cache = self.cache.write().await;

        if let Some(cached_frame) = cache.find_nearest_keyframe(source_path, target_pts) {
            let frames_to_decode = self.estimate_frames_between(
                cached_frame.info.timestamp,
                target_time,
                source_path,
            )?;

            return Ok(SeekResult {
                cache_hit: true,
                cached_frame: Some(cached_frame.clone()),
                nearest_idr: None,
                frames_to_decode,
            });
        }

        drop(cache); // Release lock

        // Cache miss - find nearest IDR frame
        let nearest_idr = idr_frames
            .iter()
            .filter(|f| f.timestamp <= target_time)
            .max_by(|a, b| a.timestamp.partial_cmp(&b.timestamp).unwrap());

        if let Some(idr) = nearest_idr {
            let frames_to_decode =
                self.estimate_frames_between(idr.timestamp, target_time, source_path)?;

            return Ok(SeekResult {
                cache_hit: false,
                cached_frame: None,
                nearest_idr: Some(idr.clone()),
                frames_to_decode,
            });
        }

        Err(Error::Other(format!(
            "No keyframe found before {} in {}",
            target_time, source_path
        )))
    }

    /// Get a cached frame by key
    pub async fn get_cached_frame(
        &self,
        source_path: &str,
        frame_index: u64,
    ) -> Option<CachedKeyframe> {
        let key = CacheKey::new(source_path, frame_index);
        let mut cache = self.cache.write().await;
        cache.get(&key).cloned()
    }

    /// Get cached NV12 data for a frame
    pub async fn get_cached_nv12(
        &self,
        source_path: &str,
        frame_index: u64,
    ) -> Option<Nv12FrameBuffer> {
        self.get_cached_frame(source_path, frame_index)
            .await
            .map(|f| f.nv12_data)
    }

    /// Clear cache for a specific source
    pub async fn clear_source(&self, source_path: &str) {
        let mut cache = self.cache.write().await;
        cache.clear_source(source_path);

        let mut indices = self.idr_indices.write().await;
        indices.remove(source_path);
    }

    /// Clear all cached frames
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();

        let mut indices = self.idr_indices.write().await;
        indices.clear();
    }

    /// Get cache status
    pub async fn status(&self) -> CacheStatus {
        let cache = self.cache.read().await;
        let mut status = cache.status();

        // Update total keyframes from scanned indices
        let indices = self.idr_indices.read().await;
        for source_status in &mut status.sources {
            if let Some(frames) = indices.get(&source_status.source_path) {
                source_status.total_keyframes = frames.len();
            }
        }

        status
    }

    /// Get video sources from timeline that are visible at playhead
    fn get_video_sources(&self, timeline: &Timeline, playhead: f64) -> Vec<(String, f64)> {
        let mut sources = Vec::new();

        for track in &timeline.tracks {
            if track.track_type != TrackType::Video {
                continue;
            }

            for element in &track.elements {
                if let ElementType::Media(ref media) = element.element_type {
                    // Check if this element is visible at or after playhead
                    let element_end = element.start_time + element.duration;
                    if element_end > playhead {
                        // Check if file exists
                        if Path::new(&media.src).exists() {
                            sources.push((media.src.clone(), element.start_time));
                        }
                    }
                }
            }
        }

        sources
    }

    /// Get IDR frame info for a source
    pub async fn get_idr_frames(&self, source_path: &str) -> Result<Vec<KeyframeInfo>> {
        self.get_or_scan_idr_frames(source_path).await
    }

    /// Get time base for a video source
    fn get_time_base(&self, source_path: &str) -> Result<f64> {
        let input_ctx = input(source_path)?;
        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let time_base = stream.time_base();
        Ok(time_base.numerator() as f64 / time_base.denominator() as f64)
    }

    /// Estimate number of frames between two timestamps
    fn estimate_frames_between(
        &self,
        start_time: f64,
        end_time: f64,
        source_path: &str,
    ) -> Result<u32> {
        // Get frame rate from video
        let input_ctx = input(source_path)?;
        let stream = input_ctx
            .streams()
            .best(Type::Video)
            .ok_or_else(|| Error::Ffmpeg("No video stream found".to_string()))?;

        let frame_rate = stream.avg_frame_rate();
        let fps = if frame_rate.denominator() > 0 {
            frame_rate.numerator() as f64 / frame_rate.denominator() as f64
        } else {
            30.0 // Default to 30fps
        };

        let duration = (end_time - start_time).max(0.0);
        Ok((duration * fps).ceil() as u32)
    }
}

impl Default for KeyframeCacheService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_default() {
        let config = KeyframeCacheConfig::default();
        assert_eq!(config.max_memory_bytes, 512 * 1024 * 1024);
        assert_eq!(config.max_frames, 200);
        assert_eq!(config.max_warmup_frames, 80);
    }

    #[tokio::test]
    async fn test_service_creation() {
        let service = KeyframeCacheService::new();
        let status = service.status().await;
        assert_eq!(status.cached_count, 0);
        assert_eq!(status.capacity, 200);
    }

    #[tokio::test]
    async fn test_clear() {
        let service = KeyframeCacheService::new();
        service.clear().await;
        let status = service.status().await;
        assert_eq!(status.cached_count, 0);
    }
}
