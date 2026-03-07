/**
 * Generation Tools Types
 *
 * Shared types for AI generation tools.
 */

import type { MediaTaskStatus } from '../../media/types';

/**
 * AI Service interface for generation tools
 */
export interface AIGenerationService {
  generateImage(options: ImageGenerationOptions): Promise<GeneratedMedia>;
  generateVideo?(options: VideoGenerationOptions): Promise<GeneratedMedia>;
  generateTTS?(options: TTSOptions): Promise<GeneratedMedia>;
  generateMusic?(options: MusicGenerationOptions): Promise<GeneratedMedia>;
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
