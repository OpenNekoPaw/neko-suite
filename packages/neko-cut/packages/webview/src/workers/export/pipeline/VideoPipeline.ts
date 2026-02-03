/**
 * Video Pipeline
 *
 * Handles video processing: demux → decode → composite → encode
 * Implements zero-copy pipeline using WebGPU when available.
 *
 * Zero-copy flow:
 * 1. MP4Demuxer → EncodedVideoChunk (no copy, just reference)
 * 2. VideoDecoder → VideoFrame (GPU-backed, zero-copy)
 * 3. WebGPU importExternalTexture → GPU texture (zero-copy)
 * 4. GPU composite → OffscreenCanvas (GPU-backed)
 * 5. OffscreenCanvas → VideoFrame (GPU-backed, zero-copy)
 * 6. VideoEncoder.encode(VideoFrame) (GPU-backed, zero-copy)
 */

import type {
  MultiTrackExportConfig,
  SerializedProjectData,
  SerializedElement,
} from '../protocol/messages';
import { WorkerDemuxerPool } from '../media/WorkerDemuxerPool';
import { WorkerDecoderPool } from '../media/WorkerDecoderPool';
import { WorkerWebGPUCompositor } from '../rendering/WorkerWebGPUCompositor';

// =============================================================================
// Types
// =============================================================================

export interface VideoPipelineConfig {
  maxDemuxers: number;
  maxDecoders: number;
}

export interface VideoPipelineStats {
  // Timing (ms)
  demuxTime: number;
  decodeTime: number;
  renderTime: number;

  // Frame statistics
  framesProcessed: number;
  avgFrameTime: number;
  maxFrameTime: number;
  minFrameTime: number;

  // Cache statistics
  demuxerCacheHits: number;
  demuxerCacheMisses: number;
  decoderCacheHits: number;
  decoderCacheMisses: number;

  // Pipeline info
  /** Whether zero-copy mode is active */
  zeroCopy: boolean;
  /** Rendering backend (WebGPU) */
  backend: string;
}

// =============================================================================
// VideoPipeline
// =============================================================================

export class VideoPipeline {
  private _exportConfig: MultiTrackExportConfig | null = null;
  private _project: SerializedProjectData | null = null;

  private _demuxerPool: WorkerDemuxerPool;
  private _decoderPool: WorkerDecoderPool;
  private _compositor: WorkerWebGPUCompositor;

  private _stats: VideoPipelineStats = {
    demuxTime: 0,
    decodeTime: 0,
    renderTime: 0,
    framesProcessed: 0,
    avgFrameTime: 0,
    maxFrameTime: 0,
    minFrameTime: Infinity,
    demuxerCacheHits: 0,
    demuxerCacheMisses: 0,
    decoderCacheHits: 0,
    decoderCacheMisses: 0,
    zeroCopy: false,
    backend: 'unknown',
  };

  // Frame time tracking
  private _frameTimes: number[] = [];

  constructor(config: VideoPipelineConfig) {
    this._demuxerPool = new WorkerDemuxerPool({ maxDemuxers: config.maxDemuxers });
    this._decoderPool = new WorkerDecoderPool({ maxDecoders: config.maxDecoders });
    this._compositor = new WorkerWebGPUCompositor();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize video pipeline
   */
  async initialize(
    canvas: OffscreenCanvas,
    config: MultiTrackExportConfig,
    project: SerializedProjectData
  ): Promise<void> {
    this._exportConfig = config;
    this._project = project;

    // Initialize compositor (WebGPU required for zero-copy)
    await this._compositor.initialize(canvas);

    // Update stats with compositor info
    this._stats.zeroCopy = this._compositor.isZeroCopy;
    this._stats.backend = this._compositor.backend;

    console.log(`[VideoPipeline] Initialized with ${this._stats.backend} (zero-copy: ${this._stats.zeroCopy})`);

    // Preload demuxers for all media elements
    const mediaUrls = new Set<string>();
    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.mediaUrl && element.hasVideo) {
          mediaUrls.add(element.mediaUrl);
        }
      }
    }

    // Preload in parallel (limited by pool size)
    const preloadPromises = Array.from(mediaUrls).map(url =>
      this._demuxerPool.preload(url).catch(err => {
        console.warn(`[VideoPipeline] Failed to preload ${url}:`, err);
      })
    );
    await Promise.all(preloadPromises);
  }

  // ===========================================================================
  // Frame Processing
  // ===========================================================================

  /**
   * Process single frame at given time
   * Returns VideoFrame ready for encoding
   */
  async processFrame(timeInSeconds: number): Promise<VideoFrame> {
    if (!this._project || !this._exportConfig) {
      throw new Error('Pipeline not initialized');
    }

    const frameStart = performance.now();

    // Collect video frames for all visible elements
    const videoFrames = new Map<string, VideoFrame>();

    try {
      // Get visible elements at this time
      const visibleElements = this._getVisibleElements(timeInSeconds);

      // Decode frames for each element
      for (const element of visibleElements) {
        if (!element.mediaUrl) continue;

        const frame = await this._decodeElementFrame(element, timeInSeconds);
        if (frame) {
          videoFrames.set(element.id, frame);
        }
      }

      // Composite all frames
      const renderStart = performance.now();
      await this._compositor.renderFrame(timeInSeconds, videoFrames, this._project);
      this._stats.renderTime += performance.now() - renderStart;

      // Create output VideoFrame
      const timestamp = Math.round(timeInSeconds * 1_000_000); // microseconds
      const outputFrame = this._compositor.toVideoFrame(timestamp);

      // Update frame statistics
      const frameTime = performance.now() - frameStart;
      this._frameTimes.push(frameTime);
      this._stats.framesProcessed++;
      this._stats.maxFrameTime = Math.max(this._stats.maxFrameTime, frameTime);
      this._stats.minFrameTime = Math.min(this._stats.minFrameTime, frameTime);
      this._stats.avgFrameTime = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;

      return outputFrame;
    } finally {
      // Close input frames
      for (const frame of videoFrames.values()) {
        try { frame.close(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Get visible video elements at given time
   */
  private _getVisibleElements(time: number): SerializedElement[] {
    if (!this._project) return [];

    const elements: SerializedElement[] = [];

    for (const track of this._project.tracks) {
      if (track.type !== 'video') continue;

      for (const element of track.elements) {
        if (time >= element.startTime && time < element.startTime + element.duration) {
          if (element.hasVideo && element.mediaUrl) {
            elements.push(element);
          }
        }
      }
    }

    return elements;
  }

  /**
   * Decode video frame for element at given time
   */
  private async _decodeElementFrame(
    element: SerializedElement,
    timeInSeconds: number
  ): Promise<VideoFrame | null> {
    if (!element.mediaUrl) return null;

    try {
      // Calculate media time (accounting for offset)
      const mediaTime = timeInSeconds - element.startTime + element.mediaOffset;

      // Get demuxer
      const demuxStart = performance.now();
      const demuxer = await this._demuxerPool.getDemuxer(element.mediaUrl);
      const mediaInfo = await this._demuxerPool.getMediaInfo(element.mediaUrl);

      if (!mediaInfo) {
        console.warn(`[VideoPipeline] No media info for ${element.mediaUrl}`);
        return null;
      }

      // Get encoded chunks from demuxer
      const chunks = await demuxer.getVideoChunksAt(mediaTime, 1);
      this._stats.demuxTime += performance.now() - demuxStart;

      if (chunks.length === 0) {
        return null;
      }

      // Decode frame
      const decodeStart = performance.now();
      const targetTimestamp = Math.round(mediaTime * 1_000_000);
      const frame = await this._decoderPool.decodeFrame(
        element.mediaUrl,
        mediaInfo,
        chunks,
        targetTimestamp
      );
      this._stats.decodeTime += performance.now() - decodeStart;

      return frame;
    } catch (error) {
      console.error(`[VideoPipeline] Failed to decode frame for ${element.id}:`, error);
      return null;
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get pipeline statistics
   */
  getStats(): VideoPipelineStats {
    return { ...this._stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this._stats = {
      demuxTime: 0,
      decodeTime: 0,
      renderTime: 0,
      framesProcessed: 0,
      avgFrameTime: 0,
      maxFrameTime: 0,
      minFrameTime: Infinity,
      demuxerCacheHits: 0,
      demuxerCacheMisses: 0,
      decoderCacheHits: 0,
      decoderCacheMisses: 0,
      zeroCopy: this._stats.zeroCopy,
      backend: this._stats.backend,
    };
    this._frameTimes = [];
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { demuxer: { size: number; maxSize: number }; decoder: { size: number; maxSize: number } } {
    const demuxerStats = this._demuxerPool.getStats();
    const decoderStats = this._decoderPool.getStats();
    return {
      demuxer: { size: demuxerStats.size, maxSize: demuxerStats.maxSize },
      decoder: { size: decoderStats.size, maxSize: decoderStats.maxSize },
    };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose pipeline resources
   */
  dispose(): void {
    this._demuxerPool.dispose();
    this._decoderPool.dispose();
    this._compositor.dispose();
  }
}
