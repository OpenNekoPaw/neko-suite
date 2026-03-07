/**
 * Tools Module - Public API
 *
 * Centralized module for all tool implementations including:
 * - Base tool class
 * - Project/Timeline tools
 * - AI Generation tools
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
  registerGenerationTools,
  type AIGenerationService,
  type ImageGenerationOptions,
  type VideoGenerationOptions,
  type TTSOptions,
  type MusicGenerationOptions,
  type GeneratedMedia,
} from './generation';
