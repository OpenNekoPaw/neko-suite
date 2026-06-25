/**
 * Think Phase Unit Tests
 *
 * Tests the extracted think/thinkStream/parseToolCallArgs functions
 * independently from AgentExecutor.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  think,
  thinkStream,
  parseToolCallArgs,
  extractThinkTags,
  StreamingThinkTagStripper,
  type ThinkDeps,
} from '../think-phase';
import type {
  AgentContext,
  IService,
  IToolRegistry,
  ServiceResponse,
  ChatMessage,
  StreamChunk,
} from '@neko/shared';
import { createAgentTraceContext } from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function createMockService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  };
}

function createMockToolRegistry(): IToolRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    execute: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
    toToolDefinitions: vi.fn().mockReturnValue([]),
  };
}

function createDeps(overrides?: Partial<ThinkDeps>): ThinkDeps {
  return {
    service: createMockService(),
    toolRegistry: createMockToolRegistry(),
    hooks: [],
    config: {
      name: 'test',
      systemPrompt: 'Test',
      tools: [],
      maxIterations: 5,
    },
    abortController: new AbortController(),
    ...overrides,
  };
}

function createContext(messages?: ChatMessage[]): AgentContext {
  return {
    messages: messages ?? [
      { role: 'system', content: 'Test' },
      { role: 'user', content: 'Hello' },
    ],
    state: 'think',
    iteration: 1,
    toolResults: [],
    metadata: {},
  };
}

function textResponse(content: string): ServiceResponse {
  return {
    id: 'resp_1',
    model: 'test-model',
    message: { role: 'assistant', content } as ChatMessage,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

function toolCallResponse(toolName: string, args: Record<string, unknown>): ServiceResponse {
  return {
    id: 'resp_tc',
    model: 'test-model',
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function' as const,
          function: { name: toolName, arguments: JSON.stringify(args) },
        },
      ],
    } as ChatMessage,
    finishReason: 'tool_calls',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

// =============================================================================
// parseToolCallArgs
// =============================================================================

describe('parseToolCallArgs', () => {
  it('should parse valid JSON', () => {
    expect(parseToolCallArgs('{"key": "value"}')).toEqual({ key: 'value' });
  });

  it('should return _raw fallback for malformed JSON', () => {
    expect(parseToolCallArgs('not json')).toEqual({ _raw: 'not json' });
  });

  it('should handle empty JSON object', () => {
    expect(parseToolCallArgs('{}')).toEqual({});
  });
});

// =============================================================================
// think (non-streaming)
// =============================================================================

describe('think', () => {
  it('should return a think step with text content', async () => {
    const deps = createDeps();
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hello!'));

    const step = await think(deps, createContext());

    expect(step.type).toBe('think');
    expect(step.content).toBe('Hello!');
    expect(step.toolCalls).toBeUndefined();
  });

  it('should return a think step with tool calls', async () => {
    const deps = createDeps();
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(
      toolCallResponse('Bash', { command: 'ls' }),
    );

    const step = await think(deps, createContext());

    expect(step.type).toBe('think');
    expect(step.toolCalls).toHaveLength(1);
    expect(step.toolCalls![0]!.name).toBe('Bash');
    expect(step.toolCalls![0]!.arguments).toEqual({ command: 'ls' });
  });

  it('should add assistant message to context', async () => {
    const deps = createDeps();
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Reply'));

    const ctx = createContext();
    const initialLength = ctx.messages.length;
    await think(deps, ctx);

    expect(ctx.messages.length).toBe(initialLength + 1);
    expect(ctx.messages[ctx.messages.length - 1]!.role).toBe('assistant');
  });

  it('should run afterThink hook', async () => {
    const afterThink = vi.fn();
    const deps = createDeps({ hooks: [{ name: 'test-hook', afterThink }] });
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hi'));

    await think(deps, createContext());

    expect(afterThink).toHaveBeenCalledTimes(1);
  });

  it('should run beforeThink hook that modifies context', async () => {
    const beforeThink = vi.fn().mockImplementation((ctx: AgentContext) => {
      return { ...ctx, metadata: { ...ctx.metadata, modified: true } };
    });
    const deps = createDeps({ hooks: [{ name: 'test-hook', beforeThink }] });
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hi'));

    await think(deps, createContext());

    expect(beforeThink).toHaveBeenCalledTimes(1);
  });

  it('injects current turn multimodal packet into service message projector', async () => {
    const deps = createDeps({
      config: {
        name: 'test',
        systemPrompt: 'Test',
        tools: [],
        maxIterations: 5,
        serviceOptions: {
          providerId: 'provider-1',
          modelId: 'vision-model',
        },
      },
    });
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hi'));
    const packet = {
      id: 'packet-1',
      selection: [],
      artifactRefs: [],
      projectRefs: [],
      perceptionInputs: [
        {
          id: 'input-image',
          kind: 'image-file',
          modality: 'image',
          uri: 'data:image/png;base64,abc',
        },
      ],
      uiContext: { activePanel: 'asset-browser', selectionIds: [] },
      createdAt: 1,
    };

    const context = createContext();
    context.metadata['multimodalContextPacket'] = packet;

    await think(deps, context);

    const options = (deps.service.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | {
          messageProjector?: NonNullable<ThinkDeps['config']['serviceOptions']>['messageProjector'];
        }
      | undefined;
    expect(options?.messageProjector).toBeTypeOf('function');
    const projected = await options!.messageProjector!({
      messages: [{ role: 'user', content: 'analyze this' }],
      providerId: 'provider-1',
      modelId: 'vision-model',
    });

    expect(projected).toEqual([
      { role: 'user', content: 'analyze this' },
      { role: 'user', content: JSON.stringify(packet) },
    ]);
  });

  it('does not inject text-only multimodal packet into service message projector', async () => {
    const deps = createDeps({
      config: {
        name: 'test',
        systemPrompt: 'Test',
        tools: [],
        maxIterations: 5,
      },
    });
    (deps.service.chat as ReturnType<typeof vi.fn>).mockResolvedValue(textResponse('Hi'));
    const context = createContext();
    context.metadata['multimodalContextPacket'] = {
      id: 'packet-text',
      selection: [],
      artifactRefs: [],
      projectRefs: [],
      perceptionInputs: [
        {
          id: 'input-text',
          kind: 'structured-data',
          modality: 'text',
          metadata: { text: 'hello' },
        },
      ],
      uiContext: { activePanel: 'unknown', selectionIds: [] },
      createdAt: 1,
    };

    await think(deps, context);

    const options = (deps.service.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | {
          messageProjector?: NonNullable<ThinkDeps['config']['serviceOptions']>['messageProjector'];
        }
      | undefined;
    expect(options?.messageProjector).toBeUndefined();
  });
});

// =============================================================================
// thinkStream
// =============================================================================

describe('thinkStream', () => {
  it('should yield content_delta steps then a final think step', async () => {
    const deps = createDeps();

    async function* mockStream(): AsyncIterable<StreamChunk> {
      yield { type: 'content', content: 'Hello' };
      yield { type: 'content', content: ' world' };
      yield {
        type: 'done',
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    (deps.service.chatStream as ReturnType<typeof vi.fn>).mockReturnValue(mockStream());

    const steps = [];
    for await (const step of thinkStream(deps, createContext())) {
      steps.push(step);
    }

    // Two content_delta + one final think
    expect(steps).toHaveLength(3);
    expect(steps[0]!.type).toBe('content_delta');
    expect(steps[0]!.content).toBe('Hello');
    expect(steps[1]!.type).toBe('content_delta');
    expect(steps[1]!.content).toBe(' world');
    expect(steps[2]!.type).toBe('think');
    expect(steps[2]!.content).toBe('Hello world');
  });

  it('should accumulate tool calls from stream chunks', async () => {
    const deps = createDeps();

    async function* mockStream(): AsyncIterable<StreamChunk> {
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'tc_1',
          type: 'function',
          function: { name: 'Read', arguments: '{"path":' },
        },
      };
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'tc_1',
          type: 'function',
          function: { name: 'Read', arguments: '"/tmp"}' },
        },
      };
      yield {
        type: 'done',
        finishReason: 'tool_calls',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    (deps.service.chatStream as ReturnType<typeof vi.fn>).mockReturnValue(mockStream());

    const steps = [];
    for await (const step of thinkStream(deps, createContext())) {
      steps.push(step);
    }

    // Only final think step (no content deltas)
    expect(steps).toHaveLength(1);
    const final = steps[0]!;
    expect(final.type).toBe('think');
    expect(final.toolCalls).toHaveLength(1);
    expect(final.toolCalls![0]!.name).toBe('Read');
    expect(final.toolCalls![0]!.arguments).toEqual({ path: '/tmp' });
  });

  it('passes the derived think trace to streaming afterThink hooks', async () => {
    vi.resetModules();
    const runHooksWithTrace = vi.fn(async () => {});
    vi.doMock('../hook-runner', () => ({ runHooksWithTrace }));

    try {
      const { thinkStream: isolatedThinkStream } = await import('../think-phase');
      const deps = createDeps({
        hooks: [{ name: 'trace-hook', afterThink: vi.fn() }],
      });

      async function* mockStream(): AsyncIterable<StreamChunk> {
        yield { type: 'content', content: 'Hello' };
        yield {
          type: 'done',
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }

      (deps.service.chatStream as ReturnType<typeof vi.fn>).mockReturnValue(mockStream());
      const context = createContext();
      context.trace = createAgentTraceContext({
        conversationId: 'conv-stream-trace',
        turnId: 'turn-stream-trace',
      });
      const thinkTrace = createAgentTraceContext({
        conversationId: 'conv-stream-trace',
        turnId: 'turn-stream-trace',
        iteration: 3,
        phase: 'think',
      });

      const steps = [];
      for await (const step of isolatedThinkStream(deps, context, thinkTrace)) {
        steps.push(step);
      }

      expect(steps.at(-1)?.type).toBe('think');
      expect(runHooksWithTrace).toHaveBeenCalledWith(
        deps.hooks,
        'afterThink',
        expect.objectContaining({
          conversationId: 'conv-stream-trace',
          turnId: 'turn-stream-trace',
          iteration: 3,
          phase: 'think',
        }),
        expect.objectContaining({ type: 'think' }),
        context,
      );
    } finally {
      vi.doUnmock('../hook-runner');
      vi.resetModules();
    }
  });
});

// =======================
// extractThinkTags
// ============================

describe('extractThinkTags', () => {
  it('should return original content when no <think> tags present', () => {
    const result = extractThinkTags('Hello world');
    expect(result.content).toBe('Hello world');
    expect(result.thinking).toBeNull();
  });

  it('should extract and strip single <think> tag', () => {
    const result = extractThinkTags('<think>Requesting more details</think>Hello there!');
    expect(result.content).toBe('Hello there!');
    expect(result.thinking).toBe('Requesting more details');
  });

  it('should extract and strip multiple <think> tags', () => {
    const result = extractThinkTags(
      '<think>First thought</think>Some text<think>Second thought</think>More text',
    );
    expect(result.content).toBe('Some textMore text');
    expect(result.thinking).toBe('First thought\n\nSecond thought');
  });

  it('should handle <think> tags with whitespace', () => {
    const result = extractThinkTags('<think>  Thinking content  </think>  Response text  ');
    expect(result.content).toBe('Response text');
    expect(result.thinking).toBe('Thinking content');
  });

  it('should handle multiline <think> content', () => {
    const result = extractThinkTags(`<think>
Line 1
Line 2
</think>Response`);
    expect(result.content).toBe('Response');
    expect(result.thinking).toBe('Line 1\nLine 2');
  });

  it('should handle empty <think> tags', () => {
    const result = extractThinkTags('<think></think>Content');
    expect(result.content).toBe('Content');
    expect(result.thinking).toBeNull();
  });

  it('should be case insensitive', () => {
    const result = extractThinkTags('<THINK>Uppercase</THINK>Text');
    expect(result.content).toBe('Text');
    expect(result.thinking).toBe('Uppercase');
  });
});

// =============================================================================
// StreamingThinkTagStripper
// =============================================================================

describe('StreamingThinkTagStripper', () => {
  function collectFromChunks(chunks: string[]): { text: string; thinking: string } {
    const stripper = new StreamingThinkTagStripper();
    let text = '';
    let thinking = '';

    for (const chunk of chunks) {
      const result = stripper.push(chunk);
      if (result.text) text += result.text;
      if (result.thinking) thinking += (thinking ? '\n\n' : '') + result.thinking;
    }

    const flushed = stripper.flush();
    if (flushed.text) text += flushed.text;
    if (flushed.thinking) thinking += (thinking ? '\n\n' : '') + flushed.thinking;

    return { text, thinking };
  }

  it('should pass through text with no think tags', () => {
    const result = collectFromChunks(['Hello', ' world', '!']);
    expect(result.text).toBe('Hello world!');
    expect(result.thinking).toBe('');
  });

  it('should handle complete think tag in a single chunk', () => {
    const result = collectFromChunks(['<think>reasoning</think>response']);
    expect(result.text).toBe('response');
    expect(result.thinking).toBe('reasoning');
  });

  it('should handle open tag split across 2 chunks', () => {
    const result = collectFromChunks(['<thi', 'nk>reasoning</think>response']);
    expect(result.text).toBe('response');
    expect(result.thinking).toBe('reasoning');
  });

  it('should handle open tag split across 3 chunks', () => {
    const result = collectFromChunks(['<', 'think>rea', 'soning</think>response']);
    expect(result.text).toBe('response');
    expect(result.thinking).toBe('reasoning');
  });

  it('should handle close tag split across chunks', () => {
    const result = collectFromChunks(['<think>reasoning</thi', 'nk>response']);
    expect(result.text).toBe('response');
    expect(result.thinking).toBe('reasoning');
  });

  it('should handle close tag split at every boundary', () => {
    const result = collectFromChunks(['<think>thinking</', 'think>', 'text']);
    expect(result.text).toBe('text');
    expect(result.thinking).toBe('thinking');
  });

  it('should handle text before and after think block', () => {
    const result = collectFromChunks(['before', '<think>mid</think>', 'after']);
    expect(result.text).toBe('beforeafter');
    expect(result.thinking).toBe('mid');
  });

  it('should handle multiple think blocks across chunks', () => {
    const result = collectFromChunks(['<think>first</think>text1', '<think>second</think>text2']);
    expect(result.text).toBe('text1text2');
    expect(result.thinking).toBe('first\n\nsecond');
  });

  it('should handle incomplete tag at end of stream (flush as text)', () => {
    const result = collectFromChunks(['hello<thi']);
    expect(result.text).toBe('hello<thi');
    expect(result.thinking).toBe('');
  });

  it('should handle unclosed think block at end of stream', () => {
    const result = collectFromChunks(['<think>never closed']);
    expect(result.text).toBe('<think>never closed');
    expect(result.thinking).toBe('');
  });

  it('should handle single-character streaming', () => {
    const input = '<think>AB</think>CD';
    const chars = input.split('');
    const result = collectFromChunks(chars);
    expect(result.text).toBe('CD');
    expect(result.thinking).toBe('AB');
  });

  it('should handle empty think tags', () => {
    const result = collectFromChunks(['<think></think>text']);
    expect(result.text).toBe('text');
    expect(result.thinking).toBe('');
  });

  it('should handle think block split at tag boundary character by character', () => {
    const result = collectFromChunks([
      'pre',
      '<',
      't',
      'h',
      'i',
      'n',
      'k',
      '>',
      'thought',
      '<',
      '/',
      't',
      'h',
      'i',
      'n',
      'k',
      '>',
      'post',
    ]);
    expect(result.text).toBe('prepost');
    expect(result.thinking).toBe('thought');
  });

  it('should be case insensitive', () => {
    const result = collectFromChunks(['<THINK>upper</THINK>text']);
    expect(result.text).toBe('text');
    expect(result.thinking).toBe('upper');
  });

  it('should handle angle bracket that is not a think tag', () => {
    const result = collectFromChunks(['a < b and', ' c > d']);
    expect(result.text).toBe('a < b and c > d');
    expect(result.thinking).toBe('');
  });
});
