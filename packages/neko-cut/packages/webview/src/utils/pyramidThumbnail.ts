/**
 * PyramidThumbnailGenerator - Multi-resolution thumbnail for large video files
 *
 * Architecture:
 *   L1 (Overview):   1 frame per 60 seconds - for 4GB video full-length display
 *   L2 (Navigation): 1 frame per 10 seconds - for normal editing operations
 *   L3 (Detail):     1 frame per 2 seconds  - on-demand decode for viewport
 *
 * Data flow:
 *   MP4Demuxer → getKeyframeTimes() → WebviewVideoDecoder → ImageBitmap → dataUrl
 *
 * Key features:
 * - On-demand loading: only loads thumbnails needed for current viewport
 * - Progressive refinement: starts with L1, refines to L2/L3 as user zooms
 * - Memory efficient: uses LRU cache with size limit
 * - Keyframe-aligned: always uses nearest keyframe for fast decoding
 */

import { getMediaProxy } from '../services/mediaProxyFactory';

// =============================================================================
// Types
// =============================================================================

/** Thumbnail resolution level */
export type ThumbnailLevel = 'L1' | 'L2' | 'L3';

/** Single thumbnail data */
export interface ThumbnailFrame {
  /** Time in seconds */
  time: number;
  /** Data URL (JPEG) */
  dataUrl: string;
  /** Whether this is a placeholder */
  isPlaceholder?: boolean;
}

/** Level thumbnail data */
export interface LevelThumbnailData {
  level: ThumbnailLevel;
  /** Frames per second for this level */
  framesPerSecond: number;
  /** Thumbnail frames */
  frames: ThumbnailFrame[];
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Whether this level is complete */
  isComplete: boolean;
}

/** Pyramid thumbnail data structure */
export interface PyramidThumbnailData {
  /** Video duration in seconds */
  duration: number;
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** L1 overview data */
  l1: LevelThumbnailData | null;
  /** L2 navigation data (loaded progressively) */
  l2: LevelThumbnailData | null;
  /** L3 detail data (loaded on-demand for viewport) */
  l3: LevelThumbnailData | null;
}

/** Viewport for on-demand loading */
export interface ThumbnailViewport {
  startTime: number;
  endTime: number;
  /** Pixels per second (determines required resolution) */
  pixelsPerSecond: number;
  /** Target thumbnail height */
  height: number;
}

/** Progress callback */
export type ThumbnailProgressCallback = (progress: {
  level: ThumbnailLevel;
  percent: number;
  message: string;
}) => void;

// =============================================================================
// Constants
// =============================================================================

/** L1: 1 frame per 60 seconds (overview for 4GB+ videos) */
const L1_INTERVAL_SECONDS = 60;

/** L2: 1 frame per 10 seconds (navigation level) */
const L2_INTERVAL_SECONDS = 10;

/** L3: 1 frame per 2 seconds (detail level) */
const L3_INTERVAL_SECONDS = 2;

/** Default thumbnail height */
const DEFAULT_THUMBNAIL_HEIGHT = 60;

/** JPEG quality for thumbnails */
const THUMBNAIL_QUALITY = 0.6;

/** Maximum cached frames per level */
const MAX_CACHED_FRAMES = 200;

// =============================================================================
// PyramidThumbnailGenerator
// =============================================================================

export class PyramidThumbnailGenerator {
  private _videoPath = '';
  private _duration = 0;
  private _width = 0;
  private _height = 0;
  private _keyframeTimes: number[] = [];
  private _disposed = false;

  // Cached thumbnail data
  private _l1Data: LevelThumbnailData | null = null;
  private _l2Cache: Map<number, ThumbnailFrame> = new Map(); // time -> frame
  private _l3Cache: Map<number, ThumbnailFrame> = new Map(); // time -> frame

  constructor() {}

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Initialize the generator with a video source
   */
  async initialize(videoPath: string): Promise<PyramidThumbnailData> {
    if (this._disposed) {
      throw new Error('Generator has been disposed');
    }

    this._videoPath = videoPath;

    // Get media info
    const mediaInfo = await getMediaProxy().probeMediaInfo(videoPath);
    this._duration = mediaInfo.duration;
    this._width = mediaInfo.width;
    this._height = mediaInfo.height;

    // Get keyframe times for efficient thumbnail generation
    this._keyframeTimes = await getMediaProxy().getKeyframeTimes(videoPath);

    return this._buildPyramidData();
  }

  /**
   * Generate L1 overview thumbnails (fast, for initial display)
   */
  async generateL1(
    height = DEFAULT_THUMBNAIL_HEIGHT,
    onProgress?: ThumbnailProgressCallback
  ): Promise<LevelThumbnailData> {
    if (!this._videoPath) {
      throw new Error('Generator not initialized');
    }

    const frameCount = Math.ceil(this._duration / L1_INTERVAL_SECONDS);
    const frames: ThumbnailFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      const targetTime = i * L1_INTERVAL_SECONDS;
      const alignedTime = this._findNearestKeyframe(targetTime);

      try {
        const dataUrl = await this._generateThumbnail(alignedTime, height);
        frames.push({ time: alignedTime, dataUrl });
      } catch {
        frames.push(this._createPlaceholder(alignedTime, height));
      }

      onProgress?.({
        level: 'L1',
        percent: ((i + 1) / frameCount) * 100,
        message: `Generating overview: ${i + 1}/${frameCount}`,
      });
    }

    this._l1Data = {
      level: 'L1',
      framesPerSecond: 1 / L1_INTERVAL_SECONDS,
      frames,
      startTime: 0,
      endTime: this._duration,
      isComplete: true,
    };

    return this._l1Data;
  }

  /**
   * Generate L2 navigation thumbnails for a time range
   */
  async generateL2Range(
    startTime: number,
    endTime: number,
    height = DEFAULT_THUMBNAIL_HEIGHT,
    onProgress?: ThumbnailProgressCallback
  ): Promise<LevelThumbnailData> {
    if (!this._videoPath) {
      throw new Error('Generator not initialized');
    }

    // Clamp to valid range
    startTime = Math.max(0, startTime);
    endTime = Math.min(this._duration, endTime);

    const duration = endTime - startTime;
    const frameCount = Math.ceil(duration / L2_INTERVAL_SECONDS);
    const frames: ThumbnailFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      const targetTime = startTime + i * L2_INTERVAL_SECONDS;
      const alignedTime = this._findNearestKeyframe(targetTime);

      // Check cache
      const cached = this._l2Cache.get(alignedTime);
      if (cached) {
        frames.push(cached);
        continue;
      }

      try {
        const dataUrl = await this._generateThumbnail(alignedTime, height);
        const frame: ThumbnailFrame = { time: alignedTime, dataUrl };
        frames.push(frame);

        // Cache with LRU eviction
        this._cacheFrame(this._l2Cache, alignedTime, frame);
      } catch {
        frames.push(this._createPlaceholder(alignedTime, height));
      }

      onProgress?.({
        level: 'L2',
        percent: ((i + 1) / frameCount) * 100,
        message: `Generating navigation: ${i + 1}/${frameCount}`,
      });
    }

    return {
      level: 'L2',
      framesPerSecond: 1 / L2_INTERVAL_SECONDS,
      frames,
      startTime,
      endTime,
      isComplete: true,
    };
  }

  /**
   * Generate L3 detail thumbnails for viewport (on-demand)
   */
  async generateL3ForViewport(
    viewport: ThumbnailViewport
  ): Promise<LevelThumbnailData> {
    if (!this._videoPath) {
      throw new Error('Generator not initialized');
    }

    const { startTime, endTime, height } = viewport;
    const duration = endTime - startTime;

    // Only generate L3 if viewport is small enough (< 30 seconds)
    if (duration > 30) {
      return this.generateL2Range(startTime, endTime, height);
    }

    const frameCount = Math.ceil(duration / L3_INTERVAL_SECONDS);
    const frames: ThumbnailFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      const targetTime = startTime + i * L3_INTERVAL_SECONDS;
      const alignedTime = this._findNearestKeyframe(targetTime);

      // Check cache
      const cached = this._l3Cache.get(alignedTime);
      if (cached) {
        frames.push(cached);
        continue;
      }

      try {
        const dataUrl = await this._generateThumbnail(alignedTime, height);
        const frame: ThumbnailFrame = { time: alignedTime, dataUrl };
        frames.push(frame);

        // Cache with LRU eviction
        this._cacheFrame(this._l3Cache, alignedTime, frame);
      } catch {
        frames.push(this._createPlaceholder(alignedTime, height));
      }
    }

    return {
      level: 'L3',
      framesPerSecond: 1 / L3_INTERVAL_SECONDS,
      frames,
      startTime,
      endTime,
      isComplete: true,
    };
  }

  /**
   * Get thumbnails for a viewport, automatically selecting appropriate level
   */
  async getThumbnailsForViewport(
    viewport: ThumbnailViewport
  ): Promise<LevelThumbnailData> {
    const { startTime, endTime, pixelsPerSecond, height } = viewport;
    const duration = endTime - startTime;

    // Determine appropriate level based on zoom
    // If we have more than 50 pixels per second, use L3
    // If we have more than 10 pixels per second, use L2
    // Otherwise use L1

    if (pixelsPerSecond >= 50 && duration <= 30) {
      return this.generateL3ForViewport(viewport);
    } else if (pixelsPerSecond >= 10) {
      return this.generateL2Range(startTime, endTime, height);
    } else {
      // Use L1 if available, otherwise generate it
      if (!this._l1Data) {
        await this.generateL1(height);
      }
      return this._l1Data!;
    }
  }

  /**
   * Get current pyramid data structure
   */
  getPyramidData(): PyramidThumbnailData {
    return this._buildPyramidData();
  }

  /**
   * Clear cached data
   */
  clearCache(): void {
    this._l2Cache.clear();
    this._l3Cache.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._disposed = true;
    this._l1Data = null;
    this._l2Cache.clear();
    this._l3Cache.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Build pyramid data structure
   */
  private _buildPyramidData(): PyramidThumbnailData {
    return {
      duration: this._duration,
      width: this._width,
      height: this._height,
      l1: this._l1Data,
      l2: null, // L2 is loaded progressively
      l3: null, // L3 is loaded on-demand
    };
  }

  /**
   * Find nearest keyframe to target time
   */
  private _findNearestKeyframe(targetTime: number): number {
    if (this._keyframeTimes.length === 0) {
      return targetTime;
    }

    let nearest = this._keyframeTimes[0]!;
    let nearestDist = Math.abs(nearest - targetTime);

    for (const kf of this._keyframeTimes) {
      const dist = Math.abs(kf - targetTime);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = kf;
      }
    }

    return nearest;
  }

  /**
   * Generate a single thumbnail
   */
  private async _generateThumbnail(time: number, height: number): Promise<string> {
    const scale = this._height > 0 ? height / this._height : 1;

    const imageBitmap = await getMediaProxy().getVideoFrame(this._videoPath, time, {
      scale,
      useThumbnailMode: true,
    });

    if (!imageBitmap) {
      throw new Error(`Failed to get frame at ${time}s`);
    }

    try {
      // Convert to dataUrl
      const aspectRatio = this._width / this._height || 16 / 9;
      const width = Math.round(height * aspectRatio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to create canvas context');
      }

      ctx.drawImage(imageBitmap, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
    } finally {
      imageBitmap.close();
    }
  }

  /**
   * Create a placeholder thumbnail
   */
  private _createPlaceholder(time: number, height: number): ThumbnailFrame {
    const aspectRatio = this._width / this._height || 16 / 9;
    const width = Math.round(height * aspectRatio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#374151';
      ctx.fillRect(0, 0, width, height);

      // Draw play icon
      ctx.fillStyle = '#6B7280';
      const iconSize = Math.min(width, height) * 0.3;
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.beginPath();
      ctx.moveTo(centerX - iconSize / 3, centerY - iconSize / 2);
      ctx.lineTo(centerX + iconSize / 2, centerY);
      ctx.lineTo(centerX - iconSize / 3, centerY + iconSize / 2);
      ctx.closePath();
      ctx.fill();
    }

    return {
      time,
      dataUrl: canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY),
      isPlaceholder: true,
    };
  }

  /**
   * Cache a frame with LRU eviction
   */
  private _cacheFrame(
    cache: Map<number, ThumbnailFrame>,
    time: number,
    frame: ThumbnailFrame
  ): void {
    // Evict oldest if at capacity
    if (cache.size >= MAX_CACHED_FRAMES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
    cache.set(time, frame);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a PyramidThumbnailGenerator instance
 */
export function createPyramidThumbnailGenerator(): PyramidThumbnailGenerator {
  return new PyramidThumbnailGenerator();
}

// =============================================================================
// Singleton Cache
// =============================================================================

const generatorCache = new Map<string, PyramidThumbnailGenerator>();

/**
 * Get or create a PyramidThumbnailGenerator for a video
 */
export async function getPyramidThumbnailGenerator(
  videoPath: string
): Promise<PyramidThumbnailGenerator> {
  let generator = generatorCache.get(videoPath);

  if (!generator) {
    generator = createPyramidThumbnailGenerator();
    await generator.initialize(videoPath);
    generatorCache.set(videoPath, generator);
  }

  return generator;
}

/**
 * Clear all cached generators
 */
export function clearPyramidThumbnailCache(): void {
  for (const generator of generatorCache.values()) {
    generator.dispose();
  }
  generatorCache.clear();
}

/**
 * Clear cached generator for a specific video
 */
export function clearPyramidThumbnailCacheForVideo(videoPath: string): void {
  const generator = generatorCache.get(videoPath);
  if (generator) {
    generator.dispose();
    generatorCache.delete(videoPath);
  }
}
