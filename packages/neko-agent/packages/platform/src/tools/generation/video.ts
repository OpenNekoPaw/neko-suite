/**
 * Generate Video Tool
 */

import type { ToolResult } from '../../types/tool';
import { RoutedGenerationTool } from './base';

export class GenerateVideoTool extends RoutedGenerationTool {
  readonly name = 'GenerateVideo';
  readonly description = 'Generate a video from a text prompt using AI';
  readonly parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Text description of the video to generate',
      },
      duration: {
        type: 'number',
        description: 'Video duration in seconds (default: 4)',
        minimum: 1,
        maximum: 30,
      },
      resolution: {
        type: 'string',
        enum: ['480p', '720p', '1080p'],
        description: 'Video resolution (default: 720p)',
      },
      fps: {
        type: 'number',
        description: 'Frames per second (default: 24)',
        enum: [24, 30, 60],
      },
    },
    required: ['prompt'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.aiService.generateVideo) {
      return this.error('Video generation is not configured');
    }

    return this.executeWithRouting(
      'video_generation',
      args,
      () => this.aiService.generateVideo!({
        prompt: args.prompt as string,
        duration: args.duration as number | undefined,
        resolution: args.resolution as string | undefined,
        fps: args.fps as number | undefined,
      }),
      'Failed to generate video'
    );
  }
}
