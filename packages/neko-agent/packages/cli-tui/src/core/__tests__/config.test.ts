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
    getProvider(providerId: string): MockProvider | undefined {
      return state.providers.find((provider) => provider.id === providerId);
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

  it('does not apply [default_models.llm] model when provider override selects another provider', () => {
    state.userConfig = {
      defaultModels: {
        llm: {
          providerId: 'local',
          modelId: 'local-chat',
        },
      },
    };

    const config = loadConfig('/tmp/project', { provider: 'gateway' });

    expect(config.provider).toBe('gateway');
    expect(config.model).toBe('gpt-4.1');
  });
});
