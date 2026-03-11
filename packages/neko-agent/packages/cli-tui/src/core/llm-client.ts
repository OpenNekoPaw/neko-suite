/**
 * LLM Client Abstraction
 *
 * Provides a built-in HTTP client for direct LLM API calls in CLI standalone mode.
 *
 * Adaptation path (standalone CLI):
 *   CLIConfig → BuiltinLLMClient (ILLMClient) → LLMServiceAdapter (IService) → AgentSession
 *
 * When a Platform service is available (extension mode), the adapter is bypassed:
 *   Platform.createService() → IService → AgentSession
 */

import type { ChatMessage, ToolDefinition } from '@neko/shared';
import type { CLIConfig } from './types';

/**
 * LLM Client interface
 */
export interface ILLMClient {
  /**
   * Send chat messages and get response
   */
  chat(messages: ChatMessage[], options?: LLMClientOptions): Promise<LLMClientResponse>;

  /**
   * Send chat messages and get streaming response
   */
  chatStream(
    messages: ChatMessage[],
    options?: LLMClientOptions,
  ): AsyncIterable<LLMClientStreamChunk>;

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
  tools?: ToolDefinition[];
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
 * Stream chunk from LLM client
 */
export interface LLMClientStreamChunk {
  type: 'content' | 'tool_call' | 'usage' | 'done';
  content?: string;
  toolCall?: Partial<ToolCall>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Create LLM client from CLI config
 */
export function createLLMClient(config: CLIConfig): ILLMClient {
  return new BuiltinLLMClient(config);
}

/**
 * Built-in HTTP LLM Client
 *
 * Simple fetch-based client for direct API calls.
 * Supports: Anthropic, OpenAI, DeepSeek
 */
class BuiltinLLMClient implements ILLMClient {
  constructor(private config: CLIConfig) {}

  async chat(messages: ChatMessage[], options?: LLMClientOptions): Promise<LLMClientResponse> {
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

  async *chatStream(
    messages: ChatMessage[],
    options?: LLMClientOptions,
  ): AsyncIterable<LLMClientStreamChunk> {
    const { provider, apiKey } = this.config;
    const maxTokens = options?.maxTokens ?? this.config.maxTokens;
    const temperature = options?.temperature ?? this.config.temperature;

    if (!apiKey) {
      throw new Error('API key is required');
    }

    const { url, headers, body } = this.buildRequestBody({
      maxTokens,
      temperature,
      messages,
      tools: options?.tools,
      stream: true,
    });

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const providerType = this.config.providerType ?? provider;
    yield* providerType === 'anthropic'
      ? this.parseAnthropicStream(response.body)
      : this.parseOpenAIStream(response.body);
  }

  private async *parseSSELines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *parseAnthropicStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<LLMClientStreamChunk> {
    let inputTokens = 0;
    let outputTokens = 0;
    // Track tool use accumulation
    let currentToolId = '';
    let currentToolName = '';
    let currentToolJson = '';

    for await (const data of this.parseSSELines(body)) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }

      const eventType = event.type as string;

      if (eventType === 'message_start') {
        const message = event.message as Record<string, unknown> | undefined;
        const usage = message?.usage as Record<string, number> | undefined;
        if (usage?.input_tokens) {
          inputTokens = usage.input_tokens;
        }
      } else if (eventType === 'content_block_start') {
        const block = event.content_block as Record<string, unknown> | undefined;
        if (block?.type === 'tool_use') {
          currentToolId = (block.id as string) ?? '';
          currentToolName = (block.name as string) ?? '';
          currentToolJson = '';
        }
      } else if (eventType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'text_delta') {
          yield { type: 'content', content: delta.text as string };
        } else if (delta?.type === 'input_json_delta') {
          currentToolJson += (delta.partial_json as string) ?? '';
        }
      } else if (eventType === 'content_block_stop') {
        if (currentToolId) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(currentToolJson) as Record<string, unknown>;
          } catch {
            /* empty */
          }
          yield {
            type: 'tool_call',
            toolCall: {
              id: currentToolId,
              name: currentToolName,
              arguments: args,
            },
          };
          currentToolId = '';
          currentToolName = '';
          currentToolJson = '';
        }
      } else if (eventType === 'message_delta') {
        const usage = (event.usage as Record<string, number>) ?? {};
        if (usage.output_tokens) {
          outputTokens = usage.output_tokens;
        }
      } else if (eventType === 'message_stop') {
        yield {
          type: 'usage',
          usage: { inputTokens, outputTokens },
        };
        yield { type: 'done' };
      }
    }
  }

  private async *parseOpenAIStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<LLMClientStreamChunk> {
    // Track tool call accumulation
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let finished = false;

    for await (const data of this.parseSSELines(body)) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Handle standalone usage chunk (choices: [] or absent, with usage field)
      // OpenAI sends usage in a separate chunk after finish_reason when stream_options.include_usage is true
      const choices = event.choices as Array<Record<string, unknown>> | undefined;
      if ((!choices || choices.length === 0) && event.usage) {
        const usage = event.usage as Record<string, number>;
        yield {
          type: 'usage',
          usage: {
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
          },
        };
        if (finished) {
          yield { type: 'done' };
        }
        continue;
      }

      if (!choices || choices.length === 0) continue;

      const choice = choices[0];
      if (!choice) continue;
      const delta = choice.delta as Record<string, unknown> | undefined;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        yield { type: 'content', content: delta.content as string };
      }

      // Tool calls
      const tcDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
      if (tcDeltas) {
        for (const tc of tcDeltas) {
          const idx = tc.index as number;
          const fn = tc.function as Record<string, string> | undefined;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, {
              id: (tc.id as string) ?? '',
              name: fn?.name ?? '',
              args: '',
            });
          }
          const existing = toolCalls.get(idx)!;
          if (fn?.arguments) {
            existing.args += fn.arguments;
          }
        }
      }

      // Finish reason
      if (choice.finish_reason) {
        // Emit accumulated tool calls
        for (const [, tc] of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.args) as Record<string, unknown>;
          } catch {
            /* empty */
          }
          yield {
            type: 'tool_call',
            toolCall: { id: tc.id, name: tc.name, arguments: args },
          };
        }

        // Usage may be in this chunk or in a subsequent standalone chunk
        const usage = event.usage as Record<string, number> | undefined;
        if (usage) {
          yield {
            type: 'usage',
            usage: {
              inputTokens: usage.prompt_tokens ?? 0,
              outputTokens: usage.completion_tokens ?? 0,
            },
          };
          yield { type: 'done' };
        } else {
          // Mark finished, wait for standalone usage chunk
          finished = true;
        }
      }
    }

    // If stream ended without explicit done (no usage chunk came)
    if (finished) {
      yield { type: 'done' };
    }
  }

  /**
   * Build provider-specific request URL, headers, and body.
   * Shared by both chat() (via callAPI) and chatStream().
   */
  private buildRequestBody(options: {
    maxTokens: number;
    temperature: number;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
    stream: boolean;
  }): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const { model, apiKey, baseUrl } = this.config;
    // Use providerType for API routing (not provider ID)
    const providerType = this.config.providerType ?? this.config.provider;
    const { maxTokens, temperature, messages, tools, stream } = options;

    if (providerType === 'anthropic') {
      const systemPrompt = this.extractSystemPrompt(messages);
      // Anthropic: resolve endpoint URL
      const url = baseUrl
        ? resolveApiUrl(baseUrl, 'messages')
        : 'https://api.anthropic.com/v1/messages';
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: {
          model,
          max_tokens: maxTokens,
          temperature,
          ...(stream ? { stream: true } : {}),
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages: this.formatMessagesForAnthropic(messages),
          ...(tools && tools.length > 0 ? { tools: this.formatToolsForAnthropic(tools) } : {}),
        },
      };
    }

    // OpenAI-compatible providers (openai, deepseek, generic, ollama, etc.)
    const url = baseUrl
      ? resolveApiUrl(baseUrl, 'chat/completions')
      : 'https://api.openai.com/v1/chat/completions';
    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: {
        model,
        max_tokens: maxTokens,
        temperature,
        ...(stream ? { stream: true } : {}),
        messages: this.formatMessagesForOpenAI(messages),
        ...(tools && tools.length > 0 ? { tools } : {}),
      },
    };
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
      tools?: ToolDefinition[];
      signal?: AbortSignal;
    },
  ): Promise<LLMClientResponse> {
    const { maxTokens, temperature, messages, tools, signal } = options;

    const { url, headers, body } = this.buildRequestBody({
      maxTokens,
      temperature,
      messages,
      tools,
      stream: false,
    });

    const response = await this.fetchWithRetry(url, {
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

  /**
   * Fetch with exponential backoff retry for transient errors
   */
  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, init);

        // Retry on rate limit or server errors
        if (isRetryableStatus(response.status) && attempt < maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 10000);
          await sleep(delay);
          continue;
        }

        return response;
      } catch (err) {
        // Retry on network errors, but not on abort
        if (init.signal?.aborted) throw err;
        if (attempt === maxRetries) throw err;

        const isNetworkError =
          err instanceof TypeError || // fetch network error
          (err instanceof Error && err.message.includes('fetch'));
        if (!isNetworkError) throw err;

        const delay = Math.min(1000 * 2 ** attempt, 10000);
        await sleep(delay);
      }
    }

    // Should not reach here, but TypeScript needs it
    throw new Error('Max retries exceeded');
  }

  /**
   * Extract system prompt from messages (Anthropic uses top-level `system` param)
   */
  private extractSystemPrompt(messages: ChatMessage[]): string | undefined {
    const systemMsgs = messages.filter((m) => m.role === 'system');
    if (systemMsgs.length === 0) return undefined;
    return systemMsgs.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
  }

  /**
   * Format messages for Anthropic API.
   * - Strips system messages (handled via top-level `system` param)
   * - Preserves tool_use / tool_result structure
   */
  private formatMessagesForAnthropic(messages: ChatMessage[]): unknown[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          // Anthropic expects tool results as role: 'user' with tool_result content block
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: m.toolCallId ?? '',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              },
            ],
          };
        }
        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          // Assistant message with tool calls → content blocks
          const contentBlocks: unknown[] = [];
          if (m.content) {
            contentBlocks.push({ type: 'text', text: m.content });
          }
          for (const tc of m.toolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
          return { role: 'assistant', content: contentBlocks };
        }
        return { role: m.role, content: m.content };
      });
  }

  /**
   * Format messages for OpenAI/DeepSeek API.
   * - Preserves tool_calls on assistant messages
   * - Preserves tool_call_id on tool messages
   */
  private formatMessagesForOpenAI(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          tool_call_id: m.toolCallId ?? '',
        };
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: m.content ?? null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  /**
   * Convert ToolDefinition[] (OpenAI format) to Anthropic tool format
   */
  private formatToolsForAnthropic(tools: ToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  private parseResponse(provider: string, data: Record<string, unknown>): LLMClientResponse {
    const providerType = this.config.providerType ?? provider;
    if (providerType === 'anthropic') {
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
    const usage = data.usage as
      | {
          prompt_tokens: number;
          completion_tokens: number;
        }
      | undefined;

    const choice = choices[0];
    const result: LLMClientResponse = {
      content: choice?.message?.content ?? '',
      usage: usage
        ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
        : undefined,
    };

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls.map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          args = { _raw: tc.function.arguments };
        }
        return { id: tc.id, name: tc.function.name, arguments: args };
      });
    }

    return result;
  }
}

/**
 * Resolve the full API endpoint URL from a base URL and endpoint suffix.
 *
 * Handles three cases:
 * 1. baseUrl already has full path (e.g., /v1/chat/completions) → use as-is
 * 2. baseUrl ends with version prefix (e.g., /v1) → append only the endpoint part
 * 3. baseUrl has no API path → append full /v1/{endpoint}
 */
function resolveApiUrl(baseUrl: string, endpoint: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  const pathname = new URL(normalized).pathname;

  // Case 1: full endpoint path present (e.g., /v1/chat/completions, /v1/messages)
  if (/\/v\d+\/.+/.test(pathname)) {
    return normalized;
  }

  // Case 2: ends with version prefix (e.g., /v1)
  if (/\/v\d+$/.test(pathname)) {
    return `${normalized}/${endpoint}`;
  }

  // Case 3: no API path, append full versioned path
  return `${normalized}/v1/${endpoint}`;
}

/** Check if HTTP status is retryable */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

/** Sleep for given milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
