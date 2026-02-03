/**
 * Multi-Track Export Worker Protocol
 *
 * Message types for multi-track video/audio export in Web Worker.
 * Supports complete pipeline: demux → decode → composite → encode → mux
 */

import type { ExportFormat, QualityPreset } from '../../../utils/export/IExportEngine';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Multi-track export configuration
 */
export interface MultiTrackExportConfig {
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Frame rate */
  fps: number;
  /** Total frames to export */
  totalFrames: number;
  /** Total duration in seconds */
  duration: number;
  /** Output format */
  format: ExportFormat;
  /** Quality preset */
  quality: QualityPreset;
  /** Video codec */
  videoCodec: 'h264' | 'vp9';
  /** Video bitrate (bps) */
  videoBitrate: number;
  /** Audio codec */
  audioCodec: 'aac' | 'opus';
  /** Audio bitrate (bps) */
  audioBitrate: number;
  /** Audio sample rate */
  sampleRate: number;
  /** Audio channels */
  channels: number;
  /** Include audio in export */
  includeAudio: boolean;
  /** Maximum parallel decoders */
  maxDecoders: number;
  /** Maximum frames in flight (backpressure) */
  maxInflightFrames: number;
}

// =============================================================================
// Serialized Project Data
// =============================================================================

/**
 * Serialized project data for Worker
 */
export interface SerializedProjectData {
  /** All tracks */
  tracks: SerializedTrack[];
  /** Project duration in seconds */
  duration: number;
  /** Project width */
  width: number;
  /** Project height */
  height: number;
}

/**
 * Serialized track
 */
export interface SerializedTrack {
  /** Track ID */
  id: string;
  /** Track type */
  type: 'video' | 'audio';
  /** Track index (z-order for video, mix order for audio) */
  index: number;
  /** Elements in this track */
  elements: SerializedElement[];
}

/**
 * Serialized element
 */
export interface SerializedElement {
  /** Element ID */
  id: string;
  /** Element type */
  type: 'media' | 'text' | 'shape' | 'image';
  /** Media URL (for media elements) */
  mediaUrl?: string;
  /** Timeline start position (seconds) */
  startTime: number;
  /** Duration on timeline (seconds) */
  duration: number;
  /** Media internal offset (seconds) */
  mediaOffset: number;
  /** Media internal duration (seconds) */
  mediaDuration: number;
  /** Transform parameters */
  transform: SerializedTransform;
  /** Audio parameters (for media with audio) */
  audio?: SerializedAudioParams;
  /** Whether element has video track */
  hasVideo?: boolean;
  /** Whether element has audio track */
  hasAudio?: boolean;
}

/**
 * Serialized transform
 */
export interface SerializedTransform {
  /** X position (normalized 0-1) */
  x: number;
  /** Y position (normalized 0-1) */
  y: number;
  /** Width (normalized 0-1) */
  width: number;
  /** Height (normalized 0-1) */
  height: number;
  /** Rotation in degrees */
  rotation: number;
  /** Opacity (0-1) */
  opacity: number;
  /** Horizontal flip */
  flipX: boolean;
  /** Vertical flip */
  flipY: boolean;
  /** Scale X */
  scaleX: number;
  /** Scale Y */
  scaleY: number;
}

/**
 * Serialized audio parameters
 */
export interface SerializedAudioParams {
  /** Volume (0-1) */
  volume: number;
  /** Muted */
  muted: boolean;
  /** Fade in duration (seconds) */
  fadeIn: number;
  /** Fade out duration (seconds) */
  fadeOut: number;
}

// =============================================================================
// Request Types (Main Thread → Worker)
// =============================================================================

/**
 * Initialize multi-track export
 */
export interface InitMultiTrackRequest {
  type: 'init-multitrack';
  /** OffscreenCanvas for rendering (Transferable) */
  canvas: OffscreenCanvas;
  /** Export configuration */
  config: MultiTrackExportConfig;
  /** Serialized project data */
  project: SerializedProjectData;
}

/**
 * Start export process
 */
export interface StartExportRequest {
  type: 'start-export';
}

/**
 * Pause export
 */
export interface PauseExportRequest {
  type: 'pause-export';
}

/**
 * Resume export
 */
export interface ResumeExportRequest {
  type: 'resume-export';
}

/**
 * Cancel export
 */
export interface CancelExportRequest {
  type: 'cancel-export';
}

/**
 * Terminate worker
 */
export interface TerminateWorkerRequest {
  type: 'terminate';
}

/**
 * All multi-track request types
 */
export type MultiTrackExportRequest =
  | InitMultiTrackRequest
  | StartExportRequest
  | PauseExportRequest
  | ResumeExportRequest
  | CancelExportRequest
  | TerminateWorkerRequest;

// =============================================================================
// Response Types (Worker → Main Thread)
// =============================================================================

/**
 * Worker capabilities
 */
export interface WorkerCapabilities {
  /** WebGPU available */
  webgpu: boolean;
  /** WebGL available */
  webgl: boolean;
  /** WebCodecs available */
  webcodecs: boolean;
  /** libav.js available */
  libav: boolean;
}

/**
 * Worker ready response
 */
export interface MultiTrackReadyResponse {
  type: 'ready';
  /** Worker capabilities */
  capabilities: WorkerCapabilities;
}

/**
 * Initialization complete
 */
export interface MultiTrackInitDoneResponse {
  type: 'init-done';
  success: boolean;
  error?: string;
  /** Detected media info */
  mediaInfo?: {
    videoTracks: number;
    audioTracks: number;
    totalDuration: number;
  };
}

/**
 * Export progress detail
 */
export interface ExportProgressDetail {
  /** Current stage */
  stage: 'initializing' | 'rendering' | 'encoding' | 'muxing' | 'finalizing';
  /** Current frame number */
  currentFrame: number;
  /** Total frames */
  totalFrames: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Elapsed time in ms */
  elapsedTime: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining: number;
  /** Current FPS */
  currentFps: number;
  /** Status message */
  message: string;
  /** Detailed stats */
  stats: ExportStats;
}

/**
 * Detailed export statistics
 */
export interface ExportStats {
  // ==========================================================================
  // Timing (all in milliseconds)
  // ==========================================================================

  /** Total demux time */
  demuxTime: number;
  /** Total decode time */
  decodeTime: number;
  /** Total render/composite time */
  renderTime: number;
  /** Total encode time */
  encodeTime: number;
  /** Total audio mix time */
  audioMixTime: number;
  /** Total mux time */
  muxTime: number;

  // ==========================================================================
  // Frame Statistics
  // ==========================================================================

  /** Average frame processing time (ms) */
  avgFrameTime: number;
  /** Maximum frame processing time (ms) */
  maxFrameTime: number;
  /** Minimum frame processing time (ms) */
  minFrameTime: number;
  /** Number of frames processed */
  framesProcessed: number;
  /** Number of keyframes encoded */
  keyframesEncoded: number;
  /** Number of frames dropped/skipped */
  framesDropped: number;

  // ==========================================================================
  // Pipeline Status
  // ==========================================================================

  /** Whether zero-copy mode is active */
  zeroCopy: boolean;
  /** Rendering backend (WebGPU) */
  backend: string;
  /** Video encoder queue depth */
  encoderQueueDepth: number;
  /** Frames currently in flight */
  framesInFlight: number;

  // ==========================================================================
  // Pool Statistics
  // ==========================================================================

  /** Number of active demuxers */
  activeDemuxers: number;
  /** Number of active decoders */
  activeDecoders: number;
  /** Demuxer cache hit rate (0-1) */
  demuxerCacheHitRate: number;
  /** Decoder cache hit rate (0-1) */
  decoderCacheHitRate: number;

  // ==========================================================================
  // Data Statistics
  // ==========================================================================

  /** Total video data encoded (bytes) */
  videoDataEncoded: number;
  /** Total audio data encoded (bytes) */
  audioDataEncoded: number;
  /** Estimated output file size (bytes) */
  estimatedFileSize: number;
}

/**
 * Progress update response
 */
export interface MultiTrackProgressResponse {
  type: 'progress';
  progress: ExportProgressDetail;
}

/**
 * Export complete response
 */
export interface MultiTrackCompleteResponse {
  type: 'complete';
  /** Output MP4 data (Transferable) */
  outputBuffer: ArrayBuffer;
  /** File size in bytes */
  fileSize: number;
  /** Total export time in ms */
  totalTime: number;
  /** Average FPS during export */
  averageFps: number;
  /** Final export statistics */
  finalStats: ExportFinalStats;
}

/**
 * Final export statistics (after completion)
 */
export interface ExportFinalStats {
  // ==========================================================================
  // Summary
  // ==========================================================================

  /** Total frames exported */
  totalFrames: number;
  /** Total duration exported (seconds) */
  totalDuration: number;
  /** Average export FPS */
  averageFps: number;
  /** Peak export FPS */
  peakFps: number;

  // ==========================================================================
  // Timing Breakdown (all in milliseconds)
  // ==========================================================================

  /** Total demux time */
  demuxTime: number;
  /** Total decode time */
  decodeTime: number;
  /** Total render time */
  renderTime: number;
  /** Total encode time */
  encodeTime: number;
  /** Total audio mix time */
  audioMixTime: number;
  /** Total mux time */
  muxTime: number;
  /** Total pipeline overhead */
  overheadTime: number;

  // ==========================================================================
  // Frame Statistics
  // ==========================================================================

  /** Average frame time (ms) */
  avgFrameTime: number;
  /** Maximum frame time (ms) */
  maxFrameTime: number;
  /** Minimum frame time (ms) */
  minFrameTime: number;
  /** Standard deviation of frame time (ms) */
  stdDevFrameTime: number;
  /** Number of keyframes */
  keyframeCount: number;
  /** Number of dropped frames */
  droppedFrameCount: number;

  // ==========================================================================
  // Data Statistics
  // ==========================================================================

  /** Total video data (bytes) */
  videoDataSize: number;
  /** Total audio data (bytes) */
  audioDataSize: number;
  /** Final file size (bytes) */
  finalFileSize: number;
  /** Video bitrate achieved (bps) */
  actualVideoBitrate: number;
  /** Audio bitrate achieved (bps) */
  actualAudioBitrate: number;
  /** Compression ratio */
  compressionRatio: number;

  // ==========================================================================
  // Pipeline Info
  // ==========================================================================

  /** Zero-copy mode used */
  zeroCopy: boolean;
  /** Rendering backend */
  backend: string;
  /** Video codec used */
  videoCodec: string;
  /** Audio codec used */
  audioCodec: string;
  /** Hardware acceleration used */
  hardwareAcceleration: boolean;
}

/**
 * Export error response
 */
export interface MultiTrackErrorResponse {
  type: 'error';
  /** Error message */
  error: string;
  /** Error stage */
  stage?: string;
  /** Whether error is recoverable */
  recoverable: boolean;
}

/**
 * Export cancelled response
 */
export interface MultiTrackCancelledResponse {
  type: 'cancelled';
  /** Number of frames processed before cancel */
  processedFrames: number;
}

/**
 * Export paused response
 */
export interface MultiTrackPausedResponse {
  type: 'paused';
  /** Current frame when paused */
  currentFrame: number;
}

/**
 * Export resumed response
 */
export interface MultiTrackResumedResponse {
  type: 'resumed';
}

/**
 * All multi-track response types
 */
export type MultiTrackExportResponse =
  | MultiTrackReadyResponse
  | MultiTrackInitDoneResponse
  | MultiTrackProgressResponse
  | MultiTrackCompleteResponse
  | MultiTrackErrorResponse
  | MultiTrackCancelledResponse
  | MultiTrackPausedResponse
  | MultiTrackResumedResponse;
