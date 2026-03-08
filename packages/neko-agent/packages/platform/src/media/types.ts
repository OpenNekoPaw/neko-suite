/**
 * Media Generation Types
 *
 * Core type definitions for the media generation service.
 */

import type { Model, Provider } from '../types/provider';

// =============================================================================
// Generation Types
// =============================================================================

/**
 * Supported media generation types
 */
export type MediaGenerationType =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'video-to-video'
  | 'text-to-audio'
  | 'text-to-music'
  | 'workflow';

/**
 * Media task status
 */
export type MediaTaskStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Media output type
 */
export type MediaOutputType = 'image' | 'video' | 'audio';

// =============================================================================
// Request Interfaces
// =============================================================================

/**
 * Base request for all media generation
 */
export interface MediaGenerationRequestBase {
  /** Text prompt for generation */
  prompt: string;
  /** Negative prompt (what to avoid) */
  negativePrompt?: string;
  /** Specific provider ID (optional, for routing) */
  providerId?: string;
  /** Specific model ID (optional, for routing) */
  modelId?: string;
  /** Routing preference */
  routingPreference?: RoutingPreference;
  /** Request metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Routing preference for provider selection
 */
export interface RoutingPreference {
  /** Optimization target */
  optimize?: 'cost' | 'speed' | 'quality';
  /** Allow fallback to other providers */
  allowFallback?: boolean;
  /** Excluded provider IDs */
  excludeProviders?: string[];
}

/**
 * Image generation request
 */
export interface ImageGenerationRequest extends MediaGenerationRequestBase {
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Aspect ratio (e.g., "16:9", "1:1") */
  aspectRatio?: string;
  /** Number of images to generate */
  count?: number;
  /** Reference image URL for image-to-image */
  referenceImageUrl?: string;
  /** Image quality setting */
  quality?: 'standard' | 'hd';
  /** Style preset */
  style?: string;
}

/**
 * Video generation request
 */
export interface VideoGenerationRequest extends MediaGenerationRequestBase {
  /** Video duration in seconds */
  duration?: number;
  /** Video resolution (e.g., "1920x1080") */
  resolution?: string;
  /** Frame rate */
  fps?: number;
  /** Aspect ratio (e.g., "16:9") */
  aspectRatio?: string;
  /** Reference image URL for image-to-video */
  referenceImageUrl?: string;
  /** Reference video URL for video-to-video */
  referenceVideoUrl?: string;
  /** Motion strength (0-1) */
  motionStrength?: number;
}

/**
 * Audio generation request
 */
export interface AudioGenerationRequest extends MediaGenerationRequestBase {
  /** Audio duration in seconds */
  duration?: number;
  /** Whether this is music generation */
  isMusic?: boolean;
  /** Music genre (for music generation) */
  genre?: string;
  /** Audio format */
  format?: 'mp3' | 'wav' | 'flac';
}

// =============================================================================
// Output Interfaces
// =============================================================================

/**
 * Media output result
 */
export interface MediaOutput {
  /** Output type */
  type: MediaOutputType;
  /** Output URL */
  url: string;
  /** Width in pixels (for image/video) */
  width?: number;
  /** Height in pixels (for image/video) */
  height?: number;
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Thumbnail URL */
  thumbnailUrl?: string;
}

// =============================================================================
// Adapter Interfaces
// =============================================================================

/**
 * Result from media adapter operations
 */
export interface MediaAdapterResult {
  /** External task ID from the platform */
  externalTaskId?: string;
  /** Current task status */
  status: MediaTaskStatus;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Generated outputs */
  outputs?: MediaOutput[];
  /** Error information */
  error?: MediaAdapterError;
  /** Estimated completion time */
  estimatedCompletionTime?: Date;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error from media adapter
 */
export interface MediaAdapterError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether this error is retryable */
  retryable: boolean;
  /** Retry delay in milliseconds (if retryable) */
  retryAfterMs?: number;
}

/**
 * Media adapter interface
 */
export interface MediaAdapter {
  /** Adapter type identifier */
  readonly type: string;

  /** Supported generation types */
  getSupportedTypes(): MediaGenerationType[];

  /** Check if adapter supports the given generation type */
  supportsType(type: MediaGenerationType): boolean;

  /**
   * Generate image
   */
  generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult>;

  /**
   * Generate video
   */
  generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult>;

  /**
   * Generate audio
   */
  generateAudio(
    request: AudioGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult>;

  /**
   * Get task status (for async polling)
   */
  getTaskStatus(
    externalTaskId: string,
    provider: Provider
  ): Promise<MediaAdapterResult>;

  /**
   * Cancel a running task
   */
  cancelTask(externalTaskId: string, provider: Provider): Promise<void>;
}

// =============================================================================
// Routing Interfaces
// =============================================================================

/**
 * Routing result
 */
export interface MediaRoutingResult {
  /** Selected provider ID */
  providerId: string;
  /** Selected model ID */
  modelId: string;
  /** Routing score */
  score: number;
  /** Reason for selection */
  reason: string;
}

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * Media generation task
 */
export interface MediaTask {
  /** Task ID */
  id: string;
  /** Generation type */
  type: MediaGenerationType;
  /** Current status */
  status: MediaTaskStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Selected provider ID */
  providerId: string;
  /** Selected model ID */
  modelId: string;
  /** External task ID from platform */
  externalTaskId?: string;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
  /** Completed timestamp */
  completedAt?: Date;
  /** Generated outputs */
  outputs?: MediaOutput[];
  /** Error if failed */
  error?: MediaAdapterError;
  /** Original request */
  request: MediaGenerationRequestBase;
}

/**
 * Progress callback
 */
export type MediaProgressCallback = (task: MediaTask) => void;
