/**
 * NewAPI Video Model - VideoModelV3 implementation for NewAPI/OneAPI
 *
 * Handles NewAPI-specific differences:
 * - Endpoint: /v1/video/generations (not /v1/videos/generations)
 * - Response: task_id (not id)
 * - Resolution: width/height integers (not resolution string)
 * - Async polling internally until video is ready
 */

import type {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  Experimental_VideoModelV3VideoData as VideoModelV3VideoData,
  SharedV3Warning,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';

interface NewAPIVideoSubmitResponse {
  task_id?: string;
  id?: string;
  status?: string;
}

interface NewAPIVideoStatusResponse {
  task_id?: string;
  id?: string;
  status: string;
  output?: {
    video_url?: string;
    duration?: number;
    width?: number;
    height?: number;
  };
  // NewAPI also supports results array
  results?: Array<{
    url?: string;
  }>;
  error?: {
    code: string;
    message: string;
  };
}

export class NewAPIVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi';
  readonly modelId: string;
  readonly maxVideosPerCall = 1;

  private config: ProviderConfig;
  private pollingIntervalMs = 5000;
  private maxPollingAttempts = 360; // 30 min at 5s

  constructor(modelId: string, config: ProviderConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: VideoModelV3CallOptions): Promise<{
    videos: Array<VideoModelV3VideoData>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: SharedV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
  }> {
    const baseUrl = this.getBaseUrl();
    const submitUrl = `${baseUrl}/v1/video/generations`;

    // Build request body
    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
    };

    if (options.duration !== undefined) body.duration = options.duration;
    if (options.fps !== undefined) body.fps = options.fps;

    // Parse resolution "WxH" to width/height
    if (options.resolution) {
      const [w, h] = options.resolution.split('x').map(Number);
      if (w && h) {
        body.width = w;
        body.height = h;
      }
    }

    if (options.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }

    // Image-to-video: NewAPI uses "image" field
    if (options.image) {
      if (options.image.type === 'file') {
        // File type with data (base64 string or Uint8Array)
        body.image =
          typeof options.image.data === 'string'
            ? options.image.data
            : Buffer.from(options.image.data).toString('base64');
      } else if (options.image.type === 'url') {
        body.image = options.image.url;
      }
    }

    // Submit generation request
    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(options.headers as Record<string, string>),
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text();
      throw new Error(`NewAPI video generation failed (${submitResponse.status}): ${errorBody}`);
    }

    const submitData = (await submitResponse.json()) as NewAPIVideoSubmitResponse;
    const taskId = submitData.task_id ?? submitData.id;

    if (!taskId) {
      throw new Error('NewAPI video generation: no task_id returned');
    }

    // Poll for completion
    const videoUrl = await this.pollForCompletion(taskId, options.abortSignal);

    return {
      videos: [
        {
          type: 'url',
          url: videoUrl,
          mediaType: 'video/mp4',
        },
      ],
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  private async pollForCompletion(taskId: string, abortSignal?: AbortSignal): Promise<string> {
    const baseUrl = this.getBaseUrl();
    // NewAPI uses GET /v1/video/generations/{taskId} for status
    const statusUrl = `${baseUrl}/v1/video/generations/${taskId}`;

    for (let attempt = 0; attempt < this.maxPollingAttempts; attempt++) {
      // Check abort signal
      if (abortSignal?.aborted) {
        throw new Error('Video generation was cancelled');
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollingIntervalMs));

      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: abortSignal,
      });

      if (!response.ok) {
        // Continue polling on transient errors
        continue;
      }

      const data = (await response.json()) as NewAPIVideoStatusResponse;

      if (data.error) {
        throw new Error(`Video generation failed: ${data.error.message}`);
      }

      if (data.status === 'completed' || data.status === 'succeed') {
        // Try different response formats
        const videoUrl = data.output?.video_url ?? data.results?.[0]?.url;
        if (videoUrl) {
          return videoUrl;
        }
        throw new Error('Video completed but no URL found in response');
      }

      if (data.status === 'failed') {
        throw new Error('Video generation failed');
      }

      // Continue polling for 'queued', 'in_progress', 'processing'
    }

    throw new Error(`Video generation timed out after ${this.maxPollingAttempts} polling attempts`);
  }

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}
