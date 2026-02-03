/**
 * Runway Media Adapter
 *
 * Supports Runway Gen-3 Alpha video generation API
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
 * Runway API response types
 */
interface RunwayTaskResponse {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  progress?: number;
  output?: string[];
  failure?: string;
  createdAt: string;
}

/**
 * Runway media adapter
 */
export class RunwayMediaAdapter extends BaseMediaAdapter {
  readonly type = 'runway';

  private readonly apiVersion = '2024-11-06';

  getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-video', 'image-to-video'];
  }

  /**
   * Build Runway-specific headers
   */
  protected buildAuthHeader(provider: Provider): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Runway-Version': this.apiVersion,
    };
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }
    return headers;
  }

  /**
   * Generate video using Runway API
   */
  async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    // Determine if this is text-to-video or image-to-video
    const isImageToVideo = !!request.referenceImageUrl;
    const url = `${provider.apiUrl}/v1/${isImageToVideo ? 'image_to_video' : 'text_to_video'}`;

    const body: Record<string, unknown> = {
      model: model.name || 'gen3a_turbo',
      prompt_text: request.prompt,
    };

    if (isImageToVideo) {
      body.prompt_image = request.referenceImageUrl;
    }

    if (request.duration) {
      // Runway uses 5 or 10 seconds
      body.duration = request.duration <= 5 ? 5 : 10;
    }

    if (request.aspectRatio) {
      body.ratio = request.aspectRatio.replace(':', ':');
    }

    const { data, error } = await this.request<RunwayTaskResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    return {
      externalTaskId: data?.id,
      status: this.mapStatus(data?.status),
      progress: data?.progress ?? this.estimateProgress(data?.status),
    };
  }

  /**
   * Get task status
   */
  async getTaskStatus(
    externalTaskId: string,
    provider: Provider
  ): Promise<MediaAdapterResult> {
    const url = `${provider.apiUrl}/v1/tasks/${externalTaskId}`;

    const { data, error } = await this.request<RunwayTaskResponse>(
      url,
      { method: 'GET' },
      provider
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.failure) {
      return {
        status: 'failed',
        error: {
          code: 'GENERATION_FAILED',
          message: data.failure,
          retryable: false,
        },
      };
    }

    const outputs: MediaOutput[] | undefined = data?.output?.map((url) => ({
      type: 'video' as const,
      url,
      mimeType: 'video/mp4',
    }));

    return {
      externalTaskId,
      status: this.mapStatus(data?.status),
      progress: data?.progress ?? this.estimateProgress(data?.status),
      outputs: data?.status === 'SUCCEEDED' ? outputs : undefined,
    };
  }

  /**
   * Cancel a running task
   */
  async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    const url = `${provider.apiUrl}/v1/tasks/${externalTaskId}/cancel`;
    await this.request(url, { method: 'POST' }, provider);
  }

  /**
   * Map Runway status to our status
   */
  private mapStatus(
    status?: string
  ): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (status) {
      case 'PENDING':
        return 'pending';
      case 'RUNNING':
        return 'processing';
      case 'SUCCEEDED':
        return 'completed';
      case 'FAILED':
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
      case 'PENDING':
        return 0;
      case 'RUNNING':
        return 50;
      case 'SUCCEEDED':
        return 100;
      case 'FAILED':
        return 0;
      default:
        return 0;
    }
  }
}
