/**
 * Export Worker Types
 *
 * Message protocol for video export in Web Worker.
 * Supports zero-copy VideoFrame transfer via Transferable.
 */

import type { ExportFormat, QualityPreset, ExportProgress } from '../../utils/export/IExportEngine';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Export Worker configuration
 */
export interface ExportWorkerConfig {
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Frame rate */
  fps: number;
  /** Total frames to export */
  totalFrames: number;
  /** Output format */
  format: ExportFormat;
  /** Quality preset */
  quality: QualityPreset;
  /** Video bitrate (bps) */
  videoBitrate?: number;
  /** Audio bitrate (bps) */
  audioBitrate?: number;
  /** Include audio in export */
  includeAudio?: boolean;
  /** Maximum frames in flight (queue size) */
  maxInflightFrames?: number;
}

/**
 * Serialized project data for Worker
 * Contains all information needed to render the timeline
 */
export interface SerializedProjectData {
  /** Project duration in seconds */
  duration: number;
  /** Tracks with elements */
  tracks: SerializedTrack[];
}

/**
 * Serialized track data
 */
export interface SerializedTrack {
  /** Track ID */
  id: string;
  /** Track type */
  type: 'video' | 'audio';
  /** Track elements */
  elements: SerializedElement[];
  /** Is track hidden */
  hidden?: boolean;
  /** Is track muted */
  muted?: boolean;
}

/**
 * Serialized color correction parameters
 * Matches WebGPUCompositor's ColorCorrectionUniforms
 */
export interface SerializedColorCorrection {
  /** Exposure in EV stops (-5 to 5) */
  exposure?: number;
  /** Contrast (-100 to 100) */
  contrast?: number;
  /** Saturation (-100 to 100) */
  saturation?: number;
  /** Color temperature (-100 to 100) */
  temperature?: number;
  /** Tint (-100 to 100) */
  tint?: number;
  /** Vibrance (-100 to 100) */
  vibrance?: number;
  /** Highlights (-100 to 100) */
  highlights?: number;
  /** Shadows (-100 to 100) */
  shadows?: number;
  /** Whites (-100 to 100) */
  whites?: number;
  /** Blacks (-100 to 100) */
  blacks?: number;
}

/**
 * Serialized element data
 */
export interface SerializedElement {
  /** Element ID */
  id: string;
  /** Element type */
  type: 'video' | 'audio' | 'image' | 'text';
  /** Media source URL (resolved, accessible from Worker) */
  sourceUrl: string;
  /** Start time on timeline (seconds) */
  startTime: number;
  /** Duration (seconds) */
  duration: number;
  /** Trim start (seconds) */
  trimStart?: number;
  /** Trim end (seconds) */
  trimEnd?: number;
  /** Transform properties */
  transform: SerializedTransform;
  /** Color correction parameters */
  colorCorrection?: SerializedColorCorrection;
  /** Is element hidden */
  hidden?: boolean;
  /** Is element muted */
  muted?: boolean;
  /** Volume (0-1) for audio */
  volume?: number;
  /**
   * Preloaded media data (first 1MB) for Worker initialization.
   * This avoids Worker fetch issues with VSCode resource URLs.
   * Transferred via postMessage for zero-copy.
   */
  preloadedData?: ArrayBuffer;
}

/**
 * Serialized transform data
 */
export interface SerializedTransform {
  /** X position (0-1, relative to canvas) */
  x: number;
  /** Y position (0-1, relative to canvas) */
  y: number;
  /** Width (0-1, relative to canvas) */
  width: number;
  /** Height (0-1, relative to canvas) */
  height: number;
  /** Rotation in degrees */
  rotation?: number;
  /** Opacity (0-1) */
  opacity?: number;
  /** Flip horizontally */
  flipX?: boolean;
  /** Flip vertically */
  flipY?: boolean;
}

/**
 * Audio track info for mixing
 */
export interface AudioTrackData {
  /** Audio buffer (interleaved Float32Array) */
  buffer: Float32Array;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Timeline start position (seconds) */
  timelineStart: number;
  /** Duration (seconds) */
  duration: number;
  /** Volume multiplier (0-1) */
  volume: number;
}

// =============================================================================
// Request Types (Main Thread → Worker)
// =============================================================================

/**
 * Initialize export worker with OffscreenCanvas and project data
 * Worker will handle demux, decode, render, encode, mux internally
 */
export interface InitFullPipelineRequest {
  type: 'init-full-pipeline';
  canvas: OffscreenCanvas;
  config: ExportWorkerConfig;
  project: SerializedProjectData;
}

/**
 * Start export after initialization
 */
export interface StartExportRequest {
  type: 'start-export';
}

/**
 * Initialize export worker with OffscreenCanvas (legacy mode)
 * Main thread handles demux/decode, Worker handles render/encode
 */
export interface InitRequest {
  type: 'init';
  canvas: OffscreenCanvas;
  config: ExportWorkerConfig;
}

/**
 * Submit a video frame for rendering and encoding (legacy mode)
 */
export interface SubmitFrameRequest {
  type: 'submit-frame';
  frameIndex: number;
  timeInSeconds: number;
  /** VideoFrame from main thread decoder (transferred) */
  videoFrames: Array<{
    elementId: string;
    frame: VideoFrame;
    transform: FrameTransform;
  }>;
}

/**
 * Frame transform for compositing
 */
export interface FrameTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Submit audio data for encoding
 */
export interface SubmitAudioRequest {
  type: 'submit-audio';
  /** Mixed audio buffer (interleaved stereo Float32Array) */
  audioBuffer: Float32Array;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  channels: number;
}

/**
 * Finalize export and get result
 */
export interface FinalizeRequest {
  type: 'finalize';
}

/**
 * Cancel export
 */
export interface CancelRequest {
  type: 'cancel';
}

/**
 * Terminate worker
 */
export interface TerminateRequest {
  type: 'terminate';
}

/**
 * All request types
 */
export type ExportWorkerRequest =
  | InitFullPipelineRequest
  | StartExportRequest
  | InitRequest
  | SubmitFrameRequest
  | SubmitAudioRequest
  | FinalizeRequest
  | CancelRequest
  | TerminateRequest
  | FetchProxyResponse;

// =============================================================================
// Response Types (Worker → Main Thread)
// =============================================================================

/**
 * Worker ready response
 */
export interface ReadyResponse {
  type: 'ready';
}

/**
 * Initialization complete
 */
export interface InitDoneResponse {
  type: 'init:done';
  success: boolean;
  error?: string;
}

/**
 * Frame encoded response
 */
export interface FrameEncodedResponse {
  type: 'frame:encoded';
  frameIndex: number;
}

/**
 * Audio encoded response
 */
export interface AudioEncodedResponse {
  type: 'audio:encoded';
}

/**
 * Progress update
 */
export interface ProgressResponse {
  type: 'progress';
  progress: ExportProgress;
}

/**
 * Export complete with result
 */
export interface CompleteResponse {
  type: 'complete';
  /** Output MP4/WebM data */
  outputBuffer: ArrayBuffer;
  /** File size in bytes */
  fileSize: number;
  /** Total export time in ms */
  totalTime: number;
  /** Average FPS during export */
  averageFps: number;
}

/**
 * Export cancelled
 */
export interface CancelledResponse {
  type: 'cancelled';
}

/**
 * Error response
 */
export interface ErrorResponse {
  type: 'error';
  error: string;
  stage?: string;
}

/**
 * Fetch request from Worker to Main Thread (proxy fetch)
 * Worker cannot directly fetch VSCode resource URLs, so it requests main thread to fetch
 */
export interface FetchProxyRequest {
  type: 'fetch-proxy';
  /** Unique request ID for matching response */
  requestId: string;
  /** URL to fetch */
  url: string;
  /** Range header value (e.g., 'bytes=0-1048575') */
  range?: string;
}

/**
 * Fetch response from Main Thread to Worker
 */
export interface FetchProxyResponse {
  type: 'fetch-proxy-response';
  /** Request ID to match with request */
  requestId: string;
  /** Success flag */
  success: boolean;
  /** Response data (transferred) */
  data?: ArrayBuffer;
  /** Error message if failed */
  error?: string;
}

/**
 * All response types
 */
export type ExportWorkerResponse =
  | ReadyResponse
  | InitDoneResponse
  | FrameEncodedResponse
  | AudioEncodedResponse
  | ProgressResponse
  | CompleteResponse
  | CancelledResponse
  | ErrorResponse
  | FetchProxyRequest;

// =============================================================================
// Client Types
// =============================================================================

/**
 * Export Worker client configuration
 */
export interface ExportWorkerClientConfig {
  /** Worker script URL (optional, uses default if not provided) */
  workerUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Pending request entry
 */
export interface PendingExportRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout?: ReturnType<typeof setTimeout>;
}
