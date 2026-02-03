/**
 * LLMRoutingManager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMRoutingManager } from '../routing/llm-routing-manager';
import type { LLMRoutingContext, LLMRoutingPreference } from '../routing/types';
import type { ProviderRegistry } from '../../provider/provider-registry';
import type { ConfigManager } from '../../config/config-manager';
import type { Provider, Model } from '../../types/provider';

// Mock config manager
function createMockConfigManager(
  providers: Provider[],
  models: Model[]
): ConfigManager {
  return {
    getEnabledProviders: vi.fn().mockReturnValue(providers),
    getModelsByProvider: vi.fn((providerId: string) =>
      models.filter((m) => m.providerId === providerId)
    ),
    getProvider: vi.fn((id: string) => providers.find((p) => p.id === id)),
    getModel: vi.fn((id: string) => models.find((m) => m.id === id)),
  } as unknown as ConfigManager;
}

// Mock provider registry
function createMockProviderRegistry(): ProviderRegistry {
  return {
    isProviderAvailable: vi.fn().mockReturnValue(true),
  } as unknown as ProviderRegistry;
}

describe('LLMRoutingManager', () => {
  let manager: LLMRoutingManager;
  let mockProviderRegistry: ProviderRegistry;
  let mockConfigManager: ConfigManager;

  const mockProviders: Provider[] = [
    {
      id: 'openai',
      type: 'openai',
      displayName: 'OpenAI',
      enabled: true,
      config: { apiKey: 'test' },
    },
    {
      id: 'anthropic',
      type: 'anthropic',
      displayName: 'Anthropic',
      enabled: true,
      config: { apiKey: 'test' },
    },
  ];

  const mockModels: Model[] = [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      providerId: 'openai',
      modelId: 'gpt-4',
      enabled: true,
      capabilities: ['chat', 'tools', 'vision'],
      contextWindow: 128000,
      inputCostPer1k: 0.03,
      outputCostPer1k: 0.06,
    },
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      providerId: 'openai',
      modelId: 'gpt-3.5-turbo',
      enabled: true,
      capabilities: ['chat', 'tools'],
      contextWindow: 16000,
      inputCostPer1k: 0.001,
      outputCostPer1k: 0.002,
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      providerId: 'anthropic',
      modelId: 'claude-3-opus-20240229',
      enabled: true,
      capabilities: ['chat', 'tools', 'vision'],
      contextWindow: 200000,
      inputCostPer1k: 0.015,
      outputCostPer1k: 0.075,
    },
  ];

  beforeEach(() => {
    mockProviderRegistry = createMockProviderRegistry();
    mockConfigManager = createMockConfigManager(mockProviders, mockModels);
    manager = new LLMRoutingManager(mockProviderRegistry, mockConfigManager);
  });

  describe('selectProvider', () => {
    it('should select a provider and model', async () => {
      const context: LLMRoutingContext = {
        taskType: 'chat',
        providerHealth: new Map(),
      };

      const result = await manager.selectProvider(context);

      expect(result).not.toBeNull();
      expect(result?.providerId).toBeDefined();
      expect(result?.modelId).toBeDefined();
    });

    it('should return null when no providers available', async () => {
      const emptyProviderRegistry = createMockProviderRegistry();
      const emptyConfigManager = createMockConfigManager([], []);
      const emptyManager = new LLMRoutingManager(emptyProviderRegistry, emptyConfigManager);

      const context: LLMRoutingContext = {
        taskType: 'chat',
        providerHealth: new Map(),
      };

      const result = await emptyManager.selectProvider(context);
      expect(result).toBeNull();
    });
  });

  describe('routeChat', () => {
    it('should route chat request', async () => {
      const result = await manager.routeChat();

      expect(result).not.toBeNull();
      expect(result?.model.capabilities).toContain('chat');
    });

    it('should filter by vision requirement', async () => {
      const result = await manager.routeChat({ requireVision: true });

      expect(result).not.toBeNull();
      expect(result?.model.capabilities).toContain('vision');
    });

    it('should filter by tools requirement', async () => {
      const result = await manager.routeChat({ requireTools: true });

      expect(result).not.toBeNull();
      expect(result?.model.capabilities).toContain('tools');
    });

    it('should respect user preference to exclude providers', async () => {
      const preference: LLMRoutingPreference = {
        excludeTargets: ['openai'],
      };

      const result = await manager.routeChat({ preference });

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('anthropic');
    });

    it('should respect user preference for preferred provider', async () => {
      const preference: LLMRoutingPreference = {
        preferredTargets: ['anthropic'],
        optimizeFor: 'quality', // Prefer quality to avoid cost affecting selection
      };

      // Run multiple times to verify preference consistently affects selection
      const results = await Promise.all([
        manager.routeChat({ preference }),
        manager.routeChat({ preference }),
        manager.routeChat({ preference }),
      ]);

      // Preferred provider should get bonus score
      // At least some selections should favor anthropic
      const anthropicCount = results.filter(r => r?.providerId === 'anthropic').length;
      expect(anthropicCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createChatContext', () => {
    it('should create context with all options', () => {
      const context = manager.createChatContext({
        estimatedInputTokens: 1000,
        requireStream: true,
        requireToolCalling: true,
        requireVision: true,
        requireJsonMode: true,
      });

      expect(context.taskType).toBe('chat');
      expect(context.estimatedInputTokens).toBe(1000);
      expect(context.requireStream).toBe(true);
      expect(context.requireToolCalling).toBe(true);
      expect(context.requireVision).toBe(true);
      expect(context.requireJsonMode).toBe(true);
    });
  });

  describe('selectFallback', () => {
    it('should exclude specified providers', async () => {
      const context: LLMRoutingContext = {
        taskType: 'chat',
        providerHealth: new Map(),
        preference: {
          allowFallback: true,
        },
      };

      const result = await manager.selectFallback(context, ['openai']);

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('anthropic');
    });

    it('should return null when fallback not allowed', async () => {
      const context: LLMRoutingContext = {
        taskType: 'chat',
        providerHealth: new Map(),
        preference: {
          allowFallback: false,
        },
      };

      const result = await manager.selectFallback(context, ['openai']);
      expect(result).toBeNull();
    });
  });

  describe('strategy chain', () => {
    it('should filter unhealthy providers', async () => {
      const healthMap = new Map<string, boolean>();
      healthMap.set('openai', false); // Mark OpenAI as unhealthy

      const context: LLMRoutingContext = {
        taskType: 'chat',
        providerHealth: healthMap,
      };

      const result = await manager.selectProvider(context);

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('anthropic');
    });

    it('should filter by context window', async () => {
      const context: LLMRoutingContext = {
        taskType: 'chat',
        providerHealth: new Map(),
        estimatedInputTokens: 50000, // Requires > 16k context
      };

      const result = await manager.selectProvider(context);

      expect(result).not.toBeNull();
      // GPT-3.5 only has 16k context, should be filtered out
      expect(result?.model.contextWindow).toBeGreaterThan(50000);
    });
  });
});
