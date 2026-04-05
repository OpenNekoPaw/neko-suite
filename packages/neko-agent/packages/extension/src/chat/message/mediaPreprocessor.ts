/**
 * Media Preprocessor
 *
 * Prepares image and video files for LLM vision input:
 * - Images: auto-resize if exceeding Claude's optimal dimensions
 * - Videos: extract keyframes, resize, return as frame array
 *
 * Uses neko-engine (via EngineClient) for video processing and sharp for images.
 * Degrades gracefully when engine is unavailable.
 */

import * as fs from 'fs';
import { getLogger } from '../../base';
import { getMimeType } from '@neko/shared';
import type { EngineClient } from '@neko/neko-client';

const logger = getLogger('MediaPreprocessor');

// ─── Constants ────────────────────────────────────────────────────────────────

/** Claude's optimal long-edge for vision inputs */
const VISION_MAX_LONG_EDGE = 1568;
/** Safety margin below the 5MB API limit */
const VISION_MAX_BYTES = 4 * 1024 * 1024;
/** Default number of frames to sample from a video */
const VIDEO_SAMPLE_FRAMES = 4;
/** Max keyframes to send (prevents token overload) */
const VIDEO_KEYFRAME_MAX = 8;
/** Skip first/last N% of video to avoid black frames */
const VIDEO_EDGE_SKIP = 0.05;

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);
const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/webm',
  'video/x-m4v',
  'video/mpeg',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessedMedia {
  type: 'image' | 'video-frames' | 'unsupported';
  images: Array<{ media_type: string; data: string }>;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    frameCount?: number;
  };
}

export interface MediaProcessOptions {
  /** Video segment to sample from (in/out seconds) */
  segment?: { in: number; out: number };
  /** Max frames to extract from video (default VIDEO_SAMPLE_FRAMES) */
  maxFrames?: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class MediaPreprocessor {
  constructor(private readonly engineClient: EngineClient | null) {}

  /**
   * Auto-detect file type and preprocess for LLM vision.
   * Returns processed images or 'unsupported' if not a media file.
   */
  async process(filePath: string, opts?: MediaProcessOptions): Promise<ProcessedMedia> {
    const mime = getMimeType(filePath);
    if (IMAGE_MIMES.has(mime)) return this.processImage(filePath);
    if (VIDEO_MIMES.has(mime)) return this.processVideo(filePath, opts);
    return { type: 'unsupported', images: [] };
  }

  /**
   * Process an image file: resize if exceeding vision thresholds.
   */
  async processImage(filePath: string): Promise<ProcessedMedia> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buffer).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const longEdge = Math.max(w, h);

      let outputBuf: Buffer;
      if (longEdge > VISION_MAX_LONG_EDGE || buffer.length > VISION_MAX_BYTES) {
        outputBuf = await sharp(buffer)
          .resize({
            width: VISION_MAX_LONG_EDGE,
            height: VISION_MAX_LONG_EDGE,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer();
        logger.info(`Resized image: ${w}x${h} (${buffer.length}B) → ${outputBuf.length}B`);
      } else {
        // Convert to JPEG for consistent format
        outputBuf = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
      }

      return {
        type: 'image',
        images: [{ media_type: 'image/jpeg', data: outputBuf.toString('base64') }],
        metadata: { width: w, height: h },
      };
    } catch (err) {
      logger.error('Failed to process image', { filePath, error: err });
      return { type: 'unsupported', images: [] };
    }
  }

  /**
   * Process a video file: extract keyframes, resize, return as frame array.
   * Requires engine to be available.
   */
  async processVideo(filePath: string, opts?: MediaProcessOptions): Promise<ProcessedMedia> {
    if (!this.engineClient) {
      logger.warn('Engine unavailable, cannot extract video frames');
      return { type: 'unsupported', images: [], metadata: { duration: 0 } };
    }

    try {
      // 1. Probe video metadata
      const probe = await this.engineClient.probe('videos', filePath);
      const duration = probe.duration;
      if (duration <= 0) {
        return { type: 'unsupported', images: [], metadata: { duration: 0 } };
      }

      // 2. Determine time range
      const rangeIn = opts?.segment?.in ?? duration * VIDEO_EDGE_SKIP;
      const rangeOut = opts?.segment?.out ?? duration * (1 - VIDEO_EDGE_SKIP);
      const rangeLen = rangeOut - rangeIn;

      // 3. Get sample timestamps
      const maxFrames = opts?.maxFrames ?? VIDEO_SAMPLE_FRAMES;
      const timestamps = await this.getSampleTimestamps(filePath, rangeIn, rangeOut, maxFrames);

      // 4. Calculate resize dimensions
      const { width: resizeW, height: resizeH } = this.calcResizeDims(probe.width, probe.height);

      // 5. Extract frames
      const images: Array<{ media_type: string; data: string }> = [];
      for (const time of timestamps) {
        const frameBuf = await this.engineClient.extractFrame(filePath, time, {
          quality: 85,
          width: resizeW,
          height: resizeH,
        });
        if (frameBuf) {
          const b64 = Buffer.from(frameBuf).toString('base64');
          images.push({ media_type: 'image/jpeg', data: b64 });
        }
      }

      logger.info(
        `Extracted ${images.length} frames from video (${duration.toFixed(1)}s, ` +
          `range ${rangeIn.toFixed(1)}-${rangeOut.toFixed(1)}s)`,
      );

      return {
        type: 'video-frames',
        images,
        metadata: {
          duration,
          width: probe.width,
          height: probe.height,
          frameCount: images.length,
        },
      };
    } catch (err) {
      logger.error('Failed to process video', { filePath, error: err });
      return { type: 'unsupported', images: [] };
    }
  }

  /**
   * Get sample timestamps for frame extraction.
   * Tries keyframes first, falls back to uniform sampling.
   */
  private async getSampleTimestamps(
    filePath: string,
    rangeIn: number,
    rangeOut: number,
    maxFrames: number,
  ): Promise<number[]> {
    if (!this.engineClient) return this.uniformSample(rangeIn, rangeOut, maxFrames);

    try {
      const keyframes = await this.engineClient.getKeyframes(filePath);
      const inRange = keyframes.filter((t) => t >= rangeIn && t <= rangeOut);

      if (inRange.length > 0) {
        // Use keyframes, subsample if too many
        if (inRange.length <= maxFrames) return inRange;
        const step = Math.ceil(inRange.length / maxFrames);
        return inRange.filter((_, i) => i % step === 0).slice(0, maxFrames);
      }
    } catch {
      // Keyframe extraction failed, fall through to uniform
    }

    return this.uniformSample(rangeIn, rangeOut, maxFrames);
  }

  private uniformSample(rangeIn: number, rangeOut: number, count: number): number[] {
    const rangeLen = rangeOut - rangeIn;
    if (rangeLen <= 0 || count <= 0) return [];
    if (count === 1) return [rangeIn + rangeLen / 2];
    const step = rangeLen / (count - 1);
    return Array.from({ length: count }, (_, i) => rangeIn + i * step);
  }

  private calcResizeDims(
    width: number,
    height: number,
  ): { width: number | undefined; height: number | undefined } {
    const longEdge = Math.max(width, height);
    if (longEdge <= VISION_MAX_LONG_EDGE) return { width: undefined, height: undefined };
    if (width >= height) {
      return { width: VISION_MAX_LONG_EDGE, height: undefined };
    }
    return { width: undefined, height: VISION_MAX_LONG_EDGE };
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Check if a MIME type is a supported image format */
export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime);
}

/** Check if a MIME type is a supported video format */
export function isVideoMime(mime: string): boolean {
  return VIDEO_MIMES.has(mime);
}
