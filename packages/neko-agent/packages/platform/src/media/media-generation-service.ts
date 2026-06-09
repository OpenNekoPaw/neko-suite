/**
 * Media Generation Service
 *
 * High-level API for media generation (images, videos, audio)
 *
 * NOTE: TaskManager has been moved to @neko/agent package.
 * This service now accepts ITaskManager interface for flexibility.
 */

import type { Task, ITaskManager } from '@neko/shared';
import type {
  MediaGenerationType,
  MediaTask,
  MediaProgressCallback,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaOutput,
  MediaAdapterError,
} from './types';
import { downloadMediaOutputs, type DownloadMediaOptions } from './media-file-downloader';
import { ProviderRegistry } from '../provider/provider-registry';
import { MediaRoutingManager } from './routing/media-routing-manager';
import { createMediaTaskInput } from './media-task-executor';
import { resolveImageGenerationType, resolveVideoGenerationType } from './media-generation-kind';

/**
 * Extended task manager interface with updateOutputData support
 */
export interface IMediaTaskManager extends ITaskManager {
  /** Update task output data (e.g., to store local file paths) */
  updateOutputData?(id: string, outputData: Record<string, unknown>): Promise<boolean>;
}

/**
 * Media generation service options
 */
export interface MediaGenerationServiceOptions {
  /** Default timeout for generation in ms (default: 10 min) */
  defaultTimeoutMs?: number;
}

/**
 * Media generation service - unified API for all media generation
 */
export class MediaGenerationService {
  private taskManager: IMediaTaskManager;
  private providerRegistry: ProviderRegistry;
  private routingManager: MediaRoutingManager;
  private defaultTimeoutMs: number;

  constructor(
    taskManager: IMediaTaskManager,
    providerRegistry: ProviderRegistry,
    routingManager: MediaRoutingManager,
    options: MediaGenerationServiceOptions = {},
  ) {
    this.taskManager = taskManager;
    this.providerRegistry = providerRegistry;
    this.routingManager = routingManager;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60 * 1000;
  }

  /**
   * Generate an image
   */
  async generateImage(request: ImageGenerationRequest): Promise<MediaTask> {
    return this.submitGeneration(resolveImageGenerationType(request), request);
  }

  /**
   * Generate a video
   */
  async generateVideo(request: VideoGenerationRequest): Promise<MediaTask> {
    return this.submitGeneration(resolveVideoGenerationType(request), request);
  }

  /**
   * Generate audio/music
   */
  async generateAudio(request: AudioGenerationRequest): Promise<MediaTask> {
    const generationType: MediaGenerationType = request.isMusic ? 'text-to-music' : 'text-to-audio';

    return this.submitGeneration(generationType, request);
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(taskId: string, timeoutMs?: number): Promise<MediaTask> {
    const task = await this.taskManager.waitForCompletion(
      taskId,
      timeoutMs ?? this.defaultTimeoutMs,
    );
    return this.convertToMediaTask(task);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    return this.taskManager.cancel(taskId);
  }

  /**
   * Delete a task (remove from storage)
   */
  async deleteTask(taskId: string): Promise<boolean> {
    if (this.taskManager.delete) {
      return this.taskManager.delete(taskId);
    }
    return false;
  }

  /**
   * Update task outputs with local file paths
   * Call this after downloading remote outputs to local storage
   */
  async updateTaskOutputs(taskId: string, outputs: MediaOutput[]): Promise<boolean> {
    if (this.taskManager.updateOutputData) {
      return this.taskManager.updateOutputData(taskId, { outputs });
    }
    return false;
  }

  /**
   * Download completed task outputs to a local directory.
   *
   * Retrieves outputs from the task, calls the shared downloader, then updates
   * the task's stored output URLs to point to the local paths.
   *
   * @param taskId    - Task whose outputs should be saved
   * @param outputDir - Absolute path to target directory (created if absent)
   * @param options   - Optional transcoding callback (needed for Electron webview compat)
   * @returns Local file paths (same length/order as task outputs)
   */
  async saveOutputs(
    taskId: string,
    outputDir: string,
    options?: DownloadMediaOptions,
  ): Promise<string[]> {
    const task = await this.getTask(taskId);
    if (!task?.outputs || task.outputs.length === 0) return [];

    const localPaths = await downloadMediaOutputs(
      taskId,
      task.type,
      task.outputs,
      outputDir,
      options,
    );

    if (localPaths.length > 0) {
      const updatedOutputs = task.outputs.map((output, i) => ({
        ...output,
        url: localPaths[i] ?? output.url,
      }));
      await this.updateTaskOutputs(taskId, updatedOutputs);
    }

    return localPaths;
  }

  /**
   * Get task status
   */
  async getTask(taskId: string): Promise<MediaTask | undefined> {
    const task = await this.taskManager.get(taskId);
    return task ? this.convertToMediaTask(task) : undefined;
  }

  /**
   * Subscribe to task progress
   */
  onProgress(taskId: string, callback: MediaProgressCallback): () => void {
    return this.taskManager.onProgress(taskId, (task) => {
      callback(this.convertToMediaTask(task));
    });
  }

  /**
   * Submit a generation request
   */
  private async submitGeneration(
    generationType: MediaGenerationType,
    request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest,
  ): Promise<MediaTask> {
    // Route to best provider
    const routing = await this.routingManager.selectProvider(
      generationType,
      request.routingPreference,
      request.providerId,
      request.modelId,
    );

    if (!routing) {
      throw new Error(`No available provider for ${generationType}`);
    }

    // Create task input
    const taskInput = createMediaTaskInput(
      generationType,
      routing.providerId,
      routing.modelId,
      request,
    );

    // Submit to task manager
    const taskId = await this.taskManager.submit(taskInput);

    // Return initial task state
    return {
      id: taskId,
      type: generationType,
      status: 'pending',
      progress: 0,
      providerId: routing.providerId,
      modelId: routing.modelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      request,
    };
  }

  /**
   * Convert internal task to MediaTask
   */
  private convertToMediaTask(task: Task): MediaTask {
    const payload = task.input.payload as {
      generationType: MediaGenerationType;
      providerId: string;
      modelId: string;
      request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
    };

    const outputs: MediaOutput[] | undefined =
      task.output?.data && typeof task.output.data === 'object'
        ? (task.output.data as { outputs?: MediaOutput[] }).outputs
        : undefined;

    const error: MediaAdapterError | undefined =
      task.error || task.output?.error
        ? {
            code: 'TASK_ERROR',
            message: task.error || task.output?.error || 'Unknown error',
            retryable: false,
          }
        : undefined;

    return {
      id: task.id,
      type: payload.generationType,
      status: this.mapTaskStatus(task.status),
      progress: task.progress,
      providerId: payload.providerId,
      modelId: payload.modelId,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
      outputs,
      error,
      request: payload.request,
    };
  }

  /**
   * Map task status to media task status
   */
  private mapTaskStatus(
    status: string,
  ): 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'running':
        return 'processing';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }
}
