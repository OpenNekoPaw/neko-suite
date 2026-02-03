/**
 * Generation Tools Module
 *
 * AI-powered media generation tools for image, video, audio, and more.
 */

// Types
export type {
  AIGenerationService,
  GenerationRoutingParams,
  ImageGenerationOptions,
  VideoGenerationOptions,
  TTSOptions,
  MusicGenerationOptions,
  CharacterGenerationOptions,
  StyleTransferOptions,
  VideoEnhanceOptions,
  AudioOptimizeOptions,
  GeneratedMedia,
} from './types';
export { ROUTING_PARAMETER_SCHEMA } from './types';

// Base class
export { RoutedGenerationTool } from './base';

// Tool classes
export { GenerateImageTool } from './image';
export { GenerateVideoTool } from './video';
export { GenerateTTSTool } from './tts';
export { GenerateMusicTool } from './music';
export { GenerateCharacterTool } from './character';
export { TransferStyleTool } from './style';
export { EnhanceVideoTool } from './enhance-video';
export { OptimizeAudioTool } from './optimize-audio';

// Re-export Tool type for convenience
import type { Tool } from '../../types/tool';
import type { AIGenerationService } from './types';
import type { ExecutionGroupManager } from '../../provider/execution-group-manager';
import { GenerateImageTool } from './image';
import { GenerateVideoTool } from './video';
import { GenerateTTSTool } from './tts';
import { GenerateMusicTool } from './music';
import { GenerateCharacterTool } from './character';
import { TransferStyleTool } from './style';
import { EnhanceVideoTool } from './enhance-video';
import { OptimizeAudioTool } from './optimize-audio';

/**
 * Register all generation tools with a tool registry
 */
export function registerGenerationTools(
  registry: { register(tool: Tool): void },
  aiService: AIGenerationService,
  routingManager?: ExecutionGroupManager
): void {
  registry.register(new GenerateImageTool(aiService, routingManager));
  registry.register(new GenerateVideoTool(aiService, routingManager));
  registry.register(new GenerateTTSTool(aiService, routingManager));
  registry.register(new GenerateMusicTool(aiService, routingManager));
  registry.register(new GenerateCharacterTool(aiService, routingManager));
  registry.register(new TransferStyleTool(aiService, routingManager));
  registry.register(new EnhanceVideoTool(aiService));
  registry.register(new OptimizeAudioTool(aiService));
}
