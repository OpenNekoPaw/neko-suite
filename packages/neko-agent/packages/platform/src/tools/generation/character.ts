/**
 * Generate Character Tool
 */

import type { ToolResult } from '../../types/tool';
import { RoutedGenerationTool } from './base';
import { ROUTING_PARAMETER_SCHEMA } from './types';

export class GenerateCharacterTool extends RoutedGenerationTool {
  readonly name = 'GenerateCharacter';
  readonly description = 'Generate a character image with optional reference for consistency';
  readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Description of the character to generate',
      },
      referenceImageUrl: {
        type: 'string',
        description: 'URL of reference image for character consistency',
      },
      style: {
        type: 'string',
        description: 'Art style (e.g., realistic, anime, cartoon, 3d)',
      },
      pose: {
        type: 'string',
        description: 'Character pose (e.g., standing, sitting, action)',
      },
      expression: {
        type: 'string',
        description: 'Facial expression (e.g., happy, sad, neutral, angry)',
      },
      ...ROUTING_PARAMETER_SCHEMA,
    },
    required: ['prompt'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.aiService.generateCharacter) {
      return this.error('Character generation is not configured');
    }

    return this.executeWithRouting(
      'character_generation',
      args,
      () => this.aiService.generateCharacter!({
        prompt: args.prompt as string,
        referenceImageUrl: args.referenceImageUrl as string | undefined,
        style: args.style as string | undefined,
        pose: args.pose as string | undefined,
        expression: args.expression as string | undefined,
      }),
      'Failed to generate character'
    );
  }
}
