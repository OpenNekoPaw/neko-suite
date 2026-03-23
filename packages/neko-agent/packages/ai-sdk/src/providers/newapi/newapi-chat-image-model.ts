/**
 * NewAPI Chat Image Model - ImageModelV3 implementation using Chat Completions
 *
 * For multimodal LLMs that generate images via chat (Gemini, GPT-image):
 * - POST /v1/chat/completions with modalities: ['text', 'image']
 * - Response content includes base64 image parts
 *
 * This model implements ImageModelV3 so it can be used interchangeably
 * with NewAPIImageModel (which uses /v1/images/generations).
 */

import type {
  ImageModelV3,
  ImageModelV3CallOptions,
  ImageModelV3ProviderMetadata,
  ImageModelV3Usage,
  SharedV3Warning,
} from '@ai-sdk/provider';
import type { ProviderConfig } from '../../types';

/** Chat completions response format */
interface ChatCompletionResponse {
  id: string;
  object: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | ContentPart[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Content part in multimodal response */
type ContentPart = TextPart | ImageUrlPart | InlineImagePart;

interface TextPart {
  type: 'text';
  text: string;
}

interface ImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

interface InlineImagePart {
  type: 'image';
  data?: string;
  source?: { type: 'base64'; media_type: string; data: string };
}

export class NewAPIChatImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'newapi-chat';
  readonly modelId: string;
  readonly maxImagesPerCall = 1;

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
    const url = `${baseUrl}/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: [{ role: 'user', content: options.prompt }],
      modalities: ['text', 'image'],
    };

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
      throw new Error(`Chat image generation failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;

    if (!data.choices?.length) {
      throw new Error('Chat image generation: no choices in response');
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Chat image generation: empty response content');
    }

    // Extract images from response content
    const images = this.extractImages(content);

    if (images.length === 0) {
      throw new Error(
        'Chat image generation: no images found in response. The model may not support image generation.',
      );
    }

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

  /**
   * Extract base64 image strings from chat response content.
   * Handles multiple response formats from different proxies.
   */
  private extractImages(content: string | ContentPart[]): string[] {
    // String content — may contain markdown image or no image at all
    if (typeof content === 'string') {
      // Try to extract base64 from markdown: ![...](data:image/...;base64,...)
      const dataUrlMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g);
      if (dataUrlMatch) {
        return dataUrlMatch.map((url) => {
          // Extract just the base64 part after the comma
          const base64 = url.split(',')[1];
          return base64 ?? url;
        });
      }
      return [];
    }

    // Array content — extract from structured parts
    const images: string[] = [];

    for (const part of content) {
      // Format 1: { type: 'image_url', image_url: { url: 'data:image/...;base64,...' } }
      if (part.type === 'image_url') {
        const url = (part as ImageUrlPart).image_url?.url;
        if (url) {
          if (url.startsWith('data:')) {
            const base64 = url.split(',')[1];
            if (base64) images.push(base64);
          } else {
            // Direct URL — return as-is (AI SDK handles download)
            images.push(url);
          }
        }
      }

      // Format 2: { type: 'image', data: 'base64...' }
      if (part.type === 'image') {
        const imgPart = part as InlineImagePart;
        if (imgPart.data) {
          images.push(imgPart.data);
        }
        if (imgPart.source?.data) {
          images.push(imgPart.source.data);
        }
      }
    }

    return images;
  }

  private getBaseUrl(): string {
    let base = this.config.apiUrl.replace(/\/+$/, '');
    base = base.replace(/\/v1$/, '');
    return base;
  }
}
