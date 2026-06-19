import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getConfigReadDiagnostic,
  getLegacyUserConfigPath,
  getUserConfigPath,
  isConfigReadError,
  readConfigFile,
  readConfigFileResult,
  readLegacyJsonConfigFileResult,
  writeConfigFile,
} from './config-reader';
import { migrateLegacyJsonConfigToToml, sanitizeLegacyUnifiedConfig } from './config-migration';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-config-reader-'));
  tempRoots.push(root);
  return root;
}

describe('config-reader typed results', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns missing without collapsing it into a parse error', () => {
    const filePath = path.join(createTempRoot(), 'missing.toml');

    const result = readConfigFileResult(filePath);

    expect(result).toEqual({ status: 'missing', filePath });
    expect(isConfigReadError(result)).toBe(false);
    expect(getConfigReadDiagnostic(result)).toBeUndefined();
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('reports an existing empty file as an error', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(filePath, '  \n', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('empty');
    expect(isConfigReadError(result)).toBe(true);
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'empty',
        filePath,
        message: expect.stringContaining(filePath),
      }),
    );
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('reports invalid TOML without returning a config object', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(filePath, 'providers = [', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('invalidToml');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'invalidToml',
        filePath,
        detail: expect.any(String),
      }),
    );
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('reports read errors separately from invalid TOML', () => {
    const filePath = path.join(createTempRoot(), 'config-as-directory.toml');
    fs.mkdirSync(filePath);

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('readError');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'readError',
        filePath,
        detail: expect.any(String),
      }),
    );
    expect(readConfigFile(filePath)).toBeNull();
  });

  it('returns parsed config for valid TOML', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        'default_provider = "custom-newapi"',
        '',
        '[[providers]]',
        'id = "custom-newapi"',
        'name = "Custom NewAPI"',
        'type = "newapi"',
        'base_url = "https://api.example.com/v1"',
        'connection_kind = "custom-gateway"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') {
      throw new Error('Expected ok result');
    }
    expect(result.config.defaultProvider).toBe('custom-newapi');
    expect(result.config.providers?.[0]).toEqual(
      expect.objectContaining({
        id: 'custom-newapi',
        apiUrl: 'https://api.example.com/v1',
        connectionKind: 'custom-gateway',
      }),
    );
    expect(readConfigFile(filePath)?.defaultProvider).toBe('custom-newapi');
  });

  it('writes TOML and reads it back through the canonical reader', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');

    writeConfigFile(filePath, {
      defaultProvider: 'ollama-local',
      defaultModel: 'ollama-local:llama3.2',
      maxTokens: 8192,
      temperature: 0.7,
      providers: [
        {
          id: 'ollama-local',
          name: 'Ollama Local',
          displayName: 'Ollama Local',
          type: 'ollama',
          apiUrl: 'http://localhost:11434/api',
          enabled: true,
          connectionKind: 'local',
          requiresApiKey: false,
        },
      ],
      models: [
        {
          id: 'ollama-local:llama3.2',
          name: 'llama3.2',
          providerId: 'ollama-local',
          type: 'llm',
          capabilities: ['chat', 'streaming'],
          enabled: true,
        },
      ],
    });

    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('default_provider = "ollama-local"');
    expect(written).toContain('[[providers]]');
    expect(written).toContain('connection_kind = "local"');

    const result = readConfigFileResult(filePath);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModel).toBe('ollama-local:llama3.2');
    expect(result.config.models?.[0]?.providerId).toBe('ollama-local');
  });

  it('rejects unsupported TOML config versions', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(filePath, 'version = 999\n', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedVersion');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'unsupportedVersion',
        filePath,
        detail: expect.stringContaining('Unsupported Agent config version'),
      }),
    );
  });

  it('diagnoses duplicate provider ids', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "dupe"',
        'name = "one"',
        'type = "newapi"',
        '',
        '[[providers]]',
        'id = "dupe"',
        'name = "two"',
        'type = "newapi"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('duplicateProviderId');
    expect(getConfigReadDiagnostic(result)?.detail).toContain('Duplicate providers id');
  });

  it('reports legacy JSON-only config as a migration diagnostic', () => {
    const root = createTempRoot();
    const filePath = path.join(root, 'config.toml');
    const legacyPath = path.join(root, 'config.json');
    fs.writeFileSync(legacyPath, '{"defaultProvider":"legacy"}', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('legacyJsonOnly');
    expect(getConfigReadDiagnostic(result)).toEqual(
      expect.objectContaining({
        code: 'legacyJsonOnly',
        filePath,
        message: expect.stringContaining(legacyPath),
      }),
    );
  });

  it('reports conflict when TOML and legacy JSON both exist', () => {
    const root = createTempRoot();
    const filePath = path.join(root, 'config.toml');
    const legacyPath = path.join(root, 'config.json');
    fs.writeFileSync(filePath, 'default_provider = "toml"', 'utf-8');
    fs.writeFileSync(legacyPath, '{"defaultProvider":"legacy"}', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('conflictingConfigFiles');
    expect(getConfigReadDiagnostic(result)?.message).toContain(legacyPath);
  });

  it('explicitly reads legacy JSON only through the migration helper', () => {
    const legacyPath = path.join(createTempRoot(), 'config.json');
    fs.writeFileSync(legacyPath, '{"defaultProvider":"legacy"}', 'utf-8');

    const result = readLegacyJsonConfigFileResult(legacyPath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultProvider).toBe('legacy');
  });

  it('migrates legacy JSON to TOML and renames JSON to a backup', () => {
    const root = createTempRoot();
    const legacyPath = path.join(root, 'config.json');
    const tomlPath = path.join(root, 'config.toml');
    const backupPath = path.join(root, 'config.json.bak');
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        defaultProvider: 'ollama-local',
        defaultModel: 'ollama-local-chat',
        providers: [
          {
            id: 'ollama-local',
            name: 'ollama',
            displayName: 'Ollama Local',
            type: 'ollama',
            apiUrl: 'http://localhost:11434/api',
            enabled: true,
            connectionKind: 'local',
            requiresApiKey: false,
          },
        ],
        models: [
          {
            id: 'ollama-local-chat',
            name: 'llama3.2',
            providerId: 'ollama-local',
            type: 'llm',
            capabilities: ['chat'],
            enabled: true,
          },
        ],
      }),
      'utf-8',
    );

    const result = migrateLegacyJsonConfigToToml({ legacyJsonPath: legacyPath, tomlPath });

    expect(result).toEqual({
      status: 'migrated',
      legacyJsonPath: legacyPath,
      tomlPath,
      backupPath,
    });
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(backupPath)).toBe(true);
    const migrated = readConfigFileResult(tomlPath);
    expect(migrated.status).toBe('ok');
    if (migrated.status !== 'ok') throw new Error('Expected migrated TOML config');
    expect(migrated.config.defaultProvider).toBe('ollama-local');
    expect(migrated.config.models?.[0]?.id).toBe('ollama-local-chat');
  });

  it('does not create partial TOML when legacy JSON is invalid', () => {
    const root = createTempRoot();
    const legacyPath = path.join(root, 'config.json');
    const tomlPath = path.join(root, 'config.toml');
    fs.writeFileSync(legacyPath, '{', 'utf-8');

    const result = migrateLegacyJsonConfigToToml({ legacyJsonPath: legacyPath, tomlPath });

    expect(result.status).toBe('invalidLegacyJson');
    expect(fs.existsSync(tomlPath)).toBe(false);
    expect(fs.existsSync(legacyPath)).toBe(true);
  });

  it('refuses migration when TOML already exists', () => {
    const root = createTempRoot();
    const legacyPath = path.join(root, 'config.json');
    const tomlPath = path.join(root, 'config.toml');
    fs.writeFileSync(legacyPath, '{"defaultProvider":"legacy"}', 'utf-8');
    fs.writeFileSync(tomlPath, 'default_provider = "toml"', 'utf-8');

    const result = migrateLegacyJsonConfigToToml({ legacyJsonPath: legacyPath, tomlPath });

    expect(result.status).toBe('tomlAlreadyExists');
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(readConfigFileResult(tomlPath).status).toBe('conflictingConfigFiles');
  });

  it('keeps OAuth account gateway snapshots and unknown token fields out of migrated TOML', () => {
    const sanitized = sanitizeLegacyUnifiedConfig({
      defaultProvider: 'neko-account-gateway',
      defaultModel: 'neko-account-gateway:official-chat',
      providers: [
        {
          id: 'neko-account-gateway',
          name: 'gateway-runtime',
          displayName: 'Gateway Runtime',
          type: 'newapi',
          apiUrl: 'https://official.example',
          apiKey: 'oauth-bearer-token',
          enabled: true,
        },
        {
          id: 'custom-newapi',
          name: 'custom-newapi',
          displayName: 'Custom NewAPI',
          type: 'newapi',
          apiUrl: 'https://api.example.com/v1',
          apiKey: 'sk-user',
          enabled: true,
        },
      ],
      models: [
        {
          id: 'neko-account-gateway:official-chat',
          name: 'official-chat',
          providerId: 'neko-account-gateway',
          capabilities: ['chat'],
          enabled: true,
        },
        {
          id: 'custom-chat',
          name: 'gpt-4o-mini',
          providerId: 'custom-newapi',
          capabilities: ['chat'],
          enabled: true,
        },
      ],
      credentials: {
        apiKeys: {
          'neko-account-gateway': 'oauth-secret',
          'custom-newapi': 'sk-user',
        },
      },
      providerOverrides: {
        'neko-account-gateway': { apiKey: 'runtime-secret' },
      },
      accessToken: 'oauth-access-token',
      refreshToken: 'oauth-refresh-token',
      accountCatalog: { secret: 'catalog-cache' },
    } as never);

    const serialized = JSON.stringify(sanitized);
    expect(sanitized.defaultProvider).toBeUndefined();
    expect(sanitized.defaultModel).toBeUndefined();
    expect(sanitized.providers?.map((provider) => provider.id)).toEqual(['custom-newapi']);
    expect(sanitized.models?.map((model) => model.id)).toEqual(['custom-chat']);
    expect(sanitized.credentials?.apiKeys).toEqual({ 'custom-newapi': 'sk-user' });
    expect(serialized).not.toContain('neko-account-gateway');
    expect(serialized).not.toContain('oauth');
    expect(serialized).not.toContain('catalog-cache');
  });
});

describe('config-reader canonical paths', () => {
  it('uses TOML as canonical user config and JSON only as legacy', () => {
    expect(getUserConfigPath()).toMatch(/\.neko[/\\]config\.toml$/);
    expect(getLegacyUserConfigPath()).toMatch(/\.neko[/\\]config\.json$/);
  });
});
