/**
 * Generate TTS Tool
 */

import type { ToolResult } from '../../types/tool';
import { RoutedGenerationTool } from './base';

export class GenerateTTSTool extends RoutedGenerationTool {
  readonly name = 'GenerateTTS';
  readonly description = 'Generate speech audio from text using text-to-speech AI';
  readonly parameters = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to convert to speech',
      },
      voice: {
        type: 'string',
        description: 'Voice ID or name to use',
      },
      language: {
        type: 'string',
        description: 'Language code (e.g., en, zh, ja)',
      },
      speed: {
        type: 'number',
        description: 'Speech speed multiplier (0.5-2.0, default: 1.0)',
        minimum: 0.5,
        maximum: 2.0,
      },
    },
    required: ['text'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.aiService.generateTTS) {
      return this.error('TTS generation is not configured');
    }

    return this.executeWithRouting(
      'tts',
      args,
      () => this.aiService.generateTTS!({
        text: args.text as string,
        voice: args.voice as string | undefined,
        language: args.language as string | undefined,
        speed: args.speed as number | undefined,
      }),
      'Failed to generate TTS'
    );
  }
}
