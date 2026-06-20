import { describe, expect, it } from 'vitest';
import type { AccountAiCatalogSnapshot } from '@neko/shared';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import type { Model, Provider } from '../../types/provider';
import { resolveAiProviderSources } from '../ai-provider-source-resolver';

const explicitProvider: Provider = {
  id: 'user-newapi',
  name: 'user-newapi',
  displayName: 'User NewAPI',
  type: 'newapi',
  apiUrl: 'https://gateway.example.com/v1',
  apiKey: 'sk-user',
  enabled: true,
  connectionKind: 'custom-gateway',
  protocolProfile: 'newapi',
};

const explicitModel: Model = {
  id: 'user-chat',
  name: 'gpt-4o-mini',
  displayName: 'User Chat',
  providerId: 'user-newapi',
  type: 'llm',
  capabilities: ['chat'],
  enabled: true,
};

function createReadResult(config: Record<string, unknown>): ConfigReadResult {
  return {
    status: 'ok',
    filePath: '<test-config>',
    config,
  } as ConfigReadResult;
}

function createAccountCatalog(): AccountAiCatalogSnapshot {
  return {
    source: 'account-gateway',
    status: 'available',
    provider: {
      id: 'neko-account-gateway',
      name: 'neko-account-gateway',
      displayName: 'Neko Official',
      type: 'newapi',
      apiUrl: '',
      enabled: true,
      connectionKind: 'gateway',
      protocolProfile: 'newapi',
      supportLevel: 'verified',
      requiresApiKey: false,
    },
    models: [
      {
        id: 'official-chat',
        name: 'gpt-4o-mini',
        displayName: 'Official Chat',
        providerId: 'neko-account-gateway',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      },
      {
        id: 'official-image',
        name: 'gpt-image-2',
        displayName: 'Official Image',
        providerId: 'neko-account-gateway',
        type: 'image',
        capabilities: ['text_to_image'],
        enabled: true,
      },
      {
        id: 'official-denied',
        name: 'denied',
        providerId: 'neko-account-gateway',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      },
    ],
    entitlement: {
      plan: 'Pro',
      allowedModelIds: ['official-chat', 'official-image'],
      disabledModelIds: ['official-denied'],
    },
    defaults: {
      chat: 'official-chat',
      image: 'official-image',
    },
    expiresAt: 10_000,
  };
}

describe('resolveAiProviderSources', () => {
  it('puts Neko official account models first and keeps LLM/domain models distinct', () => {
    const projection = resolveAiProviderSources({
      providers: [explicitProvider],
      models: [explicitModel],
      userConfigReadResult: createReadResult({
        providers: [explicitProvider],
        models: [explicitModel],
        defaultProvider: explicitProvider.id,
        defaultModel: explicitModel.id,
      }),
      accountCatalog: createAccountCatalog(),
    });

    expect(projection.modelGroups.map((group) => group.source)).toEqual([
      'account-gateway',
      'explicit-config',
    ]);
    expect(projection.modelGroups[0]?.providerLabel).toBe('Neko Official');
    expect(projection.modelGroups[0]?.modelsByType.llm?.map((model) => model.modelId)).toEqual([
      'official-chat',
    ]);
    expect(projection.modelGroups[0]?.modelsByType.image?.map((model) => model.modelId)).toEqual([
      'official-image',
    ]);
    expect(projection.modelGroups[0]?.modelsByType.llm).not.toContainEqual(
      expect.objectContaining({ modelId: 'official-denied' }),
    );
    expect(projection.chatModelOptions.map((option) => option.id)).toEqual([
      'auto',
      'neko-account-gateway:official-chat',
      'user-newapi:user-chat',
    ]);
  });

  it('treats non-AI config as absent so account gateway can satisfy configuration', () => {
    const projection = resolveAiProviderSources({
      providers: [],
      models: [],
      userConfigReadResult: createReadResult({
        mcpServers: [{ id: 'fs', name: 'fs', category: 'filesystem', transport: 'stdio' }],
      }),
      accountCatalog: createAccountCatalog(),
    });

    expect(projection.explicitAiConfig.isExplicit).toBe(false);
    expect(projection.hasAccountGateway).toBe(true);
    expect(projection.modelGroups).toHaveLength(1);
  });

  it('keeps invalid explicit AI config visible instead of turning it into account fallback', () => {
    const projection = resolveAiProviderSources({
      providers: [],
      models: [],
      userConfigReadResult: createReadResult({ defaultProvider: 'missing' }),
      configDiagnostic: {
        code: 'missingProvider',
        filePath: '<test-config>',
        message: 'missing provider',
      },
      accountCatalog: createAccountCatalog(),
    });

    expect(projection.explicitAiConfig).toEqual({
      isExplicit: true,
      invalidDiagnostic: {
        code: 'missingProvider',
        filePath: '<test-config>',
        message: 'missing provider',
      },
    });
    expect(projection.hasAccountGateway).toBe(true);
  });

  it('does not expose provider secrets through source projections', () => {
    const projection = resolveAiProviderSources({
      providers: [explicitProvider],
      models: [explicitModel],
      userConfigReadResult: createReadResult({ providers: [explicitProvider] }),
      accountCatalog: createAccountCatalog(),
    });

    const serialized = JSON.stringify({
      providers: projection.providers,
      models: projection.models,
      modelGroups: projection.modelGroups,
    });
    expect(serialized).not.toContain('sk-user');
    expect(serialized).not.toContain('apiKey');
  });
});
