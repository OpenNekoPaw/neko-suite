/**
 * Generate Image Tool
 */

import type { ToolResult } from '../../types/tool';
import { RoutedGenerationTool } from './base';

export class GenerateImageTool extends RoutedGenerationTool {
  readonly name = 'GenerateImage';
  readonly description = 'Generate an image from a text prompt using AI';
  readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Text description of the image to generate',
      },
      size: {
        type: 'string',
        enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
        description: 'Image dimensions (default: 1024x1024)',
      },
      quality: {
        type: 'string',
        enum: ['standard', 'hd'],
        description: 'Image quality (default: standard)',
      },
      style: {
        type: 'string',
        enum: ['natural', 'vivid'],
        description: 'Image style (default: vivid)',
      },
      n: {
        type: 'number',
        description: 'Number of images to generate (default: 1, max: 4)',
        minimum: 1,
        maximum: 4,
      },
    },
    required: ['prompt'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return this.executeWithRouting(
      'image_generation',
      args,
      () => this.aiService.generateImage({
        prompt: args.prompt as string,
        size: args.size as string | undefined,
        quality: args.quality as 'standard' | 'hd' | undefined,
        style: args.style as 'natural' | 'vivid' | undefined,
        n: args.n as number | undefined,
      }),
      'Failed to generate image'
    );
  }
}
