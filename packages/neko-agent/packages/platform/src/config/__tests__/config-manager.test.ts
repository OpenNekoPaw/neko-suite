/**
 * ConfigManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigManager } from '../config-manager';
import { loadBuiltinPresets } from '../builtin-presets';
import type { UserConfigStorage } from '../user-config';
import type { Provider, Model } from '../../types/provider';
import type { Group } from '../../types/group';

// Mock user config storage
function createMockStorage(): UserConfigStorage & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get<T>(key: string): T | undefined {
      return data[key] as T | undefined;
    },
    async update(key: string, value: unknown): Promise<void> {
      data[key] = value;
    },
  };
}

describe('ConfigManager', () => {
  describe('builtin presets', () => {
    it('should load builtin presets correctly', () => {
      const presets = loadBuiltinPresets();

      expect(presets.providers.length).toBeGreaterThan(0);
      expect(presets.models.length).toBeGreaterThan(0);
      expect(presets.groups.length).toBeGreaterThan(0);
    });

    it('should include expected providers', () => {
      const presets = loadBuiltinPresets();
      const providerIds = presets.providers.map((p) => p.id);

      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('anthropic');
      expect(providerIds).toContain('google');
    });

    it('should include expected models', () => {
      const presets = loadBuiltinPresets();
      const modelIds = presets.models.map((m) => m.id);

      // Model IDs now use provider-modelname format
      expect(modelIds).toContain('openai-gpt-4o');
      expect(modelIds).toContain('anthropic-claude-3-5-sonnet');
      expect(modelIds).toContain('google-gemini-2-flash');
    });

    it('should include expected groups', () => {
      const presets = loadBuiltinPresets();
      const groupIds = presets.groups.map((g) => g.id);

      expect(groupIds).toContain('default');
      expect(groupIds).toContain('fast');
      expect(groupIds).toContain('vision');
    });
  });

  describe('ConfigManager initialization', () => {
    it('should initialize without options', () => {
      const manager = new ConfigManager();
      const config = manager.getConfig();

      expect(config.providers.size).toBeGreaterThan(0);
      expect(config.models.size).toBeGreaterThan(0);
      expect(config.groups.size).toBeGreaterThan(0);
    });

    it('should get provider by ID', () => {
      const manager = new ConfigManager();
      const provider = manager.getProvider('openai');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('openai');
      expect(provider?.name).toBe('openai');
      expect(provider?.displayName).toBe('OpenAI');
    });

    it('should get model by ID', () => {
      const manager = new ConfigManager();
      // Model ID now uses provider-modelname format
      const model = manager.getModel('openai-gpt-4o');

      expect(model).toBeDefined();
      expect(model?.id).toBe('openai-gpt-4o');
      expect(model?.name).toBe('gpt-4o');
      expect(model?.displayName).toBe('GPT-4o');
      expect(model?.providerId).toBe('openai');
    });

    it('should get group by ID', () => {
      const manager = new ConfigManager();
      const group = manager.getGroup('default');

      expect(group).toBeDefined();
      expect(group?.id).toBe('default');
      expect(group?.models.length).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent items', () => {
      const manager = new ConfigManager();

      expect(manager.getProvider('non-existent')).toBeUndefined();
      expect(manager.getModel('non-existent')).toBeUndefined();
      expect(manager.getGroup('non-existent')).toBeUndefined();
    });
  });

  describe('ConfigManager with user config', () => {
    let storage: ReturnType<typeof createMockStorage>;
    let manager: ConfigManager;

    beforeEach(() => {
      storage = createMockStorage();
      manager = new ConfigManager({ userConfigStorage: storage });
    });

    it('should add custom provider', async () => {
      const customProvider: Provider = {
        id: 'custom-provider',
        name: 'custom-provider',
        displayName: 'Custom Provider',
        type: 'generic',
        apiUrl: 'https://custom.api.com',
        enabled: true,
      };

      await manager.setProvider(customProvider);
      const provider = manager.getProvider('custom-provider');

      expect(provider).toBeDefined();
      expect(provider?.displayName).toBe('Custom Provider');
    });

    it('should override builtin provider', async () => {
      await manager.setProviderApiKey('openai', 'test-api-key');
      const provider = manager.getProvider('openai');

      expect(provider).toBeDefined();
      expect(provider?.apiKey).toBe('test-api-key');
    });

    it('should add custom model', async () => {
      const customModel: Model = {
        id: 'custom-model',
        name: 'custom-model',
        displayName: 'Custom Model',
        providerId: 'openai',
        capabilities: ['chat'],
        contextWindow: 8000,
        enabled: true,
      };

      await manager.setModel(customModel);
      const model = manager.getModel('custom-model');

      expect(model).toBeDefined();
      expect(model?.displayName).toBe('Custom Model');
    });

    it('should add custom group', async () => {
      const customGroup: Group = {
        id: 'custom-group',
        name: 'Custom Group',
        models: ['openai-gpt-4o', 'anthropic-claude-3-5-sonnet'],
        strategy: { type: 'round-robin' },
        fallback: { enabled: true, maxAttempts: 2, triggerOn: ['timeout'] },
        enabled: true,
      };

      await manager.setGroup(customGroup);
      const group = manager.getGroup('custom-group');

      expect(group).toBeDefined();
      expect(group?.name).toBe('Custom Group');
      expect(group?.strategy.type).toBe('round-robin');
    });

    it('should remove custom provider', async () => {
      const customProvider: Provider = {
        id: 'to-remove',
        name: 'to-remove',
        displayName: 'To Remove',
        type: 'generic',
        apiUrl: 'https://remove.api.com',
        enabled: true,
      };

      await manager.setProvider(customProvider);
      expect(manager.getProvider('to-remove')).toBeDefined();

      await manager.removeProvider('to-remove');
      expect(manager.getProvider('to-remove')).toBeUndefined();
    });
  });

  describe('ConfigManager change listeners', () => {
    let storage: ReturnType<typeof createMockStorage>;
    let manager: ConfigManager;

    beforeEach(() => {
      storage = createMockStorage();
      manager = new ConfigManager({ userConfigStorage: storage });
    });

    it('should notify listeners on provider change', async () => {
      const listener = vi.fn();
      manager.onChange(listener);

      await manager.setProviderApiKey('openai', 'new-key');

      expect(listener).toHaveBeenCalledWith({
        type: 'provider',
        ids: ['openai'],
      });
    });

    it('should notify listeners on model change', async () => {
      const listener = vi.fn();
      manager.onChange(listener);

      const model: Model = {
        id: 'test-model',
        name: 'test-model',
        displayName: 'Test',
        providerId: 'openai',
        capabilities: ['chat'],
        contextWindow: 4000,
        enabled: true,
      };
      await manager.setModel(model);

      expect(listener).toHaveBeenCalledWith({
        type: 'model',
        ids: ['test-model'],
      });
    });

    it('should unsubscribe listener', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.onChange(listener);

      unsubscribe();
      await manager.setProviderApiKey('openai', 'new-key');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('ConfigManager helper methods', () => {
    let manager: ConfigManager;

    beforeEach(() => {
      manager = new ConfigManager();
    });

    it('should get all providers', () => {
      const providers = manager.getProviders();
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should get enabled providers', () => {
      const providers = manager.getEnabledProviders();
      expect(providers.every((p) => p.enabled)).toBe(true);
    });

    it('should get all models', () => {
      const models = manager.getModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should get enabled models', () => {
      const models = manager.getEnabledModels();
      expect(models.every((m) => m.enabled)).toBe(true);
    });

    it('should get models by provider', () => {
      const models = manager.getModelsByProvider('openai');
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.providerId === 'openai')).toBe(true);
    });

    it('should get all groups', () => {
      const groups = manager.getGroups();
      expect(groups.length).toBeGreaterThan(0);
    });

    it('should get enabled groups', () => {
      const groups = manager.getEnabledGroups();
      expect(groups.every((g) => g.enabled)).toBe(true);
    });

    it('should get retry/timeout preset', () => {
      const preset = manager.getRetryTimeoutPreset('modelCall');
      expect(preset).toBeDefined();
      expect(preset?.retry.maxRetries).toBeGreaterThan(0);
    });
  });

  describe('ConfigManager caching', () => {
    it('should cache config and return same reference', () => {
      const manager = new ConfigManager();
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).toBe(config2);
    });

    it('should invalidate cache on user config change', async () => {
      const storage = createMockStorage();
      const manager = new ConfigManager({ userConfigStorage: storage });

      const config1 = manager.getConfig();
      await manager.setProviderApiKey('openai', 'new-key');
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
    });
  });

  describe('ConfigManager disposal', () => {
    it('should dispose resources', () => {
      const manager = new ConfigManager();
      const listener = vi.fn();
      manager.onChange(listener);

      manager.dispose();

      // After dispose, listeners should be cleared
      // Internal state should be cleaned up
      expect(manager.getConfig()).toBeDefined(); // Should still work but create new cache
    });
  });
});
