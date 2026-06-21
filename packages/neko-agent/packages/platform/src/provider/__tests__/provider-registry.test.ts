/**
 * ProviderRegistry Unit Tests
 *
 * Tests for adapter routing and model discovery.
 */

import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from '../provider-registry';
import { ConfigManager } from '../../config/config-manager';
import type { Provider, Model } from '../../types/provider';

// Create mock config manager
function createMockConfigManager(): ConfigManager {
  const mockProviders: Provider[] = [
    {
      id: 'openai',
      name: 'openai',
      displayName: 'OpenAI',
      type: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      enabled: true,
    },
    {
      id: 'anthropic',
      name: 'anthropic',
      displayName: 'Anthropic',
      type: 'anthropic',
      apiUrl: 'https://api.anthropic.com',
      enabled: true,
    },
    {
      id: 'generic-provider',
      name: 'generic-provider',
      displayName: 'Generic',
      type: 'generic',
      apiUrl: 'https://generic.com/v1',
      enabled: true,
    },
    {
      id: 'disabled-provider',
      name: 'disabled-provider',
      displayName: 'Disabled',
      type: 'openai',
      apiUrl: 'https://disabled.com',
      enabled: false,
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
      id: 'gpt-3.5-turbo',
      name: 'gpt-3.5-turbo',
      displayName: 'GPT-3.5 Turbo',
      providerId: 'openai',
      capabilities: ['chat', 'function_calling'],
      contextWindow: 16000,
      enabled: true,
    },
    {
      id: 'claude-3-opus',
      name: 'claude-3-opus',
      displayName: 'Claude 3 Opus',
      providerId: 'anthropic',
      capabilities: ['chat', 'vision', 'function_calling'],
      contextWindow: 200000,
      enabled: true,
    },
    {
      id: 'disabled-model',
      name: 'disabled-model',
      displayName: 'Disabled Model',
      providerId: 'openai',
      capabilities: ['chat'],
      contextWindow: 4000,
      enabled: false,
    },
  ];

  const manager = {
    getProvider: vi.fn((id: string) => mockProviders.find((p) => p.id === id)),
    getProviders: vi.fn(() => mockProviders),
    getEnabledProviders: vi.fn(() => mockProviders.filter((p) => p.enabled)),
    getModel: vi.fn((id: string) => mockModels.find((m) => m.id === id)),
    getModels: vi.fn(() => mockModels),
    getEnabledModels: vi.fn(() => mockModels.filter((m) => m.enabled)),
    getModelsByProvider: vi.fn((providerId: string) =>
      mockModels.filter((m) => m.providerId === providerId),
    ),
  };

  return manager as unknown as ConfigManager;
}

describe('ProviderRegistry', () => {
  it('should get adapter for valid provider', () => {
    const configManager = createMockConfigManager();
    const registry = new ProviderRegistry(configManager);

    const adapter = registry.getAdapter('openai');
    expect(adapter).toBeDefined();
    expect(adapter?.type).toBe('openai');
  });

  it('should return undefined for non-existent provider', () => {
    const configManager = createMockConfigManager();
    const registry = new ProviderRegistry(configManager);

    const adapter = registry.getAdapter('non-existent');
    expect(adapter).toBeUndefined();
  });

  it('should use model protocol when provided', () => {
    const configManager = createMockConfigManager();
    const registry = new ProviderRegistry(configManager);

    const model: Model = {
      id: 'custom',
      name: 'custom-model',
      providerId: 'openai',
      capabilities: ['chat'],
      enabled: true,
      protocol: 'anthropic',
    };

    const adapter = registry.getAdapter('openai', model);
    expect(adapter).toBeDefined();
    expect(adapter?.type).toBe('anthropic');
  });

  it('keeps generic providers on the generic adapter even when the model name resembles another provider', () => {
    const configManager = createMockConfigManager();
    const registry = new ProviderRegistry(configManager);

    const model: Model = {
      id: 'claude-generic',
      name: 'claude-3-sonnet',
      providerId: 'generic-provider',
      capabilities: ['chat'],
      enabled: true,
    };

    const adapter = registry.getAdapter('generic-provider', model);
    expect(adapter).toBeDefined();
    expect(adapter?.type).toBe('generic');
  });

  it('keeps non-generic providers on their configured adapter even when the model name resembles another provider', () => {
    const configManager = createMockConfigManager();
    const registry = new ProviderRegistry(configManager);

    // Even though model name contains 'claude', openai provider should keep openai adapter
    const model: Model = {
      id: 'claude-via-openai',
      name: 'claude-proxy',
      providerId: 'openai',
      capabilities: ['chat'],
      enabled: true,
    };

    const adapter = registry.getAdapter('openai', model);
    expect(adapter).toBeDefined();
    expect(adapter?.type).toBe('openai');
  });

  describe('isProviderAvailable', () => {
    it('should always return true', () => {
      const configManager = createMockConfigManager();
      const registry = new ProviderRegistry(configManager);

      expect(registry.isProviderAvailable('openai')).toBe(true);
      expect(registry.isProviderAvailable('non-existent')).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should be a no-op', () => {
      const configManager = createMockConfigManager();
      const registry = new ProviderRegistry(configManager);

      // Should not throw
      registry.dispose();
    });
  });
});
