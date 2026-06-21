import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getConfigReadDiagnostic,
  getUserConfigPath,
  isConfigReadError,
  readConfigFileResult,
  writeConfigFile,
} from './config-reader';

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
        'connection_kind = "gateway"',
        'protocol_profile = "newapi"',
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
        connectionKind: 'gateway',
        protocolProfile: 'newapi',
      }),
    );
  });

  it('rejects the removed newapi-compatible protocol profile alias', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "custom-newapi"',
        'name = "Custom NewAPI"',
        'type = "newapi"',
        'base_url = "https://api.example.com/v1"',
        'connection_kind = "gateway"',
        'protocol_profile = "newapi-compatible"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedProviderProtocolProfile');
    expect(getConfigReadDiagnostic(result)?.detail).toContain(
      'Unsupported provider protocol_profile "newapi-compatible"',
    );
  });

  it('preserves type defaults and model capability metadata from TOML', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.audio]',
        'provider_id = "neko-gateway"',
        'model_id = "suno-v4"',
        '',
        '[default_models.video]',
        'provider_id = "neko-gateway"',
        'model_id = "gemini-video"',
        '',
        '[[models]]',
        'id = "suno-v4"',
        'name = "suno-v4"',
        'provider_id = "neko-gateway"',
        'type = "audio"',
        'capabilities = ["text_to_music"]',
        '',
        '[[models]]',
        'id = "gemini-video"',
        'name = "gemini-2.5-pro"',
        'provider_id = "neko-gateway"',
        'type = "video"',
        'capabilities = ["text_to_video", "vision"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModels).toEqual({
      audio: { providerId: 'neko-gateway', modelId: 'suno-v4' },
      video: { providerId: 'neko-gateway', modelId: 'gemini-video' },
    });
    expect(result.config.models?.[0]).toEqual(
      expect.objectContaining({
        type: 'audio',
        capabilities: ['text_to_music'],
      }),
    );
    expect(result.config.models?.[1]).toEqual(
      expect.objectContaining({
        type: 'video',
        capabilities: ['text_to_video', 'vision'],
      }),
    );
  });

  it('accepts existing capability metadata fields for type defaults', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.llm]',
        'provider_id = "neko-gateway"',
        'model_id = "gpt"',
        '',
        '[default_models.audio]',
        'provider_id = "neko-gateway"',
        'model_id = "suno-v4"',
        '',
        '[[models]]',
        'id = "gpt"',
        'name = "gpt-4.1"',
        'provider_id = "neko-gateway"',
        'type = "llm"',
        'capabilities = ["chat", "function_calling", "streaming", "json_mode", "code"]',
        '',
        '[[models]]',
        'id = "suno-v4"',
        'name = "suno-v4"',
        'provider_id = "neko-gateway"',
        'type = "audio"',
        'capabilities = ["text_to_music"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultModels).toEqual({
      llm: { providerId: 'neko-gateway', modelId: 'gpt' },
      audio: { providerId: 'neko-gateway', modelId: 'suno-v4' },
    });
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

  it('rejects unsupported provider protocol profile values', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "deepseek"',
        'name = "deepseek"',
        'type = "generic"',
        'api_url = "https://api.deepseek.com"',
        'connection_kind = "direct"',
        'protocol_profile = "deepseek"',
        '',
        '[providers.protocol_variant]',
        'base_path = "/v1"',
        'auth_type = "bearer"',
        'stream_format = "sse"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedProviderProtocolProfile');
    expect(getConfigReadDiagnostic(result)?.detail).toContain(
      'DeepSeek direct endpoints use "openai-chat"',
    );
  });

  it('rejects unsupported provider and protocol variant enum values', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[providers]]',
        'id = "bad-provider"',
        'name = "Bad Provider"',
        'type = "deepseek"',
        'connection_kind = "remote"',
        'protocol_profile = "openai-chat"',
        'support_level = "stable"',
        '',
        '[providers.protocol_variant]',
        'auth_type = "token"',
        'stream_format = "jsonl"',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedProviderType');
    const detail = getConfigReadDiagnostic(result)?.detail ?? '';
    expect(detail).toContain('Unsupported provider type "deepseek"');
    expect(detail).toContain('Unsupported provider connection_kind "remote"');
    expect(detail).toContain('Unsupported provider support_level "stable"');
    expect(detail).toContain('Unsupported protocol_variant auth_type "token"');
    expect(detail).toContain('Unsupported protocol_variant stream_format "jsonl"');
  });

  it('rejects music as a top-level model type', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[models]]',
        'id = "suno-v4"',
        'name = "suno-v4"',
        'provider_id = "neko-gateway"',
        'type = "music"',
        'capabilities = ["text_to_music"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedModelType');
    expect(getConfigReadDiagnostic(result)?.detail).toContain(
      'Configure music models as type "audio"',
    );
  });

  it('rejects unsupported model protocol overrides', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[[models]]',
        'id = "custom-model"',
        'name = "custom-model"',
        'provider_id = "custom-provider"',
        'protocol = "deepseek"',
        'type = "llm"',
        'capabilities = ["chat"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedModelProtocol');
    expect(getConfigReadDiagnostic(result)?.detail).toContain(
      'Unsupported model protocol "deepseek"',
    );
  });

  it('rejects legacy default media models section', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      ['[default_media_models]', 'image = "gpt-image-2"'].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedDefaultMediaModelType');
    expect(getConfigReadDiagnostic(result)?.detail).toContain('Unsupported default_media_models');
  });

  it('rejects unsupported type defaults', () => {
    const filePath = path.join(createTempRoot(), 'config.toml');
    fs.writeFileSync(
      filePath,
      [
        '[default_models.audio_music_generate]',
        'provider_id = "neko-gateway"',
        'model_id = "suno-v4"',
        '',
        '[[models]]',
        'id = "suno-v4"',
        'name = "suno-v4"',
        'provider_id = "neko-gateway"',
        'type = "audio"',
        'capabilities = ["text_to_music"]',
      ].join('\n'),
      'utf-8',
    );

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('unsupportedDefaultModelType');
    expect(getConfigReadDiagnostic(result)?.detail).toContain('Unsupported default_models key');
  });

  it('ignores adjacent config.json when canonical TOML is missing', () => {
    const root = createTempRoot();
    const filePath = path.join(root, 'config.toml');
    const legacyPath = path.join(root, 'config.json');
    fs.writeFileSync(legacyPath, '{"defaultProvider":"legacy"}', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result).toEqual({ status: 'missing', filePath });
  });

  it('ignores adjacent config.json when canonical TOML exists', () => {
    const root = createTempRoot();
    const filePath = path.join(root, 'config.toml');
    const legacyPath = path.join(root, 'config.json');
    fs.writeFileSync(filePath, 'default_provider = "toml"', 'utf-8');
    fs.writeFileSync(legacyPath, '{"defaultProvider":"legacy"}', 'utf-8');

    const result = readConfigFileResult(filePath);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected ok result');
    expect(result.config.defaultProvider).toBe('toml');
  });
});

describe('config-reader canonical paths', () => {
  it('uses TOML as canonical user config', () => {
    expect(getUserConfigPath()).toMatch(/\.neko[/\\]config\.toml$/);
  });
});
