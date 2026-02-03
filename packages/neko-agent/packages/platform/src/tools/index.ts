/**
 * Tools Module - Public API
 *
 * Centralized module for all tool implementations including:
 * - Base tool class
 * - Project/Timeline tools
 * - AI Generation tools
 * - AI Analysis tools
 * - Document tools
 */

// Base class - import from shared
export { BuiltinTool } from '@neko/shared';

// Project tools (timeline, media operations)
export {
  // Types
  type ProjectContext,
  type TimelineInfo,
  type TrackInfo,
  type ElementInfo,
  type ElementInput,
  type MediaInfo,
  // Tool classes
  GetTimelineInfoTool,
  GetTracksTool,
  GetElementsTool,
  AddElementTool,
  UpdateElementTool,
  DeleteElementTool,
  GetMediaInfoTool,
  // Registration functions
  registerProjectTools,
  registerBuiltinTools,
} from './project-tools';

// Project context adapters
export {
  BaseProjectContextAdapter,
  MockProjectContextAdapter,
  createContextSummary,
} from './project-adapter';

// AI Generation Tools
export {
  GenerateImageTool,
  GenerateVideoTool,
  GenerateTTSTool,
  GenerateMusicTool,
  GenerateCharacterTool,
  TransferStyleTool,
  EnhanceVideoTool,
  OptimizeAudioTool,
  registerGenerationTools,
  type AIGenerationService,
  type ImageGenerationOptions,
  type VideoGenerationOptions,
  type TTSOptions,
  type MusicGenerationOptions,
  type CharacterGenerationOptions,
  type StyleTransferOptions,
  type VideoEnhanceOptions,
  type AudioOptimizeOptions,
  type GeneratedMedia,
} from './generation-tools';

// Media Service Adapter
export {
  MediaServiceAdapter,
  createMediaServiceAdapter,
  type MediaServiceAdapterOptions,
} from './media-service-adapter';

// AI Analysis Tools
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
} from './analysis-tools';

// Document Tools
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
} from './document-tools';
