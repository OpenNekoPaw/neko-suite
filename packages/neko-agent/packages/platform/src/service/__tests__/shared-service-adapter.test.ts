/**
 * SharedServiceAdapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SharedServiceAdapter, toSharedService } from '../shared-service-adapter';
import type { Service } from '../service';
import type { ChatChunk } from '../../types/adapter';
import type { ServiceResponse, ServiceStreamResponse } from '../../types/service';

// Mock platform logger to capture warn calls
const { mockLogger } = vi.hoisted(() => {
  const mockLogger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return { mockLogger };
});
vi.mock('../../utils/logger', () => ({
  getLogger: () => mockLogger,
  getRootLogger: () => mockLogger,
  setRootLogger: vi.fn(),
}));

// Helper: create a mock Platform Service
function createMockService() {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  } as unknown as Service & {
    chat: ReturnType<typeof vi.fn>;
    chatStream: ReturnType<typeof vi.fn>;
    embed: ReturnType<typeof vi.fn>;
  };
}

// Helper: build a ServiceStreamResponse from chunks
function mockStreamResponse(
  chunks: ChatChunk[],
  response?: Promise<ServiceResponse>,
): ServiceStreamResponse {
  async function* gen() {
    for (const c of chunks) yield c;
  }
  return {
    stream: gen(),
    response: response ?? Promise.resolve({} as ServiceResponse),
  };
}

// Helper: collect all StreamChunks from the async iterable
async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iter) result.push(item);
  return result;
}

const baseChunk: ChatChunk = { id: 'c1', model: 'gpt-4', delta: {} };

describe('SharedServiceAdapter', () => {
  let mockService: ReturnType<typeof createMockService>;
  let adapter: SharedServiceAdapter;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new SharedServiceAdapter(mockService);
  });

  // ── chat() ──────────────────────────────────────────────

  it('chat() forwards call and strips routing/timing metadata', async () => {
    const platformResponse: ServiceResponse = {
      id: 'r1',
      model: 'gpt-4',
      message: { role: 'assistant', content: 'hello' },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      thinking: 'thought',
      routing: { modelId: 'm1', providerId: 'p1', attempts: 1 },
      timing: { startTime: 0, endTime: 100, duration: 100 },
    };
    mockService.chat.mockResolvedValue(platformResponse);

    const messages = [{ role: 'user' as const, content: 'hi' }];
    const result = await adapter.chat(messages, { modelId: 'gpt-4' });

    expect(mockService.chat).toHaveBeenCalledWith(messages, { modelId: 'gpt-4' });
    expect(result).toEqual({
      id: 'r1',
      model: 'gpt-4',
      message: { role: 'assistant', content: 'hello' },
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      thinking: 'thought',
    });
    // Must NOT contain routing/timing
    expect(result).not.toHaveProperty('routing');
    expect(result).not.toHaveProperty('timing');
  });

  // ── chatStream() ────────────────────────────────────────

  it('chatStream() text string delta yields content StreamChunk', async () => {
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, delta: { content: 'hello' } }]),
    );

    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toContainEqual({ type: 'content', content: 'hello' });
  });

  it('chatStream() thinking yields thinking StreamChunk', async () => {
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, thinking: 'reasoning...' }]),
    );

    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toContainEqual({ type: 'thinking', content: 'reasoning...' });
  });

  it('chatStream() toolCalls yields tool_call StreamChunk', async () => {
    const toolCall = {
      id: 'tc1',
      type: 'function' as const,
      function: { name: 'fn', arguments: '{}' },
    };
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, delta: { toolCalls: [toolCall] } }]),
    );

    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toContainEqual({ type: 'tool_call', toolCall });
  });

  it('chatStream() usage yields usage StreamChunk', async () => {
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
    mockService.chatStream.mockReturnValue(mockStreamResponse([{ ...baseChunk, usage }]));

    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toContainEqual({ type: 'usage', usage });
  });

  it('chatStream() finishReason yields done StreamChunk', async () => {
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, finishReason: 'stop' }]),
    );

    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toContainEqual({ type: 'done', finishReason: 'stop' });
  });

  it('chatStream() ContentPart[] with text parts yields concatenated content', async () => {
    const contentParts = [
      { type: 'text' as const, text: 'Hello ' },
      { type: 'text' as const, text: 'World' },
    ];
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, delta: { content: contentParts } }]),
    );

    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toContainEqual({ type: 'content', content: 'Hello World' });
  });

  it('chatStream() ContentPart[] with non-text parts warns and drops them', async () => {
    mockLogger.warn.mockClear();
    const contentParts = [
      { type: 'text' as const, text: 'kept' },
      { type: 'image' as const, imageUrl: 'http://img.png' },
    ];
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, delta: { content: contentParts as never } }]),
    );

    const chunks = await collect(adapter.chatStream([]));

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(chunks).toContainEqual({ type: 'content', content: 'kept' });
  });

  it('chatStream() ContentPart[] with only non-text parts yields no content chunk', async () => {
    mockLogger.warn.mockClear();
    const contentParts = [{ type: 'image' as const, imageUrl: 'http://img.png' }];
    mockService.chatStream.mockReturnValue(
      mockStreamResponse([{ ...baseChunk, delta: { content: contentParts as never } }]),
    );

    const chunks = await collect(adapter.chatStream([]));

    expect(chunks.filter((c) => c.type === 'content')).toHaveLength(0);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('chatStream() response Promise rejection does not leak', async () => {
    const rejection = Promise.reject(new Error('stream failed'));
    mockService.chatStream.mockReturnValue(mockStreamResponse([], rejection));

    // Should not throw unhandled rejection
    const chunks = await collect(adapter.chatStream([]));
    expect(chunks).toEqual([]);
  });

  // ── embed() ─────────────────────────────────────────────

  it('embed() forwards and returns embeddings', async () => {
    const embeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    mockService.embed.mockResolvedValue({
      embeddings,
      model: 'text-embedding-3',
      usage: { promptTokens: 5, totalTokens: 5 },
    });

    const result = await adapter.embed(['a', 'b']);
    expect(mockService.embed).toHaveBeenCalledWith(['a', 'b']);
    expect(result).toEqual({ embeddings });
  });

  // ── toSharedService() ───────────────────────────────────

  it('toSharedService() factory returns SharedServiceAdapter instance', () => {
    const shared = toSharedService(mockService);
    expect(shared).toBeInstanceOf(SharedServiceAdapter);
  });
});
