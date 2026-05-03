/**
 * Generic REST Adapter - Fallback for OpenAI-compatible APIs
 * Supports protocol variants for different API implementations.
 */

import { BaseAdapter } from './base-adapter';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ContentPart,
  ModelInfo,
  ModelInfoCapability,
} from '../../types/adapter';
import type { Model, Provider, ProtocolVariant } from '../../types/provider';
import { getLogger } from '../../utils/logger';

const logger = getLogger('GenericAdapter');

interface GenericMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface GenericResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GenericAdapter extends BaseAdapter {
  readonly type = 'generic';

  /**
   * Default protocol variant settings for OpenAI-compatible APIs
   */
  private static readonly DEFAULT_VARIANT: Required<ProtocolVariant> = {
    basePath: '/v1',
    authType: 'bearer',
    authHeader: '',
    streamFormat: 'sse',
    streamDoneMarker: '[DONE]',
    extraHeaders: {},
    mediaEndpoints: {},
  };

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'streaming', 'vision', 'function_calling'];
  }

  // ==========================================================================
  // Protocol Variant Helpers
  // ==========================================================================

  /**
   * Get merged protocol variant with defaults
   */
  private getVariant(provider: Provider): Required<ProtocolVariant> {
    return {
      ...GenericAdapter.DEFAULT_VARIANT,
      ...provider.protocolVariant,
    };
  }

  /**
   * Build full URL for an endpoint
   */
  private buildUrl(provider: Provider, endpoint: string): string {
    if (!provider.apiUrl) {
      throw new Error('API URL is required for generic adapter');
    }

    const variant = this.getVariant(provider);
    const baseUrl = provider.apiUrl.replace(/\/+$/, '');
    let basePath = variant.basePath || '';

    // Smart detection: if apiUrl already ends with basePath, don't add it again
    // e.g., if apiUrl is "https://api.example.com/v1" and basePath is "/v1", skip adding basePath
    if (basePath && baseUrl.endsWith(basePath.replace(/^\//, ''))) {
      basePath = '';
    }

    const fullPath = `${basePath}/${endpoint}`.replace(/\/+/g, '/');

    return `${baseUrl}${fullPath}`;
  }

  /**
   * Build authentication headers based on variant config
   */
  private buildAuthHeaders(provider: Provider): Record<string, string> {
    const variant = this.getVariant(provider);
    const apiKey = provider.apiKey || '';

    if (!apiKey) return {};

    switch (variant.authType) {
      case 'bearer':
        return { Authorization: `Bearer ${apiKey}` };
      case 'api-key':
        return { 'x-api-key': apiKey };
      case 'custom-header':
        return variant.authHeader ? { [variant.authHeader]: apiKey } : {};
      default:
        return { Authorization: `Bearer ${apiKey}` };
    }
  }

  /**
   * Build all headers for a request
   */
  private buildHeaders(provider: Provider): Record<string, string> {
    const variant = this.getVariant(provider);
    return {
      ...this.buildAuthHeaders(provider),
      ...variant.extraHeaders,
    };
  }

  // ==========================================================================
  // Chat Methods
  // ==========================================================================

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): Promise<ChatResponse> {
    const url = this.buildUrl(provider, 'chat/completions');
    const headers = this.buildHeaders(provider);
    const body = this.buildRequestBody(messages, options, model);

    const data = await this.httpRequest<GenericResponse>({
      url,
      method: 'POST',
      headers,
      body,
      errorPrefix: 'Generic API error',
    });

    return this.transformResponse(data);
  }

  async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): AsyncIterable<ChatChunk> {
    const url = this.buildUrl(provider, 'chat/completions');
    const headers = this.buildHeaders(provider);
    const body = this.buildRequestBody(messages, { ...options, stream: true }, model);
    const variant = this.getVariant(provider);

    for await (const line of this.httpStream({
      url,
      method: 'POST',
      headers,
      body,
      errorPrefix: 'Generic API error',
    })) {
      // Skip empty lines and SSE comments
      if (!line.trim() || line.startsWith(':')) continue;

      // Handle stream end markers
      const doneMarker = variant.streamDoneMarker;
      if (line === doneMarker || line === `data: ${doneMarker}`) {
        return;
      }

      // Extract JSON from SSE format (remove 'data: ' prefix if present)
      const jsonStr = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();

      // Skip if empty after trimming
      if (!jsonStr) continue;

      try {
        const chunk = JSON.parse(jsonStr);
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        yield {
          id: chunk.id || '',
          model: chunk.model || model.name,
          delta: {
            role: choice.delta?.role,
            content: choice.delta?.content || undefined,
            toolCalls: choice.delta?.tool_calls,
          },
          finishReason: choice.finish_reason,
        };
      } catch {
        // Skip invalid JSON - this is expected for partial chunks or non-JSON lines
      }
    }
  }

  // ==========================================================================
  // Request Building
  // ==========================================================================

  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model || model.name,
      messages: messages.map((m) => this.transformMessage(m)),
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stop) body.stop = options.stop;
    if (options.stream) body.stream = true;

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      if (options.toolChoice) body.tool_choice = options.toolChoice;

      // Debug: log tools structure
      logger.debug('Tools being sent', { tools: options.tools });
    }

    return body;
  }

  private transformMessage(message: ChatMessage): GenericMessage {
    let content: GenericMessage['content'];

    if (typeof message.content === 'string') {
      content = message.content;
    } else {
      content = message.content.map((part: ContentPart) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image') {
          return { type: 'image_url', image_url: { url: part.imageUrl } };
        }
        return { type: 'text', text: part.videoUrl };
      });
    }

    const result: GenericMessage = {
      role: message.role,
      content,
    };

    if (message.name) result.name = message.name;
    if (message.toolCallId) result.tool_call_id = message.toolCallId;
    if (message.toolCalls) result.tool_calls = message.toolCalls;

    return result;
  }

  private transformResponse(data: GenericResponse): ChatResponse {
    const choice = data.choices[0];
    return {
      id: data.id,
      model: data.model,
      message: {
        role: 'assistant',
        content: choice?.message.content || '',
        toolCalls: choice?.message.tool_calls,
      },
      finishReason: (choice?.finish_reason as ChatResponse['finishReason']) || 'stop',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  // ==========================================================================
  // Model Listing
  // ==========================================================================

  /**
   * List available models from the provider
   * Calls the OpenAI-compatible /models endpoint
   */
  async listModels(provider: Provider): Promise<string[]> {
    const url = this.buildUrl(provider, 'models');
    const headers = this.buildHeaders(provider);

    interface ModelsResponse {
      data: Array<{ id: string; object?: string; owned_by?: string }>;
    }

    const data = await this.httpRequest<ModelsResponse>({
      url,
      method: 'GET',
      headers,
      errorPrefix: 'Failed to fetch models',
    });

    return data.data?.map((m) => m.id) || [];
  }

  /**
   * List available models with detailed information
   */
  async listModelsDetailed(provider: Provider): Promise<ModelInfo[]> {
    const url = this.buildUrl(provider, 'models');
    const headers = this.buildHeaders(provider);

    interface ModelsResponse {
      data: Array<{ id: string; object?: string; owned_by?: string }>;
    }

    const data = await this.httpRequest<ModelsResponse>({
      url,
      method: 'GET',
      headers,
      errorPrefix: 'Failed to fetch models',
    });

    return (data.data || []).map((m) => ({
      id: m.id,
      name: m.id,
      capabilities: this.inferCapabilities(m.id),
      owner: m.owned_by,
    }));
  }

  /**
   * Infer model capabilities from model ID
   */
  private inferCapabilities(modelId: string): ModelInfoCapability[] {
    const capabilities: ModelInfoCapability[] = ['chat', 'stream'];
    const id = modelId.toLowerCase();

    // Vision capability
    if (id.includes('vision') || id.includes('gpt-4') || id.includes('claude-3')) {
      capabilities.push('vision');
    }

    // Function calling
    if (id.includes('gpt-') || id.includes('claude') || id.includes('gemini')) {
      capabilities.push('function_call');
    }

    // Embedding
    if (id.includes('embed') || id.includes('embedding')) {
      capabilities.push('embedding');
    }

    // Image generation
    if (id.includes('dall-e') || id.includes('image') || id.includes('stable-diffusion')) {
      capabilities.push('image-generation');
    }

    return capabilities;
  }
}
