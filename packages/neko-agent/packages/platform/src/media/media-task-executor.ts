/**
 * Media Task Executor
 *
 * Handles async media generation tasks with polling and recovery support
 */

import type {
  TaskInput,
  TaskOutput,
  TaskRecoveryInfo,
  TaskExecutor,
  TaskExecutionContext,
  SerializableTask,
  ITaskRecoveryStorage,
} from '@neko/shared';
import { sleepWithAbort } from '@neko/shared';
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
import type { MediaTaskManagerDeps } from './types';
import { getLogger } from '../utils/logger';
import { resolveProvider } from '@neko/ai-sdk';
import { generateImage, experimental_generateVideo, experimental_generateSpeech } from 'ai';
import { materializeImageRequestFileUris } from './media-request-assets';
import {
  formatMediaGenerationErrorSummary,
  getMediaGenerationHttpStatus,
  summarizeMediaGenerationError,
  type MediaGenerationErrorSummary,
} from './media-generation-error';

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

  constructor(
    providerRegistry: ProviderRegistry,
    configManager: ConfigManager,
    _options: MediaTaskExecutorOptions = {},
  ) {
    this.providerRegistry = providerRegistry;
    this.configManager = configManager;
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
    const recoveryStorage: ITaskRecoveryStorage | undefined = taskManager.getRecoveryStorage();
    if (!recoveryStorage) {
      return 0;
    }
    const recoveryInfos = await recoveryStorage.loadAll();
    let resumed = 0;

    for (const info of recoveryInfos) {
      try {
        const task = await taskManager.get(info.taskId);
        if (task?.lifecycle?.recoverPolicy && task.lifecycle.recoverPolicy !== 'resume-polling') {
          logger.debug('Skipping recovery polling for task recover policy', {
            taskId: info.taskId,
            recoverPolicy: task.lifecycle.recoverPolicy,
          });
          continue;
        }

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
          await this.completeRecoveredTask(taskManager, info, {
            data: {
              outputs: result.outputs,
              metadata: result.metadata,
            },
          });
          logger.debug('Recovered task already completed', { taskId: info.taskId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
        } else if (result.status === 'failed' || result.status === 'cancelled') {
          await this.completeRecoveredTask(taskManager, info, {
            error:
              result.status === 'cancelled'
                ? 'Generation was cancelled'
                : result.error?.message || 'Generation failed',
          });
          logger.debug('Recovered task failed/cancelled', { taskId: info.taskId });
          if (taskManager.deleteRecoveryInfo) {
            await taskManager.deleteRecoveryInfo(info.taskId);
          }
        } else {
          // Task still pending/processing, resume polling
          logger.debug('Resuming polling for task', { taskId: info.taskId });
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
      .then((output) => {
        void this.completeRecoveredTask(taskManager, info, output);
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
      context?: TaskExecutionContext,
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

      throwIfAborted(context?.signal);

      // All generation goes through AI SDK (native providers or legacy bridge)
      const aiSdkResult = await this.tryAISDK(
        generationType,
        request,
        model,
        provider,
        onProgress,
        legacyAdapter ?? undefined,
        context,
        __taskId,
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
    context?: TaskExecutionContext,
    taskId?: string,
  ): Promise<TaskOutput | null> {
    // Infer image generation mode from model capabilities:
    // Models with both 'chat' and 'image_generation' use chat completions (Gemini, GPT-image)
    // Models with only 'image_generation' use dedicated /v1/images/generations (flux, dall-e)
    const capabilities = model.capabilities ?? [];
    const imageMode =
      capabilities.includes('chat') &&
      (capabilities.includes('image_generation') || capabilities.includes('text_to_image'))
        ? ('chat' as const)
        : ('standard' as const);

    const resolved = resolveProvider(
      provider.type,
      {
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey ?? '',
        onExternalTaskId: async (externalTaskId) => {
          if (taskId && this.taskManager?.saveRecoveryInfo) {
            await this.taskManager.saveRecoveryInfo(taskId, externalTaskId, provider.id);
          }
          context?.reportLifecycle({
            lifecycle: {
              costPhase: 'external-wait',
              recoverPolicy: 'resume-polling',
              interruptPolicy: 'detach-and-continue',
            },
          });
        },
      },
      legacyAdapter as import('@neko/ai-sdk').LegacyMediaAdapter | undefined,
      { imageMode },
    );
    if (!resolved) return null;

    try {
      context?.reportLifecycle({ lifecycle: { costPhase: 'token-active' } });
      // Image generation via AI SDK
      if (generationType === 'text-to-image' || generationType === 'image-to-image') {
        const imageModel = resolved.image(model.name);
        if (!imageModel) return null;

        const imgReq = await materializeImageRequestFileUris(request as ImageGenerationRequest);
        const size =
          imgReq.width && imgReq.height ? (`${imgReq.width}x${imgReq.height}` as const) : undefined;

        // Carry ControlNet / IP-Adapter / inpaint / edit fields through providerOptions
        // so the legacy bridge (LegacyImageModel) can forward them to the adapter.
        // Native AI SDK providers ignore unknown namespaces, so this is safe.
        const nekoProviderOptions: Record<string, unknown> = {};
        if (imgReq.negativePrompt !== undefined)
          nekoProviderOptions['negativePrompt'] = imgReq.negativePrompt;
        if (imgReq.controlImageBase64 !== undefined)
          nekoProviderOptions['controlImageBase64'] = imgReq.controlImageBase64;
        if (imgReq.controlMode !== undefined)
          nekoProviderOptions['controlMode'] = imgReq.controlMode;
        if (imgReq.controlStrength !== undefined)
          nekoProviderOptions['controlStrength'] = imgReq.controlStrength;
        if (imgReq.ipAdapterRefs !== undefined)
          nekoProviderOptions['ipAdapterRefs'] = imgReq.ipAdapterRefs;
        if (imgReq.referenceImageBase64 !== undefined)
          nekoProviderOptions['referenceImageBase64'] = imgReq.referenceImageBase64;
        if (imgReq.referenceImageUrl !== undefined)
          nekoProviderOptions['referenceImageUrl'] = imgReq.referenceImageUrl;
        if (imgReq.maskBase64 !== undefined) nekoProviderOptions['maskBase64'] = imgReq.maskBase64;
        if (imgReq.inpaintStrength !== undefined)
          nekoProviderOptions['inpaintStrength'] = imgReq.inpaintStrength;
        if (imgReq.editInstruction !== undefined)
          nekoProviderOptions['editInstruction'] = imgReq.editInstruction;
        if (imgReq.style !== undefined) nekoProviderOptions['style'] = imgReq.style;
        if (imgReq.aspectRatio !== undefined)
          nekoProviderOptions['aspectRatio'] = imgReq.aspectRatio;
        if (imgReq.quality !== undefined) nekoProviderOptions['quality'] = imgReq.quality;

        const result = await generateImage({
          model: imageModel,
          prompt: imgReq.prompt,
          n: imgReq.count ?? 1,
          size: size as `${number}x${number}` | undefined,
          abortSignal: context?.signal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(Object.keys(nekoProviderOptions).length > 0
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ({ providerOptions: { neko: nekoProviderOptions } } as any)
            : {}),
        });

        throwIfAborted(context?.signal);
        onProgress(100);
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
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
          abortSignal: context?.signal,
        });

        throwIfAborted(context?.signal);
        onProgress(100);
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
        const video = result.video;
        // Handle both base64 (file type) and URL (url type) responses
        const videoUrl = video.base64
          ? `data:${video.mediaType};base64,${video.base64}`
          : ((video as { url?: string }).url ?? '');
        return {
          data: {
            outputs: [
              {
                type: 'video' as const,
                url: videoUrl,
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
          abortSignal: context?.signal,
        });

        throwIfAborted(context?.signal);
        onProgress(100);
        context?.reportLifecycle({ lifecycle: { costPhase: 'local-finalize' } });
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
      const errorSummary = summarizeMediaGenerationError(error);
      const retryable = this.isRetryableError(error, errorSummary);
      const rawMessage = formatMediaGenerationErrorSummary(errorSummary);
      const errorContext = `[${provider.type}/${model.name}] ${rawMessage}`;
      logger.error(`AI SDK generation failed: ${errorContext}`, {
        generationType,
        providerId: provider.id,
        providerType: provider.type,
        modelId: model.id,
        modelName: model.name,
        retryable,
        error: errorSummary,
      });

      // Determine if the error is retryable (network, rate limit, server errors)
      if (retryable) {
        // Throw to let TaskManager's retry loop handle it
        throw new Error(errorContext);
      }

      // Non-retryable errors (auth, invalid request, content filter) — fail immediately
      return { error: errorContext };
    }
  }

  /**
   * Check if an error is retryable (network, rate limit, server errors)
   */
  private isRetryableError(
    error: unknown,
    summary: MediaGenerationErrorSummary = summarizeMediaGenerationError(error),
  ): boolean {
    if (summary.isRetryable !== undefined) return summary.isRetryable;

    const message = summary.message.toLowerCase();
    const status = summary.status ?? getMediaGenerationHttpStatus(error);

    if (status !== undefined) {
      return status === 429 || (status >= 500 && status < 600);
    }
    // Rate limit errors
    if (message.includes('rate limit')) {
      return true;
    }
    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('timeout') ||
      message.includes('etimedout') ||
      message.includes('fetch failed')
    ) {
      return true;
    }
    // "No video/image generated" — may be transient model issue, worth retrying
    if (message.includes('no video generated') || message.includes('no image generated')) {
      return true;
    }
    return false;
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
   * Poll for task completion (used for recovery polling).
   * Uses video preset since recovery tasks are typically long-running.
   */
  private async pollForCompletion(
    adapter: MediaAdapter,
    externalTaskId: string,
    provider: Provider,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<TaskOutput> {
    const config = {
      initialIntervalMs: 5000,
      maxIntervalMs: 15000,
      backoffStepMs: 1000,
      timeoutMs: 30 * 60 * 1000,
    };
    const startTime = Date.now();
    let currentInterval = config.initialIntervalMs;

    while (Date.now() - startTime < config.timeoutMs) {
      await sleepWithAbort(currentInterval, signal);

      try {
        const result = await adapter.getTaskStatus(externalTaskId, provider);

        if (result.progress !== undefined) {
          onProgress(result.progress);
        }

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
            break;
        }
      } catch (_error) {
        // Transient error, continue with next interval
      }

      currentInterval = Math.min(currentInterval + config.backoffStepMs, config.maxIntervalMs);
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    return {
      error: `Generation timed out after ${elapsedSec}s`,
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
    signal?: AbortSignal,
  ): Promise<TaskOutput> {
    try {
      if (taskManager.updateLifecycle) {
        await taskManager.updateLifecycle(taskId, {
          costPhase: 'external-wait',
          recoverPolicy: 'resume-polling',
          interruptPolicy: 'detach-and-continue',
        });
      }
      const output = await this.pollForCompletion(
        adapter,
        externalTaskId,
        provider,
        onProgress,
        signal,
      );
      if (taskManager.updateLifecycle) {
        await taskManager.updateLifecycle(taskId, { costPhase: 'local-finalize' });
      }

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

  private async completeRecoveredTask(
    taskManager: MediaTaskManagerDeps,
    info: TaskRecoveryInfo,
    output: TaskOutput,
  ): Promise<void> {
    const existing = await taskManager.get(info.taskId);
    if (!existing || !taskManager.upsertExternalTask) {
      return;
    }

    const terminalStatus = output.error ? 'failed' : 'completed';
    const nextTask: SerializableTask = {
      ...existing,
      status: terminalStatus,
      progress: output.error ? existing.progress : 100,
      output,
      ...(output.error ? { error: output.error } : {}),
      lifecycle: {
        ...(existing.lifecycle ?? {
          runMode: 'background',
          costPhase: 'idle',
          interruptPolicy: 'detach-and-continue',
          recoverPolicy: 'resume-polling',
        }),
        costPhase: 'idle',
      },
      updatedAt: Date.now(),
    };

    await taskManager.upsertExternalTask(nextTask);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Task aborted');
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
    lifecycle: {
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'resume-polling',
    },
    payload: {
      generationType,
      providerId,
      modelId,
      request,
    } as unknown as Record<string, unknown>,
    options: {
      retry: {
        maxRetries: 5,
        backoffMs: 3000,
      },
    },
  };
}
