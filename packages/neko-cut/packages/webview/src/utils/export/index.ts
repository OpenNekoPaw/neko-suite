/**
 * Export Module - 统一导出模块
 *
 * 提供统一的导出 API，支持多种格式和引擎：
 *
 * ## 导出引擎
 * - **CompatibleExportAdapter**: Extension 端导出（FFmpeg 全流程 via NAPI）
 * - **CanvasExportAdapter**: Canvas2D 导出（GIF/图片序列）
 *
 * ## 使用方式
 * ```typescript
 * import { ExportEngineFactory } from './export';
 *
 * // 自动选择最佳引擎
 * const engine = ExportEngineFactory.getEngine('mp4');
 * const result = await engine.export(project, config, onProgress);
 * ```
 */

// =============================================================================
// Core Interfaces
// =============================================================================

export type {
  IExportEngine,
  ExportFormat,
  QualityPreset,
  ExportStage,
  ExportConfig,
  VideoExportConfig,
  GifExportConfig,
  ImageSequenceExportConfig,
  ExportProgress,
  ExportProgressCallback,
  ExportResult,
  UrlResolver,
} from './IExportEngine';

export {
  isVideoFormat,
  isImageSequenceFormat,
  getDefaultBitrate,
  getMimeType,
  getFileExtension,
} from './IExportEngine';

// =============================================================================
// Factory
// =============================================================================

export {
  ExportEngineFactory,
  getExportEngine,
  createExportEngine,
  isExportFormatSupported,
  getExportUnsupportedReason,
  disposeAllExportEngines,
  type ExportEngineType,
  type EngineCapabilities,
} from './ExportEngineFactory';

// =============================================================================
// Adapters
// =============================================================================

export {
  CanvasExportAdapter,
  createCanvasExportAdapter,
} from './CanvasExportAdapter';

export {
  CompatibleExportAdapter,
  createCompatibleExportAdapter,
  isCompatibleExportAvailable,
} from './CompatibleExportAdapter';

// =============================================================================
// Pipeline
// =============================================================================

export {
  ExportPipeline,
  createExportPipeline,
  type ExportPipelineConfig,
  type FrameData,
  type PipelineStats,
} from './ExportPipeline';
