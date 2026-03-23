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
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaGenerationType,
} from './types';
import { getMediaAdapterRegistry } from './adapters/media-adapter-registry';
import type { ProviderRegistry } from '../provider/provider-registry';
import type { ConfigManager } from '../config/config-manager';
import type { MediaTaskManagerDeps } from './index';
import { getLogger } from '../utils/logger';
import { resolveProvider } from '@neko/ai-sdk';
import { generateImage, experimental_generateVideo, experimental_generateSpeech } from 'ai';

const logger = getLogger('MediaTaskExecutor');

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
    options: MediaTaskExecutorOptions = {},
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
    const recoveryStorage = taskManager.getRecoveryStorage() as
      | { loadAll(): Promise<TaskRecoveryInfo[]> }
      | undefined;
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
          logger.warn('Provider not found for recovery', { providerId: info.providerId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
          continue;
        }

        // Get adapter
        const adapter = getMediaAdapterRegistry().getForType(provider.type);
        if (!adapter) {
          logger.warn('Adapter not found for recovery', { providerType: provider.type });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
          continue;
        }

        // Check task status on external platform
        const result = await adapter.getTaskStatus(info.externalTaskId, provider);

        if (result.status === 'completed') {
          // Task already completed, clean up
          logger.info('Recovered task already completed', { taskId: info.taskId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          // Task failed/cancelled, clean up
          logger.info('Recovered task failed/cancelled', { taskId: info.taskId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
        } else {
          // Task still pending/processing, resume polling
          logger.info('Resuming polling for task', { taskId: info.taskId });
          this.resumePolling(taskManager, info, adapter, provider);
          resumed++;
        }
      } catch (error) {
        logger.error('Recovery failed for task', { taskId: info.taskId, error });
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
    provider: Provider,
  ): void {
    // Run polling in background
    this.pollForCompletionWithRecovery(
      adapter,
      info.externalTaskId,
      provider,
      info.taskId,
      taskManager,
      () => {}, // No progress callback for resumed tasks
    )
      .then(() => {
        // Clean up recovery info on completion
        if (taskManager.deleteRecoveryInfo) {
          taskManager.deleteRecoveryInfo(info.taskId).catch((err) => {
            logger.error('Failed to delete recovery info', { error: err });
          });
        }
      })
      .catch((err) => {
        logger.error('Resumed polling failed', { taskId: info.taskId, error: err });
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
      onProgress: (progress: number) => void,
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

      // Get legacy adapter for bridge fallback
      const legacyAdapter = getMediaAdapterRegistry().getForType(provider.type);

      // All generation goes through AI SDK (native providers or legacy bridge)
      const aiSdkResult = await this.tryAISDK(
        generationType,
        request,
        model,
        provider,
        onProgress,
        legacyAdapter ?? undefined,
      );
      if (aiSdkResult) return aiSdkResult;

      return {
        error: `No AI SDK provider or legacy adapter found for provider type: ${provider.type}`,
      };
    };
  }

  /**
   * Try AI SDK for image/video generation.
   * Returns TaskOutput if AI SDK handled it, null if not supported (fallback to legacy).
   */
  private async tryAISDK(
    generationType: MediaGenerationType,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
    model: Model,
    provider: Provider,
    onProgress: (progress: number) => void,
    legacyAdapter?: MediaAdapter,
  ): Promise<TaskOutput | null> {
    const resolved = resolveProvider(
      provider.type,
      { apiUrl: provider.apiUrl, apiKey: provider.apiKey ?? '' },
      legacyAdapter as import('@neko/ai-sdk').LegacyMediaAdapter | undefined,
    );
    if (!resolved) return null;

    try {
      // Image generation via AI SDK
      if (generationType === 'text-to-image' || generationType === 'image-to-image') {
        const imageModel = resolved.image(model.name);
        if (!imageModel) return null;

        const imgReq = request as ImageGenerationRequest;
        const size =
          imgReq.width && imgReq.height ? (`${imgReq.width}x${imgReq.height}` as const) : undefined;

        const result = await generateImage({
          model: imageModel,
          prompt: imgReq.prompt,
          n: imgReq.count ?? 1,
          size: size as `${number}x${number}` | undefined,
        });

        onProgress(100);
        return {
          data: {
            outputs: result.images.map((img) => ({
              type: 'image' as const,
              url: img.base64 ? `data:${img.mediaType};base64,${img.base64}` : '',
              mimeType: img.mediaType,
            })),
          },
        };
      }

      // Video generation via AI SDK
      if (
        generationType === 'text-to-video' ||
        generationType === 'image-to-video' ||
        generationType === 'video-to-video'
      ) {
        const videoModel = resolved.video(model.name);
        if (!videoModel) return null;

        const vidReq = request as VideoGenerationRequest;
        const resolution = vidReq.resolution
          ? this.parseResolutionToSize(vidReq.resolution)
          : undefined;

        const result = await experimental_generateVideo({
          model: videoModel,
          prompt: vidReq.prompt,
          resolution,
          duration: vidReq.duration,
          fps: vidReq.fps,
        });

        onProgress(100);
        const video = result.video;
        return {
          data: {
            outputs: [
              {
                type: 'video' as const,
                url: video.base64 ? `data:${video.mediaType};base64,${video.base64}` : '',
                mimeType: video.mediaType,
              },
            ],
          },
        };
      }

      // Audio (TTS + music) via AI SDK
      if (generationType === 'text-to-audio' || generationType === 'text-to-music') {
        const audioReq = request as AudioGenerationRequest;
        const speechModel = resolved.speech(model.name);
        if (!speechModel) return null;

        const result = await experimental_generateSpeech({
          model: speechModel,
          text: audioReq.prompt,
          voice: audioReq.metadata?.voice as string | undefined,
          speed: audioReq.metadata?.speed as number | undefined,
          outputFormat: audioReq.format,
        });

        onProgress(100);
        const audio = result.audio;
        return {
          data: {
            outputs: [
              {
                type: 'audio' as const,
                url: audio.base64 ? `data:${audio.mediaType};base64,${audio.base64}` : '',
                mimeType: audio.mediaType,
              },
            ],
          },
        };
      }

      return null;
    } catch (error) {
      // Do not silently fallback — user specified this provider, report the error
      const message = error instanceof Error ? error.message : String(error);
      logger.error('AI SDK generation failed', { error });
      return { error: message };
    }
  }

  /**
   * Parse resolution string (e.g., "720p") to "WxH" format
   */
  private parseResolutionToSize(resolution: string): `${number}x${number}` | undefined {
    const presets: Record<string, `${number}x${number}`> = {
      '480p': '854x480',
      '720p': '1280x720',
      '1080p': '1920x1080',
    };
    const preset = presets[resolution];
    if (preset) return preset;
    // If already in WxH format
    const match = resolution.match(/^(\d+)x(\d+)$/);
    if (match) return resolution as `${number}x${number}`;
    return undefined;
  }

  /**
   * Poll for task completion
   */
  private async pollForCompletion(
    adapter: MediaAdapter,
    externalTaskId: string,
    provider: Provider,
    onProgress: (progress: number) => void,
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
        await new Promise((resolve) => setTimeout(resolve, this.pollingIntervalMs * 2));
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
    onProgress: (progress: number) => void,
  ): Promise<TaskOutput> {
    try {
      const output = await this.pollForCompletion(adapter, externalTaskId, provider, onProgress);

      // Clean up recovery info on completion
      if (taskManager.deleteRecoveryInfo) {
        await taskManager.deleteRecoveryInfo(taskId).catch((err) => {
          logger.error('Failed to delete recovery info', { error: err });
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
  request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
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
