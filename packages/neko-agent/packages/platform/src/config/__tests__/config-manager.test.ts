/**
 * ConfigManager Unit Tests
 *
 * Tests two-layer merge (User + Workspace) with no builtin presets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../config-manager';
import type { IUserConfigManager, UserConfig } from '../user-config';
import type { Provider, Model } from '../../types/provider';
import type { MCPServerPreset } from '../../types/config';
import { RETRY_TIMEOUT_PRESETS } from '../retry-timeout-presets';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockUserConfigManager(initial?: Partial<UserConfig>): IUserConfigManager {
  let config: UserConfig = {
    providers: [],
    models: [],
    mcpServers: [],
    providerOverrides: {},
    modelOverrides: {},
    mcpServerOverrides: {},
    ...initial,
  };

  return {
    load: () => ({
      ...config,
      providers: [...config.providers],
      models: [...config.models],
      mcpServers: [...config.mcpServers],
    }),
    save: async (c: UserConfig) => {
      config = { ...c };
    },
    updateProviderOverride: async (id, override) => {
      config.providerOverrides[id] = { ...config.providerOverrides[id], ...override };
    },
    addProvider: async (p: Provider) => {
      const i = config.providers.findIndex((x) => x.id === p.id);
      if (i >= 0) config.providers[i] = p;
      else config.providers.push(p);
    },
    removeProvider: async (id: string) => {
      config.providers = config.providers.filter((p) => p.id !== id);
      delete config.providerOverrides[id];
    },
    addModel: async (m: Model) => {
      const i = config.models.findIndex((x) => x.id === m.id);
      if (i >= 0) config.models[i] = m;
      else config.models.push(m);
    },
    removeModel: async (id: string) => {
      config.models = config.models.filter((m) => m.id !== id);
      delete config.modelOverrides[id];
    },
    updateMCPServerOverride: async (id, override) => {
      config.mcpServerOverrides[id] = { ...config.mcpServerOverrides[id], ...override };
    },
    addMCPServer: async (s: MCPServerPreset) => {
      const i = config.mcpServers.findIndex((x) => x.id === s.id);
      if (i >= 0) config.mcpServers[i] = s;
      else config.mcpServers.push(s);
    },
    removeMCPServer: async (id: string) => {
      config.mcpServers = config.mcpServers.filter((s) => s.id !== id);
      delete config.mcpServerOverrides[id];
    },
    clear: async () => {
      config = {
        providers: [],
        models: [],
        mcpServers: [],
        providerOverrides: {},
        modelOverrides: {},
        mcpServerOverrides: {},
      };
    },
    loadRaw: () => ({
      providers: config.providers,
      models: config.models,
      mcpServers: config.mcpServers,
    }),
    updateScalar: async () => {},
    updateScalars: async () => {},
  };
}

const SAMPLE_PROVIDER: Provider = {
  id: 'anthropic',
  name: 'anthropic',
  displayName: 'Anthropic',
  type: 'anthropic',
  apiUrl: 'https://api.anthropic.com',
  enabled: true,
};

const SAMPLE_MODEL: Model = {
  id: 'anthropic-claude-sonnet-4',
  name: 'claude-sonnet-4-20250514',
  displayName: 'Claude Sonnet 4',
  providerId: 'anthropic',
  capabilities: ['chat'],
  contextWindow: 200000,
  enabled: true,
};

// =============================================================================
// Tests
// =============================================================================

describe('ConfigManager', () => {
  describe('initialization without user config', () => {
    it('should initialize with empty config', () => {
      const manager = new ConfigManager();
      const config = manager.getConfig();

      expect(config.providers.size).toBe(0);
      expect(config.models.size).toBe(0);
      expect(config.mcpServers.size).toBe(0);
    });

    it('should return retry/timeout presets', () => {
      const manager = new ConfigManager();
      const preset = manager.getRetryTimeoutPreset('modelCall');

      expect(preset).toBeDefined();
      expect(preset?.retry.maxRetries).toBe(10);
      expect(preset?.timeout.totalTimeout).toBeGreaterThan(5 * 60 * 1000);
      expect(preset?.timeout.streamTimeout).toBeGreaterThan(5 * 60 * 1000);
    });
  });

  describe('user config merge', () => {
    it('should load providers from user config', () => {
      const ucm = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
        models: [SAMPLE_MODEL],
      });
      const manager = new ConfigManager({ userConfigManager: ucm });

      expect(manager.getProvider('anthropic')).toBeDefined();
      expect(manager.getProvider('anthropic')?.displayName).toBe('Anthropic');
      expect(manager.getModel('anthropic-claude-sonnet-4')).toBeDefined();
    });

    it('should apply provider overrides', () => {
      const ucm = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
        providerOverrides: { anthropic: { apiKey: 'sk-test-123' } },
      });
      const manager = new ConfigManager({ userConfigManager: ucm });
      const provider = manager.getProvider('anthropic');

      expect(provider?.apiKey).toBe('sk-test-123');
    });

    it('should apply model overrides', () => {
      const ucm = createMockUserConfigManager({
        models: [SAMPLE_MODEL],
        modelOverrides: { 'anthropic-claude-sonnet-4': { enabled: false } },
      });
      const manager = new ConfigManager({ userConfigManager: ucm });
      const model = manager.getModel('anthropic-claude-sonnet-4');

      expect(model?.enabled).toBe(false);
    });
  });

  describe('CRUD operations', () => {
    let manager: ConfigManager;

    beforeEach(() => {
      manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({
          providers: [SAMPLE_PROVIDER],
          models: [SAMPLE_MODEL],
        }),
      });
    });

    it('should add custom provider', async () => {
      const custom: Provider = {
        id: 'custom',
        name: 'custom',
        displayName: 'Custom',
        type: 'generic',
        apiUrl: 'https://custom.api.com',
        enabled: true,
      };
      await manager.setProvider(custom);
      expect(manager.getProvider('custom')).toBeDefined();
      expect(manager.getProvider('custom')?.displayName).toBe('Custom');
    });

    it('should remove provider', async () => {
      expect(manager.getProvider('anthropic')).toBeDefined();
      await manager.removeProvider('anthropic');
      expect(manager.getProvider('anthropic')).toBeUndefined();
    });

    it('should set provider API key', async () => {
      await manager.setProviderApiKey('anthropic', 'sk-new-key');
      const provider = manager.getProvider('anthropic');
      expect(provider?.apiKey).toBe('sk-new-key');
    });

    it('should add custom model', async () => {
      const model: Model = {
        id: 'custom-model',
        name: 'custom-model',
        displayName: 'Custom Model',
        providerId: 'anthropic',
        capabilities: ['chat'],
        enabled: true,
      };
      await manager.setModel(model);
      expect(manager.getModel('custom-model')).toBeDefined();
    });

    it('should remove model', async () => {
      expect(manager.getModel('anthropic-claude-sonnet-4')).toBeDefined();
      await manager.removeModel('anthropic-claude-sonnet-4');
      expect(manager.getModel('anthropic-claude-sonnet-4')).toBeUndefined();
    });

    it('should import provider credentials from unified config files with later configs winning', async () => {
      const result = await manager.importProviderCredentialsFromUnifiedConfigs([
        {
          providers: [
            {
              ...SAMPLE_PROVIDER,
              apiKey: 'sk-user',
            },
            {
              id: 'openai',
              name: 'openai',
              displayName: 'OpenAI',
              type: 'openai',
              apiUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-openai',
              enabled: true,
            },
          ],
        },
        {
          providers: [
            {
              ...SAMPLE_PROVIDER,
              apiKey: 'sk-workspace',
            },
          ],
        },
      ]);

      expect(manager.getProvider('anthropic')?.apiKey).toBe('sk-workspace');
      expect(manager.getProvider('openai')?.apiKey).toBe('sk-openai');
      expect(result.imported.map((item) => item.id)).toEqual(['anthropic', 'openai']);
      expect(result.failed).toEqual([]);
    });

    it('should keep importing remaining provider credentials when one provider fails', async () => {
      const ucm = createMockUserConfigManager({
        providers: [SAMPLE_PROVIDER],
      });
      const updateProviderOverride = ucm.updateProviderOverride;
      ucm.updateProviderOverride = async (id, override) => {
        if (id === 'anthropic') {
          throw new Error('denied');
        }
        await updateProviderOverride(id, override);
      };
      const failingManager = new ConfigManager({ userConfigManager: ucm });

      const result = await failingManager.importProviderCredentialsFromUnifiedConfigs([
        {
          providers: [
            { ...SAMPLE_PROVIDER, apiKey: 'sk-user' },
            {
              id: 'openai',
              name: 'openai',
              displayName: 'OpenAI',
              type: 'openai',
              apiUrl: 'https://api.openai.com/v1',
              apiKey: 'sk-openai',
              enabled: true,
            },
          ],
        },
      ]);

      expect(result.imported.map((item) => item.id)).toEqual(['openai']);
      expect(result.failed.map((item) => item.id)).toEqual(['anthropic']);
      expect(failingManager.getProvider('openai')?.apiKey).toBe('sk-openai');
    });
  });

  describe('helper methods', () => {
    let manager: ConfigManager;

    beforeEach(() => {
      manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({
          providers: [
            SAMPLE_PROVIDER,
            {
              ...SAMPLE_PROVIDER,
              id: 'openai',
              name: 'openai',
              displayName: 'OpenAI',
              type: 'openai',
              apiUrl: 'https://api.openai.com/v1',
              enabled: false,
            },
          ],
          models: [
            SAMPLE_MODEL,
            {
              ...SAMPLE_MODEL,
              id: 'openai-gpt-4o',
              name: 'gpt-4o',
              providerId: 'openai',
              enabled: false,
            },
          ],
        }),
      });
    });

    it('should get all providers', () => {
      expect(manager.getProviders()).toHaveLength(2);
    });

    it('should get enabled providers only', () => {
      const enabled = manager.getEnabledProviders();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]?.id).toBe('anthropic');
    });

    it('should get all models', () => {
      expect(manager.getModels()).toHaveLength(2);
    });

    it('should get enabled models only', () => {
      const enabled = manager.getEnabledModels();
      expect(enabled).toHaveLength(1);
      expect(enabled[0]?.id).toBe('anthropic-claude-sonnet-4');
    });

    it('should get models by provider', () => {
      const models = manager.getModelsByProvider('anthropic');
      expect(models).toHaveLength(1);
      expect(models[0]?.providerId).toBe('anthropic');
    });

    it('should return undefined for non-existent items', () => {
      expect(manager.getProvider('nonexistent')).toBeUndefined();
      expect(manager.getModel('nonexistent')).toBeUndefined();
    });
  });

  describe('retry/timeout presets', () => {
    it('should return all built-in presets', () => {
      const manager = new ConfigManager();
      const config = manager.getConfig();

      expect(config.retryTimeoutPresets.size).toBe(4);
      expect(config.retryTimeoutPresets.get('modelCall')).toBeDefined();
      expect(config.retryTimeoutPresets.get('toolExecution')).toBeDefined();
      expect(config.retryTimeoutPresets.get('mcpRequest')).toBeDefined();
      expect(config.retryTimeoutPresets.get('workflowExecution')).toBeDefined();
    });

    it('should return correct preset values', () => {
      const manager = new ConfigManager();
      const preset = manager.getRetryTimeoutPreset('modelCall');

      expect(preset).toEqual(RETRY_TIMEOUT_PRESETS.modelCall);
    });

    it('should return undefined for non-existent preset', () => {
      const manager = new ConfigManager();
      const preset = manager.getRetryTimeoutPreset('nonexistent' as any);

      expect(preset).toBeUndefined();
    });
  });

  describe('caching', () => {
    it('should cache config and return same reference', () => {
      const manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({ providers: [SAMPLE_PROVIDER] }),
      });
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).toBe(config2);
    });

    it('should invalidate cache on write operation', async () => {
      const manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager({ providers: [SAMPLE_PROVIDER] }),
      });
      const config1 = manager.getConfig();
      await manager.setProviderApiKey('anthropic', 'new-key');
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
    });
  });

  describe('disposal', () => {
    it('should dispose without error', () => {
      const manager = new ConfigManager({
        userConfigManager: createMockUserConfigManager(),
      });
      manager.dispose();

      // After dispose, getConfig should still work (creates new cache)
      expect(manager.getConfig()).toBeDefined();
    });
  });
});
