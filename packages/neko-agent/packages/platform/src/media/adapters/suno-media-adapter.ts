/**
 * Suno Media Adapter
 *
 * Supports Suno music generation API
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  AudioGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * Suno API response types
 */
interface SunoGenerateResponse {
  id: string;
  clips: Array<{
    id: string;
    title: string;
    status: 'queued' | 'streaming' | 'complete' | 'error';
    audio_url?: string;
    video_url?: string;
    image_url?: string;
    duration?: number;
    error_message?: string;
  }>;
  status: 'queued' | 'streaming' | 'complete' | 'error';
}

interface SunoStatusResponse {
  id: string;
  status: 'queued' | 'streaming' | 'complete' | 'error';
  clips: Array<{
    id: string;
    title: string;
    status: 'queued' | 'streaming' | 'complete' | 'error';
    audio_url?: string;
    video_url?: string;
    image_url?: string;
    duration?: number;
    error_message?: string;
  }>;
}

/**
 * Suno media adapter for music generation
 */
export class SunoMediaAdapter extends BaseMediaAdapter {
  readonly type = 'suno';

  getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-music', 'text-to-audio'];
  }

  /**
   * Generate audio/music using Suno API
   */
  async generateAudio(
    request: AudioGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/api/generate`;

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      make_instrumental: !request.prompt.toLowerCase().includes('lyrics'),
      wait_audio: false,
    };

    // Add genre/style hints
    if (request.genre) {
      body.tags = request.genre;
    }

    // Custom generation with description
    if (model.name === 'chirp-v3-5' || model.name === 'chirp-v4') {
      body.model = model.name;
    }

    const { data, error } = await this.request<SunoGenerateResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (!data?.id) {
      return {
        status: 'failed',
        error: {
          code: 'API_ERROR',
          message: 'No task ID returned',
          retryable: false,
        },
      };
    }

    return {
      externalTaskId: data.id,
      status: this.mapStatus(data.status),
      progress: this.estimateProgress(data.status),
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(
    externalTaskId: string,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/api/get?ids=${externalTaskId}`;

    const { data, error } = await this.request<SunoStatusResponse[]>(
      url,
      { method: 'GET' },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    const task = data?.[0];
    if (!task) {
      return {
        status: 'failed',
        error: {
          code: 'NOT_FOUND',
          message: 'Task not found',
          retryable: false,
        },
      };
    }

    // Check for errors in any clip
    const failedClip = task.clips.find((c) => c.status === 'error');
    if (failedClip) {
      return {
        status: 'failed',
        error: {
          code: 'GENERATION_FAILED',
          message: failedClip.error_message || 'Generation failed',
          retryable: false,
        },
      };
    }

    const status = this.mapStatus(task.status);

    // Build outputs if completed
    let outputs: MediaOutput[] | undefined;
    if (status === 'completed') {
      outputs = task.clips
        .filter((clip) => clip.audio_url)
        .map((clip) => ({
          type: 'audio' as const,
          url: clip.audio_url!,
          duration: clip.duration,
          thumbnailUrl: clip.image_url,
          mimeType: 'audio/mpeg',
        }));
    }

    return {
      externalTaskId,
      status,
      progress: this.estimateProgress(task.status),
      outputs,
    };
  }

  /**
   * Cancel a running task
   */
  async cancelTask(_externalTaskId: string, _provider: Provider): Promise<void> {
    // Suno does not support task cancellation
  }

  /**
   * Map Suno status to our status
   */
  private mapStatus(
    status?: string
  ): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status) {
      case 'queued':
        return 'pending';
      case 'streaming':
        return 'processing';
      case 'complete':
        return 'completed';
      case 'error':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Estimate progress from status
   */
  private estimateProgress(status?: string): number {
    switch (status) {
      case 'queued':
        return 0;
      case 'streaming':
        return 50;
      case 'complete':
        return 100;
      case 'error':
        return 0;
      default:
        return 0;
    }
  }
}
