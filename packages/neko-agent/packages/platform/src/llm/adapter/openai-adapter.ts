/**
 * OpenAI Adapter - Using AI SDK
 *
 * Uses @ai-sdk/openai for API integration.
 * Embedding and image generation use direct HTTP calls.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { embed, embedMany, type LanguageModel } from 'ai';
import { AISdkAdapter } from './ai-sdk-adapter';
import { getHttpClient } from '../../core/http-client';
import type {
  ChatOptions,
  ImageGenerationOptions,
  ImageGenerationResult,
  ModelInfo,
  ModelInfoCapability,
} from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';

/**
 * OpenAI adapter using AI SDK
 */
export class OpenAIAdapter extends AISdkAdapter {
  readonly type = 'openai';

  private static readonly DEFAULT_API_URL = 'https://api.openai.com/v1';
  private static readonly ENV_KEY_NAME = 'OPENAI_API_KEY';

  /** Helper for HTTP calls (embedding, image generation) */
  private readonly httpHelper = new OpenAIHttpHelper();

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'vision', 'function_calling', 'json_mode', 'streaming', 'embedding', 'image_generation'];
  }

  /**
   * Get the AI SDK OpenAI language model
   *
   * Uses Chat Completions API (.chat()) instead of Responses API for compatibility
   * with third-party API proxies that don't support the /responses endpoint.
   */
  protected getLanguageModel(model: Model, provider: Provider): LanguageModel {
    const apiKey = provider.apiKey || process.env[OpenAIAdapter.ENV_KEY_NAME];
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseURL = provider.apiUrl || OpenAIAdapter.DEFAULT_API_URL;

    const openai = createOpenAI({
      apiKey,
      baseURL,
    });

    // Use .chat() to explicitly use Chat Completions API (/v1/chat/completions)
    // instead of the default Responses API (/responses) which many proxies don't support
    return openai.chat(model.name);
  }

  /**
   * Get OpenAI-specific provider options
   *
   * Note: strictJsonSchema is disabled by default for compatibility with
   * third-party API proxies that don't support OpenAI's Structured Outputs feature.
   */
  protected override getProviderOptions(options: ChatOptions, provider: Provider, _model: Model): Record<string, unknown> {
    const result: Record<string, unknown> = {
      // Disable strict JSON schema validation for tool calls
      // Many API proxies don't support this OpenAI-specific feature
      openai: {
        strictJsonSchema: provider.supportsBeta ?? false,
      },
    };

    if (options.responseFormat) {
      result.responseFormat = options.responseFormat;
    }

    return result;
  }

  /**
   * Generate embeddings using AI SDK
   */
  async embed(input: string | string[], model: Model, provider: Provider): Promise<number[][]> {
    const apiKey = provider.apiKey || process.env[OpenAIAdapter.ENV_KEY_NAME];
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseURL = provider.apiUrl || OpenAIAdapter.DEFAULT_API_URL;

    const openai = createOpenAI({
      apiKey,
      baseURL,
    });

    const embeddingModel = openai.embedding(model.name);
    const inputs = Array.isArray(input) ? input : [input];

    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: inputs,
    });

    return embeddings;
  }

  /**
   * Generate image using OpenAI DALL-E
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    model: Model,
    provider: Provider
  ): Promise<ImageGenerationResult> {
    return this.httpHelper.generateImage(prompt, options, model, provider);
  }

  /**
   * List available models
   */
  async listModels(provider: Provider): Promise<string[]> {
    const models = await this.listModelsDetailed(provider);
    return models.map((m) => m.id);
  }

  /**
   * List available models with details
   */
  async listModelsDetailed(provider: Provider): Promise<ModelInfo[]> {
    return this.httpHelper.listModelsDetailed(provider);
  }
}

/**
 * Helper class for OpenAI HTTP operations not supported by AI SDK
 *
 * Uses HttpClient directly instead of inheriting BaseAdapter,
 * since this class only handles image generation and model listing.
 */
class OpenAIHttpHelper {
  private static readonly DEFAULT_API_URL = 'https://api.openai.com/v1';
  private static readonly ENV_KEY_NAME = 'OPENAI_API_KEY';

  private readonly http = getHttpClient();

  /**
   * Generate image using OpenAI DALL-E
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    model: Model,
    provider: Provider
  ): Promise<ImageGenerationResult> {
    const { apiKey, apiUrl } = this.getCredentials(provider);

    const data = await this.http.request<{
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    }>({
      url: `${apiUrl}/images/generations`,
      method: 'POST',
      headers: this.http.buildBearerAuth(apiKey),
      body: {
        model: model.name,
        prompt,
        size: options.size || '1024x1024',
        quality: options.quality || 'standard',
        style: options.style || 'natural',
        n: options.n || 1,
      },
    }, 'OpenAI API error');

    return {
      images: data.data.map((img) => ({
        url: img.url,
        b64Json: img.b64_json,
        revisedPrompt: img.revised_prompt,
      })),
    };
  }

  /**
   * List available models with details
   */
  async listModelsDetailed(provider: Provider): Promise<ModelInfo[]> {
    const { apiKey, apiUrl } = this.getCredentials(provider);

    const data = await this.http.request<{ data: Array<{ id: string; owned_by: string }> }>({
      url: `${apiUrl}/models`,
      method: 'GET',
      headers: this.http.buildBearerAuth(apiKey),
    }, 'OpenAI API error');

    return data.data.map((m) => this.inferModelCapabilities(m.id, m.owned_by));
  }

  private getCredentials(provider: Provider): { apiKey: string; apiUrl: string } {
    const apiKey = provider.apiKey || process.env[OpenAIHttpHelper.ENV_KEY_NAME];
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    return {
      apiKey,
      apiUrl: provider.apiUrl || OpenAIHttpHelper.DEFAULT_API_URL,
    };
  }

  /**
   * Infer model capabilities from model ID
   */
  private inferModelCapabilities(modelId: string, owner: string): ModelInfo {
    const id = modelId.toLowerCase();
    const capabilities: ModelInfoCapability[] = [];

    // Chat models
    if (
      id.startsWith('gpt-') ||
      id.startsWith('o1') ||
      id.startsWith('chatgpt') ||
      id.includes('chat') ||
      id.includes('instruct')
    ) {
      capabilities.push('chat', 'stream');
      // Vision models
      if (id.includes('vision') || id.includes('gpt-4o') || id.includes('gpt-4-turbo')) {
        capabilities.push('vision');
      }
      // Function calling support
      if (!id.includes('instruct') && (id.includes('gpt-4') || id.includes('gpt-3.5-turbo'))) {
        capabilities.push('function_call');
      }
    }
    // Image generation models
    else if (id.startsWith('dall-e')) {
      capabilities.push('image-generation');
    }
    // Embedding models
    else if (id.includes('embedding') || id.includes('embed')) {
      capabilities.push('embedding');
    }
    // Unknown models - default to chat
    else {
      capabilities.push('chat');
    }

    return { id: modelId, capabilities, owner };
  }
}
