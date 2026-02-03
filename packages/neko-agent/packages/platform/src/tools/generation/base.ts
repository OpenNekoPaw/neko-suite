/**
 * Base class for routed generation tools
 *
 * Provides common routing logic and execute template method for all generation tools.
 */

import type { ToolResult, ToolCategory } from '../../types/tool';
import type { ExecutionRoutingOptions, ExecutionFallbackTrigger } from '../../types/execution-group';
import { BuiltinTool } from '@neko/shared';
import { ExecutionGroupManager, isRoutingError } from '../../provider/execution-group-manager';
import type { AIGenerationService, GenerationRoutingParams, GeneratedMedia } from './types';

/**
 * Target information resolved from routing
 */
interface TargetInfo {
  provider?: string;
  model?: string;
  workflow?: string;
}

/**
 * Abstract base class for generation tools with routing support
 */
export abstract class RoutedGenerationTool extends BuiltinTool {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly category: ToolCategory = 'generation';
  readonly requiresConfirmation = true;

  constructor(
    protected aiService: AIGenerationService,
    protected routingManager?: ExecutionGroupManager
  ) {
    super();
  }

  /**
   * Extract routing parameters from tool arguments
   */
  protected extractRoutingParams(args: Record<string, unknown>): GenerationRoutingParams {
    return {
      provider: args.provider as string | undefined,
      model: args.model as string | undefined,
      workflow: args.workflow as string | undefined,
      capabilities: args.capabilities as string[] | undefined,
      routeStrategy: args.routeStrategy as GenerationRoutingParams['routeStrategy'],
    };
  }

  /**
   * Resolve routing for this generation task
   */
  protected resolveRoute(
    taskType: string,
    params: GenerationRoutingParams
  ): { target?: TargetInfo; error?: string } {
    if (!this.routingManager) {
      return {};
    }

    // Direct target specification
    if (params.provider || params.model || params.workflow) {
      const result = this.routingManager.routeToTarget({
        provider: params.provider,
        model: params.model,
        workflow: params.workflow,
      });

      if (isRoutingError(result)) {
        return { error: result.message };
      }

      return {
        target: {
          provider: result.target.providerId,
          model: result.target.modelId,
          workflow: result.target.workflowId,
        },
      };
    }

    // Route via execution group
    const options: ExecutionRoutingOptions = {};
    if (params.capabilities) {
      options.requiredCapabilities = params.capabilities;
    }

    const result = this.routingManager.route(taskType, options);

    if (isRoutingError(result)) {
      return { error: result.message };
    }

    return {
      target: {
        provider: result.target.providerId,
        model: result.target.modelId,
        workflow: result.target.workflowId,
      },
    };
  }

  /**
   * Attempt fallback routing on execution failure
   */
  protected attemptFallback(
    taskType: string,
    error: unknown,
    excludeTargets: string[]
  ): TargetInfo | null {
    if (!this.routingManager) {
      return null;
    }

    const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
    let errorCategory: ExecutionFallbackTrigger = 'server_error';

    if (errorMessage.includes('rate') || errorMessage.includes('429')) {
      errorCategory = 'rate_limit';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      errorCategory = 'timeout';
    } else if (errorMessage.includes('unavailable') || errorMessage.includes('503')) {
      errorCategory = 'unavailable';
    } else if (errorMessage.includes('content') || errorMessage.includes('policy')) {
      errorCategory = 'content_filter';
    } else if (errorMessage.includes('quota')) {
      errorCategory = 'quota_exceeded';
    }

    const fallbackResult = this.routingManager.routeFallback(taskType, errorCategory, excludeTargets);

    if (!fallbackResult || isRoutingError(fallbackResult)) {
      return null;
    }

    return {
      provider: fallbackResult.target.providerId,
      model: fallbackResult.target.modelId,
      workflow: fallbackResult.target.workflowId,
    };
  }

  /**
   * Template method for executing generation with routing and error handling
   *
   * @param taskType - Type of generation task for routing
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

    const routingParams = this.extractRoutingParams(args);
    let targetInfo: TargetInfo | undefined;

    if (this.routingManager) {
      const routeResult = this.resolveRoute(taskType, routingParams);
      if (routeResult.error) {
        return this.error(routeResult.error);
      }
      targetInfo = routeResult.target;
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
        routedTo: targetInfo,
        backgroundMode: isAsync,
      });
    } catch (error) {
      if (this.routingManager && targetInfo) {
        const fallbackResult = this.attemptFallback(taskType, error, [
          targetInfo.provider || targetInfo.workflow || '',
        ]);
        if (fallbackResult) {
          return this.error(
            `${error instanceof Error ? error.message : errorMessage}. Fallback available: ${JSON.stringify(fallbackResult)}`
          );
        }
      }
      return this.error(error instanceof Error ? error.message : errorMessage);
    }
  }
}
