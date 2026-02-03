/**
 * Media Task Executor
 *
 * Handles async media generation tasks with polling and recovery support
 */

import type { TaskInput, TaskOutput, TaskRecoveryInfo, TaskExecutor } from '@neko/shared';
import type { Provider, Model } from '../types/provider';
import type {
  MediaAdapter,
  MediaAdapterResult,
  MediaTask,
  MediaTaskStatus,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaGenerationType,
  MediaOutput,
} from './types';
import { getMediaAdapterRegistry } from './adapters/media-adapter-registry';
import type { ProviderRegistry } from '../provider/provider-registry';
import type { ConfigManager } from '../config/config-manager';
import type { MediaTaskManagerDeps } from './index';

/**
 * Media task input payload
 */
export interface MediaTaskPayload {
  /** Generation type */
  generationType: MediaGenerationType;
  /** Provider ID */
  providerId: string;
  /** Model ID */
  modelId: string;
  /** Generation request */
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
}

/**
 * Media task executor options
 */
export interface MediaTaskExecutorOptions {
  /** Polling interval in ms (default: 5000) */
  pollingIntervalMs?: number;
  /** Max polling attempts (default: 360 = 30 min at 5s interval) */
  maxPollingAttempts?: number;
}

/**
 * Media task executor for polling-based generation
 */
export class MediaTaskExecutor {
  private providerRegistry: ProviderRegistry;
  private configManager: ConfigManager;
  private taskManager?: MediaTaskManagerDeps;
  private pollingIntervalMs: number;
  private maxPollingAttempts: number;

  constructor(
    providerRegistry: ProviderRegistry,
    configManager: ConfigManager,
    options: MediaTaskExecutorOptions = {}
  ) {
    this.providerRegistry = providerRegistry;
    this.configManager = configManager;
    this.pollingIntervalMs = options.pollingIntervalMs ?? 5000;
    this.maxPollingAttempts = options.maxPollingAttempts ?? 360;
  }

  /**
   * Register this executor with a TaskManager
   */
  registerWith(taskManager: MediaTaskManagerDeps): void {
    this.taskManager = taskManager;
    if (taskManager.registerExecutor) {
      taskManager.registerExecutor('image_generation', this.createExecutor());
      taskManager.registerExecutor('video_generation', this.createExecutor());
      taskManager.registerExecutor('audio_generation', this.createExecutor());
    }
  }

  /**
   * Resume tasks from recovery info after restart
   * Returns number of resumed tasks
   */
  async resumeFromRecovery(taskManager: MediaTaskManagerDeps): Promise<number> {
    if (!taskManager.getRecoveryStorage) {
      return 0;
    }
    const recoveryStorage = taskManager.getRecoveryStorage() as { loadAll(): Promise<TaskRecoveryInfo[]> } | undefined;
    if (!recoveryStorage) {
      return 0;
    }
    const recoveryInfos = await recoveryStorage.loadAll();
    let resumed = 0;

    for (const info of recoveryInfos) {
      try {
        // Get provider
        const provider = this.configManager.getProvider(info.providerId);
        if (!provider) {
          console.warn('[MediaTaskExecutor] Provider not found for recovery:', info.providerId);
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
          continue;
        }

        // Get adapter
        const adapter = getMediaAdapterRegistry().getForType(provider.type);
        if (!adapter) {
          console.warn('[MediaTaskExecutor] Adapter not found for recovery:', provider.type);
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
          continue;
        }

        // Check task status on external platform
        const result = await adapter.getTaskStatus(info.externalTaskId, provider);

        if (result.status === 'completed') {
          // Task already completed, clean up
          console.log('[MediaTaskExecutor] Recovered task already completed:', info.taskId);
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          // Task failed/cancelled, clean up
          console.log('[MediaTaskExecutor] Recovered task failed/cancelled:', info.taskId);
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
        } else {
          // Task still pending/processing, resume polling
          console.log('[MediaTaskExecutor] Resuming polling for task:', info.taskId);
          this.resumePolling(taskManager, info, adapter, provider);
          resumed++;
        }
      } catch (error) {
        console.error('[MediaTaskExecutor] Recovery failed for task:', info.taskId, error);
        // Clean up invalid recovery info
        if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
      }
    }

    return resumed;
  }

  /**
   * Resume polling for an external task
   */
  private resumePolling(
    taskManager: MediaTaskManagerDeps,
    info: TaskRecoveryInfo,
    adapter: MediaAdapter,
    provider: Provider
  ): void {
    // Run polling in background
    this.pollForCompletionWithRecovery(
      adapter,
      info.externalTaskId,
      provider,
      info.taskId,
      taskManager,
      () => {} // No progress callback for resumed tasks
    ).then(() => {
      // Clean up recovery info on completion
      if (taskManager.deleteRecoveryInfo) {
        taskManager.deleteRecoveryInfo(info.taskId).catch((err) => {
          console.error('[MediaTaskExecutor] Failed to delete recovery info:', err);
        });
      }
    }).catch((err) => {
      console.error('[MediaTaskExecutor] Resumed polling failed:', info.taskId, err);
      if (taskManager.deleteRecoveryInfo) {
        taskManager.deleteRecoveryInfo(info.taskId).catch(() => {});
      }
    });
  }

  /**
   * Create the executor function
   */
  private createExecutor(): TaskExecutor {
    return async (
      input: TaskInput,
      onProgress: (progress: number) => void
    ): Promise<TaskOutput> => {
      const payload = input.payload as unknown as MediaTaskPayload & { __taskId?: string };
      const { generationType, providerId, modelId, request, __taskId } = payload;

      // Get provider and model (uses configManager for config data)
      const provider = this.configManager.getProvider(providerId);
      const model = this.configManager.getModel(modelId);

      if (!provider || !model) {
        return {
          error: `Provider or model not found: ${providerId}/${modelId}`,
        };
      }

      // Get adapter
      const adapter = getMediaAdapterRegistry().getForType(provider.type);

      if (!adapter) {
        return {
          error: `No adapter found for provider type: ${provider.type}`,
        };
      }

      // Submit generation request
      let result: MediaAdapterResult;

      try {
        result = await this.submitGeneration(
          adapter,
          generationType,
          request,
          model,
          provider
        );
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      if (result.status === 'failed') {
        return {
          error: result.error?.message || 'Generation failed',
        };
      }

      if (result.status === 'completed') {
        onProgress(100);
        return {
          data: {
            outputs: result.outputs,
            metadata: result.metadata,
          },
        };
      }

      // Poll for completion
      if (!result.externalTaskId) {
        return {
          error: 'No external task ID returned for async generation',
        };
      }

      // Save recovery info for restart recovery
      if (__taskId && this.taskManager?.saveRecoveryInfo) {
        await this.taskManager.saveRecoveryInfo(
          __taskId,
          result.externalTaskId,
          providerId
        );
      }

      // Poll and return result
      const output = await this.pollForCompletion(
        adapter,
        result.externalTaskId,
        provider,
        onProgress
      );

      // Clean up recovery info on completion
      if (__taskId && this.taskManager?.deleteRecoveryInfo) {
        await this.taskManager.deleteRecoveryInfo(__taskId).catch((err) => {
          console.error('[MediaTaskExecutor] Failed to delete recovery info:', err);
        });
      }

      return output;
    };
  }

  /**
   * Submit the generation request
   */
  private async submitGeneration(
    adapter: MediaAdapter,
    generationType: MediaGenerationType,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    switch (generationType) {
      case 'text-to-image':
      case 'image-to-image':
        return adapter.generateImage(request as ImageGenerationRequest, model, provider);

      case 'text-to-video':
      case 'image-to-video':
      case 'video-to-video':
        return adapter.generateVideo(request as VideoGenerationRequest, model, provider);

      case 'text-to-audio':
      case 'text-to-music':
        return adapter.generateAudio(request as AudioGenerationRequest, model, provider);

      default:
        throw new Error(`Unsupported generation type: ${generationType}`);
    }
  }

  /**
   * Poll for task completion
   */
  private async pollForCompletion(
    adapter: MediaAdapter,
    externalTaskId: string,
    provider: Provider,
    onProgress: (progress: number) => void
  ): Promise<TaskOutput> {
    let attempts = 0;

    while (attempts < this.maxPollingAttempts) {
      attempts++;

      // Wait before polling
      await new Promise((resolve) => setTimeout(resolve, this.pollingIntervalMs));

      try {
        const result = await adapter.getTaskStatus(externalTaskId, provider);

        // Update progress
        if (result.progress !== undefined) {
          onProgress(result.progress);
        }

        // Check status
        switch (result.status) {
          case 'completed':
            onProgress(100);
            return {
              data: {
                outputs: result.outputs,
                metadata: result.metadata,
              },
            };

          case 'failed':
            return {
              error: result.error?.message || 'Generation failed',
            };

          case 'cancelled':
            return {
              error: 'Generation was cancelled',
            };

          case 'pending':
          case 'processing':
            // Continue polling
            break;
        }
      } catch (error) {
        // If polling fails, continue with reduced frequency
        await new Promise((resolve) =>
          setTimeout(resolve, this.pollingIntervalMs * 2)
        );
      }
    }

    return {
      error: `Generation timed out after ${this.maxPollingAttempts} polling attempts`,
    };
  }

  /**
   * Poll for completion with recovery cleanup
   * Used when resuming tasks after restart
   */
  private async pollForCompletionWithRecovery(
    adapter: MediaAdapter,
    externalTaskId: string,
    provider: Provider,
    taskId: string,
    taskManager: MediaTaskManagerDeps,
    onProgress: (progress: number) => void
  ): Promise<TaskOutput> {
    try {
      const output = await this.pollForCompletion(
        adapter,
        externalTaskId,
        provider,
        onProgress
      );

      // Clean up recovery info on completion
      if (taskManager.deleteRecoveryInfo) {
        await taskManager.deleteRecoveryInfo(taskId).catch((err) => {
          console.error('[MediaTaskExecutor] Failed to delete recovery info:', err);
        });
      }

      return output;
    } catch (error) {
      // Clean up on error too
      if (taskManager.deleteRecoveryInfo) {
        await taskManager.deleteRecoveryInfo(taskId).catch(() => {});
      }
      throw error;
    }
  }
}

/**
 * Create media task input
 */
export function createMediaTaskInput(
  generationType: MediaGenerationType,
  providerId: string,
  modelId: string,
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest
): TaskInput {
  const typeMap: Record<string, 'image_generation' | 'video_generation' | 'audio_generation'> = {
    'text-to-image': 'image_generation',
    'image-to-image': 'image_generation',
    'text-to-video': 'video_generation',
    'image-to-video': 'video_generation',
    'video-to-video': 'video_generation',
    'text-to-audio': 'audio_generation',
    'text-to-music': 'audio_generation',
  };

  return {
    type: typeMap[generationType] || 'image_generation',
    payload: {
      generationType,
      providerId,
      modelId,
      request,
    } as unknown as Record<string, unknown>,
  };
}
