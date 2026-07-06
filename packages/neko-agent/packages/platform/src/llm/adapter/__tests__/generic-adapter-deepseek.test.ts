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

  it('projects invalid OpenAI-compatible tool names and maps tool calls back', async () => {
    const adapter = new GenericAdapter();
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        id: 'resp-1',
        model: 'deepseek-v4-pro',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'canvas_getPlaybackPlan',
                    arguments: '{"sourceCanvasUri":"file:///tmp/board.nkc"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    );

    const response = await adapter.chat(
      [
        { role: 'system', content: 'system' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_prev',
              type: 'function',
              function: { name: 'canvas.getPlaybackPlan', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', content: '{}', toolCallId: 'call_prev' },
        { role: 'user', content: 'read playback plan' },
      ],
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'canvas.getPlaybackPlan',
              description: 'Read playback plan.',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        toolChoice: {
          type: 'function',
          function: { name: 'canvas.getPlaybackPlan' },
        },
      },
      model,
      provider,
    );

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as {
      tools: Array<{ function: { name: string } }>;
      tool_choice?: { type: 'function'; function: { name: string } };
      messages: Array<{ tool_calls?: Array<{ function: { name: string } }> }>;
    };
    expect(body.tools[0]?.function.name).toBe('canvas_getPlaybackPlan');
    expect(body.tool_choice?.function.name).toBe('canvas_getPlaybackPlan');
    expect(body.messages[1]?.tool_calls?.[0]?.function.name).toBe('canvas_getPlaybackPlan');
    expect(response.message.toolCalls?.[0]?.function.name).toBe('canvas.getPlaybackPlan');
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

  it('maps fragmented projected streaming tool names back to original names', async () => {
    const adapter = new GenericAdapter();
    const stream = [
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
                  function: { name: 'canvas_get', arguments: '' },
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
              tool_calls: [
                { index: 0, function: { name: 'PlaybackPlan', arguments: '{"ok":true}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
      'data: [DONE]\n\n',
    ].join('');

    fetchSpy.mockResolvedValueOnce(streamResponse(stream));

    const chunks = [];
    for await (const chunk of adapter.chatStream(
      [{ role: 'user', content: 'read playback plan' }],
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'canvas.getPlaybackPlan',
              description: 'Read playback plan.',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      },
      model,
      provider,
    )) {
      chunks.push(chunk);
    }

    const toolNames = chunks.flatMap(
      (chunk) => chunk.delta.toolCalls?.map((call) => call.function.name) ?? [],
    );
    expect(toolNames).toEqual(['', 'canvas.getPlaybackPlan']);
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
