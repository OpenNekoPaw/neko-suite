import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedConfig } from '@neko/shared';

interface MockProvider {
  id: string;
  name: string;
  displayName?: string;
  type: string;
  apiUrl: string;
  apiKey?: string;
  requiresApiKey?: boolean;
}

interface MockModel {
  id: string;
  name?: string;
  providerId: string;
  type?: string;
  capabilities?: readonly string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  enabled?: boolean;
}

interface MockMcpServer {
  id: string;
  name: string;
  enabled?: boolean;
}

const state = vi.hoisted(() => ({
  userConfig: {} as UnifiedConfig,
  workspaceConfig: {} as UnifiedConfig,
  providers: [] as MockProvider[],
  models: [] as MockModel[],
  mcpServers: [] as MockMcpServer[],
}));

vi.mock('@neko/platform', () => ({
  FileUserConfigManager: class FileUserConfigManager {},
  ConfigManager: class ConfigManager {
    private providerOverrides = new Map<string, Partial<MockProvider>>();

    getEffectiveAgentWorkspaceConfigSnapshot(runtimeOverrides: {
      selectedProviderId?: string;
      selectedModelId?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}) {
      const providerId =
        runtimeOverrides.selectedProviderId ??
        state.workspaceConfig.defaultModels?.llm?.providerId ??
        state.userConfig.defaultModels?.llm?.providerId ??
        state.workspaceConfig.defaultProvider ??
        state.userConfig.defaultProvider ??
        null;
      const provider = providerId ? this.getProvider(providerId) : undefined;
      const modelId =
        runtimeOverrides.selectedModelId ??
        (state.workspaceConfig.defaultModels?.llm?.providerId === providerId
          ? state.workspaceConfig.defaultModels.llm.modelId
          : undefined) ??
        (state.userConfig.defaultModels?.llm?.providerId === providerId
          ? state.userConfig.defaultModels.llm.modelId
          : undefined) ??
        state.workspaceConfig.defaultModel ??
        state.userConfig.defaultModel ??
        null;
      const model = modelId ? this.getModel(modelId) : undefined;
      return {
        providerId,
        modelId,
        provider,
        model,
        modelCapabilities: model?.capabilities,
        temperature:
          runtimeOverrides.temperature ??
          state.workspaceConfig.temperature ??
          state.userConfig.temperature ??
          0.7,
        maxTokens:
          runtimeOverrides.maxTokens ??
          state.workspaceConfig.maxTokens ??
          state.userConfig.maxTokens ??
          8192,
        thinkingBudget:
          state.workspaceConfig.thinkingBudget ?? state.userConfig.thinkingBudget ?? 10000,
        executionMode:
          state.workspaceConfig.executionMode ?? state.userConfig.executionMode ?? 'ask',
        defaultMediaModels: {
          image: toOptionId(state.workspaceConfig.defaultModels?.image),
          video: toOptionId(state.workspaceConfig.defaultModels?.video),
          audio: toOptionId(state.workspaceConfig.defaultModels?.audio),
        },
        mcpServers: this.getEnabledMCPServers(),
        diagnostics: [],
        sources: {
          temperature: 'workspace',
          maxTokens: 'workspace',
          thinkingBudget: 'workspace',
          executionMode: 'workspace',
          mediaDefaults: {},
        },
      };
    }

    setRuntimeProviderOverride(providerId: string, override: Partial<MockProvider>): void {
      this.providerOverrides.set(providerId, {
        ...this.providerOverrides.get(providerId),
        ...override,
      });
    }

    getProviders(): MockProvider[] {
      return state.providers.map((provider) => ({
        ...provider,
        ...this.providerOverrides.get(provider.id),
      }));
    }

    getProvider(providerId: string): MockProvider | undefined {
      const provider = state.providers.find((candidate) => candidate.id === providerId);
      return provider ? { ...provider, ...this.providerOverrides.get(provider.id) } : undefined;
    }

    getModel(modelId: string): MockModel | undefined {
      return state.models.find((model) => model.id === modelId);
    }

    getModelsByProvider(providerId: string): MockModel[] {
      return state.models.filter((model) => model.providerId === providerId);
    }

    getEnabledModels(): MockModel[] {
      return state.models.filter((model) => model.enabled !== false);
    }

    getEnabledMCPServers(): MockMcpServer[] {
      return state.mcpServers.filter((server) => server.enabled !== false);
    }

    dispose(): void {}
  },
}));

function toOptionId(ref: { providerId: string; modelId: string } | undefined): string | undefined {
  return ref ? `${ref.providerId}:${ref.modelId}` : undefined;
}

vi.mock('@neko/shared/config/config-reader.ts', () => ({
  getUserConfigDir: () => '/tmp/neko-user',
  getUserConfigPath: () => '/tmp/neko-user/config.toml',
  getWorkspaceConfigDir: () => '/tmp/neko-workspace/.neko',
  getWorkspaceConfigPath: () => '/tmp/neko-workspace/.neko/config.toml',
  getConfigLocations: () => ({
    user: '/tmp/neko-user/config.toml',
    workspace: '/tmp/neko-workspace/.neko/config.toml',
  }),
  readUserConfigResult: () => ({
    status: 'ok',
    filePath: '/tmp/neko-user/config.toml',
    config: state.userConfig,
  }),
  readWorkspaceConfigResult: () => ({
    status: 'ok',
    filePath: '/tmp/neko-workspace/.neko/config.toml',
    config: state.workspaceConfig,
  }),
  writeUserConfig: vi.fn(),
}));

import { loadConfig } from '../config';

describe('loadConfig', () => {
  beforeEach(() => {
    state.userConfig = {};
    state.workspaceConfig = {};
    state.providers = [
      {
        id: 'local',
        name: 'local',
        displayName: 'Local',
        type: 'ollama',
        apiUrl: 'http://localhost:11434/api',
        requiresApiKey: false,
      },
      {
        id: 'gateway',
        name: 'gateway',
        displayName: 'Gateway',
        type: 'newapi',
        apiUrl: 'https://gateway.example/v1',
        apiKey: 'sk-gateway',
      },
    ];
    state.models = [
      {
        id: 'local-chat',
        name: 'llama3.2',
        providerId: 'local',
        type: 'llm',
        capabilities: ['chat'],
      },
      {
        id: 'gateway-chat',
        name: 'gpt-4.1',
        providerId: 'gateway',
        type: 'llm',
        capabilities: ['chat'],
      },
    ];
    state.mcpServers = [];
  });

  it('uses [default_models.llm] before legacy default provider and model scalars', () => {
    state.userConfig = {
      defaultProvider: 'gateway',
      defaultModel: 'gateway-chat',
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    const config = loadConfig('/tmp/project');

    expect(config.provider).toBe('local');
    expect(config.model).toBe('local-chat');
  });

  it('uses workspace [default_models.llm] before user [default_models.llm]', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
    };
    state.workspaceConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    const config = loadConfig('/tmp/project');

    expect(config.provider).toBe('local');
    expect(config.model).toBe('local-chat');
  });

  it('fails visibly when provider override conflicts with the only configured default model', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    expect(() => loadConfig('/tmp/project', { provider: 'gateway' })).toThrow(
      'No model is configured for provider "gateway".',
    );
  });

  it('uses effective workspace scalar and media defaults from ConfigManager', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
        image: {
          providerId: 'gateway',
          modelId: 'gateway-image',
        },
      },
      temperature: 0.2,
      maxTokens: 4096,
      thinkingBudget: 2048,
    };
    state.workspaceConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
        image: {
          providerId: 'local',
          modelId: 'local-image',
        },
      },
      temperature: 0.55,
      maxTokens: 1024,
      thinkingBudget: 512,
    };

    const config = loadConfig('/tmp/project');

    expect(config.provider).toBe('local');
    expect(config.model).toBe('local-chat');
    expect(config.temperature).toBe(0.55);
    expect(config.maxTokens).toBe(1024);
    expect(config.thinkingBudget).toBe(512);
    expect(config.defaultMediaModels).toEqual({
      image: 'local:local-image',
      video: undefined,
      audio: undefined,
    });
  });

  it('projects selected chat model token metadata into CLI config', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'gateway',
          modelId: 'gateway-chat',
        },
      },
    };
    state.models = state.models.map((model) =>
      model.id === 'gateway-chat'
        ? {
            ...model,
            capabilities: ['chat', 'vision'],
            contextWindow: 256000,
            maxOutputTokens: 128000,
          }
        : model,
    );

    const config = loadConfig('/tmp/project');

    expect(config.chatModel).toEqual({
      providerId: 'gateway',
      modelId: 'gateway-chat',
      capabilities: ['chat', 'vision'],
      contextWindow: 256000,
      maxOutputTokens: 128000,
    });
  });
});
