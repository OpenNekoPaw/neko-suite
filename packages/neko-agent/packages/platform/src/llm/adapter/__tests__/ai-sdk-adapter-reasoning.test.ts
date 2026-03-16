/**
 * AISdkAdapter reasoning model detection tests
 *
 * Verifies that reasoning models (o1, o3, deepseek-r1, etc.) have
 * temperature/topP/frequencyPenalty/presencePenalty stripped from
 * both chat() and chatStream() requests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AISdkAdapter } from '../ai-sdk-adapter';
import type { LanguageModel } from 'ai';
import type { Model, Provider } from '../../../types/provider';
import type { ChatMessage, ChatOptions } from '../../../types/adapter';

// ---------------------------------------------------------------------------
// Mock the `ai` module
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
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
}));

// ---------------------------------------------------------------------------
// Mock logger so adapter doesn't throw on import
// ---------------------------------------------------------------------------
vi.mock('../../../utils/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
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
    } as ReturnType<typeof streamText>);

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
    } as ReturnType<typeof streamText>);

    const stream = adapter.chatStream(messages, options, model, makeProvider());
    for await (const _ of stream) {
      /* consume */
    }

    const callArgs = vi.mocked(streamText).mock.calls[0]![0];
    expect(callArgs.maxOutputTokens).toBe(4096);
  });
});
