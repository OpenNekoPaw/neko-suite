/**
 * Video Decoder Worker Types
 *
 * Message protocol for video decoding in Web Worker.
 * Supports zero-copy VideoFrame transfer via Transferable.
 */

// =============================================================================
// Message Types
// =============================================================================

/**
 * Request from main thread to worker
 */
export type VideoWorkerRequest =
  | { type: 'init'; id: string; config: VideoDecoderWorkerConfig }
  | { type: 'open'; id: string }
  | { type: 'close'; id: string }
  | { type: 'getFrame'; id: string; time: number }
  | { type: 'preload'; id: string; startTime: number; endTime: number }
  | { type: 'clearBuffer'; id: string }
  | { type: 'terminate' };

/**
 * Response from worker to main thread
 */
export type VideoWorkerResponse =
  | { type: 'init:done'; id: string }
  | { type: 'open:done'; id: string; mediaInfo: VideoMediaInfo }
  | { type: 'close:done'; id: string }
  | { type: 'getFrame:done'; id: string; frame: VideoFrame | null; timestamp: number }
  | { type: 'preload:done'; id: string; frameCount: number }
  | { type: 'clearBuffer:done'; id: string }
  | { type: 'error'; id: string; error: string };

/**
 * Worker configuration
 */
export interface VideoDecoderWorkerConfig {
  /** Video source URL */
  source: string;
  /** Maximum frames to buffer (default: 30) */
  maxBufferSize?: number;
  /** Preload window in seconds (default: 2) */
  preloadWindow?: number;
}

/**
 * Video media info (subset for worker communication)
 */
export interface VideoMediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

/**
 * Pending request entry
 */
export interface PendingVideoRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Worker client configuration
 */
export interface VideoWorkerClientConfig {
  /** Worker script URL (optional) */
  workerUrl?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}
