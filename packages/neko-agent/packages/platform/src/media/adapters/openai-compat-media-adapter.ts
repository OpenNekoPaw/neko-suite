/**
 * OpenAI Compatible Media Adapter
 *
 * Supports Sora, xAI Grok, Kling and other OpenAI-compatible video/image APIs
 */

import type { Model, Provider } from '../../types/provider';
import type {
  MediaGenerationType,
  MediaAdapterResult,
  MediaTaskStatus,
  ImageGenerationRequest,
  VideoGenerationRequest,
  MediaOutput,
} from '../types';
import { BaseMediaAdapter } from './base-media-adapter';

/**
 * OpenAI compatible response types
 */
interface OpenAIImageResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

interface OpenAIVideoResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  created_at: number;
  model: string;
  output?: {
    video_url: string;
    duration: number;
    width: number;
    height: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * OpenAI compatible media adapter for Sora, xAI, Kling
 */
export class OpenAICompatMediaAdapter extends BaseMediaAdapter {
  readonly type = 'openai-compat';

  private static readonly STATUS_MAP: Record<string, MediaTaskStatus> = {
    queued: 'pending',
    in_progress: 'processing',
    completed: 'completed',
    failed: 'failed',
  };

  private static readonly PROGRESS_MAP: Record<string, number> = {
    queued: 0,
    in_progress: 50,
    completed: 100,
    failed: 0,
  };

  getSupportedTypes(): MediaGenerationType[] {
    return ['text-to-image', 'text-to-video', 'image-to-video'];
  }

  /**
   * Get normalized base URL (removes trailing /v1 if present)
   */
  private getBaseUrl(provider: Provider): string {
    let baseUrl = provider.apiUrl || '';
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');
    // Remove /v1 suffix if present (will be added by endpoint paths)
    baseUrl = baseUrl.replace(/\/v1$/, '');
    return baseUrl;
  }

  /**
   * Generate image using OpenAI DALL-E compatible API
   */
  async generateImage(
    request: ImageGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${this.getBaseUrl(provider)}/v1/images/generations`;

    const body = {
      model: model.name,
      prompt: request.prompt,
      n: request.count || 1,
      size: this.formatSize(request.width, request.height, request.aspectRatio),
      quality: request.quality || 'standard',
      style: request.style,
    };

    const { data, error } = await this.request<OpenAIImageResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    const outputs: MediaOutput[] =
      data?.data.map((item) => ({
        type: 'image' as const,
        url: item.url || '',
        mimeType: 'image/png',
      })) || [];

    return {
      status: 'completed',
      progress: 100,
      outputs,
    };
  }

  /**
   * Generate video using Sora-like API
   */
  async generateVideo(
    request: VideoGenerationRequest,
    model: Model,
    provider: Provider,
  ): Promise<MediaAdapterResult> {
    const url = `${this.getBaseUrl(provider)}/v1/videos/generations`;

    const body: Record<string, unknown> = {
      model: model.name,
      prompt: request.prompt,
    };

    if (request.duration) body.duration = request.duration;
    if (request.resolution) body.resolution = request.resolution;
    if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;
    if (request.referenceImageUrl) body.image_url = request.referenceImageUrl;

    const { data, error } = await this.request<OpenAIVideoResponse>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    // Video generation is async, return task ID for polling
    return {
      externalTaskId: data?.id,
      status: this.mapStatusFrom(data?.status, OpenAICompatMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.status, OpenAICompatMediaAdapter.PROGRESS_MAP),
    };
  }

  /**
   * Get task status for async video generation
   */
  async getTaskStatus(externalTaskId: string, provider: Provider): Promise<MediaAdapterResult> {
    const url = `${this.getBaseUrl(provider)}/v1/videos/${externalTaskId}`;

    const { data, error } = await this.request<OpenAIVideoResponse>(
      url,
      { method: 'GET' },
      provider,
    );

    if (error) {
      return { status: 'failed', error };
    }

    if (data?.error) {
      return {
        status: 'failed',
        error: {
          code: data.error.code,
          message: data.error.message,
          retryable: false,
        },
      };
    }

    const outputs: MediaOutput[] | undefined = data?.output
      ? [
          {
            type: 'video',
            url: data.output.video_url,
            width: data.output.width,
            height: data.output.height,
            duration: data.output.duration,
            mimeType: 'video/mp4',
          },
        ]
      : undefined;

    return {
      externalTaskId,
      status: this.mapStatusFrom(data?.status, OpenAICompatMediaAdapter.STATUS_MAP),
      progress: this.estimateProgressFrom(data?.status, OpenAICompatMediaAdapter.PROGRESS_MAP),
      outputs,
    };
  }

  /**
   * Cancel a running task
   */
  async cancelTask(externalTaskId: string, provider: Provider): Promise<void> {
    await this.cancelViaEndpoint(
      `${this.getBaseUrl(provider)}/v1/videos/${externalTaskId}/cancel`,
      provider,
    );
  }

  /**
   * Format size string from dimensions
   */
  private formatSize(width?: number, height?: number, aspectRatio?: string): string {
    if (width && height) {
      return `${width}x${height}`;
    }
    if (aspectRatio === '16:9') return '1792x1024';
    if (aspectRatio === '9:16') return '1024x1792';
    return '1024x1024';
  }
}
