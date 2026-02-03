/**
 * Generation Tools Types
 *
 * Shared types for AI generation tools.
 */

import type { MediaTaskStatus } from '../../media/types';
import type { ExecutionStrategyType } from '../../types/execution-group';

/**
 * AI Service interface for generation tools
 */
export interface AIGenerationService {
  generateImage(options: ImageGenerationOptions): Promise<GeneratedMedia>;
  generateVideo?(options: VideoGenerationOptions): Promise<GeneratedMedia>;
  generateTTS?(options: TTSOptions): Promise<GeneratedMedia>;
  generateMusic?(options: MusicGenerationOptions): Promise<GeneratedMedia>;
  generateCharacter?(options: CharacterGenerationOptions): Promise<GeneratedMedia>;
  transferStyle?(options: StyleTransferOptions): Promise<GeneratedMedia>;
  enhanceVideo?(options: VideoEnhanceOptions): Promise<GeneratedMedia>;
  optimizeAudio?(options: AudioOptimizeOptions): Promise<GeneratedMedia>;
}

/**
 * Routing parameters for AI generation tools
 */
export interface GenerationRoutingParams {
  provider?: string;
  model?: string;
  workflow?: string;
  capabilities?: string[];
  routeStrategy?: ExecutionStrategyType;
}

/**
 * Options for AI image generation
 */
export interface ImageGenerationOptions {
  prompt: string;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  n?: number;
}

/**
 * Options for AI video generation
 */
export interface VideoGenerationOptions {
  prompt: string;
  duration?: number;
  resolution?: string;
  fps?: number;
}

/**
 * Options for text-to-speech generation
 */
export interface TTSOptions {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
}

/**
 * Options for AI music generation
 */
export interface MusicGenerationOptions {
  prompt: string;
  duration?: number;
  genre?: string;
  mood?: string;
}

/**
 * Options for character image generation
 */
export interface CharacterGenerationOptions {
  prompt: string;
  referenceImageUrl?: string;
  referenceImageData?: ArrayBuffer;
  style?: string;
  pose?: string;
  expression?: string;
}

/**
 * Options for artistic style transfer
 */
export interface StyleTransferOptions {
  sourceImageUrl?: string;
  sourceImageData?: ArrayBuffer;
  stylePrompt: string;
  styleStrength?: number;
}

/**
 * Options for video enhancement
 */
export interface VideoEnhanceOptions {
  videoUrl?: string;
  videoData?: ArrayBuffer;
  targetResolution?: string;
  denoise?: boolean;
  stabilize?: boolean;
  interpolateFps?: number;
}

/**
 * Options for audio optimization
 */
export interface AudioOptimizeOptions {
  audioUrl?: string;
  audioData?: ArrayBuffer;
  denoise?: boolean;
  normalize?: boolean;
  enhanceVoice?: boolean;
  removeBackground?: boolean;
}

/**
 * Result of media generation
 */
export interface GeneratedMedia {
  id: string;
  url?: string;
  data?: ArrayBuffer;
  mimeType: string;
  taskId?: string;
  status?: MediaTaskStatus;
}

/**
 * Common routing parameter definitions for tool schemas
 */
export const ROUTING_PARAMETER_SCHEMA = {
  provider: {
    type: 'string',
    description: 'Specific provider to use (e.g., openai, stability, fal)',
  },
  model: {
    type: 'string',
    description: 'Specific model to use',
  },
  workflow: {
    type: 'string',
    description: 'Specific workflow to use (e.g., comfyui-sdxl)',
  },
  capabilities: {
    type: 'array',
    items: { type: 'string' },
    description: 'Required capabilities (e.g., controlnet, lora)',
  },
  routeStrategy: {
    type: 'string',
    enum: ['priority', 'round-robin', 'cost-optimal', 'quality-optimal', 'latency-optimal'],
    description: 'Routing strategy override',
  },
} as const;
