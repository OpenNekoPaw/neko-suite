/**
 * ConfigManager Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../config-manager';
import { loadBuiltinPresets } from '../builtin-presets';
import type { IUserConfigManager, UserConfig } from '../user-config';
import type { Provider, Model } from '../../types/provider';
import type { MCPServerPreset, WorkflowPreset, PromptPreset } from '../../types/config';
import type { TaskDefaults } from '@neko/shared';

// In-memory IUserConfigManager for testing
function createMockUserConfigManager(): IUserConfigManager {
  let config: UserConfig = {
    providers: [],
    models: [],
    mcpServers: [],
    workflows: [],
    prompts: [],
    providerOverrides: {},
    modelOverrides: {},
    mcpServerOverrides: {},
    workflowOverrides: {},
    promptOverrides: {},
  };

  return {
    load: () => ({ ...config }),
    save: async (c: UserConfig) => { config = { ...c }; },
    updateProviderOverride: async (id, override) => {
      config.providerOverrides[id] = { ...config.providerOverrides[id], ...override };
    },
    addProvider: async (p: Provider) => {
      const i = config.providers.findIndex(x => x.id === p.id);
      if (i >= 0) config.providers[i] = p; else config.providers.push(p);
    },
    removeProvider: async (id: string) => {
      config.providers = config.providers.filter(p => p.id !== id);
      delete config.providerOverrides[id];
    },
    addModel: async (m: Model) => {
      const i = config.models.findIndex(x => x.id === m.id);
      if (i >= 0) config.models[i] = m; else config.models.push(m);
    },
    removeModel: async (id: string) => {
      config.models = config.models.filter(m => m.id !== id);
      delete config.modelOverrides[id];
    },
    updateMCPServerOverride: async (id, override) => {
      config.mcpServerOverrides[id] = { ...config.mcpServerOverrides[id], ...override };
    },
    addMCPServer: async (s: MCPServerPreset) => {
      const i = config.mcpServers.findIndex(x => x.id === s.id);
      if (i >= 0) config.mcpServers[i] = s; else config.mcpServers.push(s);
    },
    removeMCPServer: async (id: string) => {
      config.mcpServers = config.mcpServers.filter(s => s.id !== id);
      delete config.mcpServerOverrides[id];
    },
    updateWorkflowOverride: async (id, override) => {
      config.workflowOverrides[id] = { ...config.workflowOverrides[id], ...override };
    },
    addWorkflow: async (w: WorkflowPreset) => {
      const i = config.workflows.findIndex(x => x.id === w.id);
      if (i >= 0) config.workflows[i] = w; else config.workflows.push(w);
    },
    removeWorkflow: async (id: string) => {
      config.workflows = config.workflows.filter(w => w.id !== id);
      delete config.workflowOverrides[id];
    },
    updatePromptOverride: async (id, override) => {
      config.promptOverrides[id] = { ...config.promptOverrides[id], ...override };
    },
    addPrompt: async (p: PromptPreset) => {
      const i = config.prompts.findIndex(x => x.id === p.id);
      if (i >= 0) config.prompts[i] = p; else config.prompts.push(p);
    },
    removePrompt: async (id: string) => {
      config.prompts = config.prompts.filter(p => p.id !== id);
      delete config.promptOverrides[id];
    },
    updateTaskDefaults: async (defaults: TaskDefaults | undefined) => {
      config.taskDefaults = defaults;
    },
    clear: async () => {
      config = {
        providers: [], models: [], mcpServers: [], workflows: [], prompts: [],
        providerOverrides: {}, modelOverrides: {}, mcpServerOverrides: {},
        workflowOverrides: {}, promptOverrides: {},
      };
    },
    migrateProviders: async (builtinIds: Set<string>) => {
      config.providers = config.providers.filter(p => !p.builtin || builtinIds.has(p.id));
    },
  };
}

describe('ConfigManager', () => {
  describe('builtin presets', () => {
    it('should load builtin presets correctly', () => {
      const presets = loadBuiltinPresets();

      expect(presets.providers.length).toBeGreaterThan(0);
      expect(presets.models.length).toBeGreaterThan(0);
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
  });

  describe('ConfigManager initialization', () => {
    it('should initialize without options', () => {
      const manager = new ConfigManager();
      const config = manager.getConfig();

      expect(config.providers.size).toBeGreaterThan(0);
      expect(config.models.size).toBeGreaterThan(0);
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

    it('should return undefined for non-existent items', () => {
      const manager = new ConfigManager();

      expect(manager.getProvider('non-existent')).toBeUndefined();
      expect(manager.getModel('non-existent')).toBeUndefined();
    });
  });

  describe('ConfigManager with user config', () => {
    let manager: ConfigManager;

    beforeEach(() => {
      manager = new ConfigManager({ userConfigManager: createMockUserConfigManager() });
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
      const manager = new ConfigManager({ userConfigManager: createMockUserConfigManager() });

      const config1 = manager.getConfig();
      await manager.setProviderApiKey('openai', 'new-key');
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2);
    });
  });

  describe('ConfigManager disposal', () => {
    it('should dispose resources', () => {
      const manager = new ConfigManager();

      manager.dispose();

      // After dispose, internal state should be cleaned up
      expect(manager.getConfig()).toBeDefined(); // Should still work but create new cache
    });
  });
});
