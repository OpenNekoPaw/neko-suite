/**
 * Ollama Adapter - Local models
 *
 * Uses shared HttpClient for HTTP operations.
 * Note: Ollama uses NDJSON streaming instead of SSE.
 */

import { BaseAdapter } from './base-adapter';
import type { ChatMessage, ChatOptions, ChatResponse, ChatChunk } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export class OllamaAdapter extends BaseAdapter {
  readonly type = 'ollama';

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'vision', 'streaming', 'embedding'];
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): Promise<ChatResponse> {
    const apiUrl = this.getApiUrl(provider);
    const ollamaMessages = this.transformMessages(messages);

    const data = await this.httpRequest<OllamaResponse>({
      url: `${apiUrl}/chat`,
      method: 'POST',
      headers: {},
      body: {
        model: options.model || model.name,
        messages: ollamaMessages,
        stream: false,
        options: this.buildOptions(options),
      },
      errorPrefix: 'Ollama API error',
    });

    return this.transformResponse(data);
  }

  async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): AsyncIterable<ChatChunk> {
    const apiUrl = this.getApiUrl(provider);
    const ollamaMessages = this.transformMessages(messages);
    const modelName = options.model || model.name;

    // Ollama uses NDJSON, not SSE - need custom streaming
    const response = await fetch(`${apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: ollamaMessages,
        stream: true,
        options: this.buildOptions(options),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            yield {
              id: `ollama-${chunkIndex++}`,
              model: chunk.model,
              delta: { content: chunk.message.content },
              finishReason: chunk.done ? 'stop' : undefined,
            };
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  override async embed(
    input: string | string[],
    model: Model,
    provider: Provider,
  ): Promise<number[][]> {
    const apiUrl = this.getApiUrl(provider);
    const inputs = Array.isArray(input) ? input : [input];
    const embeddings: number[][] = [];

    for (const text of inputs) {
      const data = await this.httpRequest<{ embedding: number[] }>({
        url: `${apiUrl}/embeddings`,
        method: 'POST',
        headers: {},
        body: { model: model.name, prompt: text },
        errorPrefix: 'Ollama API error',
      });

      embeddings.push(data.embedding);
    }

    return embeddings;
  }

  /**
   * List available models
   */
  async listModels(provider: Provider): Promise<string[]> {
    const apiUrl = this.getApiUrl(provider);

    const data = await this.httpRequest<{ models: Array<{ name: string }> }>({
      url: `${apiUrl}/tags`,
      method: 'GET',
      headers: {},
      errorPrefix: 'Ollama API error',
    });

    return data.models.map((m) => m.name);
  }

  private getApiUrl(provider: Provider): string {
    return provider.apiUrl || 'http://localhost:11434/api';
  }

  private transformMessages(messages: ChatMessage[]): OllamaMessage[] {
    return messages
      .filter((m) => m.role !== 'tool') // Ollama doesn't support tool messages
      .map((message) => {
        const ollamaMessage: OllamaMessage = {
          role: message.role as 'system' | 'user' | 'assistant',
          content: typeof message.content === 'string' ? message.content : '',
        };

        // Handle vision messages
        if (Array.isArray(message.content)) {
          const textParts: string[] = [];
          const images: string[] = [];

          for (const part of message.content) {
            if (part.type === 'text') {
              textParts.push(part.text);
            } else if (part.type === 'image') {
              // Extract base64 data
              const imageData = part.imageUrl.startsWith('data:')
                ? part.imageUrl.split(',')[1]
                : part.imageUrl;
              images.push(imageData);
            }
          }

          ollamaMessage.content = textParts.join('\n');
          if (images.length > 0) {
            ollamaMessage.images = images;
          }
        }

        return ollamaMessage;
      });
  }

  private buildOptions(options: ChatOptions): Record<string, unknown> {
    const opts: Record<string, unknown> = {};

    if (options.temperature !== undefined) opts.temperature = options.temperature;
    if (options.topP !== undefined) opts.top_p = options.topP;
    if (options.maxTokens !== undefined) opts.num_predict = options.maxTokens;
    if (options.stop) opts.stop = options.stop;

    return opts;
  }

  private transformResponse(data: OllamaResponse): ChatResponse {
    return {
      id: `ollama-${Date.now()}`,
      model: data.model,
      message: {
        role: 'assistant',
        content: data.message.content,
      },
      finishReason: 'stop',
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }
}
