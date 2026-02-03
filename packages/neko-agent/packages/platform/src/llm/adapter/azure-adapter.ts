/**
 * Azure OpenAI Adapter
 *
 * Uses shared HttpClient for HTTP operations.
 */

import { BaseAdapter } from './base-adapter';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ContentPart,
} from '../../types/adapter';
import type { Model } from '../../types/provider';

interface AzureMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface AzureResponse {
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AzureAdapter extends BaseAdapter {
  readonly type = 'azure';

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'vision', 'function_calling', 'json_mode', 'streaming', 'embedding', 'image_generation'];
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model
  ): Promise<ChatResponse> {
    const url = this.buildUrl(model, 'chat/completions');
    const headers = this.buildHeaders(model);
    const body = this.buildRequestBody(messages, options, model);

    const data = await this.httpRequest<AzureResponse>({
      url,
      method: 'POST',
      headers,
      body,
      errorPrefix: 'Azure OpenAI API error',
    });

    return this.transformResponse(data);
  }

  async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model
  ): AsyncIterable<ChatChunk> {
    const url = this.buildUrl(model, 'chat/completions');
    const headers = this.buildHeaders(model);
    const body = this.buildRequestBody(messages, { ...options, stream: true }, model);

    const toolCallsBuffer: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const data of this.httpStream({
      url,
      method: 'POST',
      headers,
      body,
      errorPrefix: 'Azure OpenAI API error',
    })) {
      try {
        const chunk = JSON.parse(data);
        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            let existing = toolCallsBuffer.get(tc.index);
            if (!existing) {
              existing = { id: tc.id || '', name: '', arguments: '' };
              toolCallsBuffer.set(tc.index, existing);
            }
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }

        const toolCalls = choice.delta.tool_calls
          ? Array.from(toolCallsBuffer.values()).map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            }))
          : undefined;

        yield {
          id: chunk.id,
          model: chunk.model,
          delta: {
            role: choice.delta.role,
            content: choice.delta.content || undefined,
            toolCalls,
          },
          finishReason: choice.finish_reason,
        };
      } catch {
        // Skip invalid JSON
      }
    }
  }

  private buildUrl(model: Model, endpoint: string): string {
    const resourceName = (model.options?.resourceName as string) || process.env.AZURE_OPENAI_RESOURCE;
    const deploymentId = (model.options?.deploymentId as string) || model.id;
    const apiVersion = (model.options?.apiVersion as string) || '2024-02-15-preview';

    if (!resourceName) {
      throw new Error('Azure OpenAI resource name not configured');
    }

    return `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentId}/${endpoint}?api-version=${apiVersion}`;
  }

  private buildHeaders(model: Model): Record<string, string> {
    const apiKey = (model.options?.apiKey as string) || process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Azure OpenAI API key not configured');
    }

    return {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };
  }

  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      messages: messages.map((m) => this.transformMessage(m)),
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.frequencyPenalty !== undefined) body.frequency_penalty = options.frequencyPenalty;
    if (options.presencePenalty !== undefined) body.presence_penalty = options.presencePenalty;
    if (options.stop) body.stop = options.stop;
    if (options.stream) body.stream = true;
    if (options.responseFormat) body.response_format = options.responseFormat;

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      if (options.toolChoice) body.tool_choice = options.toolChoice;
    }

    return body;
  }

  private transformMessage(message: ChatMessage): AzureMessage {
    let content: AzureMessage['content'];

    if (typeof message.content === 'string') {
      content = message.content;
    } else {
      content = message.content.map((part: ContentPart) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else {
          return {
            type: 'image_url',
            image_url: { url: part.imageUrl, detail: part.detail },
          };
        }
      });
    }

    const result: AzureMessage = {
      role: message.role,
      content,
    };

    if (message.name) result.name = message.name;
    if (message.toolCallId) result.tool_call_id = message.toolCallId;
    if (message.toolCalls) result.tool_calls = message.toolCalls;

    return result;
  }

  private transformResponse(data: AzureResponse): ChatResponse {
    const choice = data.choices[0];
    return {
      id: data.id,
      model: data.model,
      message: {
        role: 'assistant',
        content: choice.message.content || '',
        toolCalls: choice.message.tool_calls,
      },
      finishReason: choice.finish_reason as ChatResponse['finishReason'],
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }
}
