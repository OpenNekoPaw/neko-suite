/**
 * Legacy Adapter Bridge - ImageModelV3 wrapper
 *
 * Wraps a legacy MediaAdapter as an AI SDK ImageModelV3.
 * Handles async polling internally when adapter returns externalTaskId.
 */

import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { LegacyMediaAdapter, LegacyAdapterResult, ProviderConfig } from '../types';

const POLLING_INTERVAL_MS = 5000;
const MAX_POLLING_ATTEMPTS = 360;

export class LegacyImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider: string;
  readonly modelId: string;
  readonly maxImagesPerCall = 4;

  constructor(
    provider: string,
    modelId: string,
    private adapter: LegacyMediaAdapter,
    private config: ProviderConfig,
  ) {
    this.provider = provider;
    this.modelId = modelId;
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: ImageModelV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
    usage?: ImageModelV3Usage;
  }> {
    // Convert AI SDK options to legacy adapter request
    const request = {
      prompt: options.prompt ?? '',
      width: options.size ? parseInt(options.size.split('x')[0]) : undefined,
      height: options.size ? parseInt(options.size.split('x')[1]) : undefined,
      aspectRatio: options.aspectRatio,
      count: options.n,
      seed: options.seed,
    };

    const model = { name: this.modelId, id: this.modelId };
    const provider = {
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
      type: this.provider,
    };

    // Call legacy adapter
    let result = await this.adapter.generateImage(request, model, provider);

    // Handle async polling
    if (result.externalTaskId && result.status !== 'completed' && result.status !== 'failed') {
      result = await this.pollForCompletion(result.externalTaskId, provider, options.abortSignal);
    }

    if (result.status === 'failed') {
      throw new Error(result.error?.message ?? 'Image generation failed');
    }

    // Convert outputs to AI SDK format (URLs as strings)
    const images = (result.outputs ?? []).map((output) => output.url);

    return {
      images,
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
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
      if (abortSignal?.aborted) throw new Error('Image generation cancelled');
      await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS));

      const result = await this.adapter.getTaskStatus(taskId, provider);
      if (
        result.status === 'completed' ||
        result.status === 'failed' ||
        result.status === 'cancelled'
      ) {
        return result;
      }
    }
    throw new Error('Image generation timed out');
  }
}
