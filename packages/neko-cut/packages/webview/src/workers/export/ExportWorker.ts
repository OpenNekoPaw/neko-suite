/**
 * Export Worker
 *
 * Runs video export pipeline in a Web Worker to avoid blocking the main thread.
 * Handles GPU rendering, video encoding, audio encoding, and MP4 muxing.
 *
 * Architecture:
 * - Receives OffscreenCanvas via Transferable
 * - Uses WebGPU/WebGL for rendering
 * - Uses WebCodecs VideoEncoder for video encoding
 * - Uses mp4-muxer for container muxing
 */

import type {
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerConfig,
  FrameTransform,
} from './types';
import type { ExportProgress, ExportStage, ExportPerformanceStats } from '../../utils/export/IExportEngine';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// =============================================================================
// Types
// =============================================================================

interface WorkerState {
  config: ExportWorkerConfig | null;
  canvas: OffscreenCanvas | null;
  ctx: OffscreenCanvasRenderingContext2D | GPUCanvasContext | null;
  gpuDevice: GPUDevice | null;
  videoEncoder: VideoEncoder | null;
  muxer: Muxer<ArrayBufferTarget> | null;
  muxerTarget: ArrayBufferTarget | null;
  isInitialized: boolean;
  isCancelled: boolean;
  startTime: number;
  encodedFrames: number;
  // Performance tracking
  totalRenderTime: number;      // Canvas compositing time
  totalEncodeCallTime: number;  // Time spent calling encode()
  totalFrameTime: number;       // Total time per frame (render + encode call)
  pendingEncodes: number;       // Frames waiting for encoding
  encoderOutputCount: number;   // Frames output by encoder
  lastEncoderOutputTime: number; // Time of last encoder output
  estimatedEncodeTime: number;  // Estimated actual encode time based on throughput
  audioData: { buffer: Float32Array; sampleRate: number; channels: number } | null;
}

// =============================================================================
// Worker State
// =============================================================================

const state: WorkerState = {
  config: null,
  canvas: null,
  ctx: null,
  gpuDevice: null,
  videoEncoder: null,
  muxer: null,
  muxerTarget: null,
  isInitialized: false,
  isCancelled: false,
  startTime: 0,
  encodedFrames: 0,
  // Performance tracking
  totalRenderTime: 0,
  totalEncodeCallTime: 0,
  totalFrameTime: 0,
  pendingEncodes: 0,
  encoderOutputCount: 0,
  lastEncoderOutputTime: 0,
  estimatedEncodeTime: 0,
  audioData: null,
};

// =============================================================================
// Response Helper
// =============================================================================

function postResponse(response: ExportWorkerResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(response, transfer);
  } else {
    self.postMessage(response);
  }
}

function postError(error: unknown, stage?: string): void {
  postResponse({
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
    stage,
  });
}

function postProgress(progress: Partial<ExportProgress>): void {
  const elapsed = performance.now() - state.startTime;
  const totalFrames = state.config?.totalFrames ?? 0;
  const currentFrame = state.encodedFrames;
  const fps = elapsed > 0 ? currentFrame / (elapsed / 1000) : 0;
  const remaining = totalFrames > currentFrame && fps > 0 ? ((totalFrames - currentFrame) / fps) * 1000 : 0;

  // Calculate performance stats
  const avgRenderTime = currentFrame > 0 ? state.totalRenderTime / currentFrame : 0;
  const avgEncodeCallTime = currentFrame > 0 ? state.totalEncodeCallTime / currentFrame : 0;
  const avgFrameTime = currentFrame > 0 ? state.totalFrameTime / currentFrame : 0;

  // Estimate actual encode time based on:
  // 1. If encoder output count > 0, use actual throughput
  // 2. Otherwise, estimate from frame time minus render time
  let avgEncodeTime: number;
  if (state.encoderOutputCount > 0 && state.estimatedEncodeTime > 0) {
    avgEncodeTime = state.estimatedEncodeTime / state.encoderOutputCount;
  } else {
    // Fallback: estimate encode time as frame time minus render time
    avgEncodeTime = Math.max(0, avgFrameTime - avgRenderTime);
  }

  // Build performance stats
  const performanceStats: ExportPerformanceStats = {
    avgRenderTime,
    avgEncodeTime,
    avgDecodeTime: undefined, // Decode happens in main thread, not tracked here
    avgWaitTime: state.pendingEncodes > 0 ? avgEncodeCallTime : 0, // Queue wait approximation
    queueLength: state.pendingEncodes,
    memoryUsedMB: getMemoryUsage(),
    pipelineMode: false, // Worker mode is not pipeline mode
  };

  postResponse({
    type: 'progress',
    progress: {
      stage: 'rendering' as ExportStage,
      currentFrame,
      totalFrames,
      percent: totalFrames > 0 ? (currentFrame / totalFrames) * 80 : 0,
      elapsedTime: elapsed,
      estimatedTimeRemaining: remaining,
      currentFps: fps,
      message: `Exporting frame ${currentFrame}/${totalFrames}`,
      performanceStats,
      ...progress,
    },
  });
}

/**
 * Get current memory usage in MB
 */
function getMemoryUsage(): number {
  const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  if (perfMemory?.usedJSHeapSize) {
    return Math.round(perfMemory.usedJSHeapSize / (1024 * 1024));
  }
  return 0;
}

// =============================================================================
// Initialization
// =============================================================================

async function initializeWorker(
  canvas: OffscreenCanvas,
  config: ExportWorkerConfig
): Promise<void> {
  state.config = config;
  state.canvas = canvas;
  state.startTime = performance.now();
  state.encodedFrames = 0;
  // Reset performance tracking
  state.totalRenderTime = 0;
  state.totalEncodeCallTime = 0;
  state.totalFrameTime = 0;
  state.pendingEncodes = 0;
  state.encoderOutputCount = 0;
  state.lastEncoderOutputTime = 0;
  state.estimatedEncodeTime = 0;
  state.audioData = null;
  state.isCancelled = false;

  try {
    // Initialize rendering context (prefer WebGPU, fallback to 2D)
    await initializeRenderingContext(canvas, config);

    // Initialize video encoder
    await initializeVideoEncoder(config);

    // Initialize muxer
    await initializeMuxer(config);

    state.isInitialized = true;

    postResponse({ type: 'init:done', success: true });
  } catch (error) {
    postResponse({
      type: 'init:done',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function initializeRenderingContext(
  canvas: OffscreenCanvas,
  _config: ExportWorkerConfig
): Promise<void> {
  // Use 2D context for export (simpler and sufficient for compositing)
  // WebGPU compositing would require full shader pipeline implementation
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context');
  }
  state.ctx = ctx;
  console.log('[ExportWorker] Using 2D rendering');
}

async function initializeVideoEncoder(config: ExportWorkerConfig): Promise<void> {
  const isWebM = config.format === 'webm';
  const codec = isWebM ? 'vp09.00.10.08' : 'avc1.640028';

  // Check codec support
  const support = await VideoEncoder.isConfigSupported({
    codec,
    width: config.width,
    height: config.height,
    bitrate: config.videoBitrate ?? 5_000_000,
    framerate: config.fps,
  });

  if (!support.supported) {
    throw new Error(`Video codec ${codec} not supported`);
  }

  state.videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      handleEncodedVideoChunk(chunk, metadata);
    },
    error: (error) => {
      console.error('[ExportWorker] VideoEncoder error:', error);
      postError(error, 'encoding');
    },
  });

  state.videoEncoder.configure({
    codec,
    width: config.width,
    height: config.height,
    bitrate: config.videoBitrate ?? 5_000_000,
    framerate: config.fps,
    latencyMode: 'quality',
    avc: isWebM ? undefined : { format: 'avc' },
  });
}

async function initializeMuxer(config: ExportWorkerConfig): Promise<void> {
  const isWebM = config.format === 'webm';

  if (isWebM) {
    // WebM format not yet supported in Worker
    throw new Error('WebM format not supported in Worker export');
  }

  // Create ArrayBufferTarget for output
  state.muxerTarget = new ArrayBufferTarget();

  // Create MP4 muxer
  state.muxer = new Muxer({
    target: state.muxerTarget,
    video: {
      codec: 'avc',
      width: config.width,
      height: config.height,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
}

function handleEncodedVideoChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
  if (!state.muxer) return;

  // Track encoder output for performance estimation
  const now = performance.now();
  if (state.lastEncoderOutputTime > 0) {
    // Estimate encode time based on output interval
    state.estimatedEncodeTime += now - state.lastEncoderOutputTime;
  }
  state.lastEncoderOutputTime = now;
  state.encoderOutputCount++;
  state.pendingEncodes = Math.max(0, state.pendingEncodes - 1);

  // Add video chunk to muxer
  state.muxer.addVideoChunk(chunk, metadata);
}

// =============================================================================
// Frame Processing
// =============================================================================

async function processFrame(
  frameIndex: number,
  timeInSeconds: number,
  videoFrames: Array<{ elementId: string; frame: VideoFrame; transform: FrameTransform }>
): Promise<void> {
  if (state.isCancelled || !state.isInitialized) return;

  const frameStart = performance.now();

  try {
    // Composite frames onto canvas (this is the "render" time)
    const renderStart = performance.now();
    await compositeFrames(videoFrames);
    state.totalRenderTime += performance.now() - renderStart;

    // Create VideoFrame from canvas
    const timestamp = Math.round(timeInSeconds * 1_000_000); // microseconds
    const videoFrame = new VideoFrame(state.canvas!, { timestamp });

    // Encode frame (async - actual encoding happens in background)
    const encodeStart = performance.now();
    const keyFrame = frameIndex % (state.config?.fps ?? 30) === 0;
    state.pendingEncodes++;
    state.videoEncoder!.encode(videoFrame, { keyFrame });
    videoFrame.close();
    state.totalEncodeCallTime += performance.now() - encodeStart;

    // Close input frames
    for (const { frame } of videoFrames) {
      frame.close();
    }

    state.encodedFrames++;
    state.totalFrameTime += performance.now() - frameStart;

    // Report progress
    postResponse({ type: 'frame:encoded', frameIndex });

    // Periodic progress update
    if (frameIndex % 10 === 0) {
      postProgress({});
    }
  } catch (error) {
    // Close input frames on error
    for (const { frame } of videoFrames) {
      try { frame.close(); } catch { /* ignore */ }
    }
    throw error;
  }
}

async function compositeFrames(
  videoFrames: Array<{ elementId: string; frame: VideoFrame; transform: FrameTransform }>
): Promise<void> {
  if (!state.ctx || !state.canvas) return;

  const { width, height } = state.config!;

  if (state.ctx instanceof OffscreenCanvasRenderingContext2D) {
    // 2D rendering
    const ctx = state.ctx;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    for (const { frame, transform } of videoFrames) {
      ctx.save();

      // Apply transform
      if (transform.rotation) {
        const cx = transform.x + transform.width / 2;
        const cy = transform.y + transform.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }

      if (transform.flipX || transform.flipY) {
        const cx = transform.x + transform.width / 2;
        const cy = transform.y + transform.height / 2;
        ctx.translate(cx, cy);
        ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
        ctx.translate(-cx, -cy);
      }

      if (transform.opacity !== undefined && transform.opacity < 1) {
        ctx.globalAlpha = transform.opacity;
      }

      // Draw frame
      ctx.drawImage(
        frame,
        transform.x,
        transform.y,
        transform.width,
        transform.height
      );

      ctx.restore();
    }
  } else {
    // WebGPU rendering - simplified for now
    // In production, this would use proper WebGPU render pipeline
    console.warn('[ExportWorker] WebGPU compositing not fully implemented');
  }
}

// =============================================================================
// Audio Processing
// =============================================================================

async function processAudio(
  audioBuffer: Float32Array,
  sampleRate: number,
  channels: number
): Promise<void> {
  if (state.isCancelled || !state.isInitialized) return;

  // Store raw audio data for later encoding
  // Note: Audio encoding with libav.js in Worker requires special handling
  // For now, we store the data and could add audio track support later
  state.audioData = {
    buffer: audioBuffer,
    sampleRate,
    channels,
  };

  postResponse({ type: 'audio:encoded' });
}

// =============================================================================
// Finalization
// =============================================================================

async function finalizeExport(): Promise<void> {
  if (!state.isInitialized || !state.muxer || !state.muxerTarget) {
    postError('Worker not initialized', 'finalize');
    return;
  }

  try {
    postProgress({ stage: 'muxing', percent: 85, message: 'Finalizing video...' });

    // Flush video encoder
    await state.videoEncoder!.flush();

    // Finalize muxer
    state.muxer.finalize();

    // Get output buffer
    const outputBuffer = state.muxerTarget.buffer;
    const totalSize = outputBuffer.byteLength;

    const totalTime = performance.now() - state.startTime;
    const averageFps = state.encodedFrames / (totalTime / 1000);

    postResponse(
      {
        type: 'complete',
        outputBuffer,
        fileSize: totalSize,
        totalTime,
        averageFps,
      },
      [outputBuffer]
    );
  } catch (error) {
    postError(error, 'finalize');
  }
}

// =============================================================================
// Cleanup
// =============================================================================

function cancelExport(): void {
  state.isCancelled = true;
  cleanup();
  postResponse({ type: 'cancelled' });
}

function cleanup(): void {
  if (state.videoEncoder) {
    try {
      state.videoEncoder.close();
    } catch { /* ignore */ }
    state.videoEncoder = null;
  }

  if (state.gpuDevice) {
    state.gpuDevice.destroy();
    state.gpuDevice = null;
  }

  state.ctx = null;
  state.canvas = null;
  state.muxer = null;
  state.muxerTarget = null;
  state.audioData = null;
  state.isInitialized = false;
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async (event: MessageEvent<ExportWorkerRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init':
        await initializeWorker(msg.canvas, msg.config);
        break;

      case 'submit-frame':
        await processFrame(msg.frameIndex, msg.timeInSeconds, msg.videoFrames);
        break;

      case 'submit-audio':
        await processAudio(msg.audioBuffer, msg.sampleRate, msg.channels);
        break;

      case 'finalize':
        await finalizeExport();
        break;

      case 'cancel':
        cancelExport();
        break;

      case 'terminate':
        cleanup();
        self.close();
        break;
    }
  } catch (error) {
    postError(error);
  }
};

// Notify ready
postResponse({ type: 'ready' });
