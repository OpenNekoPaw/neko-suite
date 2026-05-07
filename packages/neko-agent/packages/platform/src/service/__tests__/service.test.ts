/**
 * Service Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { Service, ServiceConfig } from '../service';
import { ConfigManager } from '../../config/config-manager';
import { ProviderRegistry } from '../../provider/provider-registry';
import type { ChatMessage, ChatResponse, Adapter, ChatChunk } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';

// Mock adapter
const createMockAdapter = (responses: ChatResponse[] = []): Partial<Adapter> => {
  let callIndex = 0;
  return {
    type: 'mock',
    supportsStreaming: () => true,
    supportsCapability: () => true,
    chat: vi.fn().mockImplementation(async () => {
      if (responses.length > 0) {
        return responses[callIndex++ % responses.length];
      }
      return {
        id: 'response-1',
        model: 'gpt-4',
        message: {
          role: 'assistant',
          content: 'Test response',
        },
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    }),
    chatStream: vi.fn().mockImplementation(async function* () {
      yield { id: 'stream-1', model: 'gpt-4', delta: { content: 'Hello' } };
      yield { id: 'stream-1', model: 'gpt-4', delta: { content: ' World' } };
      yield { id: 'stream-1', model: 'gpt-4', delta: {}, finishReason: 'stop' };
    }),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  };
};

// Mock providers and models
const mockProviders: Provider[] = [
  {
    id: 'openai',
    name: 'openai',
    displayName: 'OpenAI',
    type: 'openai',
    apiUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    enabled: true,
  },
];

const mockModels: Model[] = [
  {
    id: 'gpt-4',
    name: 'gpt-4',
    displayName: 'GPT-4',
    providerId: 'openai',
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 128000,
    enabled: true,
  },
  {
    id: 'text-embedding-ada',
    name: 'text-embedding-ada-002',
    displayName: 'Ada Embedding',
    providerId: 'openai',
    capabilities: ['embedding'],
    contextWindow: 8192,
    enabled: true,
  },
];

function createMockConfig(adapter?: Partial<Adapter>): ServiceConfig {
  const mockAdapter = adapter || createMockAdapter();

  const configManager = {
    getProvider: vi.fn((id: string) => mockProviders.find((p) => p.id === id)),
    getProviders: vi.fn(() => mockProviders),
    getEnabledProviders: vi.fn(() => mockProviders.filter((p) => p.enabled)),
    getModel: vi.fn((id: string) => mockModels.find((m) => m.id === id)),
    getModels: vi.fn(() => mockModels),
    getEnabledModels: vi.fn(() => mockModels.filter((m) => m.enabled)),
    getModelsByProvider: vi.fn((providerId: string) =>
      mockModels.filter((m) => m.providerId === providerId),
    ),
    getTaskDefaults: vi.fn(() => undefined),
    getRetryTimeoutPreset: vi.fn(() => ({
      retry: {
        maxRetries: 2,
        backoffStrategy: { type: 'fixed' as const, delayMs: 10 },
        retryableCategories: ['rate_limit', 'timeout', 'server', 'network'],
      },
      timeout: {
        requestTimeout: 30000,
        totalTimeout: 60000,
        streamTimeout: 10000,
      },
    })),
    getChatModelOptions: vi.fn(() => []),
  } as unknown as ConfigManager;

  const providerRegistry = {
    getAdapter: vi.fn(() => mockAdapter as Adapter),
    isProviderAvailable: vi.fn(() => true),
  } as unknown as ProviderRegistry;

  return {
    configManager,
    providerRegistry,
  };
}

describe('Service', () => {
  describe('chat', () => {
    it('should send chat request successfully', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      const response = await service.chat(messages);

      expect(response.message.content).toBe('Test response');
      expect(response.routing.modelId).toBe('gpt-4');
      expect(response.routing.providerId).toBe('openai');
      expect(response.timing.duration).toBeDefined();
    });

    it('should use specified model ID', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      const response = await service.chat(messages, { modelId: 'gpt-4' });

      expect(response.routing.modelId).toBe('gpt-4');
    });

    it('projects messages before sending to the adapter', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      await service.chat([{ role: 'user', content: 'Hello' }], {
        modelId: 'gpt-4',
        messageProjector: ({ messages, providerId, modelId }) => [
          ...messages,
          { role: 'user', content: `projected:${providerId}:${modelId}` },
        ],
      });

      expect(adapter.chat).toHaveBeenCalledWith(
        [
          { role: 'user', content: 'Hello' },
          { role: 'user', content: 'projected:openai:gpt-4' },
        ],
        expect.objectContaining({ model: 'gpt-4' }),
        expect.objectContaining({ id: 'gpt-4' }),
        expect.objectContaining({ id: 'openai' }),
      );
    });

    it('should throw when no model available', async () => {
      const config = createMockConfig();
      (config.configManager.getEnabledModels as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const service = new Service(config);

      await expect(service.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow();
    });

    it('should throw when model not found', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], { modelId: 'non-existent' }),
      ).rejects.toThrow('Model non-existent not found');
    });
  });

  describe('chatStream', () => {
    it('should stream chat response', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      const { stream, response } = service.chatStream(messages);

      const chunks: ChatChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(3);
      expect(chunks[0]?.delta.content).toBe('Hello');
      expect(chunks[1]?.delta.content).toBe(' World');

      const finalResponse = await response;
      expect(finalResponse.message.content).toBe('Hello World');
      expect(finalResponse.routing.modelId).toBe('gpt-4');
    });

    it('projects messages before opening a chat stream', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      const { stream } = service.chatStream([{ role: 'user', content: 'Hello' }], {
        modelId: 'gpt-4',
        messageProjector: ({ messages }) => [...messages, { role: 'user', content: 'projected' }],
      });

      for await (const _chunk of stream) {
        // Drain stream.
      }

      expect(adapter.chatStream).toHaveBeenCalledWith(
        [
          { role: 'user', content: 'Hello' },
          { role: 'user', content: 'projected' },
        ],
        expect.objectContaining({ model: 'gpt-4', stream: true }),
        expect.objectContaining({ id: 'gpt-4' }),
        expect.objectContaining({ id: 'openai' }),
      );
    });

    it('should throw when no model available', () => {
      const config = createMockConfig();
      (config.configManager.getEnabledModels as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const service = new Service(config);

      expect(() => service.chatStream([{ role: 'user', content: 'Hello' }])).toThrow();
    });
  });

  describe('embed', () => {
    it('should generate embeddings', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const response = await service.embed('Hello world', { modelId: 'text-embedding-ada' });

      expect(response.embeddings).toBeDefined();
      expect(response.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(response.model).toBe('text-embedding-ada');
    });

    it('should handle array input', async () => {
      const adapter = createMockAdapter();
      adapter.embed = vi.fn().mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);

      const config = createMockConfig(adapter);
      const service = new Service(config);

      const response = await service.embed(['Hello', 'World'], { modelId: 'text-embedding-ada' });

      expect(response.embeddings.length).toBe(2);
    });

    it('should throw when embedding not supported', async () => {
      const adapter = createMockAdapter();
      delete adapter.embed;

      const config = createMockConfig(adapter);
      const service = new Service(config);

      await expect(service.embed('Hello', { modelId: 'text-embedding-ada' })).rejects.toThrow(
        'does not support embeddings',
      );
    });
  });

  describe('error handling', () => {
    it('should propagate adapter errors', async () => {
      const adapter = createMockAdapter();
      (adapter.chat as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));

      const config = createMockConfig(adapter);
      const service = new Service(config);

      await expect(service.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow('API error');
    });
  });
});
