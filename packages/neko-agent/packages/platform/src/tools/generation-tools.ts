/**
 * AI Generation Tools - Image, Video, Audio generation
 *
 * This module re-exports from the generation/ directory for backward compatibility.
 *
 * @module generation-tools
 * @example
 * ```typescript
 * import { registerGenerationTools, GenerateImageTool } from '@uniedit/platform';
 *
 * // Register all generation tools with a service
 * registerGenerationTools(registry, aiService);
 *
 * // Or use individual tools
 * const imageTool = new GenerateImageTool(aiService);
 * const result = await imageTool.execute({ prompt: 'A sunset over mountains' });
 * ```
 */

// Re-export everything from the generation module
export {
  // Types
  type AIGenerationService,
  type GenerationRoutingParams,
  type ImageGenerationOptions,
  type VideoGenerationOptions,
  type TTSOptions,
  type MusicGenerationOptions,
  type CharacterGenerationOptions,
  type StyleTransferOptions,
  type VideoEnhanceOptions,
  type AudioOptimizeOptions,
  type GeneratedMedia,
  ROUTING_PARAMETER_SCHEMA,
  // Base class
  RoutedGenerationTool,
  // Tool classes
  GenerateImageTool,
  GenerateVideoTool,
  GenerateTTSTool,
  GenerateMusicTool,
  GenerateCharacterTool,
  TransferStyleTool,
  EnhanceVideoTool,
  OptimizeAudioTool,
  // Registration function
  registerGenerationTools,
} from './generation';
