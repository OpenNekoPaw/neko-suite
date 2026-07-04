import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenericAdapter } from '../generic-adapter';
import type { ChatMessage, ChatOptions } from '../../../types/adapter';
import type { Model, Provider } from '../../../types/provider';

const provider: Provider = {
  id: 'deepseek',
  name: 'deepseek',
  displayName: 'DeepSeek',
  type: 'generic',
  apiUrl: 'https://api.deepseek.test',
  apiKey: 'sk-test',
  enabled: true,
  protocolVariant: {
    basePath: '/v1',
    authType: 'bearer',
    streamFormat: 'sse',
  },
};

const model: Model = {
  id: 'deepseek-v4-pro',
  name: 'deepseek-v4-pro',
  providerId: 'deepseek',
  capabilities: ['chat', 'function_calling', 'streaming', 'reasoning'],
  enabled: true,
};

describe('GenericAdapter DeepSeek reasoning compatibility', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('passes assistant reasoning_content back to OpenAI-compatible providers', async () => {
    const adapter = new GenericAdapter();
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        reasoningContent: 'Need context.',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'GetContext', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', content: 'context', toolCallId: 'call_1' },
    ];

    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'resp-1',
        model: 'deepseek-v4-pro',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'ok',
              reasoning_content: 'Answer from context.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    );

    const response = await adapter.chat(messages, {} satisfies ChatOptions, model, provider);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as {
      messages: Array<{ reasoning_content?: string }>;
    };
    expect(body.messages[1]?.reasoning_content).toBe('Need context.');
    expect(response.message.reasoningContent).toBe('Answer from context.');
    expect(response.reasoningContent).toBe('Answer from context.');
    expect(response.thinking).toBe('Answer from context.');
  });

  it('maps max_tokens from resolved output cap instead of model context metadata', async () => {
    const adapter = new GenericAdapter();
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'resp-1',
        model: 'deepseek-v4-pro',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    );

    await adapter.chat(
      [{ role: 'user', content: 'hi' }],
      { maxTokens: 8192 },
      { ...model, contextWindow: 256000, maxOutputTokens: 128000 },
      provider,
    );

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as {
      max_tokens?: number;
    };
    expect(body.max_tokens).toBe(8192);
  });

  it('streams reasoning_content and fragmented tool-call deltas without creating text-token tools', async () => {
    const adapter = new GenericAdapter();
    const stream = [
      sse({
        id: 'chunk-1',
        model: 'deepseek-v4-pro',
        choices: [{ index: 0, delta: { reasoning_content: 'Need ' }, finish_reason: null }],
      }),
      sse({
        id: 'chunk-1',
        model: 'deepseek-v4-pro',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'Get', arguments: '' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      sse({
        id: 'chunk-1',
        model: 'deepseek-v4-pro',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [{ index: 0, function: { name: 'Context', arguments: '{"include' } }],
            },
            finish_reason: null,
          },
        ],
      }),
      sse({
        id: 'chunk-1',
        model: 'deepseek-v4-pro',
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: 'Tools":true}' } }] },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      'data: [DONE]\n\n',
    ].join('');

    fetchSpy.mockResolvedValueOnce(streamResponse(stream));

    const chunks = [];
    for await (const chunk of adapter.chatStream(
      [{ role: 'user', content: '当前支持的能力' }],
      {},
      model,
      provider,
    )) {
      chunks.push(chunk);
    }

    expect(chunks[0]?.reasoningContent).toBe('Need ');
    const toolNames = chunks.flatMap(
      (chunk) => chunk.delta.toolCalls?.map((call) => call.function.name) ?? [],
    );
    const toolArguments = chunks.flatMap(
      (chunk) => chunk.delta.toolCalls?.map((call) => call.function.arguments) ?? [],
    );
    expect(toolNames).toEqual(['Get', 'Context', '']);
    expect(toolArguments).toEqual(['', '{"include', 'Tools":true}']);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamResponse(body: string): Response {
  return new Response(new TextEncoder().encode(body), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function sse(body: unknown): string {
  return `data: ${JSON.stringify(body)}\n\n`;
}
