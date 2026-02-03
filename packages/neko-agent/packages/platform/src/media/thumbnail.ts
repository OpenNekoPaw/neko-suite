/**
 * Thumbnail Generator - Generate thumbnails for media files
 */

import type { ThumbnailOptions, MediaType } from '../types/media';

/**
 * Thumbnail result
 */
export interface ThumbnailResult {
  /** Thumbnail path or data URL */
  path: string;
  /** Width */
  width: number;
  /** Height */
  height: number;
  /** Format */
  format: 'jpeg' | 'png' | 'webp';
}

/**
 * Frame extractor interface (video only)
 */
export interface FrameExtractor {
  /**
   * Extract a frame from video at given timestamp
   */
  extractFrame(
    videoPath: string,
    timestamp: number,
    outputPath: string
  ): Promise<void>;
}

/**
 * Image processor interface
 */
export interface ImageProcessor {
  /**
   * Resize and convert image
   */
  resize(
    inputPath: string,
    outputPath: string,
    options: {
      width?: number;
      height?: number;
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
    }
  ): Promise<void>;

  /**
   * Get image dimensions
   */
  getDimensions(inputPath: string): Promise<{ width: number; height: number }>;
}

/**
 * Default thumbnail options
 */
const DEFAULT_OPTIONS: Required<ThumbnailOptions> = {
  width: 320,
  height: 180,
  timestamp: 0,
  format: 'jpeg',
  quality: 80,
};

/**
 * Thumbnail generator configuration
 */
export interface ThumbnailGeneratorConfig {
  /** Frame extractor for video files */
  frameExtractor?: FrameExtractor;
  /** Image processor for resizing */
  imageProcessor?: ImageProcessor;
  /** Temporary directory for intermediate files */
  tempDir?: string;
}

/**
 * Thumbnail generator
 */
export class ThumbnailGenerator {
  private config: ThumbnailGeneratorConfig;

  constructor(config: ThumbnailGeneratorConfig = {}) {
    this.config = config;
  }

  /**
   * Generate thumbnail for media file
   */
  async generate(
    sourcePath: string,
    destPath: string,
    mediaType: MediaType,
    options?: ThumbnailOptions
  ): Promise<ThumbnailResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    switch (mediaType) {
      case 'video':
        return this.generateVideoThumbnail(sourcePath, destPath, opts);
      case 'image':
        return this.generateImageThumbnail(sourcePath, destPath, opts);
      case 'audio':
        return this.generateAudioThumbnail(destPath, opts);
      default:
        throw new Error(`Unsupported media type for thumbnail: ${mediaType}`);
    }
  }

  /**
   * Generate video thumbnail
   */
  private async generateVideoThumbnail(
    sourcePath: string,
    destPath: string,
    options: Required<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    if (!this.config.frameExtractor) {
      throw new Error('Frame extractor not configured');
    }

    // Extract frame at timestamp
    const tempFramePath = this.config.tempDir
      ? `${this.config.tempDir}/frame_${Date.now()}.png`
      : destPath.replace(/\.[^.]+$/, '_temp.png');

    await this.config.frameExtractor.extractFrame(
      sourcePath,
      options.timestamp,
      tempFramePath
    );

    // Resize if image processor available
    if (this.config.imageProcessor) {
      await this.config.imageProcessor.resize(tempFramePath, destPath, {
        width: options.width,
        height: options.height,
        format: options.format,
        quality: options.quality,
      });

      return {
        path: destPath,
        width: options.width,
        height: options.height,
        format: options.format,
      };
    }

    // No resizing, just use extracted frame
    return {
      path: tempFramePath,
      width: options.width,
      height: options.height,
      format: 'png',
    };
  }

  /**
   * Generate image thumbnail
   */
  private async generateImageThumbnail(
    sourcePath: string,
    destPath: string,
    options: Required<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    if (!this.config.imageProcessor) {
      throw new Error('Image processor not configured');
    }

    await this.config.imageProcessor.resize(sourcePath, destPath, {
      width: options.width,
      height: options.height,
      format: options.format,
      quality: options.quality,
    });

    return {
      path: destPath,
      width: options.width,
      height: options.height,
      format: options.format,
    };
  }

  /**
   * Generate audio thumbnail (placeholder waveform)
   */
  private async generateAudioThumbnail(
    destPath: string,
    options: Required<ThumbnailOptions>
  ): Promise<ThumbnailResult> {
    // For audio, we generate a placeholder or waveform visualization
    // This is a stub - real implementation would generate waveform image

    return {
      path: destPath,
      width: options.width,
      height: options.height,
      format: options.format,
    };
  }

  /**
   * Check if thumbnail generation is supported for media type
   */
  supportsMediaType(mediaType: MediaType): boolean {
    switch (mediaType) {
      case 'video':
        return !!this.config.frameExtractor;
      case 'image':
        return !!this.config.imageProcessor;
      case 'audio':
        return true; // Placeholder always supported
      default:
        return false;
    }
  }
}

/**
 * Mock frame extractor for testing
 */
export class MockFrameExtractor implements FrameExtractor {
  private extractedFrames: Array<{ video: string; timestamp: number; output: string }> = [];

  async extractFrame(
    videoPath: string,
    timestamp: number,
    outputPath: string
  ): Promise<void> {
    this.extractedFrames.push({
      video: videoPath,
      timestamp,
      output: outputPath,
    });
  }

  getExtractedFrames() {
    return this.extractedFrames;
  }
}

/**
 * Mock image processor for testing
 */
export class MockImageProcessor implements ImageProcessor {
  private processedImages: Array<{
    input: string;
    output: string;
    options: Record<string, unknown>;
  }> = [];

  async resize(
    inputPath: string,
    outputPath: string,
    options: {
      width?: number;
      height?: number;
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
    }
  ): Promise<void> {
    this.processedImages.push({
      input: inputPath,
      output: outputPath,
      options,
    });
  }

  async getDimensions(_inputPath: string): Promise<{ width: number; height: number }> {
    return { width: 1920, height: 1080 };
  }

  getProcessedImages() {
    return this.processedImages;
  }
}
