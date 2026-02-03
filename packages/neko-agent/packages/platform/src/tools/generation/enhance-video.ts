/**
 * Enhance Video Tool
 */

import type { ToolResult, ToolCategory } from '../../types/tool';
import { BuiltinTool } from '@neko/shared';
import type { AIGenerationService } from './types';

export class EnhanceVideoTool extends BuiltinTool {
  readonly name = 'EnhanceVideo';
  readonly description = 'Enhance video quality with upscaling, denoising, and stabilization';
  readonly category: ToolCategory = 'generation';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      videoUrl: {
        type: 'string',
        description: 'URL of the video to enhance',
      },
      targetResolution: {
        type: 'string',
        enum: ['720p', '1080p', '4k'],
        description: 'Target resolution for upscaling',
      },
      denoise: {
        type: 'boolean',
        description: 'Apply noise reduction (default: true)',
      },
      stabilize: {
        type: 'boolean',
        description: 'Apply video stabilization (default: false)',
      },
      interpolateFps: {
        type: 'number',
        enum: [30, 60, 120],
        description: 'Interpolate to target frame rate',
      },
    },
    required: ['videoUrl'],
  };

  constructor(private aiService: AIGenerationService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    if (!this.aiService.enhanceVideo) {
      return this.error('Video enhancement is not configured');
    }

    try {
      const result = await this.aiService.enhanceVideo({
        videoUrl: args.videoUrl as string,
        targetResolution: args.targetResolution as string | undefined,
        denoise: args.denoise as boolean | undefined,
        stabilize: args.stabilize as boolean | undefined,
        interpolateFps: args.interpolateFps as number | undefined,
      });

      const isAsync = !!result.taskId;

      return this.success({
        mediaId: result.id,
        taskId: result.taskId,
        status: result.status || (isAsync ? 'pending' : 'completed'),
        url: result.url,
        mimeType: result.mimeType,
        message: isAsync
          ? `Video enhancement task started (taskId: ${result.taskId}). Use task status to check progress.`
          : 'Video enhanced successfully',
        backgroundMode: isAsync,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to enhance video');
    }
  }
}
