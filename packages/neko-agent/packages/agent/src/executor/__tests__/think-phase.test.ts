/**
 * Think Phase Unit Tests
 *
 * Tests the extracted think/thinkStream/parseToolCallArgs functions
 * independently from AgentExecutor.
 */

import { describe, it, expect, vi } from 'vitest';
import { think, thinkStream, parseToolCallArgs, type ThinkDeps } from '../think-phase';
import type {
  AgentContext,
  IService,
  IToolRegistry,
  ServiceResponse,
  ChatMessage,
  StreamChunk,
} from '@neko/shared';

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
});
