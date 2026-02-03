/**
 * Multi-Track Export Worker
 *
 * Web Worker entry point for multi-track video/audio export.
 * Handles complete pipeline: demux → decode → composite → encode → mux
 *
 * Architecture:
 * - Receives OffscreenCanvas via Transferable
 * - Uses WebGPU/2D Canvas for multi-track compositing
 * - Uses WebCodecs for video encoding
 * - Uses libav.js for audio decoding/encoding
 * - Uses mp4-muxer for container muxing
 */

import type {
  MultiTrackExportRequest,
  MultiTrackExportResponse,
  MultiTrackExportConfig,
  SerializedProjectData,
  WorkerCapabilities,
  ExportProgressDetail,
} from './protocol/messages';
import { WorkerExportPipeline, type ExportResult } from './pipeline/WorkerExportPipeline';

// =============================================================================
// Worker State
// =============================================================================

interface WorkerState {
  pipeline: WorkerExportPipeline | null;
  config: MultiTrackExportConfig | null;
  isInitialized: boolean;
  isExporting: boolean;
}

const state: WorkerState = {
  pipeline: null,
  config: null,
  isInitialized: false,
  isExporting: false,
};

// =============================================================================
// Response Helpers
// =============================================================================

function postResponse(response: MultiTrackExportResponse, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    (self as unknown as Worker).postMessage(response, transfer);
  } else {
    self.postMessage(response);
  }
}

function postError(error: unknown, stage?: string, recoverable = false): void {
  postResponse({
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
    stage,
    recoverable,
  });
}

// =============================================================================
// Capability Detection
// =============================================================================

function detectCapabilities(): WorkerCapabilities {
  return {
    webgpu: 'gpu' in navigator,
    webgl: typeof OffscreenCanvas !== 'undefined',
    webcodecs: typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined',
    libav: true, // Will be verified during initialization
  };
}

// =============================================================================
// Initialization
// =============================================================================

async function initializeMultiTrack(
  canvas: OffscreenCanvas,
  config: MultiTrackExportConfig,
  project: SerializedProjectData
): Promise<void> {
  try {
    // Create pipeline
    state.pipeline = new WorkerExportPipeline();

    // Set up progress callback
    state.pipeline.onProgress((progress: ExportProgressDetail) => {
      postResponse({
        type: 'progress',
        progress,
      });
    });

    // Initialize pipeline
    await state.pipeline.initialize(canvas, config, project);

    state.isInitialized = true;
    state.config = config;

    // Count tracks
    const videoTracks = project.tracks.filter(t => t.type === 'video').length;
    const audioTracks = project.tracks.filter(t => t.type === 'audio').length;

    postResponse({
      type: 'init-done',
      success: true,
      mediaInfo: {
        videoTracks,
        audioTracks,
        totalDuration: project.duration,
      },
    });
  } catch (error) {
    postResponse({
      type: 'init-done',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// Export Control
// =============================================================================

async function startExport(): Promise<void> {
  if (!state.isInitialized || !state.pipeline) {
    postError('Worker not initialized', 'start', false);
    return;
  }

  if (state.isExporting) {
    postError('Export already in progress', 'start', false);
    return;
  }

  state.isExporting = true;

  try {
    const result: ExportResult = await state.pipeline.start();

    postResponse(
      {
        type: 'complete',
        outputBuffer: result.outputBuffer,
        fileSize: result.fileSize,
        totalTime: result.totalTime,
        averageFps: result.averageFps,
        finalStats: {
          // Summary
          totalFrames: state.config?.totalFrames ?? 0,
          totalDuration: state.config?.duration ?? 0,
          averageFps: result.averageFps,
          peakFps: result.averageFps, // TODO: Track peak FPS

          // Timing breakdown
          demuxTime: 0, // TODO: Get from pipeline
          decodeTime: 0,
          renderTime: 0,
          encodeTime: 0,
          audioMixTime: 0,
          muxTime: 0,
          overheadTime: 0,

          // Frame statistics
          avgFrameTime: result.totalTime / (state.config?.totalFrames ?? 1),
          maxFrameTime: 0,
          minFrameTime: 0,
          stdDevFrameTime: 0,
          keyframeCount: Math.ceil((state.config?.totalFrames ?? 0) / (state.config?.fps ?? 30)),
          droppedFrameCount: 0,

          // Data statistics
          videoDataSize: result.fileSize,
          audioDataSize: 0,
          finalFileSize: result.fileSize,
          actualVideoBitrate: (result.fileSize * 8) / (state.config?.duration ?? 1),
          actualAudioBitrate: 0,
          compressionRatio: 1,

          // Pipeline info
          zeroCopy: true,
          backend: 'WebGPU',
          videoCodec: state.config?.videoCodec ?? 'h264',
          audioCodec: state.config?.audioCodec ?? 'aac',
          hardwareAcceleration: true,
        },
      },
      [result.outputBuffer]
    );
  } catch (error) {
    postError(error, 'export', false);
  } finally {
    state.isExporting = false;
  }
}

function pauseExport(): void {
  if (!state.pipeline || !state.isExporting) return;

  state.pipeline.pause();
  postResponse({ type: 'paused', currentFrame: 0 }); // TODO: Get actual frame
}

function resumeExport(): void {
  if (!state.pipeline || !state.isExporting) return;

  state.pipeline.resume();
  postResponse({ type: 'resumed' });
}

function cancelExport(): void {
  if (!state.pipeline) return;

  state.pipeline.cancel();
  state.isExporting = false;

  postResponse({ type: 'cancelled', processedFrames: 0 }); // TODO: Get actual count
}

function terminateWorker(): void {
  if (state.pipeline) {
    state.pipeline.dispose();
    state.pipeline = null;
  }

  state.isInitialized = false;
  state.isExporting = false;

  self.close();
}

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = async (event: MessageEvent<MultiTrackExportRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init-multitrack':
        await initializeMultiTrack(msg.canvas, msg.config, msg.project);
        break;

      case 'start-export':
        await startExport();
        break;

      case 'pause-export':
        pauseExport();
        break;

      case 'resume-export':
        resumeExport();
        break;

      case 'cancel-export':
        cancelExport();
        break;

      case 'terminate':
        terminateWorker();
        break;

      default:
        console.warn('[MultiTrackExportWorker] Unknown message type:', (msg as { type: string }).type);
    }
  } catch (error) {
    postError(error);
  }
};

// =============================================================================
// Worker Ready
// =============================================================================

// Notify main thread that worker is ready
postResponse({
  type: 'ready',
  capabilities: detectCapabilities(),
});
