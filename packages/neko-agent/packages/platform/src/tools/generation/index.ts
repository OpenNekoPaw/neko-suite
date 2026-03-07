/**
 * Generation Tools Module
 *
 * AI-powered media generation tools for image, video, audio, and more.
 */

// Types
export type {
  AIGenerationService,
  ImageGenerationOptions,
  VideoGenerationOptions,
  TTSOptions,
  MusicGenerationOptions,
  GeneratedMedia,
} from './types';

// Base class
export { RoutedGenerationTool } from './base';

// Tool classes
export { GenerateImageTool } from './image';
export { GenerateVideoTool } from './video';
export { GenerateTTSTool } from './tts';
export { GenerateMusicTool } from './music';

// Re-export Tool type for convenience
import type { Tool } from '../../types/tool';
import type { AIGenerationService } from './types';
import { GenerateImageTool } from './image';
import { GenerateVideoTool } from './video';
import { GenerateTTSTool } from './tts';
import { GenerateMusicTool } from './music';

/**
 * Register all generation tools with a tool registry
 */
export function registerGenerationTools(
  registry: { register(tool: Tool): void },
  aiService: AIGenerationService
): void {
  registry.register(new GenerateImageTool(aiService));
  registry.register(new GenerateVideoTool(aiService));
  registry.register(new GenerateTTSTool(aiService));
  registry.register(new GenerateMusicTool(aiService));
}
