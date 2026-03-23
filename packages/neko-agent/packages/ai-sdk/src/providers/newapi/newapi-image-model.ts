/**
 * NewAPI Image Model - ImageModelV3 implementation for NewAPI/OneAPI
 *
 * Uses the standard OpenAI-compatible /v1/images/generations endpoint.
 */

import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';

export class NewAPIImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi';
  readonly modelId: string;
  readonly maxImagesPerCall = 4;

  private config: ProviderConfig;

  constructor(modelId: string, config: ProviderConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: ImageModelV3ProviderMetadata;
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
    usage?: ImageModelV3Usage;
  }> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/v1/images/generations`;

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt: options.prompt,
      n: options.n || 1,
    };

    if (options.size) {
      body.size = options.size;
    }
    if (options.aspectRatio) {
      body.aspect_ratio = options.aspectRatio;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(options.headers as Record<string, string>),
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`NewAPI image generation failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      created: number;
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    // Return URLs as strings (AI SDK handles downloading)
    const images = data.data.map((item) => item.url ?? item.b64_json ?? '');

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

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}
