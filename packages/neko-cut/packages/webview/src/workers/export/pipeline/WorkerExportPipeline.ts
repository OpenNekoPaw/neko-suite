/**
 * Worker Export Pipeline
 *
 * Coordinates video and audio pipelines for multi-track export.
 * Runs entirely in Web Worker to avoid blocking main thread.
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                   WorkerExportPipeline                       │
 * │                                                              │
 * │  ┌─────────────────┐         ┌─────────────────┐            │
 * │  │  VideoPipeline  │         │  AudioPipeline  │            │
 * │  │  (per frame)    │         │  (per chunk)    │            │
 * │  └────────┬────────┘         └────────┬────────┘            │
 * │           │                           │                      │
 * │           ▼                           ▼                      │
 * │  ┌─────────────────────────────────────────────┐            │
 * │  │              MP4 Muxer                       │            │
 * │  └─────────────────────────────────────────────┘            │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */

import type {
  MultiTrackExportConfig,
  SerializedProjectData,
  ExportProgressDetail,
} from '../protocol/messages';
import { FrameScheduler, type FrameSlot } from './FrameScheduler';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// =============================================================================
// Types
// =============================================================================

export interface ExportResult {
  /** Output buffer */
  outputBuffer: ArrayBuffer;
  /** File size in bytes */
  fileSize: number;
  /** Total time in ms */
  totalTime: number;
  /** Average FPS */
  averageFps: number;
}

export interface PipelineStats {
  // Timing (ms)
  demuxTime: number;
  decodeTime: number;
  renderTime: number;
  encodeTime: number;
  audioMixTime: number;
  muxTime: number;

  // Frame statistics
  framesProcessed: number;
  avgFrameTime: number;
  maxFrameTime: number;
  minFrameTime: number;
  keyframesEncoded: number;
  framesDropped: number;

  // Data statistics
  videoDataEncoded: number;
  audioDataEncoded: number;

  // Pipeline info
  zeroCopy: boolean;
  backend: string;
  encoderQueueDepth: number;
}

type ProgressCallback = (progress: ExportProgressDetail) => void;

// =============================================================================
// WorkerExportPipeline
// =============================================================================

export class WorkerExportPipeline {
  private _config: MultiTrackExportConfig | null = null;
  private _project: SerializedProjectData | null = null;
  private _canvas: OffscreenCanvas | null = null;
  private _ctx: OffscreenCanvasRenderingContext2D | null = null;

  // Pipeline components
  private _scheduler: FrameScheduler | null = null;
  private _videoEncoder: VideoEncoder | null = null;
  private _muxer: Muxer<ArrayBufferTarget> | null = null;
  private _muxerTarget: ArrayBufferTarget | null = null;

  // State
  private _isInitialized = false;
  private _startTime = 0;
  private _stats: PipelineStats = {
    demuxTime: 0,
    decodeTime: 0,
    renderTime: 0,
    encodeTime: 0,
    audioMixTime: 0,
    muxTime: 0,
    framesProcessed: 0,
    avgFrameTime: 0,
    maxFrameTime: 0,
    minFrameTime: Infinity,
    keyframesEncoded: 0,
    framesDropped: 0,
    videoDataEncoded: 0,
    audioDataEncoded: 0,
    zeroCopy: false,
    backend: 'unknown',
    encoderQueueDepth: 0,
  };

  // Frame time tracking (used for statistics)
  private _frameTimes: number[] = [];

  // Callbacks
  private _onProgress: ProgressCallback | null = null;

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize pipeline with canvas and configuration
   */
  async initialize(
    canvas: OffscreenCanvas,
    config: MultiTrackExportConfig,
    project: SerializedProjectData
  ): Promise<void> {
    this._canvas = canvas;
    this._config = config;
    this._project = project;

    // Initialize 2D context for compositing
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this._ctx = ctx;

    // Initialize frame scheduler
    this._scheduler = new FrameScheduler({
      maxCapacity: config.maxInflightFrames,
      totalFrames: config.totalFrames,
      fps: config.fps,
    });

    // Initialize video encoder
    await this._initializeVideoEncoder(config);

    // Initialize muxer
    this._initializeMuxer(config);

    this._isInitialized = true;
  }

  private async _initializeVideoEncoder(config: MultiTrackExportConfig): Promise<void> {
    const codec = config.videoCodec === 'vp9' ? 'vp09.00.10.08' : 'avc1.640028';

    // Check codec support
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: config.width,
      height: config.height,
      bitrate: config.videoBitrate,
      framerate: config.fps,
    });

    if (!support.supported) {
      throw new Error(`Video codec ${codec} not supported`);
    }

    this._videoEncoder = new VideoEncoder({
      output: (chunk, metadata) => {
        this._handleEncodedVideoChunk(chunk, metadata);
      },
      error: (error) => {
        console.error('[WorkerExportPipeline] VideoEncoder error:', error);
      },
    });

    this._videoEncoder.configure({
      codec,
      width: config.width,
      height: config.height,
      bitrate: config.videoBitrate,
      framerate: config.fps,
      latencyMode: 'quality',
      avc: config.videoCodec === 'h264' ? { format: 'avc' } : undefined,
    });
  }

  private _initializeMuxer(config: MultiTrackExportConfig): void {
    this._muxerTarget = new ArrayBufferTarget();

    // Build muxer options
    const video = {
      codec: config.videoCodec === 'h264' ? 'avc' : 'vp9',
      width: config.width,
      height: config.height,
    } as const;

    if (config.includeAudio) {
      this._muxer = new Muxer({
        target: this._muxerTarget,
        video,
        audio: {
          codec: config.audioCodec === 'aac' ? 'aac' : 'opus',
          sampleRate: config.sampleRate,
          numberOfChannels: config.channels,
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });
    } else {
      this._muxer = new Muxer({
        target: this._muxerTarget,
        video,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      });
    }
  }

  private _handleEncodedVideoChunk(
    chunk: EncodedVideoChunk,
    metadata?: EncodedVideoChunkMetadata
  ): void {
    if (!this._muxer) return;
    this._muxer.addVideoChunk(chunk, metadata);
  }

  // ==========================================================================
  // Export Control
  // ==========================================================================

  /**
   * Start export process
   */
  async start(): Promise<ExportResult> {
    if (!this._isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    this._isInitialized = true;

    try {
      // Process all frames
      await this._processAllFrames();

      // Finalize
      return await this._finalize();
    } finally {
      this._isInitialized = false;
    }
  }

  /**
   * Pause export
   */
  pause(): void {
    this._scheduler?.pause();
  }

  /**
   * Resume export
   */
  resume(): void {
    this._scheduler?.resume();
  }

  /**
   * Cancel export
   */
  cancel(): void {
    this._scheduler?.cancel();
  }

  /**
   * Set progress callback
   */
  onProgress(callback: ProgressCallback): void {
    this._onProgress = callback;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this._videoEncoder) {
      try {
        this._videoEncoder.close();
      } catch { /* ignore */ }
      this._videoEncoder = null;
    }

    this._muxer = null;
    this._muxerTarget = null;
    this._ctx = null;
    this._canvas = null;
    this._scheduler = null;
    this._isInitialized = false;
  }

  // ==========================================================================
  // Frame Processing
  // ==========================================================================

  private async _processAllFrames(): Promise<void> {
    if (!this._scheduler || !this._config) return;

    let slot: FrameSlot | null;

    while ((slot = await this._scheduler.requestFrame()) !== null) {
      if (this._scheduler.isCancelled()) break;

      try {
        await this._processFrame(slot);
      } finally {
        this._scheduler.releaseFrame(slot);
      }

      // Report progress
      this._reportProgress();
    }
  }

  private async _processFrame(slot: FrameSlot): Promise<void> {
    if (!this._ctx || !this._canvas || !this._config || !this._project) return;

    const frameStart = performance.now();
    const renderStart = performance.now();
    const timeInSeconds = slot.frameIndex / this._config.fps;

    // Clear canvas
    this._ctx.fillStyle = '#000000';
    this._ctx.fillRect(0, 0, this._config.width, this._config.height);

    // TODO: Render all visible video elements at this time
    // This will be implemented in Phase 3 with WorkerDemuxerPool and WorkerDecoderPool
    // For now, just render a black frame

    // Render visible elements
    await this._renderVisibleElements(timeInSeconds);

    this._stats.renderTime += performance.now() - renderStart;

    // Create VideoFrame from canvas
    const encodeStart = performance.now();
    const videoFrame = new VideoFrame(this._canvas, { timestamp: slot.timestamp });

    // Encode frame
    const keyFrame = slot.frameIndex % this._config.fps === 0;
    this._videoEncoder!.encode(videoFrame, { keyFrame });
    videoFrame.close();

    this._stats.encodeTime += performance.now() - encodeStart;

    // Update frame statistics
    if (keyFrame) {
      this._stats.keyframesEncoded++;
    }

    const frameTime = performance.now() - frameStart;
    this._frameTimes.push(frameTime);
    this._stats.framesProcessed++;
    this._stats.maxFrameTime = Math.max(this._stats.maxFrameTime, frameTime);
    if (this._stats.minFrameTime === Infinity || frameTime < this._stats.minFrameTime) {
      this._stats.minFrameTime = frameTime;
    }
    this._stats.avgFrameTime = this._frameTimes.reduce((a, b) => a + b, 0) / this._frameTimes.length;
  }

  private async _renderVisibleElements(timeInSeconds: number): Promise<void> {
    if (!this._ctx || !this._config || !this._project) return;

    // Find all visible video elements at this time
    for (const track of this._project.tracks) {
      if (track.type !== 'video') continue;

      for (const element of track.elements) {
        // Check if element is visible at this time
        if (timeInSeconds < element.startTime || timeInSeconds >= element.startTime + element.duration) {
          continue;
        }

        // TODO: Decode and render video frame
        // This will be implemented in Phase 3
        // For now, render a placeholder

        // Calculate transform
        const transform = element.transform;
        const x = transform.x * this._config.width;
        const y = transform.y * this._config.height;
        const width = transform.width * this._config.width;
        const height = transform.height * this._config.height;

        // Draw placeholder
        this._ctx.save();
        this._ctx.globalAlpha = transform.opacity;

        if (transform.rotation) {
          const cx = x + width / 2;
          const cy = y + height / 2;
          this._ctx.translate(cx, cy);
          this._ctx.rotate((transform.rotation * Math.PI) / 180);
          this._ctx.translate(-cx, -cy);
        }

        // Placeholder: gray rectangle
        this._ctx.fillStyle = '#333333';
        this._ctx.fillRect(x, y, width, height);

        this._ctx.restore();
      }
    }
  }

  // ==========================================================================
  // Finalization
  // ==========================================================================

  private async _finalize(): Promise<ExportResult> {
    if (!this._videoEncoder || !this._muxer || !this._muxerTarget) {
      throw new Error('Pipeline not properly initialized');
    }

    // Flush video encoder
    await this._videoEncoder.flush();

    // Finalize muxer
    this._muxer.finalize();

    // Get output
    const outputBuffer = this._muxerTarget.buffer;
    const totalTime = performance.now() - this._startTime;
    const averageFps = this._config!.totalFrames / (totalTime / 1000);

    return {
      outputBuffer,
      fileSize: outputBuffer.byteLength,
      totalTime,
      averageFps,
    };
  }

  // ==========================================================================
  // Progress Reporting
  // ==========================================================================

  private _reportProgress(): void {
    if (!this._onProgress || !this._scheduler || !this._config) return;

    const status = this._scheduler.getStatus();
    const elapsed = performance.now() - this._startTime;
    const fps = status.completed / (elapsed / 1000) || 0;
    const remaining = status.pending > 0 && fps > 0 ? (status.pending / fps) * 1000 : 0;

    this._onProgress({
      stage: 'rendering',
      currentFrame: status.completed,
      totalFrames: this._config.totalFrames,
      percent: (status.completed / this._config.totalFrames) * 100,
      elapsedTime: elapsed,
      estimatedTimeRemaining: remaining,
      currentFps: fps,
      message: `Exporting frame ${status.completed}/${this._config.totalFrames}`,
      stats: {
        // Timing
        demuxTime: this._stats.demuxTime,
        decodeTime: this._stats.decodeTime,
        renderTime: this._stats.renderTime,
        encodeTime: this._stats.encodeTime,
        audioMixTime: this._stats.audioMixTime,
        muxTime: this._stats.muxTime,

        // Frame statistics
        avgFrameTime: this._stats.avgFrameTime,
        maxFrameTime: this._stats.maxFrameTime === 0 ? 0 : this._stats.maxFrameTime,
        minFrameTime: this._stats.minFrameTime === Infinity ? 0 : this._stats.minFrameTime,
        framesProcessed: this._stats.framesProcessed,
        keyframesEncoded: this._stats.keyframesEncoded,
        framesDropped: this._stats.framesDropped,

        // Pipeline status
        zeroCopy: this._stats.zeroCopy,
        backend: this._stats.backend,
        encoderQueueDepth: this._videoEncoder?.encodeQueueSize ?? 0,
        framesInFlight: status.processing,

        // Pool statistics (placeholder - will be updated when integrated with VideoPipeline)
        activeDemuxers: 0,
        activeDecoders: 0,
        demuxerCacheHitRate: 0,
        decoderCacheHitRate: 0,

        // Data statistics
        videoDataEncoded: this._stats.videoDataEncoded,
        audioDataEncoded: this._stats.audioDataEncoded,
        estimatedFileSize: this._stats.videoDataEncoded + this._stats.audioDataEncoded,
      },
    });
  }
}
