/**
 * LLM Client Abstraction
 *
 * Provides a unified interface for LLM calls, supporting:
 * 1. Platform Service integration (when available)
 * 2. Built-in HTTP client (fallback)
 */

import type { ChatMessage, IService, ServiceOptions, ServiceResponse } from '@neko/shared';
import type { CLIConfig } from './types';

/**
 * LLM Client interface
 */
export interface ILLMClient {
  /**
   * Send chat messages and get response
   */
  chat(
    messages: ChatMessage[],
    options?: LLMClientOptions
  ): Promise<LLMClientResponse>;

  /**
   * Get provider name
   */
  getProvider(): string;

  /**
   * Get model name
   */
  getModel(): string;
}

/**
 * LLM Client options
 */
export interface LLMClientOptions {
  tools?: unknown[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * LLM Client response
 */
export interface LLMClientResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Tool call structure
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Create LLM client from CLI config
 *
 * If a Platform Service is provided, uses it for advanced features.
 * Otherwise, falls back to built-in HTTP client.
 */
export function createLLMClient(
  config: CLIConfig,
  service?: IService
): ILLMClient {
  if (service) {
    return new PlatformLLMClient(config, service);
  }
  return new BuiltinLLMClient(config);
}

/**
 * Platform-based LLM Client
 *
 * Uses Platform's Service for:
 * - Multi-provider routing
 * - Fallback mechanisms
 * - Retry policies
 * - Timeout handling
 */
class PlatformLLMClient implements ILLMClient {
  constructor(
    private config: CLIConfig,
    private service: IService
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: LLMClientOptions
  ): Promise<LLMClientResponse> {
    const serviceOptions: ServiceOptions = {
      model: this.config.model,
      maxTokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
      signal: options?.signal,
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      serviceOptions.tools = options.tools as ServiceOptions['tools'];
    }

    const response = await this.service.chat(messages, serviceOptions);
    return this.convertResponse(response);
  }

  getProvider(): string {
    return this.config.provider;
  }

  getModel(): string {
    return this.config.model;
  }

  private convertResponse(response: ServiceResponse): LLMClientResponse {
    const result: LLMClientResponse = {
      content: typeof response.message.content === 'string'
        ? response.message.content
        : '',
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    };

    // Extract tool calls from message
    if (response.message.toolCalls && response.message.toolCalls.length > 0) {
      result.toolCalls = response.message.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      }));
    }

    return result;
  }
}

/**
 * Built-in HTTP LLM Client
 *
 * Simple fetch-based client for direct API calls.
 * Supports: Anthropic, OpenAI, DeepSeek
 */
class BuiltinLLMClient implements ILLMClient {
  constructor(private config: CLIConfig) {}

  async chat(
    messages: ChatMessage[],
    options?: LLMClientOptions
  ): Promise<LLMClientResponse> {
    const { provider, model, apiKey, baseUrl } = this.config;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;
    const temperature = options?.temperature ?? this.config.temperature;

    if (!apiKey) {
      throw new Error('API key is required');
    }

    const response = await this.callAPI(provider, {
      model,
      apiKey,
      baseUrl,
      maxTokens,
      temperature,
      messages,
      tools: options?.tools,
      signal: options?.signal,
    });

    return response;
  }

  getProvider(): string {
    return this.config.provider;
  }

  getModel(): string {
    return this.config.model;
  }

  private async callAPI(
    provider: string,
    options: {
      model: string;
      apiKey: string;
      baseUrl?: string;
      maxTokens: number;
      temperature: number;
      messages: ChatMessage[];
      tools?: unknown[];
      signal?: AbortSignal;
    }
  ): Promise<LLMClientResponse> {
    const { model, apiKey, baseUrl, maxTokens, temperature, messages, tools, signal } = options;

    let url: string;
    let headers: Record<string, string>;
    let body: unknown;

    if (provider === 'anthropic') {
      url = baseUrl ?? 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      body = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: this.formatMessagesForAnthropic(messages),
        ...(tools && tools.length > 0 ? { tools: this.formatToolsForAnthropic(tools) } : {}),
      };
    } else if (provider === 'openai' || provider === 'deepseek') {
      url = baseUrl
        ? `${baseUrl}/v1/chat/completions`
        : provider === 'deepseek'
          ? 'https://api.deepseek.com/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      };
      body = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: this.formatMessagesForOpenAI(messages),
        ...(tools && tools.length > 0 ? { tools: this.formatToolsForOpenAI(tools) } : {}),
      };
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseResponse(provider, data);
  }

  private formatMessagesForAnthropic(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    }));
  }

  private formatMessagesForOpenAI(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  private formatToolsForAnthropic(tools: unknown[]): unknown[] {
    // Anthropic tool format
    return tools;
  }

  private formatToolsForOpenAI(tools: unknown[]): unknown[] {
    // OpenAI tool format
    return tools;
  }

  private parseResponse(
    provider: string,
    data: Record<string, unknown>
  ): LLMClientResponse {
    if (provider === 'anthropic') {
      return this.parseAnthropicResponse(data);
    } else {
      return this.parseOpenAIResponse(data);
    }
  }

  private parseAnthropicResponse(data: Record<string, unknown>): LLMClientResponse {
    const content = data.content as Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
    const usage = data.usage as { input_tokens: number; output_tokens: number } | undefined;

    const textContent = content.find((c) => c.type === 'text');
    const toolUseBlocks = content.filter((c) => c.type === 'tool_use');

    const result: LLMClientResponse = {
      content: textContent?.text ?? '',
      usage: usage
        ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
        : undefined,
    };

    if (toolUseBlocks.length > 0) {
      result.toolCalls = toolUseBlocks.map((block) => ({
        id: block.id ?? '',
        name: block.name ?? '',
        arguments: block.input ?? {},
      }));
    }

    return result;
  }

  private parseOpenAIResponse(data: Record<string, unknown>): LLMClientResponse {
    const choices = data.choices as Array<{
      message: {
        content: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
    const usage = data.usage as {
      prompt_tokens: number;
      completion_tokens: number;
    } | undefined;

    const choice = choices[0];
    const result: LLMClientResponse = {
      content: choice?.message?.content ?? '',
      usage: usage
        ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
        : undefined,
    };

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));
    }

    return result;
  }
}
