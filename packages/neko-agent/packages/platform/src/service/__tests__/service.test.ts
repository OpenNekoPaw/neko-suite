/**
 * Service Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentTraceContext } from '@neko/shared';
import { Service, ServiceConfig } from '../service';
import { ConfigManager } from '../../config/config-manager';
import { ProviderRegistry } from '../../provider/provider-registry';
import type { ChatMessage, ChatResponse, Adapter, ChatChunk } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';
import type { IUserConfigManager } from '../../config/user-config';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';

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
    assertConfigAvailable: vi.fn(),
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

function createReadResultUserConfigManager(result: ConfigReadResult): IUserConfigManager {
  return {
    load: () => {
      throw new Error('legacy load fallback should not be used');
    },
    loadRaw: () => {
      throw new Error('legacy raw fallback should not be used');
    },
    loadRawResult: () => result,
    save: async () => {
      throw new Error('write path should not be used');
    },
    updateProviderOverride: async () => {
      throw new Error('write path should not be used');
    },
    addProvider: async () => {
      throw new Error('write path should not be used');
    },
    removeProvider: async () => {
      throw new Error('write path should not be used');
    },
    addModel: async () => {
      throw new Error('write path should not be used');
    },
    removeModel: async () => {
      throw new Error('write path should not be used');
    },
    updateMCPServerOverride: async () => {
      throw new Error('write path should not be used');
    },
    addMCPServer: async () => {
      throw new Error('write path should not be used');
    },
    removeMCPServer: async () => {
      throw new Error('write path should not be used');
    },
    clear: async () => {
      throw new Error('write path should not be used');
    },
    updateScalar: async () => {
      throw new Error('write path should not be used');
    },
    updateScalars: async () => {
      throw new Error('write path should not be used');
    },
    reload: () => {},
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

    it('keeps trace context out of provider adapter payloads', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      await service.chat(
        [{ role: 'user', content: 'Hello' }],
        { modelId: 'gpt-4' },
        {
          trace: createAgentTraceContext({
            conversationId: 'conv-1',
            runId: 'run-1',
            turnId: 'turn-1',
            phase: 'llm',
          }),
        },
      );

      expect(adapter.chat).toHaveBeenCalledTimes(1);
      const [messages, options] = (adapter.chat as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(options).toEqual(expect.objectContaining({ model: 'gpt-4' }));
      expect(options).not.toHaveProperty('trace');
      expect(JSON.stringify(messages)).not.toContain('conv-1');
      expect(JSON.stringify(options)).not.toContain('conv-1');
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

    it('fails closed before provider fallback when the active config snapshot has an error', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      (config.configManager.assertConfigAvailable as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error(
            'Configuration file contains invalid TOML: /home/user/.neko/config.toml. Fix the file, then open a new Agent session or tab.',
          );
        },
      );
      const service = new Service(config);

      await expect(service.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        'Configuration file contains invalid TOML',
      );
      expect(adapter.chat).not.toHaveBeenCalled();
      expect(config.configManager.getEnabledModels).not.toHaveBeenCalled();
    });

    it('reports missing provider configuration before model lookup can report MODEL_NOT_FOUND', async () => {
      const configManager = new ConfigManager({
        userConfigManager: createReadResultUserConfigManager({
          status: 'ok',
          filePath: '/home/user/.neko/config.toml',
          config: {},
        }),
      });
      const getEnabledModels = vi.spyOn(configManager, 'getEnabledModels');
      const providerRegistry = new ProviderRegistry(configManager);
      const adapter = createMockAdapter();
      vi.spyOn(providerRegistry, 'getAdapter').mockReturnValue(adapter as Adapter);
      const service = new Service({ configManager, providerRegistry });

      await expect(service.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        'Agent configuration has no enabled providers',
      );
      expect(getEnabledModels).not.toHaveBeenCalled();
      expect(adapter.chat).not.toHaveBeenCalled();
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

    it('fails closed before opening a stream when the active config snapshot has an error', () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      (config.configManager.assertConfigAvailable as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('Configuration file is empty: /home/user/.neko/config.toml');
        },
      );
      const service = new Service(config);

      expect(() => service.chatStream([{ role: 'user', content: 'Hello' }])).toThrow(
        'Configuration file is empty',
      );
      expect(adapter.chatStream).not.toHaveBeenCalled();
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

    it('fails closed before embedding when the active config snapshot has an error', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      (config.configManager.assertConfigAvailable as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error('Unable to read configuration file: /home/user/.neko/config.toml');
        },
      );
      const service = new Service(config);

      await expect(service.embed('Hello', { modelId: 'text-embedding-ada' })).rejects.toThrow(
        'Unable to read configuration file',
      );
      expect(adapter.embed).not.toHaveBeenCalled();
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
