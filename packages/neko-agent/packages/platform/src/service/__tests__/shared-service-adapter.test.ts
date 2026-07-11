/**
 * SharedServiceAdapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SharedServiceAdapter,
  projectProviderAwareMessages,
  toSharedService,
} from '../shared-service-adapter';
import type { Service } from '../service';
import type { ChatChunk } from '../../types/adapter';
import type { ServiceResponse, ServiceStreamResponse } from '../../types/service';
import type { ChatMessage, PerceptionCard } from '@neko/shared';

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
    const result = await adapter.chat(messages, { providerId: 'openai', modelId: 'gpt-4' });

    expect(mockService.chat).toHaveBeenCalledWith(messages, {
      providerId: 'openai',
      modelId: 'gpt-4',
    });
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

describe('projectProviderAwareMessages', () => {
  it('appends provider-ready perception content from backfilled tool results', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      {
        role: 'user',
        content: JSON.stringify({
          id: 'packet-1',
          selection: [],
          artifactRefs: [],
          projectRefs: [],
          perceptionInputs: [],
          uiContext: { activePanel: 'asset-browser', selectionIds: [] },
          createdAt: 1,
        }),
      },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({
          schema: 'neko.tool-result.v1',
          data: { status: 'completed' },
          perceptionCards: [imageCard()],
        }),
      },
    ];

    const projected = await projectProviderAwareMessages({
      messages,
      providerId: 'openai',
      modelId: 'gpt-vision',
      providerCardRegistry: {
        get: () => ({
          providerId: 'openai',
          modelId: 'gpt-vision',
          displayName: 'GPT Vision',
          version: '1.0.0',
          capabilities: ['image.generate'],
          inputModalities: { image: true },
          sourceLayer: 'builtin',
          syntaxProfile: { notes: [] },
          conceptCoverage: { entries: [] },
          trainingProfile: { styleAffinities: {}, antiBiasStrategies: [] },
        }),
      },
      assetLoader: {
        load: async () => ({ kind: 'image', url: 'data:image/png;base64,thumb' }),
      },
    });

    expect(projected).toHaveLength(3);
    expect(projected[2]).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'text', text: expect.stringContaining('PerceptionCard') }),
        { type: 'image', imageUrl: 'data:image/png;base64,thumb', detail: 'auto' },
      ],
    });
    expect(JSON.stringify(projected)).not.toContain('file://');
  });

  it('does not duplicate multimodal packet content before perception cards are backfilled', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: JSON.stringify({
          id: 'packet-1',
          selection: [],
          artifactRefs: [],
          projectRefs: [],
          perceptionInputs: [
            {
              id: 'input-text',
              kind: 'structured-data',
              modality: 'text',
              metadata: { text: 'describe this frame' },
            },
          ],
          uiContext: { activePanel: 'asset-browser', selectionIds: [] },
          createdAt: 1,
        }),
      },
    ];

    const projected = await projectProviderAwareMessages({
      messages,
      providerId: 'openai',
    });

    expect(projected).toBe(messages);
  });

  it('uses selected model capabilities for native image projection', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'describe this image' },
      {
        role: 'user',
        content: JSON.stringify({
          id: 'packet-image',
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
        }),
      },
    ];

    const projected = await projectProviderAwareMessages({
      messages,
      providerId: 'custom-direct',
      modelId: 'custom-vision',
      modelCapabilities: ['chat', 'vision'],
    });

    expect(projected).toEqual([
      { role: 'user', content: 'describe this image' },
      {
        role: 'user',
        content: [{ type: 'image', imageUrl: 'data:image/png;base64,abc', detail: 'auto' }],
      },
    ]);
  });

  it('rejects native image projection when selected model lacks vision capability', async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: JSON.stringify({
          id: 'packet-image',
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
        }),
      },
    ];

    await expect(
      projectProviderAwareMessages({
        messages,
        providerId: 'custom-direct',
        modelId: 'text-only',
        modelCapabilities: ['chat'],
      }),
    ).rejects.toMatchObject({
      code: 'CHAT_MODEL_NATIVE_MULTIMODAL_UNSUPPORTED',
    });
  });

  it('keeps tool perception evidence usable when the selected chat model lacks vision', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'analyze the exposed page image' },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({
          schema: 'neko.tool-result.v1',
          data: { mode: 'metadata' },
          perceptionCards: [imageCard()],
        }),
      },
    ];
    const assetLoader = { load: vi.fn() };

    const projected = await projectProviderAwareMessages({
      messages,
      providerId: 'custom-direct',
      modelId: 'text-only',
      modelCapabilities: ['chat'],
      assetLoader,
    });

    expect(assetLoader.load).not.toHaveBeenCalled();
    expect(projected).toHaveLength(3);
    expect(projected[2]).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'text', text: expect.stringContaining('rainy street') }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('does not support native image input'),
        }),
      ],
    });
    expect(JSON.stringify(projected[2])).not.toContain('imageUrl');
  });

  it('keeps ReadImage metadata visible and requests external perception instead of terminating a text-only turn', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'analyze the generated cat image quality' },
      {
        role: 'tool',
        toolCallId: 'call-read-image',
        content: JSON.stringify({
          schema: 'neko.tool-result.v1',
          data: { mode: 'metadata', analysis: 'custom' },
          perceptionCards: [readImageMetadataCard()],
        }),
      },
    ];

    const projected = await projectProviderAwareMessages({
      messages,
      providerId: 'deepseek-chat',
      modelId: 'deepseek-v4-flash',
      modelCapabilities: ['chat'],
    });

    expect(projected).toHaveLength(3);
    expect(projected[2]).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'text', text: expect.stringContaining('1024x1024') }),
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('runtime perception'),
        }),
      ],
    });
    expect(JSON.stringify(projected[2])).not.toContain('imageUrl');
  });

  it('rejects tool perception images when native asset projection fails for a vision model', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'analyze the exposed page image' },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({
          schema: 'neko.tool-result.v1',
          data: { mode: 'metadata' },
          perceptionCards: [imageCard()],
        }),
      },
    ];

    await expect(
      projectProviderAwareMessages({
        messages,
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        modelCapabilities: ['chat', 'streaming', 'vision'],
        assetLoader: {
          load: async () => {
            throw new Error('document entry bytes unavailable');
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'CHAT_MODEL_NATIVE_MULTIMODAL_ASSET_UNAVAILABLE',
      context: expect.objectContaining({
        assetId: 'thumb-1',
        modality: 'image',
        diagnostics: [
          expect.objectContaining({
            code: 'asset-load-failed',
            assetId: 'thumb-1',
            modality: 'image',
            message: 'document entry bytes unavailable',
          }),
        ],
      }),
    });
  });

  it('rejects tool perception images when the vision model has no asset loader', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'analyze the exposed page image' },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({
          schema: 'neko.tool-result.v1',
          data: { mode: 'metadata' },
          perceptionCards: [imageCard()],
        }),
      },
    ];

    await expect(
      projectProviderAwareMessages({
        messages,
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        modelCapabilities: ['chat', 'streaming', 'vision'],
      }),
    ).rejects.toMatchObject({
      code: 'CHAT_MODEL_NATIVE_MULTIMODAL_ASSET_UNAVAILABLE',
      context: expect.objectContaining({
        assetId: 'thumb-1',
        modality: 'image',
        diagnostics: [
          expect.objectContaining({
            code: 'asset-loader-missing',
            assetId: 'thumb-1',
            modality: 'image',
          }),
        ],
      }),
    });
  });

  it('projects perception cards even when the turn packet was not serialized in chat history', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'analyze the exposed page image' },
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({
          schema: 'neko.tool-result.v1',
          data: { mode: 'metadata' },
          perceptionCards: [imageCard()],
        }),
      },
    ];

    const projected = await projectProviderAwareMessages({
      messages,
      providerId: 'openai',
      modelId: 'gpt-vision',
      providerCardRegistry: {
        get: () => ({
          providerId: 'openai',
          modelId: 'gpt-vision',
          displayName: 'GPT Vision',
          version: '1.0.0',
          capabilities: ['image.generate'],
          inputModalities: { image: true },
          sourceLayer: 'builtin',
          syntaxProfile: { notes: [] },
          conceptCoverage: { entries: [] },
          trainingProfile: { styleAffinities: {}, antiBiasStrategies: [] },
        }),
      },
      assetLoader: {
        load: async () => ({ kind: 'image', url: 'data:image/png;base64,thumb' }),
      },
    });

    expect(projected).toHaveLength(4);
    expect(projected[3]).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ type: 'text', text: expect.stringContaining('PerceptionCard') }),
        { type: 'image', imageUrl: 'data:image/png;base64,thumb', detail: 'auto' },
      ],
    });
  });
});

function imageCard(): PerceptionCard {
  return {
    version: 1,
    assetId: 'asset-1',
    modality: 'image',
    createdAt: 1,
    layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'complete' },
    structural: { format: 'png', mimeType: 'image/png', byteSize: 10, width: 512, height: 512 },
    semantic: {
      evidences: [{ kind: 'description', confidence: 0.9, value: 'rainy street' }],
    },
    perceptual: {
      thumbnailRef: {
        assetId: 'thumb-1',
        uri: '${WORKSPACE}/thumb.png',
        mimeType: 'image/png',
      },
    },
  };
}

function readImageMetadataCard(): PerceptionCard {
  return {
    version: 1,
    assetId: 'read-image-res_3z6xxu',
    modality: 'image',
    createdAt: 1,
    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
    structural: {
      format: 'png',
      mimeType: 'image/png',
      byteSize: 1_347_289,
      width: 1024,
      height: 1024,
    },
    perceptual: {
      thumbnailRef: {
        assetId: 'read-image-res_3z6xxu',
        uri: 'generated-assets/cat.png',
        mimeType: 'image/png',
      },
    },
  };
}
