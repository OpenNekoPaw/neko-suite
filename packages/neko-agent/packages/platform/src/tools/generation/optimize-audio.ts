/**
 * Optimize Audio Tool
 */

import type { ToolResult, ToolCategory } from '../../types/tool';
import { BuiltinTool } from '@neko/shared';
import type { AIGenerationService } from './types';

export class OptimizeAudioTool extends BuiltinTool {
  readonly name = 'OptimizeAudio';
  readonly description = 'Optimize audio quality with denoising, normalization, and voice enhancement';
  readonly category: ToolCategory = 'generation';
  readonly requiresConfirmation = true;
  readonly parameters = {
    type: 'object',
    properties: {
      audioUrl: {
        type: 'string',
        description: 'URL of the audio to optimize',
      },
      denoise: {
        type: 'boolean',
        description: 'Apply noise reduction (default: true)',
      },
      normalize: {
        type: 'boolean',
        description: 'Normalize audio levels (default: true)',
      },
      enhanceVoice: {
        type: 'boolean',
        description: 'Enhance voice clarity (default: false)',
      },
      removeBackground: {
        type: 'boolean',
        description: 'Remove background noise/music (default: false)',
      },
    },
    required: ['audioUrl'],
  };

  constructor(private aiService: AIGenerationService) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    if (!this.aiService.optimizeAudio) {
      return this.error('Audio optimization is not configured');
    }

    try {
      const result = await this.aiService.optimizeAudio({
        audioUrl: args.audioUrl as string,
        denoise: args.denoise as boolean | undefined,
        normalize: args.normalize as boolean | undefined,
        enhanceVoice: args.enhanceVoice as boolean | undefined,
        removeBackground: args.removeBackground as boolean | undefined,
      });

      const isAsync = result.taskId && !result.url;

      return this.success({
        mediaId: result.id,
        taskId: result.taskId,
        status: result.status || (isAsync ? 'pending' : 'completed'),
        url: result.url,
        mimeType: result.mimeType,
        message: isAsync
          ? `Audio optimization task started (taskId: ${result.taskId}). Use task status to check progress.`
          : 'Audio optimized successfully',
        backgroundMode: isAsync,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to optimize audio');
    }
  }
}
