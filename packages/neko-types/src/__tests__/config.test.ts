/**
 * Configuration Module Tests
 *
 * Tests for the unified configuration format shared between
 * agent-cli and platform packages.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  migrateLegacyFields,
  mergeConfigs,
  normalizeConfig,
  processConfig,
  type UnifiedConfig,
} from '../config/config-normalizer';
import {
  DEFAULT_CONFIG,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
} from '../config/types';

// =============================================================================
// Legacy Field Migration Tests
// =============================================================================

describe('migrateLegacyFields', () => {
  it('should migrate provider to defaultProvider', () => {
    const config: UnifiedConfig = {
      provider: 'openai',
    };

    const migrated = migrateLegacyFields(config);

    expect(migrated.defaultProvider).toBe('openai');
  });

  it('should not override existing defaultProvider', () => {
    const config: UnifiedConfig = {
      provider: 'openai',
      defaultProvider: 'anthropic',
    };

    const migrated = migrateLegacyFields(config);

    expect(migrated.defaultProvider).toBe('anthropic');
  });

  it('should migrate model to defaultModel', () => {
    const config: UnifiedConfig = {
      model: 'gpt-4o',
    };

    const migrated = migrateLegacyFields(config);

    expect(migrated.defaultModel).toBe('gpt-4o');
  });

  it('should convert legacy providers object format to array', () => {
    const config: UnifiedConfig = {
      providers: {
        anthropic: {
          apiKey: 'sk-ant-xxx',
          defaultModel: 'claude-sonnet-4',
        },
        openai: {
          apiKey: 'sk-xxx',
          baseUrl: 'https://api.openai.com/v1',
        },
      } as unknown as UnifiedConfig['providers'],
    };

    const migrated = migrateLegacyFields(config);

    expect(Array.isArray(migrated.providers)).toBe(true);
    expect(migrated.providers).toHaveLength(2);

    const anthropic = migrated.providers?.find((p) => p.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.apiKey).toBe('sk-ant-xxx');
    expect(anthropic?.type).toBe('anthropic');

    const openai = migrated.providers?.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.apiKey).toBe('sk-xxx');
    expect(openai?.type).toBe('openai');
  });

  it('should not modify array format providers', () => {
    const config: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
    };

    const migrated = migrateLegacyFields(config);

    expect(migrated.providers).toEqual(config.providers);
  });

  it('should migrate top-level apiKey to default provider', () => {
    const config: UnifiedConfig = {
      defaultProvider: 'anthropic',
      apiKey: 'sk-ant-xxx',
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
    };

    const migrated = migrateLegacyFields(config);

    const anthropic = migrated.providers?.find((p) => p.id === 'anthropic');
    expect(anthropic?.apiKey).toBe('sk-ant-xxx');
  });
});

// =============================================================================
// Config Merging Tests
// =============================================================================

describe('mergeConfigs', () => {
  it('should merge scalar fields with override taking precedence', () => {
    const base: UnifiedConfig = {
      defaultProvider: 'anthropic',
      maxTokens: 4096,
      temperature: 0.5,
    };

    const override: UnifiedConfig = {
      maxTokens: 8192,
      verbose: true,
    };

    const merged = mergeConfigs(base, override);

    expect(merged.defaultProvider).toBe('anthropic');
    expect(merged.maxTokens).toBe(8192);
    expect(merged.temperature).toBe(0.5);
    expect(merged.verbose).toBe(true);
  });

  it('should merge providers arrays by ID', () => {
    const base: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
    };

    const override: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic Updated',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          apiKey: 'sk-ant-xxx',
          enabled: true,
        },
        {
          id: 'openai',
          name: 'openai',
          displayName: 'OpenAI',
          type: 'openai',
          apiUrl: 'https://api.openai.com/v1',
          enabled: true,
        },
      ],
    };

    const merged = mergeConfigs(base, override);

    expect(merged.providers).toHaveLength(2);

    const anthropic = merged.providers?.find((p) => p.id === 'anthropic');
    expect(anthropic?.displayName).toBe('Anthropic Updated');
    expect(anthropic?.apiKey).toBe('sk-ant-xxx');

    const openai = merged.providers?.find((p) => p.id === 'openai');
    expect(openai).toBeDefined();
  });

  it('should merge override objects', () => {
    const base: UnifiedConfig = {
      providerOverrides: {
        anthropic: { apiKey: 'old-key' },
      },
    };

    const override: UnifiedConfig = {
      providerOverrides: {
        anthropic: { enabled: false },
        openai: { apiKey: 'openai-key' },
      },
    };

    const merged = mergeConfigs(base, override);

    expect(merged.providerOverrides?.anthropic?.apiKey).toBe('old-key');
    expect(merged.providerOverrides?.anthropic?.enabled).toBe(false);
    expect(merged.providerOverrides?.openai?.apiKey).toBe('openai-key');
  });
});

// =============================================================================
// Config Normalization Tests
// =============================================================================

describe('normalizeConfig', () => {
  it('should apply default values for missing fields', () => {
    const config: UnifiedConfig = {};

    const normalized = normalizeConfig(config);

    expect(normalized.defaultProvider).toBe(DEFAULT_CONFIG.defaultProvider);
    expect(normalized.defaultModel).toBe(DEFAULT_CONFIG.defaultModel);
    expect(normalized.maxTokens).toBe(DEFAULT_CONFIG.maxTokens);
    expect(normalized.temperature).toBe(DEFAULT_CONFIG.temperature);
    expect(normalized.verbose).toBe(DEFAULT_CONFIG.verbose);
    expect(normalized.outputFormat).toBe(DEFAULT_CONFIG.outputFormat);
  });

  it('should convert arrays to Maps', () => {
    const config: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
      models: [
        {
          id: 'claude-sonnet-4',
          name: 'claude-sonnet-4-20250514',
          providerId: 'anthropic',
          capabilities: ['chat'],
          enabled: true,
        },
      ],
    };

    const normalized = normalizeConfig(config);

    expect(normalized.providers instanceof Map).toBe(true);
    expect(normalized.providers.size).toBe(1);
    expect(normalized.providers.get('anthropic')?.displayName).toBe('Anthropic');

    expect(normalized.models instanceof Map).toBe(true);
    expect(normalized.models.size).toBe(1);
    expect(normalized.models.get('claude-sonnet-4')?.name).toBe('claude-sonnet-4-20250514');
  });

  it('should apply overrides to items', () => {
    const config: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      ],
      providerOverrides: {
        anthropic: {
          apiKey: 'sk-ant-xxx',
          enabled: false,
        },
      },
    };

    const normalized = normalizeConfig(config);

    const anthropic = normalized.providers.get('anthropic');
    expect(anthropic?.apiKey).toBe('sk-ant-xxx');
    expect(anthropic?.enabled).toBe(false);
  });
});

// =============================================================================
// Full Pipeline Tests
// =============================================================================

describe('processConfig', () => {
  it('should process null configs', () => {
    const normalized = processConfig(null, null);

    expect(normalized.defaultProvider).toBe(DEFAULT_CONFIG.defaultProvider);
    expect(normalized.providers.size).toBe(0);
  });

  it('should merge user and workspace configs with workspace taking precedence', () => {
    const userConfig: UnifiedConfig = {
      defaultProvider: 'anthropic',
      maxTokens: 4096,
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          apiKey: 'user-key',
          enabled: true,
        },
      ],
    };

    const workspaceConfig: UnifiedConfig = {
      maxTokens: 8192,
      providerOverrides: {
        anthropic: {
          apiKey: 'workspace-key',
        },
      },
    };

    const normalized = processConfig(userConfig, workspaceConfig);

    expect(normalized.defaultProvider).toBe('anthropic');
    expect(normalized.maxTokens).toBe(8192);

    const anthropic = normalized.providers.get('anthropic');
    expect(anthropic?.apiKey).toBe('workspace-key');
  });

  it('should migrate legacy fields before merging', () => {
    const userConfig: UnifiedConfig = {
      provider: 'openai',
      apiKey: 'user-api-key',
    };

    const workspaceConfig: UnifiedConfig = {
      model: 'gpt-4o',
    };

    const normalized = processConfig(userConfig, workspaceConfig);

    expect(normalized.defaultProvider).toBe('openai');
    expect(normalized.defaultModel).toBe('gpt-4o');
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('config constants', () => {
  it('should have correct config directory name', () => {
    expect(CONFIG_DIR_NAME).toBe('.neko');
  });

  it('should have correct config file name', () => {
    expect(CONFIG_FILE_NAME).toBe('config.json');
  });

  it('should have sensible default values', () => {
    expect(DEFAULT_CONFIG.defaultProvider).toBe('anthropic');
    expect(DEFAULT_CONFIG.maxTokens).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CONFIG.temperature).toBeLessThanOrEqual(2);
  });
});
