/**
 * Media Preprocessor
 *
 * Prepares image and video files for LLM vision input:
 * - Images: transform according to platform vision policy
 * - Videos: extract keyframes, resize, return as frame array
 *
 * Uses neko-engine (via EngineClient) for video processing and sharp for images.
 * Degrades gracefully when engine is unavailable.
 */

import * as fs from 'fs';
import { getLogger } from '../../base';
import type { EngineClient } from '@neko/neko-client/EngineClient';
import {
  VisionPreprocessor,
  type VisionMediaProcessOptions,
  type VisionProcessedMedia,
  type VisionVideoProcessor,
} from '@neko/platform/media';
import { createSharpVisionImageProcessor } from '../../services/visionImageProcessor';
import { resolveDocumentPath } from '../../services/documentPathResolver';

const logger = getLogger('MediaPreprocessor');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessedMedia = VisionProcessedMedia;
export type MediaProcessOptions = VisionMediaProcessOptions;

// ─── Implementation ───────────────────────────────────────────────────────────

export class MediaPreprocessor {
  private readonly preprocessor: VisionPreprocessor;

  constructor(engineClient: EngineClient | null) {
    this.preprocessor = new VisionPreprocessor({
      readFile: (filePath) => fs.promises.readFile(filePath),
      imageProcessor: createSharpVisionImageProcessor(),
      videoProcessor: createEngineVideoProcessor(engineClient),
      logger,
    });
  }

  /**
   * Auto-detect file type and preprocess for LLM vision.
   * Returns processed images or 'unsupported' if not a media file.
   */
  async process(filePath: string, opts?: MediaProcessOptions): Promise<ProcessedMedia> {
    return this.preprocessor.process(await resolveDocumentPath(filePath), opts);
  }

  /**
   * Process an image file: resize if exceeding vision thresholds.
   */
  async processImage(filePath: string): Promise<ProcessedMedia> {
    return this.preprocessor.processImage(await resolveDocumentPath(filePath));
  }

  /**
   * Process a video file: extract keyframes, resize, return as frame array.
   * Requires engine to be available.
   */
  async processVideo(filePath: string, opts?: MediaProcessOptions): Promise<ProcessedMedia> {
    return this.preprocessor.processVideo(await resolveDocumentPath(filePath), opts);
  }
}

function createEngineVideoProcessor(
  engineClient: EngineClient | null,
): VisionVideoProcessor | null {
  if (!engineClient) {
    return null;
  }

  return {
    probe: (filePath) => engineClient.probe('videos', filePath),
    getKeyframes: (filePath) => engineClient.getKeyframes(filePath),
    extractFrame: async (filePath, time, options) => {
      const frame = await engineClient.extractFrame(filePath, time, options);
      return frame ? new Uint8Array(frame) : null;
    },
  };
}
