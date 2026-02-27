/**
 * Service Module - Public API
 */

export { Service, type ServiceConfig } from './service';
export { SharedServiceAdapter, toSharedService } from './shared-service-adapter';
export { ToolRegistry } from './tool-registry';

// PromptManager - local implementation
export {
  PromptManager,
  createPromptManager,
} from './prompt-manager';

// Tools - re-export from tools/ for backwards compatibility
export {
  BuiltinTool,
  registerBuiltinTools,
  type ProjectContext as BuiltinProjectContext,
} from '../tools';
export {
  BaseProjectContextAdapter,
  MockProjectContextAdapter,
  createContextSummary,
} from '../tools';
export {
  GenerateImageTool,
  GenerateVideoTool,
  GenerateTTSTool,
  GenerateMusicTool,
  registerGenerationTools,
  type AIGenerationService,
  type ImageGenerationOptions,
  type VideoGenerationOptions,
  type TTSOptions,
  type MusicGenerationOptions,
  type GeneratedMedia,
} from '../tools';
export {
  MediaServiceAdapter,
  createMediaServiceAdapter,
  type MediaServiceAdapterOptions,
} from '../tools';
export {
  AnalyzeImageTool,
  ExtractImageTextTool,
  AnalyzeVideoTool,
  ExtractVideoSummaryTool,
  registerAnalysisTools,
  type VisionAnalysisService,
  type ImageAnalysisOptions,
  type VideoAnalysisOptions,
  type AnalysisResult,
  type VideoAnalysisResult,
  type TextExtractionResult,
} from '../tools';
export {
  GenerateScriptTool,
  OptimizeScriptTool,
  GenerateStoryboardTool,
  GenerateSubtitlesTool,
  registerDocumentTools,
  type DocumentGenerationService,
  type ScriptGenerationOptions,
  type ScriptResult,
  type StoryboardOptions,
  type StoryboardResult,
  type SubtitleOptions,
  type SubtitleResult,
} from '../tools';
