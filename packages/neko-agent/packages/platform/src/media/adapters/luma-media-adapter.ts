/**
 * Luma AI Media Adapter
 *
 * Supports Luma Dream Machine video generation API
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  VideoGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * Luma API response types
 */
interface LumaGenerationResponse {
  id: string;
  state: 'queued' | 'dreaming' | 'completed' | 'failed';
  failure_reason?: string;
  created_at: string;
  assets?: {
    video?: string;
    thumbnail?: string;
  };
  version?: string;
  request?: {
    prompt: string;
    aspect_ratio?: string;
    loop?: boolean;
  };
}

/**
 * Luma AI media adapter
 */
export class LumaMediaAdapter extends BaseMediaAdapter {
  readonly type = 'luma';

  getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-video', 'image-to-video'];
  }

  /**
   * Generate video using Luma API
   */
  async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/dream-machine/v1/generations`;

    const body: Record<string, unknown> = {
      prompt: request.prompt,
    };

    if (request.aspectRatio) {
      body.aspect_ratio = request.aspectRatio.replace(':', ':');
    }

    if (request.referenceImageUrl) {
      body.keyframes = {
        frame0: {
          type: 'image',
          url: request.referenceImageUrl,
        },
      };
    }

    // Luma specific options from model
    if (model.options?.loop) {
      body.loop = true;
    }

    const { data, error } = await this.request<LumaGenerationResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    return {
      externalTaskId: data?.id,
      status: this.mapStatus(data?.state),
      progress: this.estimateProgress(data?.state),
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(
    externalTaskId: string,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/dream-machine/v1/generations/${externalTaskId}`;

    const { data, error } = await this.request<LumaGenerationResponse>(
      url,
      { method: 'GET' },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.failure_reason) {
      return {
        status: 'failed',
        error: {
          code: 'GENERATION_FAILED',
          message: data.failure_reason,
          retryable: false,
        },
      };
    }

    const outputs: MediaOutput[] | undefined =
      data?.assets?.video
        ? [
            {
              type: 'video',
              url: data.assets.video,
              thumbnailUrl: data.assets.thumbnail,
              mimeType: 'video/mp4',
            },
          ]
        : undefined;

    return {
      externalTaskId,
      status: this.mapStatus(data?.state),
      progress: this.estimateProgress(data?.state),
      outputs: data?.state === 'completed' ? outputs : undefined,
    };
  }

  /**
   * Cancel a running task
   */
  async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    const url = `${provider.apiUrl}/dream-machine/v1/generations/${externalTaskId}`;
    await this.request(url, { method: 'DELETE' }, provider);
  }

  /**
   * Map Luma status to our status
   */
  private mapStatus(
    state?: string
  ): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (state) {
      case 'queued':
        return 'pending';
      case 'dreaming':
        return 'processing';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Estimate progress from state
   */
  private estimateProgress(state?: string): number {
    switch (state) {
      case 'queued':
        return 0;
      case 'dreaming':
        return 50;
      case 'completed':
        return 100;
      case 'failed':
        return 0;
      default:
        return 0;
    }
  }
}
