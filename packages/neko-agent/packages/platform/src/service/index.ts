/**
 * Service Module - Public API
 */

export { Service, type ServiceConfig } from './service';
export { SharedServiceAdapter, toSharedService } from './shared-service-adapter';
export { ModelSelector, type ModelTaskType, type ResolvedModel } from './model-selector';

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
