/**
 * Extension Tools Module
 *
 * Provides tools for inter-extension communication with NekoCut and NekoCanvas.
 */

export {
  createNekoCutTools,
  createNekoCanvasTools,
  createNekoEngineEffectsTools,
  createTranscribeTools,
  createNekoStoryTools,
  type Tool,
} from './extensionTools';

export {
  createPipelineTools,
  getActivePipeline,
  removePipeline,
  recordCompletedPipeline,
  getPipelineReport,
  listPipelineReports,
  type PipelineToolsDeps,
  type CompletedPipelineRecord,
} from './pipelineTools';

export { createRunReportTools } from './runReportTools';
