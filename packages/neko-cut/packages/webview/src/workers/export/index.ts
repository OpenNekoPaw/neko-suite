/**
 * Export Worker Module
 *
 * Provides Web Worker-based video export to avoid blocking the main thread.
 *
 * Two modes:
 * 1. Simple mode (ExportWorker) - Single track, frames passed from main thread
 * 2. Multi-track mode (MultiTrackExportWorker) - Full pipeline in Worker
 * 3. Full pipeline mode (FullPipelineExportWorker) - Complete demux/decode/render/encode/mux in Worker
 */

// Types (basic export types)
export type {
  ExportWorkerConfig,
  AudioTrackData,
  FrameTransform,
  ExportWorkerRequest,
  ExportWorkerResponse,
  ExportWorkerClientConfig,
  PendingExportRequest,
} from './types';

// Multi-track protocol types (re-export with explicit names to avoid conflicts)
export type {
  MultiTrackExportConfig,
  SerializedProjectData,
  SerializedTrack,
  SerializedElement,
  SerializedTransform,
  WorkerCapabilities,
  ExportProgressDetail,
  ExportFinalStats,
  MultiTrackExportRequest,
  MultiTrackExportResponse,
} from './protocol/messages';

// Clients
export * from './ExportWorkerClient';
export { MultiTrackExportWorkerClient, createMultiTrackExportClient } from './MultiTrackExportWorkerClient';
export { FullPipelineExportWorkerClient, createFullPipelineExportWorkerClient, isFullPipelineExportAvailable } from './FullPipelineExportWorkerClient';

// Pipeline components (for advanced usage)
export { FrameScheduler } from './pipeline/FrameScheduler';
export { WorkerExportPipeline } from './pipeline/WorkerExportPipeline';
export { VideoPipeline } from './pipeline/VideoPipeline';
export { AudioPipeline } from './pipeline/AudioPipeline';

// Media components
export { WorkerDemuxerPool } from './media/WorkerDemuxerPool';
export { WorkerDecoderPool } from './media/WorkerDecoderPool';
export { WorkerAudioMixer } from './media/WorkerAudioMixer';

// Rendering
export { WorkerWebGPUCompositor } from './rendering/WorkerWebGPUCompositor';
