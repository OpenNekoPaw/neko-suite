/**
 * Platform Integration Tests
 *
 * Tests that config.ts correctly delegates to Platform ConfigManager
 * and maps results to CLIConfig.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @neko/platform before imports
vi.mock('@neko/platform', () => {
  const mockConfigManager = {
    getProvider: vi.fn(),
    getProviders: vi.fn().mockReturnValue([]),
    getEnabledProviders: vi.fn().mockReturnValue([]),
    getModelsByProvider: vi.fn().mockReturnValue([]),
    getEnabledMCPServers: vi.fn().mockReturnValue([]),
    getEnabledModels: vi.fn().mockReturnValue([]),
    dispose: vi.fn(),
  };

  return {
    ConfigManager: vi.fn().mockImplementation(function () {
      return mockConfigManager;
    }),
    FileUserConfigManager: vi.fn().mockImplementation(function () {
      return {};
    }),
    __mockConfigManager: mockConfigManager,
  };
});

// Mock config-reader
vi.mock('@neko/shared/config/config-reader.ts', () => ({
  getUserConfigDir: vi.fn().mockReturnValue('/mock/.neko'),
  getUserConfigPath: vi.fn().mockReturnValue('/mock/.neko/config.json'),
  getWorkspaceConfigDir: vi.fn().mockReturnValue('/mock/ws/.neko'),
  getWorkspaceConfigPath: vi.fn().mockReturnValue('/mock/ws/.neko/config.json'),
  getConfigLocations: vi.fn().mockReturnValue({ user: '/mock/.neko', workspace: '/mock/ws/.neko' }),
  readUserConfig: vi.fn().mockReturnValue(null),
  readWorkspaceConfig: vi.fn().mockReturnValue(null),
}));

import {
  loadConfig,
  validateConfig,
  getApiKeyFromEnv,
  listProviders,
  getProviderModels,
  listConfiguredProviders,
  createConfigManager,
} from '../core/config';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { readUserConfig, readWorkspaceConfig } from '@neko/shared/config/config-reader.ts';

// Import the mocked platform to access __mockConfigManager
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as platformModule from '@neko/platform';
const mockCM = (platformModule as any).__mockConfigManager as {
  getProvider: ReturnType<typeof vi.fn>;
  getProviders: ReturnType<typeof vi.fn>;
  getEnabledProviders: ReturnType<typeof vi.fn>;
  getModelsByProvider: ReturnType<typeof vi.fn>;
  getEnabledMCPServers: ReturnType<typeof vi.fn>;
  getEnabledModels: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

// ─── Tests ──────────────────────────────────────────────────────────

describe('config.ts — Platform integration', () => {
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    // Clean env vars that affect config
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['AZURE_OPENAI_API_KEY'];
    delete process.env['NEKO_API_KEY'];
    delete process.env['LLM_API_KEY'];

    // Reset mocks
    const cm = mockCM;
    cm.getProvider.mockReset().mockReturnValue(undefined);
    cm.getProviders.mockReset().mockReturnValue([]);
    cm.getEnabledProviders.mockReset().mockReturnValue([]);
    cm.getModelsByProvider.mockReset().mockReturnValue([]);
    cm.getEnabledMCPServers.mockReset().mockReturnValue([]);
    cm.getEnabledModels.mockReset().mockReturnValue([]);
    cm.dispose.mockReset();

    vi.mocked(readUserConfig).mockReturnValue(null);
    vi.mocked(readWorkspaceConfig).mockReturnValue(null);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  // ═══════════════════════════════════════════════════════════════════
  // 1. loadConfig — defaults
  // ═══════════════════════════════════════════════════════════════════

  describe('loadConfig', () => {
    it('returns defaults when no providers/models configured', () => {
      const config = loadConfig('/tmp/test');
      expect(config.provider).toBe(DEFAULT_CLI_CONFIG.provider);
      expect(config.providerType).toBe(DEFAULT_CLI_CONFIG.providerType);
      expect(config.model).toBe(DEFAULT_CLI_CONFIG.model);
      expect(config.maxTokens).toBe(DEFAULT_CLI_CONFIG.maxTokens);
      expect(config.temperature).toBe(DEFAULT_CLI_CONFIG.temperature);
      expect(config.verbose).toBe(false);
      expect(config.mcpServers).toEqual([]);
      expect(config.mediaModels).toEqual([]);
    });

    it('picks first enabled provider with env API key', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-123';
      const cm = mockCM;
      cm.getEnabledProviders.mockReturnValue([
        {
          id: 'openai',
          type: 'openai',
          name: 'OpenAI',
          apiUrl: 'https://api.openai.com',
          enabled: true,
        },
      ]);
      cm.getProvider.mockReturnValue({
        id: 'openai',
        type: 'openai',
        name: 'OpenAI',
        apiUrl: 'https://api.openai.com',
      });
      cm.getModelsByProvider.mockReturnValue([{ id: 'gpt-4o', name: 'gpt-4o', enabled: true }]);

      const config = loadConfig('/tmp/test');
      expect(config.provider).toBe('openai');
      expect(config.providerType).toBe('openai');
      expect(config.model).toBe('gpt-4o');
      expect(config.apiKey).toBe('sk-test-123');
    });

    it('applies CLI arg overrides over config', async () => {
      const cm = mockCM;
      cm.getProvider.mockReturnValue({
        id: 'anthropic',
        type: 'anthropic',
        name: 'Anthropic',
        apiUrl: 'https://api.anthropic.com',
        apiKey: 'cfg-key',
      });

      const config = loadConfig('/tmp/test', {
        provider: 'anthropic',
        model: 'claude-opus-4-20250514',
        apiKey: 'override-key',
        maxTokens: 4096,
        verbose: true,
      });

      expect(config.model).toBe('claude-opus-4-20250514');
      expect(config.apiKey).toBe('override-key');
      expect(config.maxTokens).toBe(4096);
      expect(config.verbose).toBe(true);
    });

    it('reads scalar fields from UnifiedConfig', () => {
      vi.mocked(readUserConfig).mockReturnValue({
        maxTokens: 16384,
        temperature: 0.3,
        thinkingBudget: 10000,
      } as ReturnType<typeof readUserConfig>);

      const config = loadConfig('/tmp/test');
      expect(config.maxTokens).toBe(16384);
      expect(config.temperature).toBe(0.3);
      expect(config.thinkingBudget).toBe(10000);
    });

    it('workspace scalars override user scalars', () => {
      vi.mocked(readUserConfig).mockReturnValue({
        maxTokens: 8192,
        temperature: 0.7,
      } as ReturnType<typeof readUserConfig>);
      vi.mocked(readWorkspaceConfig).mockReturnValue({
        maxTokens: 4096,
        temperature: 0.1,
      } as ReturnType<typeof readWorkspaceConfig>);

      const config = loadConfig('/tmp/test');
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.1);
    });

    it('maps MCP servers from ConfigManager', async () => {
      const cm = mockCM;
      cm.getEnabledMCPServers.mockReturnValue([
        {
          id: 'mcp-1',
          name: 'GitHub',
          description: 'GH tools',
          category: 'dev',
          transport: 'stdio',
          command: 'gh-mcp',
          args: ['--token'],
          env: {},
          enabled: true,
        },
      ]);

      const config = loadConfig('/tmp/test');
      expect(config.mcpServers).toHaveLength(1);
      expect(config.mcpServers[0]!.id).toBe('mcp-1');
      expect(config.mcpServers[0]!.name).toBe('GitHub');
      expect(config.mcpServers[0]!.command).toBe('gh-mcp');
    });

    it('disposes ConfigManager after loading', async () => {
      const cm = mockCM;
      loadConfig('/tmp/test');
      expect(cm.dispose).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. getApiKeyFromEnv
  // ═══════════════════════════════════════════════════════════════════

  describe('getApiKeyFromEnv', () => {
    it('returns provider-specific env var', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      expect(getApiKeyFromEnv('anthropic')).toBe('sk-ant-test');
    });

    it('returns undefined when no env var set', () => {
      expect(getApiKeyFromEnv('anthropic')).toBeUndefined();
    });

    it('falls back to NEKO_API_KEY', () => {
      process.env['NEKO_API_KEY'] = 'neko-generic';
      expect(getApiKeyFromEnv('unknown-provider')).toBe('neko-generic');
    });

    it('falls back to LLM_API_KEY', () => {
      process.env['LLM_API_KEY'] = 'llm-generic';
      expect(getApiKeyFromEnv('unknown-provider')).toBe('llm-generic');
    });

    it('prefers provider-specific over generic', () => {
      process.env['OPENAI_API_KEY'] = 'sk-specific';
      process.env['NEKO_API_KEY'] = 'neko-generic';
      expect(getApiKeyFromEnv('openai')).toBe('sk-specific');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. validateConfig
  // ═══════════════════════════════════════════════════════════════════

  describe('validateConfig', () => {
    it('passes for valid config with API key', () => {
      const config = { ...DEFAULT_CLI_CONFIG, apiKey: 'sk-test' };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when apiKey is missing', () => {
      const config = { ...DEFAULT_CLI_CONFIG, apiKey: undefined };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('API key not found');
    });

    it('fails for invalid temperature', () => {
      const config = { ...DEFAULT_CLI_CONFIG, apiKey: 'k', temperature: 3 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Temperature');
    });

    it('fails for invalid maxTokens', () => {
      const config = { ...DEFAULT_CLI_CONFIG, apiKey: 'k', maxTokens: -1 };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maxTokens');
    });

    it('fails for invalid outputFormat', () => {
      const config = {
        ...DEFAULT_CLI_CONFIG,
        apiKey: 'k',
        outputFormat: 'xml' as 'text',
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('outputFormat');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. listProviders / getProviderModels
  // ═══════════════════════════════════════════════════════════════════

  describe('listProviders', () => {
    it('returns provider info from ConfigManager', async () => {
      const cm = mockCM;
      cm.getEnabledProviders.mockReturnValue([
        {
          id: 'anthropic',
          type: 'anthropic',
          name: 'Anthropic',
          displayName: 'Anthropic',
          apiUrl: 'https://api.anthropic.com',
          apiKey: 'sk-ant',
        },
        {
          id: 'openai',
          type: 'openai',
          name: 'OpenAI',
          displayName: 'OpenAI',
          apiUrl: 'https://api.openai.com',
        },
      ]);
      cm.getModelsByProvider.mockImplementation((id: string) => {
        if (id === 'anthropic') return [{ id: 'claude-sonnet', name: 'claude-sonnet-4-20250514' }];
        if (id === 'openai')
          return [
            { id: 'gpt-4o', name: 'gpt-4o' },
            { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
          ];
        return [];
      });

      const providers = listProviders();
      expect(providers).toHaveLength(2);
      expect(providers[0]!.id).toBe('anthropic');
      expect(providers[0]!.hasApiKey).toBe(true);
      expect(providers[0]!.models).toEqual(['claude-sonnet-4-20250514']);
      expect(providers[1]!.id).toBe('openai');
      expect(providers[1]!.models).toHaveLength(2);
    });
  });

  describe('getProviderModels', () => {
    it('returns model names for a provider', async () => {
      const cm = mockCM;
      cm.getModelsByProvider.mockReturnValue([
        { id: 'claude-opus', name: 'claude-opus-4-20250514' },
        { id: 'claude-sonnet', name: 'claude-sonnet-4-20250514' },
      ]);

      const models = getProviderModels('anthropic');
      expect(models).toEqual(['claude-opus-4-20250514', 'claude-sonnet-4-20250514']);
    });

    it('returns empty array for unknown provider', async () => {
      const cm = mockCM;
      cm.getModelsByProvider.mockReturnValue([]);
      expect(getProviderModels('nonexistent')).toEqual([]);
    });
  });

  describe('listConfiguredProviders', () => {
    it('returns provider IDs', async () => {
      const cm = mockCM;
      cm.getProviders.mockReturnValue([{ id: 'anthropic' }, { id: 'openai' }, { id: 'deepseek' }]);

      const ids = listConfiguredProviders();
      expect(ids).toEqual(['anthropic', 'openai', 'deepseek']);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. createConfigManager
  // ═══════════════════════════════════════════════════════════════════

  describe('createConfigManager', () => {
    it('creates a ConfigManager instance', () => {
      const cm = createConfigManager('/tmp/test');
      expect(cm).toBeDefined();
      expect(cm.dispose).toBeDefined();
    });
  });
});
