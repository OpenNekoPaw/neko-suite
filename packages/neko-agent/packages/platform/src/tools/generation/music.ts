/**
 * Generate Music Tool
 */

import type { ToolResult } from '../../types/tool';
import { RoutedGenerationTool } from './base';
import { ROUTING_PARAMETER_SCHEMA } from './types';

export class GenerateMusicTool extends RoutedGenerationTool {
  readonly name = 'GenerateMusic';
  readonly description = 'Generate background music from a text prompt using AI';
  readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Description of the music to generate',
      },
      duration: {
        type: 'number',
        description: 'Music duration in seconds (default: 30)',
        minimum: 5,
        maximum: 300,
      },
      genre: {
        type: 'string',
        description: 'Music genre (e.g., corporate, ambient, electronic)',
      },
      mood: {
        type: 'string',
        description: 'Music mood (e.g., upbeat, calm, dramatic)',
      },
      ...ROUTING_PARAMETER_SCHEMA,
    },
    required: ['prompt'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.aiService.generateMusic) {
      return this.error('Music generation is not configured');
    }

    return this.executeWithRouting(
      'music_generation',
      args,
      () => this.aiService.generateMusic!({
        prompt: args.prompt as string,
        duration: args.duration as number | undefined,
        genre: args.genre as string | undefined,
        mood: args.mood as string | undefined,
      }),
      'Failed to generate music'
    );
  }
}
