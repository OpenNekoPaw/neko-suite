/**
 * Service Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgentTraceContext, type PerceptionCard } from '@neko/shared';
import { Service, ServiceConfig } from '../service';
import { toSharedService } from '../shared-service-adapter';
import { ConfigManager } from '../../config/config-manager';
import { ProviderRegistry } from '../../provider/provider-registry';
import type { ChatMessage, ChatResponse, Adapter, ChatChunk } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';
import type { IUserConfigManager } from '../../config/user-config';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';

// Mock adapter
const createMockAdapter = (
  responses: ChatResponse[] = [],
  type: string = 'mock',
): Partial<Adapter> => {
  let callIndex = 0;
  return {
    type,
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
    maxOutputTokens: 128000,
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

function createRoutingConfig(input: {
  providers: Provider[];
  models: Model[];
  adapters?: Record<string, Partial<Adapter>>;
}): ServiceConfig {
  const configManager = {
    assertConfigAvailable: vi.fn(),
    getProvider: vi.fn((id: string) => input.providers.find((p) => p.id === id)),
    getProviders: vi.fn(() => input.providers),
    getEnabledProviders: vi.fn(() => input.providers.filter((p) => p.enabled !== false)),
    getModel: vi.fn((id: string) => input.models.find((m) => m.id === id)),
    getModels: vi.fn(() => input.models),
    getEnabledModels: vi.fn(() => input.models.filter((m) => m.enabled !== false)),
    getModelsByProvider: vi.fn((providerId: string) =>
      input.models.filter((m) => m.providerId === providerId),
    ),
    getRetryTimeoutPreset: vi.fn(() => undefined),
    getChatModelOptions: vi.fn(() => []),
  } as unknown as ConfigManager;

  const providerRegistry = {
    getAdapter: vi.fn((providerId: string) => input.adapters?.[providerId] ?? createMockAdapter()),
    isProviderAvailable: vi.fn(() => true),
  } as unknown as ProviderRegistry;

  return {
    configManager,
    providerRegistry,
  };
}

function createImagePerceptionCard(): PerceptionCard {
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

describe('Service', () => {
  describe('chat', () => {
    it('should send chat request successfully with an explicit provider/model', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      const response = await service.chat(messages, { providerId: 'openai', modelId: 'gpt-4' });

      expect(response.message.content).toBe('Test response');
      expect(response.routing.modelId).toBe('gpt-4');
      expect(response.routing.providerId).toBe('openai');
      expect(response.timing.duration).toBeDefined();
    });

    it('rejects oversized output caps before provider dispatch', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], {
          providerId: 'openai',
          modelId: 'gpt-4',
          maxTokens: 256000,
        }),
      ).rejects.toMatchObject({
        code: 'TOKEN_BUDGET_INVALID',
      });

      expect(adapter.chat).not.toHaveBeenCalled();
    });

    it('passes only the validated output cap to provider adapters', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      await service.chat([{ role: 'user', content: 'Hello' }], {
        providerId: 'openai',
        modelId: 'gpt-4',
        maxTokens: 8192,
      });

      expect(adapter.chat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          maxTokens: 8192,
        }),
        expect.objectContaining({
          contextWindow: 128000,
          maxOutputTokens: 128000,
        }),
        expect.any(Object),
      );
    });

    it('records raw chat request and response payloads when a recorder is configured', async () => {
      const record = vi.fn();
      const config = {
        ...createMockConfig(),
        modelCallRecorder: { record },
      };
      const service = new Service(config);

      await service.chat(
        [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'Hello' },
        ],
        {
          providerId: 'openai',
          modelId: 'gpt-4',
          systemPromptSections: [{ content: 'Section prompt', cacheControl: 'ephemeral' }],
        },
        { trace: createAgentTraceContext({ conversationId: 'conv-1' }) },
      );

      expect(record).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          schema: 'neko.model-call.v1',
          kind: 'request',
          providerId: 'openai',
          modelId: 'gpt-4',
          stream: false,
          payload: expect.objectContaining({
            debugPayloadIncludesRawText: true,
            systemPromptSections: [
              { index: 0, cacheControl: 'ephemeral', content: 'Section prompt' },
            ],
            originalMessages: expect.arrayContaining([
              expect.objectContaining({
                role: 'system',
                content: 'System prompt',
              }),
            ]),
          }),
        }),
      );
      expect(record).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          schema: 'neko.model-call.v1',
          kind: 'response',
          providerId: 'openai',
          modelId: 'gpt-4',
          stream: false,
          payload: expect.objectContaining({
            message: expect.objectContaining({
              role: 'assistant',
              content: 'Test response',
            }),
          }),
        }),
      );
    });

    it('records localized final projected perception messages for Chinese shared-service calls', async () => {
      const record = vi.fn();
      const config = {
        ...createMockConfig(),
        modelCallRecorder: { record },
      };
      const service = new Service(config);
      const sharedService = toSharedService(service, {
        assetLoader: {
          load: async () => ({ kind: 'image', url: 'data:image/png;base64,thumb' }),
        },
      });

      await sharedService.chat(
        [
          { role: 'user', content: '分析图片' },
          {
            role: 'tool',
            toolCallId: 'call-read-image',
            content: JSON.stringify({
              schema: 'neko.tool-result.v1',
              data: { mode: 'metadata' },
              perceptionCards: [createImagePerceptionCard()],
            }),
          },
        ],
        {
          providerId: 'openai',
          modelId: 'gpt-4',
          locale: 'zh-CN',
        },
      );

      const requestRecord = record.mock.calls[0]?.[0] as
        | {
            readonly payload?: {
              readonly projectedMessages?: Array<{ readonly content?: unknown }>;
            };
          }
        | undefined;
      const projectedMessages = requestRecord?.payload?.projectedMessages ?? [];
      const projectedText = JSON.stringify(projectedMessages.at(-1)?.content);

      expect(projectedText).toContain('感知卡片 asset-1');
      expect(projectedText).not.toContain('PerceptionCard');
    });

    it('rejects model-only chat routing instead of inferring a provider', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      await expect(service.chat(messages, { modelId: 'gpt-4' })).rejects.toThrow(
        'Chat requests require both providerId and modelId',
      );
    });

    it('routes an explicit DeepSeek direct provider/model without falling through to a NewAPI gateway', async () => {
      const deepseekAdapter = createMockAdapter();
      const gatewayAdapter = createMockAdapter();
      const config = createRoutingConfig({
        providers: [
          {
            id: 'deepseek-direct',
            name: 'deepseek',
            displayName: 'DeepSeek',
            type: 'generic',
            apiUrl: 'https://api.deepseek.com',
            apiKey: 'deepseek-key',
            enabled: true,
            connectionKind: 'direct',
            protocolProfile: 'openai-chat',
          },
          {
            id: 'neko-gateway',
            name: 'neko-gateway',
            displayName: 'Neko Gateway',
            type: 'newapi',
            apiUrl: 'https://www.nekoapi.com/v1',
            apiKey: 'gateway-key',
            enabled: true,
            connectionKind: 'gateway',
            protocolProfile: 'newapi',
          },
        ],
        models: [
          {
            id: 'deepseek-v4-pro-direct',
            name: 'deepseek-v4-pro',
            displayName: 'DeepSeek V4 Pro',
            providerId: 'deepseek-direct',
            type: 'llm',
            capabilities: ['chat', 'vision'],
            enabled: true,
          },
          {
            id: 'deepseek-v4-pro-gateway',
            name: 'deepseek-v4-pro',
            displayName: 'DeepSeek V4 Pro',
            providerId: 'neko-gateway',
            type: 'llm',
            capabilities: ['chat', 'vision'],
            enabled: true,
          },
        ],
        adapters: {
          'deepseek-direct': deepseekAdapter,
          'neko-gateway': gatewayAdapter,
        },
      });
      const service = new Service(config);

      const response = await service.chat([{ role: 'user', content: 'Describe image' }], {
        providerId: 'deepseek-direct',
        modelId: 'deepseek-v4-pro-direct',
      });

      expect(response.routing).toMatchObject({
        providerId: 'deepseek-direct',
        modelId: 'deepseek-v4-pro-direct',
      });
      expect(deepseekAdapter.chat).toHaveBeenCalledTimes(1);
      expect(gatewayAdapter.chat).not.toHaveBeenCalled();
      expect(config.providerRegistry.getAdapter).toHaveBeenCalledWith(
        'deepseek-direct',
        expect.objectContaining({ providerId: 'deepseek-direct' }),
      );
    });

    it('rejects provider/model mismatches instead of rerouting by model ID', async () => {
      const deepseekAdapter = createMockAdapter();
      const gatewayAdapter = createMockAdapter();
      const config = createRoutingConfig({
        providers: [
          {
            id: 'deepseek-direct',
            name: 'deepseek',
            displayName: 'DeepSeek',
            type: 'generic',
            apiUrl: 'https://api.deepseek.com',
            apiKey: 'deepseek-key',
            enabled: true,
            connectionKind: 'direct',
            protocolProfile: 'openai-chat',
          },
          {
            id: 'neko-gateway',
            name: 'neko-gateway',
            displayName: 'Neko Gateway',
            type: 'newapi',
            apiUrl: 'https://www.nekoapi.com/v1',
            apiKey: 'gateway-key',
            enabled: true,
            connectionKind: 'gateway',
            protocolProfile: 'newapi',
          },
        ],
        models: [
          {
            id: 'gateway-deepseek',
            name: 'deepseek-v4-pro',
            providerId: 'neko-gateway',
            type: 'llm',
            capabilities: ['chat'],
            enabled: true,
          },
        ],
        adapters: {
          'deepseek-direct': deepseekAdapter,
          'neko-gateway': gatewayAdapter,
        },
      });
      const service = new Service(config);

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], {
          providerId: 'deepseek-direct',
          modelId: 'gateway-deepseek',
        }),
      ).rejects.toThrow(
        'Model gateway-deepseek belongs to provider neko-gateway, not deepseek-direct',
      );
      expect(deepseekAdapter.chat).not.toHaveBeenCalled();
      expect(gatewayAdapter.chat).not.toHaveBeenCalled();
    });

    it('uses configured local providers without requiring an API key', async () => {
      const localAdapter = createMockAdapter();
      const config = createRoutingConfig({
        providers: [
          {
            id: 'ollama-local',
            name: 'ollama',
            displayName: 'Ollama Local',
            type: 'ollama',
            apiUrl: 'http://localhost:11434/api',
            enabled: true,
            connectionKind: 'local',
            protocolProfile: 'ollama',
            requiresApiKey: false,
          },
        ],
        models: [
          {
            id: 'llama-local',
            name: 'llama3.2',
            providerId: 'ollama-local',
            type: 'llm',
            capabilities: ['chat'],
            enabled: true,
          },
        ],
        adapters: { 'ollama-local': localAdapter },
      });
      const service = new Service(config);

      const response = await service.chat([{ role: 'user', content: 'Hello' }], {
        providerId: 'ollama-local',
        modelId: 'llama-local',
      });

      expect(response.routing).toMatchObject({
        providerId: 'ollama-local',
        modelId: 'llama-local',
      });
      expect(localAdapter.chat).toHaveBeenCalledTimes(1);
    });

    it('projects messages before sending to the adapter', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      await service.chat([{ role: 'user', content: 'Hello' }], {
        providerId: 'openai',
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
        { providerId: 'openai', modelId: 'gpt-4' },
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

    it('rejects chat requests without explicit provider/model before model fallback', async () => {
      const config = createMockConfig();
      (config.configManager.getEnabledModels as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const service = new Service(config);

      await expect(service.chat([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        'Chat requests require an explicit providerId and modelId',
      );
      expect(config.configManager.getEnabledModels).not.toHaveBeenCalled();
    });

    it('should throw when model not found', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], {
          providerId: 'openai',
          modelId: 'non-existent',
        }),
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

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], {
          providerId: 'openai',
          modelId: 'gpt-4',
        }),
      ).rejects.toThrow('Configuration file contains invalid TOML');
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

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], {
          providerId: 'openai',
          modelId: 'gpt-4',
        }),
      ).rejects.toThrow('Agent configuration has no enabled providers');
      expect(getEnabledModels).not.toHaveBeenCalled();
      expect(adapter.chat).not.toHaveBeenCalled();
    });
  });

  describe('chatStream', () => {
    it('should stream chat response', async () => {
      const config = createMockConfig();
      const service = new Service(config);

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      const { stream, response } = service.chatStream(messages, {
        providerId: 'openai',
        modelId: 'gpt-4',
      });

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

    it('records raw streaming request and response payloads when a recorder is configured', async () => {
      const record = vi.fn();
      const config = {
        ...createMockConfig(),
        modelCallRecorder: { record },
      };
      const service = new Service(config);

      const { stream, response } = service.chatStream(
        [{ role: 'user', content: 'Hello' }],
        {
          providerId: 'openai',
          modelId: 'gpt-4',
        },
        { trace: createAgentTraceContext({ conversationId: 'conv-stream' }) },
      );

      for await (const _chunk of stream) {
        // Drain stream.
      }
      await response;

      expect(record).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          schema: 'neko.model-call.v1',
          kind: 'request',
          providerId: 'openai',
          modelId: 'gpt-4',
          stream: true,
          payload: expect.objectContaining({
            debugPayloadIncludesRawText: true,
            originalMessages: expect.arrayContaining([
              expect.objectContaining({ role: 'user', content: 'Hello' }),
            ]),
          }),
        }),
      );
      expect(record).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          schema: 'neko.model-call.v1',
          kind: 'response',
          providerId: 'openai',
          modelId: 'gpt-4',
          stream: true,
          payload: expect.objectContaining({
            message: expect.objectContaining({
              role: 'assistant',
              content: 'Hello World',
            }),
          }),
        }),
      );
    });

    it('projects messages before opening a chat stream', async () => {
      const adapter = createMockAdapter();
      const config = createMockConfig(adapter);
      const service = new Service(config);

      const { stream } = service.chatStream([{ role: 'user', content: 'Hello' }], {
        providerId: 'openai',
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

    it('retries retryable stream failures before the first provider chunk', async () => {
      vi.useFakeTimers();
      const adapter = createMockAdapter([], 'generic');
      (adapter.chatStream as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(async function* () {
          if (Date.now() < 0) {
            yield { id: 'unreachable', model: 'gpt-4', delta: {} };
          }
          throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
        })
        .mockImplementationOnce(async function* () {
          yield { id: 'stream-2', model: 'gpt-4', delta: { content: 'Recovered' } };
          yield { id: 'stream-2', model: 'gpt-4', delta: {}, finishReason: 'stop' };
        });
      const config = createMockConfig(adapter);
      const service = new Service(config);

      const { stream, response } = service.chatStream([{ role: 'user', content: 'Hello' }], {
        providerId: 'openai',
        modelId: 'gpt-4',
      });

      const drain = (async () => {
        const chunks: ChatChunk[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        return chunks;
      })();

      await vi.advanceTimersByTimeAsync(10);
      const chunks = await drain;
      const finalResponse = await response;

      expect(adapter.chatStream).toHaveBeenCalledTimes(2);
      expect(chunks[0]?.delta.content).toBe('Recovered');
      expect(finalResponse.message.content).toBe('Recovered');
      vi.useRealTimers();
    });

    it('does not retry stream failures after a provider chunk was emitted', async () => {
      const adapter = createMockAdapter([], 'generic');
      (adapter.chatStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { id: 'stream-1', model: 'gpt-4', delta: { content: 'Partial' } };
        throw Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' });
      });
      const config = createMockConfig(adapter);
      const service = new Service(config);

      const { stream, response } = service.chatStream([{ role: 'user', content: 'Hello' }], {
        providerId: 'openai',
        modelId: 'gpt-4',
      });
      const responseError = response.catch((error: unknown) => error);

      const chunks: ChatChunk[] = [];
      await expect(async () => {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('fetch failed');
      await expect(responseError).resolves.toMatchObject({
        message: expect.stringContaining('fetch failed'),
      });

      expect(adapter.chatStream).toHaveBeenCalledTimes(1);
      expect(chunks[0]?.delta.content).toBe('Partial');
    });

    it('surfaces detailed error after configured initial stream retries are exhausted', async () => {
      vi.useFakeTimers();
      const adapter = createMockAdapter([], 'generic');
      (adapter.chatStream as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        if (Date.now() < 0) {
          yield { id: 'unreachable', model: 'gpt-4', delta: {} };
        }
        throw Object.assign(
          new Error(
            'Network request failed for POST https://gateway.example.test/v1/chat/completions: fetch failed (cause=ECONNRESET: socket hang up)',
          ),
          { code: 'NETWORK_ERROR' },
        );
      });
      const config = createMockConfig(adapter);
      const service = new Service(config);

      const { stream, response } = service.chatStream([{ role: 'user', content: 'Hello' }], {
        providerId: 'openai',
        modelId: 'gpt-4',
      });
      const responseError = response.catch((error: unknown) => error);

      const drain = (async () => {
        for await (const _chunk of stream) {
          // Drain stream.
        }
      })();
      const drainError = drain.catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(10);
      await expect(drainError).resolves.toMatchObject({
        message: expect.stringContaining('Model request failed after 3 attempts'),
      });
      await expect(responseError).resolves.toMatchObject({
        message: expect.stringContaining('cause=ECONNRESET'),
      });

      expect(adapter.chatStream).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('rejects streams without explicit provider/model before model fallback', () => {
      const config = createMockConfig();
      (config.configManager.getEnabledModels as ReturnType<typeof vi.fn>).mockReturnValue([]);

      const service = new Service(config);

      expect(() => service.chatStream([{ role: 'user', content: 'Hello' }])).toThrow(
        'Chat requests require an explicit providerId and modelId',
      );
      expect(config.configManager.getEnabledModels).not.toHaveBeenCalled();
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

      expect(() =>
        service.chatStream([{ role: 'user', content: 'Hello' }], {
          providerId: 'openai',
          modelId: 'gpt-4',
        }),
      ).toThrow('Configuration file is empty');
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

      await expect(
        service.chat([{ role: 'user', content: 'Hello' }], {
          providerId: 'openai',
          modelId: 'gpt-4',
        }),
      ).rejects.toThrow('API error');
    });
  });
});
