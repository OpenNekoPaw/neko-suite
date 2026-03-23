/**
 * Extension Tools Module
 *
 * Provides tools for inter-extension communication with NekoCut and NekoCanvas.
 */

export {
  createNekoCutTools,
  createNekoCanvasTools,
  createNekoEngineEffectsTools,
  type Tool,
} from './extensionTools';

export {
  createPipelineTools,
  getActivePipeline,
  removePipeline,
  type PipelineToolsDeps,
} from './pipelineTools';
