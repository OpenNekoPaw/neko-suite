/**
 * Legacy Adapter Bridge - VideoModelV3 wrapper
 *
 * Wraps a legacy MediaAdapter as an AI SDK VideoModelV3.
 * Handles async polling internally when adapter returns externalTaskId.
 */

import type {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  Experimental_VideoModelV3VideoData as VideoModelV3VideoData,
  SharedV3Warning,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import type { LegacyMediaAdapter, LegacyAdapterResult, ProviderConfig } from '../types';
import { pollUntilDone, POLLING_PRESETS } from '../polling';

export class LegacyVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider: string;
  readonly modelId: string;
  readonly maxVideosPerCall = 1;

  constructor(
    provider: string,
    modelId: string,
    private adapter: LegacyMediaAdapter,
    private config: ProviderConfig,
  ) {
    this.provider = provider;
    this.modelId = modelId;
  }

  async doGenerate(options: VideoModelV3CallOptions): Promise<{
    videos: Array<VideoModelV3VideoData>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: SharedV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
  }> {
    // Convert AI SDK options to legacy adapter request
    const request: Record<string, unknown> = {
      prompt: options.prompt ?? '',
    };

    if (options.resolution) {
      const [w, h] = options.resolution.split('x').map(Number);
      if (w && h) {
        request.width = w;
        request.height = h;
      }
    }
    if (options.duration !== undefined) request.duration = options.duration;
    if (options.fps !== undefined) request.fps = options.fps;
    if (options.aspectRatio) request.aspectRatio = options.aspectRatio;
    if (options.seed !== undefined) request.seed = options.seed;

    // Image-to-video
    if (options.image) {
      if ('url' in options.image) {
        request.referenceImageUrl = options.image.url;
      }
    }

    const model = { name: this.modelId, id: this.modelId };
    const provider = {
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
      type: this.provider,
    };

    // Call legacy adapter
    let result = await this.adapter.generateVideo(request, model, provider);

    // Handle async polling
    if (result.externalTaskId && result.status !== 'completed' && result.status !== 'failed') {
      result = await this.pollForCompletion(result.externalTaskId, provider, options.abortSignal);
    }

    if (result.status === 'failed') {
      throw new Error(result.error?.message ?? 'Video generation failed');
    }

    // Convert outputs to AI SDK format
    const videos: VideoModelV3VideoData[] = (result.outputs ?? []).map((output) => ({
      type: 'url' as const,
      url: output.url,
      mediaType: output.mimeType ?? 'video/mp4',
    }));

    return {
      videos,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  private async pollForCompletion(
    taskId: string,
    provider: unknown,
    abortSignal?: AbortSignal,
  ): Promise<LegacyAdapterResult> {
    return pollUntilDone<LegacyAdapterResult>(
      async () => {
        const result = await this.adapter.getTaskStatus(taskId, provider);
        if (
          result.status === 'completed' ||
          result.status === 'failed' ||
          result.status === 'cancelled'
        ) {
          return result;
        }
        return undefined;
      },
      POLLING_PRESETS.video,
      abortSignal,
    );
  }
}
