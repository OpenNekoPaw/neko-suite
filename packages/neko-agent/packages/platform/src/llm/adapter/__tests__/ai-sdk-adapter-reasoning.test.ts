/**
 * AISdkAdapter reasoning model detection tests
 *
 * Verifies that reasoning models (o1, o3, deepseek-r1, etc.) have
 * temperature/topP/frequencyPenalty/presencePenalty stripped from
 * both chat() and chatStream() requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AISdkAdapter } from '../ai-sdk-adapter';
import { OpenAIAdapter } from '../openai-adapter';
import type { LanguageModel } from 'ai';
import type { Model, Provider } from '../../../types/provider';
import type { ChatMessage, ChatOptions } from '../../../types/adapter';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const openAIProviderMock = vi.hoisted(() => {
  const languageModel = {
    modelId: 'openai-test-model',
    provider: 'openai',
    specificationVersion: 'v1',
  };
  return {
    languageModel,
    chat: vi.fn(() => languageModel),
    embedding: vi.fn(() => languageModel),
    createOpenAI: vi.fn(() => ({
      chat: openAIProviderMock.chat,
      embedding: openAIProviderMock.embedding,
    })),
  };
});

// ---------------------------------------------------------------------------
// Mock the `ai` module
// ---------------------------------------------------------------------------
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: vi.fn().mockResolvedValue({
      text: 'hello',
      toolCalls: [],
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
    streamText: vi.fn().mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'hi' };
        yield {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
        };
      })(),
    }),
    jsonSchema: vi.fn((s: unknown) => s),
    embed: vi.fn(),
    embedMany: vi.fn(),
  };
});

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: openAIProviderMock.createOpenAI,
}));

// ---------------------------------------------------------------------------
// Mock logger so adapter doesn't throw on import
// ---------------------------------------------------------------------------
vi.mock('../../../utils/logger', () => ({
  getLogger: () => loggerMock,
}));

// ---------------------------------------------------------------------------
// Concrete test subclass
// ---------------------------------------------------------------------------
const mockLanguageModel = {
  modelId: 'test-model',
  provider: 'test',
  specificationVersion: 'v1',
} as unknown as LanguageModel;

class TestAdapter extends AISdkAdapter {
  readonly type = 'test';

  protected getLanguageModel(_model: Model, _provider: Provider): LanguageModel {
    return mockLanguageModel;
  }

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'streaming'];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeModel = (overrides?: Partial<Model>): Model => ({
  id: 'test-model',
  name: 'test-model',
  displayName: 'Test Model',
  providerId: 'test',
  capabilities: ['chat'],
  enabled: true,
  ...overrides,
});

const makeProvider = (): Provider => ({
  id: 'test',
  name: 'test',
  displayName: 'Test Provider',
  type: 'openai',
  apiUrl: 'https://api.example.com',
  apiKey: 'test-key',
  enabled: true,
});

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AISdkAdapter reasoning model handling', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TestAdapter();
  });

  // ---- chat() -------------------------------------------------------------

  it('chat() passes temperature/topP for non-reasoning model', async () => {
    const { generateText } = await import('ai');
    const model = makeModel();
    const options: ChatOptions = { temperature: 0.7, topP: 0.9 };

    await adapter.chat(messages, options, model, makeProvider());

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7, topP: 0.9 }),
    );
  });

  it('chat() disables AI SDK internal retries so platform can classify retryability first', async () => {
    const { generateText } = await import('ai');

    await adapter.chat(messages, {}, makeModel(), makeProvider());

    expect(vi.mocked(generateText).mock.calls[0]![0].maxRetries).toBe(0);
  });

  it('chat() skips temperature/topP for reasoning model', async () => {
    const { generateText } = await import('ai');
    const model = makeModel({ capabilities: ['chat', 'reasoning'] });
    const options: ChatOptions = { temperature: 0.7, topP: 0.9 };

    await adapter.chat(messages, options, model, makeProvider());

    const callArgs = vi.mocked(generateText).mock.calls[0]![0];
    expect(callArgs.temperature).toBeUndefined();
    expect(callArgs.topP).toBeUndefined();
  });

  it('chat() always passes maxTokens regardless of reasoning', async () => {
    const { generateText } = await import('ai');

    // Non-reasoning
    const normalModel = makeModel();
    await adapter.chat(messages, { maxTokens: 1024 }, normalModel, makeProvider());
    const normalArgs = vi.mocked(generateText).mock.calls[0]![0];
    expect(normalArgs.maxOutputTokens).toBe(1024);

    vi.mocked(generateText).mockClear();

    // Reasoning
    const reasoningModel = makeModel({ capabilities: ['chat', 'reasoning'] });
    await adapter.chat(messages, { maxTokens: 2048 }, reasoningModel, makeProvider());
    const reasoningArgs = vi.mocked(generateText).mock.calls[0]![0];
    expect(reasoningArgs.maxOutputTokens).toBe(2048);
  });

  it('chat() forwards projected providerOptions to AI SDK requests', async () => {
    const { generateText } = await import('ai');
    const providerOptions = {
      openai: {
        reasoningEffort: 'low',
        textVerbosity: 'high',
      },
    };

    await adapter.chat(messages, { providerOptions }, makeModel(), makeProvider());

    expect(vi.mocked(generateText).mock.calls[0]![0].providerOptions).toEqual(providerOptions);
  });

  // ---- chatStream() -------------------------------------------------------

  it('chatStream() passes temperature/topP for non-reasoning model', async () => {
    const { streamText } = await import('ai');
    const model = makeModel();
    const options: ChatOptions = { temperature: 0.5, topP: 0.8 };

    const stream = adapter.chatStream(messages, options, model, makeProvider());
    for await (const _ of stream) {
      /* consume */
    }

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.5, topP: 0.8 }),
    );
  });

  it('chatStream() disables AI SDK internal retries so stream retries stay bounded', async () => {
    const { streamText } = await import('ai');

    const stream = adapter.chatStream(messages, {}, makeModel(), makeProvider());
    for await (const _ of stream) {
      /* consume */
    }

    expect(vi.mocked(streamText).mock.calls[0]![0].maxRetries).toBe(0);
  });

  it('chatStream() skips temperature/topP/frequencyPenalty/presencePenalty for reasoning model', async () => {
    const { streamText } = await import('ai');
    const model = makeModel({ capabilities: ['chat', 'reasoning'] });
    const options: ChatOptions = {
      temperature: 0.7,
      topP: 0.9,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
    };

    // streamText mock needs a fresh async generator per call
    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'hi' };
        yield {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
        };
      })(),
    } as unknown as ReturnType<typeof streamText>);

    const stream = adapter.chatStream(messages, options, model, makeProvider());
    for await (const _ of stream) {
      /* consume */
    }

    const callArgs = vi.mocked(streamText).mock.calls[0]![0];
    expect(callArgs.temperature).toBeUndefined();
    expect(callArgs.topP).toBeUndefined();
    expect(callArgs.frequencyPenalty).toBeUndefined();
    expect(callArgs.presencePenalty).toBeUndefined();
  });

  it('chatStream() always passes maxTokens for reasoning model', async () => {
    const { streamText } = await import('ai');
    const model = makeModel({ capabilities: ['chat', 'reasoning'] });
    const options: ChatOptions = { maxTokens: 4096, temperature: 0.7 };

    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' };
        yield {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
        };
      })(),
    } as unknown as ReturnType<typeof streamText>);

    const stream = adapter.chatStream(messages, options, model, makeProvider());
    for await (const _ of stream) {
      /* consume */
    }

    const callArgs = vi.mocked(streamText).mock.calls[0]![0];
    expect(callArgs.maxOutputTokens).toBe(4096);
  });

  it('chatStream() forwards projected providerOptions to AI SDK requests', async () => {
    const { streamText } = await import('ai');
    const providerOptions = {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 4096 },
      },
    };

    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' };
        yield {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5 },
        };
      })(),
    } as unknown as ReturnType<typeof streamText>);

    const stream = adapter.chatStream(messages, { providerOptions }, makeModel(), makeProvider());
    for await (const _ of stream) {
      /* consume */
    }

    expect(vi.mocked(streamText).mock.calls[0]![0].providerOptions).toEqual(providerOptions);
  });
});

describe('OpenAIAdapter provider options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges projected OpenAI options with strictJsonSchema without moving responseFormat', async () => {
    const { generateText } = await import('ai');
    const adapter = new OpenAIAdapter();
    const responseFormat = { type: 'json_object' as const };

    await adapter.chat(
      messages,
      {
        responseFormat,
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            textVerbosity: 'high',
            serviceTier: 'priority',
          },
          neko: {
            requestKind: 'agent',
          },
        },
      },
      makeModel({ providerId: 'openai', name: 'gpt-5' }),
      { ...makeProvider(), id: 'openai', type: 'openai' },
    );

    const callArgs = vi.mocked(generateText).mock.calls[0]![0];
    expect(callArgs.providerOptions).toEqual({
      openai: {
        reasoningEffort: 'low',
        textVerbosity: 'high',
        serviceTier: 'priority',
        strictJsonSchema: false,
      },
      neko: {
        requestKind: 'agent',
      },
    });
    expect(callArgs).toEqual(expect.objectContaining({ responseFormat }));
  });
});

describe('AISdkAdapter multimodal image handling', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TestAdapter();
  });

  it('chat() passes data-url images as base64 content instead of downloadable URLs', async () => {
    const { generateText } = await import('ai');
    const imageBase64 = Buffer.from('jpeg-bytes').toString('base64');
    const multimodalMessages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this image' },
          {
            type: 'image',
            imageUrl: `data:image/jpeg;base64,${imageBase64}`,
            detail: 'high',
          },
        ],
      },
    ];

    await adapter.chat(multimodalMessages, {}, makeModel(), makeProvider());

    const callArgs = vi.mocked(generateText).mock.calls[0]![0];
    expect(callArgs.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this image' },
          {
            type: 'image',
            image: imageBase64,
            mediaType: 'image/jpeg',
            providerOptions: { openai: { imageDetail: 'high' } },
          },
        ],
      },
    ]);
  });

  it('chat() keeps http image inputs as URL objects for provider-native URL support', async () => {
    const { generateText } = await import('ai');
    const imageUrl = 'https://example.test/page.jpg';

    await adapter.chat(
      [
        {
          role: 'user',
          content: [{ type: 'image', imageUrl, detail: 'low' }],
        },
      ],
      {},
      makeModel(),
      makeProvider(),
    );

    const callArgs = vi.mocked(generateText).mock.calls[0]![0];
    expect(callArgs.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: new URL(imageUrl),
            providerOptions: { openai: { imageDetail: 'low' } },
          },
        ],
      },
    ]);
  });
});

describe('AISdkAdapter error logging', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TestAdapter();
  });

  it('chat() logs a bounded AI SDK error summary instead of the raw large object', async () => {
    const { APICallError, generateText } = await import('ai');
    const responseBody = `<html>${'x'.repeat(5000)}</html>`;
    const cause = Object.assign(new SyntaxError('Unexpected token < in JSON'), {
      responseBody: 'y'.repeat(5000),
    });
    const error = new APICallError({
      message: 'Invalid JSON response',
      statusCode: 200,
      url: 'https://www.nekoapi.com/v1/chat/completions',
      requestBodyValues: {},
      cause,
      responseBody,
      isRetryable: false,
    });
    Object.assign(error, {
      responseBody,
    });

    vi.mocked(generateText).mockRejectedValueOnce(error);

    await expect(adapter.chat(messages, {}, makeModel(), makeProvider())).rejects.toMatchObject({
      name: 'PlatformError',
      category: 'unknown',
      retryable: false,
      cause: error,
    });

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith('generateText error', {
      error: expect.objectContaining({
        name: 'PlatformError',
        message: 'Invalid JSON response',
        cause: expect.objectContaining({
          name: 'AI_APICallError',
          message: 'Invalid JSON response',
          statusCode: 200,
          url: 'https://www.nekoapi.com/v1/chat/completions',
          responseBody: expect.stringMatching(/^<html>x+/),
          responseBodyLength: responseBody.length,
          isRetryable: false,
          cause: expect.objectContaining({
            name: 'SyntaxError',
            message: 'Unexpected token < in JSON',
            responseBody: expect.stringMatching(/^y+/),
          }),
        }),
      }),
    });

    const loggedPayload = findLoggedPayload('generateText error');
    expect(
      extractNestedString(loggedPayload, ['error', 'cause', 'responseBody'])?.length,
    ).toBeLessThan(responseBody.length);
    expect(
      extractNestedString(loggedPayload, ['error', 'cause', 'cause', 'responseBody'])?.length,
    ).toBeLessThan(cause.responseBody.length);
  });

  it('chat() retries retryable rate limits up to five total attempts', async () => {
    const { APICallError, generateText } = await import('ai');
    const error = new APICallError({
      message: 'Too Many Requests',
      statusCode: 429,
      url: 'https://api.example.com/v1/chat/completions',
      requestBodyValues: {},
      responseHeaders: { 'retry-after-ms': '0' },
    });

    vi.mocked(generateText).mockRejectedValue(error);

    await expect(
      adapter.chat(messages, {}, makeModel({ id: 'model-a', name: 'Model A' }), makeProvider()),
    ).rejects.toMatchObject({
      name: 'PlatformError',
      category: 'rate_limit',
      retryable: true,
      retryAfter: 0,
      context: expect.objectContaining({
        providerId: 'test',
        modelId: 'model-a',
        modelName: 'Model A',
        statusCode: 429,
      }),
    });
    expect(generateText).toHaveBeenCalledTimes(5);
  });

  it('chat() treats quota-style 429 responses as non-retryable validation errors', async () => {
    const { APICallError, generateText } = await import('ai');
    const error = new APICallError({
      message: 'You exceeded your current quota. Please check your billing details.',
      statusCode: 429,
      url: 'https://api.example.com/v1/chat/completions',
      requestBodyValues: {},
    });

    vi.mocked(generateText).mockRejectedValueOnce(error);

    await expect(adapter.chat(messages, {}, makeModel(), makeProvider())).rejects.toMatchObject({
      name: 'PlatformError',
      category: 'validation',
      retryable: false,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('chatStream() logs a bounded summary for stream error parts', async () => {
    const { APICallError, streamText } = await import('ai');
    const responseBody = `not-json:${'z'.repeat(5000)}`;
    const error = new APICallError({
      message: 'Invalid JSON response',
      statusCode: 200,
      url: 'https://api.example.com/v1/chat/completions',
      requestBodyValues: {},
      responseBody,
    });
    Object.assign(error, { responseBody });

    vi.mocked(streamText).mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'error', error };
      })(),
    } as unknown as ReturnType<typeof streamText>);

    await expect(
      (async () => {
        for await (const _ of adapter.chatStream(messages, {}, makeModel(), makeProvider())) {
          /* consume */
        }
      })(),
    ).rejects.toMatchObject({
      name: 'PlatformError',
      category: 'unknown',
      retryable: false,
    });

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith('streamText error', {
      error: expect.objectContaining({
        name: 'PlatformError',
        message: 'Invalid JSON response',
        cause: expect.objectContaining({
          name: 'AI_APICallError',
          message: 'Invalid JSON response',
          statusCode: 200,
          responseBody: expect.stringMatching(/^not-json:z+/),
          responseBodyLength: responseBody.length,
        }),
      }),
    });
  });
});

function findLoggedPayload(message: string): unknown {
  return loggerMock.error.mock.calls.find((call) => call[0] === message)?.[1];
}

function extractNestedString(value: unknown, path: readonly string[]): string | undefined {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
