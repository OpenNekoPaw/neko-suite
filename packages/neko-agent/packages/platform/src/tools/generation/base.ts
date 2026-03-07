/**
 * Base class for generation tools
 *
 * Provides common execute template method for all generation tools.
 */

import type { ToolResult, ToolCategory } from '../../types/tool';
import { BuiltinTool } from '@neko/shared';
import type { AIGenerationService, GeneratedMedia } from './types';

/**
 * Abstract base class for AI generation tools
 */
export abstract class RoutedGenerationTool extends BuiltinTool {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly category: ToolCategory = 'generation';
  readonly requiresConfirmation = true;

  constructor(protected aiService: AIGenerationService) {
    super();
  }

  /**
   * Template method for executing generation with error handling
   *
   * @param taskType - Type of generation task (for messages)
   * @param args - Tool arguments
   * @param generateFn - The actual generation function to call
   * @param errorMessage - Error message prefix for failures
   */
  protected async executeWithRouting(
    taskType: string,
    args: Record<string, unknown>,
    generateFn: () => Promise<GeneratedMedia>,
    errorMessage: string
  ): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error!);
    }

    try {
      const result = await generateFn();
      const isAsync = result.taskId && !result.url;

      return this.success({
        mediaId: result.id,
        taskId: result.taskId,
        status: result.status || (isAsync ? 'pending' : 'completed'),
        url: result.url,
        mimeType: result.mimeType,
        message: isAsync
          ? `${taskType} task started (taskId: ${result.taskId}). Use task status to check progress.`
          : `${taskType} completed successfully`,
        backgroundMode: isAsync,
      });
    } catch (error) {
      return this.error(error instanceof Error ? error.message : errorMessage);
    }
  }
}
