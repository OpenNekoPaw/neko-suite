/**
 * Adapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdapterRegistry, createAdapterRegistry } from '../adapter-registry';
import { aggregateStream, createStreamCollector } from '../stream-aggregator';
import { OpenAIAdapter } from '../openai-adapter';
import { AnthropicAdapter } from '../anthropic-adapter';
import { GoogleAdapter } from '../google-adapter';
import { OllamaAdapter } from '../ollama-adapter';
import { GenericAdapter } from '../generic-adapter';
import type { ChatChunk, Adapter, ChatMessage, ChatOptions } from '../../../types/adapter';
import type { Model, Provider } from '../../../types/provider';

// Mock adapter for testing
class MockAdapter implements Adapter {
  readonly type = 'mock';
  private capabilities: string[];

  constructor(capabilities: string[] = ['chat', 'streaming']) {
    this.capabilities = capabilities;
  }

  supportsStreaming(): boolean {
    return this.capabilities.includes('streaming');
  }

  supportsCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  async chat(messages: ChatMessage[], options: ChatOptions, model: Model, provider: Provider) {
    return {
      id: 'test-id',
      model: model.id,
      message: {
        role: 'assistant' as const,
        content: `Response to: ${messages[messages.length - 1]?.content || ''}`,
      },
      finishReason: 'stop' as const,
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options: ChatOptions,
    model: Model,
    provider: Provider,
  ): AsyncIterable<ChatChunk> {
    const content = `Response to: ${messages[messages.length - 1]?.content || ''}`;
    for (const char of content) {
      yield {
        id: 'test-id',
        model: model.id,
        delta: { content: char },
      };
    }
    yield {
      id: 'test-id',
      model: model.id,
      delta: {},
      finishReason: 'stop',
    };
  }
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = createAdapterRegistry();
  });

  describe('built-in adapters', () => {
    it('should have openai adapter', () => {
      const adapter = registry.get('openai');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('openai');
    });

    it('should have anthropic adapter', () => {
      const adapter = registry.get('anthropic');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('anthropic');
    });

    it('should have google adapter', () => {
      const adapter = registry.get('google');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('google');
    });

    it('should have ollama adapter', () => {
      const adapter = registry.get('ollama');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('ollama');
    });

    it('should have generic adapter', () => {
      const adapter = registry.get('generic');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('generic');
    });

    it('should route NewAPI-compatible provider types through generic adapter', () => {
      expect(registry.get('newapi')).toBeInstanceOf(GenericAdapter);
      expect(registry.get('oneapi')).toBeInstanceOf(GenericAdapter);
    });

    it('should have azure adapter', () => {
      const adapter = registry.get('azure');
      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe('azure');
    });
  });

  describe('custom adapters', () => {
    it('should register custom adapter', () => {
      const customAdapter = new MockAdapter();
      registry.register('custom', customAdapter);

      const retrieved = registry.getCustom('custom');
      expect(retrieved).toBe(customAdapter);
    });

    it('should unregister custom adapter', () => {
      const customAdapter = new MockAdapter();
      registry.register('custom', customAdapter);
      registry.unregister('custom');

      const retrieved = registry.getCustom('custom');
      expect(retrieved).toBeUndefined();
    });

    it('should get adapter by type (built-in or custom)', () => {
      const customAdapter = new MockAdapter();
      registry.register('custom', customAdapter);

      expect(registry.getForType('openai')).toBeDefined();
      expect(registry.getForType('custom')).toBe(customAdapter);
      expect(registry.getForType('unknown')).toBeUndefined();
    });
  });

  describe('listTypes', () => {
    it('should list all built-in adapter types', () => {
      const types = registry.listTypes();
      expect(types).toContain('openai');
      expect(types).toContain('anthropic');
      expect(types).toContain('google');
      expect(types).toContain('ollama');
      expect(types).toContain('generic');
      expect(types).toContain('newapi');
      expect(types).toContain('oneapi');
      expect(types).toContain('azure');
    });

    it('should include custom adapter types', () => {
      registry.register('custom1', new MockAdapter());
      registry.register('custom2', new MockAdapter());

      const types = registry.listTypes();
      expect(types).toContain('custom1');
      expect(types).toContain('custom2');
    });
  });
});

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter();
  });

  it('should have correct type', () => {
    expect(adapter.type).toBe('openai');
  });

  it('should support streaming', () => {
    expect(adapter.supportsStreaming()).toBe(true);
  });

  it('should support chat capability', () => {
    expect(adapter.supportsCapability('chat')).toBe(true);
  });

  it('should support vision capability', () => {
    expect(adapter.supportsCapability('vision')).toBe(true);
  });

  it('should support function_calling capability', () => {
    expect(adapter.supportsCapability('function_calling')).toBe(true);
  });

  it('should support embedding capability', () => {
    expect(adapter.supportsCapability('embedding')).toBe(true);
  });

  it('should support image_generation capability', () => {
    expect(adapter.supportsCapability('image_generation')).toBe(true);
  });

  it('should not support unknown capability', () => {
    expect(adapter.supportsCapability('unknown')).toBe(false);
  });
});

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
  });

  it('should have correct type', () => {
    expect(adapter.type).toBe('anthropic');
  });

  it('should support streaming', () => {
    expect(adapter.supportsStreaming()).toBe(true);
  });

  it('should support chat capability', () => {
    expect(adapter.supportsCapability('chat')).toBe(true);
  });

  it('should support vision capability', () => {
    expect(adapter.supportsCapability('vision')).toBe(true);
  });

  it('should support function_calling capability', () => {
    expect(adapter.supportsCapability('function_calling')).toBe(true);
  });
});

describe('GoogleAdapter', () => {
  let adapter: GoogleAdapter;

  beforeEach(() => {
    adapter = new GoogleAdapter();
  });

  it('should have correct type', () => {
    expect(adapter.type).toBe('google');
  });

  it('should support streaming', () => {
    expect(adapter.supportsStreaming()).toBe(true);
  });

  it('should support chat capability', () => {
    expect(adapter.supportsCapability('chat')).toBe(true);
  });

  it('should support vision capability', () => {
    expect(adapter.supportsCapability('vision')).toBe(true);
  });
});

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;

  beforeEach(() => {
    adapter = new OllamaAdapter();
  });

  it('should have correct type', () => {
    expect(adapter.type).toBe('ollama');
  });

  it('should support streaming', () => {
    expect(adapter.supportsStreaming()).toBe(true);
  });

  it('should support chat capability', () => {
    expect(adapter.supportsCapability('chat')).toBe(true);
  });
});

describe('GenericAdapter', () => {
  let adapter: GenericAdapter;

  beforeEach(() => {
    adapter = new GenericAdapter();
  });

  it('should have correct type', () => {
    expect(adapter.type).toBe('generic');
  });

  it('should support streaming', () => {
    expect(adapter.supportsStreaming()).toBe(true);
  });

  it('should support chat capability', () => {
    expect(adapter.supportsCapability('chat')).toBe(true);
  });
});

describe('aggregateStream', () => {
  it('should aggregate content from chunks', async () => {
    const chunks: ChatChunk[] = [
      { id: 'test', model: 'gpt-4', delta: { content: 'Hello' } },
      { id: 'test', model: 'gpt-4', delta: { content: ' ' } },
      { id: 'test', model: 'gpt-4', delta: { content: 'World' } },
      { id: 'test', model: 'gpt-4', delta: {}, finishReason: 'stop' },
    ];

    async function* generateChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const response = await aggregateStream(generateChunks());

    expect(response.id).toBe('test');
    expect(response.model).toBe('gpt-4');
    expect(response.message.content).toBe('Hello World');
    expect(response.finishReason).toBe('stop');
  });

  it('should aggregate tool calls from chunks', async () => {
    const chunks: ChatChunk[] = [
      {
        id: 'test',
        model: 'gpt-4',
        delta: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"' },
            },
          ],
        },
      },
      {
        id: 'test',
        model: 'gpt-4',
        delta: {
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'get_weather', arguments: 'city":"NYC"}' },
            },
          ],
        },
      },
      { id: 'test', model: 'gpt-4', delta: {}, finishReason: 'tool_calls' },
    ];

    async function* generateChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const response = await aggregateStream(generateChunks());

    expect(response.message.toolCalls).toBeDefined();
    expect(response.message.toolCalls?.length).toBe(1);
    expect(response.message.toolCalls?.[0].function.name).toBe('get_weather');
    expect(response.message.toolCalls?.[0].function.arguments).toBe('{"city":"NYC"}');
    expect(response.finishReason).toBe('tool_calls');
  });

  it('should handle empty stream', async () => {
    async function* generateChunks(): AsyncIterable<ChatChunk> {
      // Empty stream
    }

    const response = await aggregateStream(generateChunks());

    expect(response.message.content).toBe('');
    expect(response.finishReason).toBe('stop');
  });

  it('should use default usage values', async () => {
    const chunks: ChatChunk[] = [
      { id: 'test', model: 'gpt-4', delta: { content: 'Hi' }, finishReason: 'stop' },
    ];

    async function* generateChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const response = await aggregateStream(generateChunks());

    expect(response.usage.promptTokens).toBe(0);
    expect(response.usage.completionTokens).toBe(0);
    expect(response.usage.totalTokens).toBe(0);
  });
});

describe('createStreamCollector', () => {
  it('should yield chunks and provide final response', async () => {
    const chunks: ChatChunk[] = [
      { id: 'test', model: 'gpt-4', delta: { content: 'Hello' } },
      { id: 'test', model: 'gpt-4', delta: { content: ' World' } },
      { id: 'test', model: 'gpt-4', delta: {}, finishReason: 'stop' },
    ];

    async function* generateChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const { stream, response: responsePromise } = createStreamCollector(generateChunks());

    const collectedChunks: ChatChunk[] = [];
    for await (const chunk of stream) {
      collectedChunks.push(chunk);
    }

    expect(collectedChunks.length).toBe(3);

    const response = await responsePromise;
    expect(response.message.content).toBe('Hello World');
  });

  it('should handle errors in stream', async () => {
    async function* generateChunks(): AsyncIterable<ChatChunk> {
      yield { id: 'test', model: 'gpt-4', delta: { content: 'Hello' } };
      throw new Error('Stream error');
    }

    const { stream, response: responsePromise } = createStreamCollector(generateChunks());

    await expect(async () => {
      for await (const _ of stream) {
        // Consume stream
      }
    }).rejects.toThrow('Stream error');

    await expect(responsePromise).rejects.toThrow('Stream error');
  });
});

describe('MockAdapter', () => {
  let adapter: MockAdapter;
  const testModel: Model = {
    id: 'test-model',
    name: 'test-model',
    displayName: 'Test Model',
    providerId: 'mock',
    capabilities: ['chat'],
    contextWindow: 4096,
    enabled: true,
  };
  const testProvider: Provider = {
    id: 'mock',
    name: 'mock',
    displayName: 'Mock Provider',
    type: 'openai',
    apiUrl: 'https://api.example.com',
    apiKey: 'test-key',
    enabled: true,
  };

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  it('should support streaming by default', () => {
    expect(adapter.supportsStreaming()).toBe(true);
  });

  it('should not support streaming when not in capabilities', () => {
    const noStreamAdapter = new MockAdapter(['chat']);
    expect(noStreamAdapter.supportsStreaming()).toBe(false);
  });

  it('should check capability support', () => {
    expect(adapter.supportsCapability('chat')).toBe(true);
    expect(adapter.supportsCapability('streaming')).toBe(true);
    expect(adapter.supportsCapability('vision')).toBe(false);
  });

  it('should return chat response', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
    const response = await adapter.chat(messages, {}, testModel, testProvider);

    expect(response.id).toBe('test-id');
    expect(response.model).toBe('test-model');
    expect(response.message.content).toContain('Hello');
    expect(response.finishReason).toBe('stop');
  });

  it('should stream chat response', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const chunks: ChatChunk[] = [];

    for await (const chunk of adapter.chatStream(messages, {}, testModel, testProvider)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1].finishReason).toBe('stop');
  });
});
