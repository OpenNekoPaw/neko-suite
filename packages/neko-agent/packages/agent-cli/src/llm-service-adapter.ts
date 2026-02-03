/**
 * LLM Service Adapter
 *
 * Adapts the CLI's LLM client to the IService interface
 * required by AgentSession.
 */

import type {
  IService,
  ChatMessage,
  ServiceOptions,
  ServiceResponse,
  StreamChunk,
} from '@neko/shared';
import type { CLIConfig } from './types';
import { createLLMClient, type ILLMClient } from './llm-client';

/**
 * Adapter that wraps ILLMClient to implement IService
 */
export class LLMServiceAdapter implements IService {
  private _client: ILLMClient;
  private _config: CLIConfig;

  constructor(config: CLIConfig, existingService?: IService) {
    this._config = config;
    // If an existing service is provided, use it directly
    if (existingService) {
      this._client = createLLMClient(config, existingService);
    } else {
      this._client = createLLMClient(config);
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: ServiceOptions
  ): Promise<ServiceResponse> {
    const response = await this._client.chat(messages, {
      maxTokens: options?.maxTokens ?? this._config.maxTokens,
      temperature: options?.temperature ?? this._config.temperature,
      tools: options?.tools,
      signal: options?.signal,
    });

    // Convert to ServiceResponse format
    return {
      id: `cli-${Date.now()}`,
      model: this._config.model,
      message: {
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      },
      finishReason: response.toolCalls && response.toolCalls.length > 0
        ? 'tool_calls'
        : 'stop',
      usage: {
        promptTokens: response.usage?.inputTokens ?? 0,
        completionTokens: response.usage?.outputTokens ?? 0,
        totalTokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
      },
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ServiceOptions
  ): AsyncIterable<StreamChunk> {
    // For now, fall back to non-streaming and emit as single chunk
    // TODO: Implement proper streaming support
    const response = await this.chat(messages, options);

    if (response.message.content) {
      yield {
        type: 'content',
        content: typeof response.message.content === 'string'
          ? response.message.content
          : '',
      };
    }

    if (response.message.toolCalls) {
      for (const tc of response.message.toolCalls) {
        yield {
          type: 'tool_call',
          toolCall: tc,
        };
      }
    }

    yield {
      type: 'usage',
      usage: response.usage,
    };

    yield { type: 'done' };
  }

  async embed(_texts: string[]): Promise<{ embeddings: number[][] }> {
    // Embedding not supported in CLI mode
    throw new Error('Embedding not supported in CLI mode');
  }

  getProvider(): string {
    return this._client.getProvider();
  }

  getModel(): string {
    return this._client.getModel();
  }
}

/**
 * Create an LLM service adapter
 */
export function createLLMServiceAdapter(
  config: CLIConfig,
  existingService?: IService
): LLMServiceAdapter {
  return new LLMServiceAdapter(config, existingService);
}
