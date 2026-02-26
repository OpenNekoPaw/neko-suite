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
    const clientOptions = {
      maxTokens: options?.maxTokens ?? this._config.maxTokens,
      temperature: options?.temperature ?? this._config.temperature,
      tools: options?.tools,
      signal: options?.signal,
    };

    for await (const chunk of this._client.chatStream(messages, clientOptions)) {
      if (chunk.type === 'content') {
        yield { type: 'content', content: chunk.content };
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: chunk.toolCall.id,
            type: 'function' as const,
            function: chunk.toolCall.name
              ? {
                  name: chunk.toolCall.name,
                  arguments: JSON.stringify(chunk.toolCall.arguments ?? {}),
                }
              : undefined,
          },
        };
      } else if (chunk.type === 'usage' && chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: chunk.usage.inputTokens,
            completionTokens: chunk.usage.outputTokens,
            totalTokens: chunk.usage.inputTokens + chunk.usage.outputTokens,
          },
        };
      } else if (chunk.type === 'done') {
        yield { type: 'done' };
      }
    }
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
