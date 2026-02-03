/**
 * Transfer Style Tool
 */

import type { ToolResult } from '../../types/tool';
import { RoutedGenerationTool } from './base';
import { ROUTING_PARAMETER_SCHEMA } from './types';

export class TransferStyleTool extends RoutedGenerationTool {
  readonly name = 'TransferStyle';
  readonly description = 'Apply artistic style transfer to an image';
  readonly parameters = {
    type: 'object',
    properties: {
      sourceImageUrl: {
        type: 'string',
        description: 'URL of the source image to style',
      },
      stylePrompt: {
        type: 'string',
        description: 'Description of the style to apply (e.g., "oil painting", "watercolor", "cyberpunk")',
      },
      styleStrength: {
        type: 'number',
        description: 'Strength of style application (0.0-1.0, default: 0.7)',
        minimum: 0,
        maximum: 1,
      },
      ...ROUTING_PARAMETER_SCHEMA,
    },
    required: ['sourceImageUrl', 'stylePrompt'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.aiService.transferStyle) {
      return this.error('Style transfer is not configured');
    }

    return this.executeWithRouting(
      'style_transfer',
      args,
      () => this.aiService.transferStyle!({
        sourceImageUrl: args.sourceImageUrl as string,
        stylePrompt: args.stylePrompt as string,
        styleStrength: args.styleStrength as number | undefined,
      }),
      'Failed to transfer style'
    );
  }
}
