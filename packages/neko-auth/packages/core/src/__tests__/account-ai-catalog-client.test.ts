import { describe, expect, it, vi } from 'vitest';
import {
  AccountAiCatalogClient,
  AuthEntitlementError,
  AuthNetworkError,
  AuthNotConfiguredError,
  AuthTokenError,
} from '../index';
import type { IAuthSession } from '@neko/shared';

const session: IAuthSession = {
  user: 'alice@example.com',
  plan: 'Pro',
  accessToken: 'oauth-access-token',
  refreshToken: 'oauth-refresh-token',
  expiresAt: 1_800_000,
};

function createCatalogPayload(overrides: Record<string, unknown> = {}) {
  return {
    provider: {
      id: 'neko-account-gateway',
      name: 'neko-account-gateway',
      displayName: 'Neko Official',
      type: 'newapi',
      enabled: true,
    },
    models: [
      {
        id: 'gpt-4o-mini',
        name: 'gpt-4o-mini',
        displayName: 'GPT-4o mini',
        providerId: 'neko-account-gateway',
        type: 'llm',
        capabilities: ['chat'],
        contextWindow: 128_000,
        enabled: true,
      },
      {
        id: 'gpt-image-2',
        name: 'gpt-image-2',
        displayName: 'GPT Image 2',
        providerId: 'neko-account-gateway',
        type: 'image',
        capabilities: ['text_to_image'],
        enabled: true,
      },
    ],
    entitlement: {
      plan: 'Pro',
      allowedModelIds: ['gpt-4o-mini', 'gpt-image-2'],
      usage: { tokens: 12, limit: 1000, resetAt: '2026-06-30T00:00:00Z' },
    },
    defaults: {
      chat: 'gpt-4o-mini',
      image: 'gpt-image-2',
    },
    version: 'catalog-v1',
    etag: 'etag-1',
    expiresInMs: 60_000,
    ...overrides,
  };
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  } as Response;
}

function collectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const keys: string[] = [];
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    for (const [key, child] of Object.entries(item)) {
      keys.push(key);
      if (child && typeof child === 'object') stack.push(child);
    }
  }

  return keys;
}

describe('AccountAiCatalogClient', () => {
  it('fetches a secret-safe account AI catalog through an injected HTTP boundary', async () => {
    const fetchFn = vi.fn().mockResolvedValue(createJsonResponse(createCatalogPayload()));
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      { fetchFn, now: () => 1_000 },
    );

    const snapshot = await client.fetchCatalog(session);

    expect(fetchFn).toHaveBeenCalledWith('https://api.neko.dev/account/ai/catalog', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer oauth-access-token',
      },
    });
    expect(snapshot.source).toBe('account-gateway');
    expect(snapshot.status).toBe('available');
    expect(snapshot.provider).toMatchObject({
      id: 'neko-account-gateway',
      connectionKind: 'gateway',
      protocolProfile: 'newapi-compatible',
      supportLevel: 'verified',
      requiresApiKey: false,
      apiUrl: '',
    });
    expect(snapshot.models.map((model) => model.id)).toEqual(['gpt-4o-mini', 'gpt-image-2']);
    expect(snapshot.entitlement.allowedModelIds).toEqual(['gpt-4o-mini', 'gpt-image-2']);
    expect(snapshot.defaults).toEqual({ chat: 'gpt-4o-mini', image: 'gpt-image-2' });
    expect(snapshot.expiresAt).toBe(61_000);

    expect(collectKeys(snapshot)).not.toContain('accessToken');
    expect(collectKeys(snapshot)).not.toContain('refreshToken');
    expect(collectKeys(snapshot)).not.toContain('apiKey');
    expect(collectKeys(snapshot)).not.toContain('authorization');
  });

  it('normalizes account catalog music models to audio models with music capability metadata', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      createJsonResponse(
        createCatalogPayload({
          models: [
            {
              id: 'suno-v4',
              name: 'suno-v4',
              displayName: 'Suno V4',
              providerId: 'neko-account-gateway',
              type: 'music',
              capabilities: ['text_to_audio'],
              enabled: true,
            },
          ],
          entitlement: {
            plan: 'Pro',
            allowedModelIds: ['suno-v4'],
          },
          defaults: {
            music: 'suno-v4',
          },
        }),
      ),
    );
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      { fetchFn, now: () => 1_000 },
    );

    const snapshot = await client.fetchCatalog(session);

    expect(snapshot.models).toHaveLength(1);
    expect(snapshot.models[0]).toMatchObject({
      id: 'suno-v4',
      type: 'audio',
      capabilities: ['text_to_audio', 'text_to_music'],
    });
    expect(snapshot.defaults).toEqual({ audio: 'suno-v4' });
  });

  it('throws AuthNotConfiguredError when the catalog URL is absent', async () => {
    const client = new AccountAiCatalogClient({ catalogUrl: '' }, { fetchFn: vi.fn() });

    await expect(client.fetchCatalog(session)).rejects.toBeInstanceOf(AuthNotConfiguredError);
  });

  it('throws AuthTokenError for unauthorized account catalog sessions', async () => {
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      { fetchFn: vi.fn().mockResolvedValue(createJsonResponse('unauthorized', 401)) },
    );

    await expect(client.fetchCatalog(session)).rejects.toMatchObject({
      name: 'AuthTokenError',
      status: 401,
    });
  });

  it('throws AuthEntitlementError for denied account catalog entitlement', async () => {
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      { fetchFn: vi.fn().mockResolvedValue(createJsonResponse('plan required', 403)) },
    );

    await expect(client.fetchCatalog(session)).rejects.toBeInstanceOf(AuthEntitlementError);
  });

  it('throws AuthEntitlementError when the catalog has no entitled models', async () => {
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      {
        fetchFn: vi
          .fn()
          .mockResolvedValue(
            createJsonResponse(createCatalogPayload({ entitlement: { allowedModelIds: [] } })),
          ),
      },
    );

    await expect(client.fetchCatalog(session)).rejects.toBeInstanceOf(AuthEntitlementError);
  });

  it('throws AuthTokenError for malformed catalog responses', async () => {
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      { fetchFn: vi.fn().mockResolvedValue(createJsonResponse({ models: [] })) },
    );

    await expect(client.fetchCatalog(session)).rejects.toBeInstanceOf(AuthTokenError);
  });

  it('throws AuthNetworkError for transport failures', async () => {
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      { fetchFn: vi.fn().mockRejectedValue(new Error('connection refused')) },
    );

    await expect(client.fetchCatalog(session)).rejects.toBeInstanceOf(AuthNetworkError);
  });

  it('rejects catalog payloads that include forbidden secret fields', async () => {
    const client = new AccountAiCatalogClient(
      { catalogUrl: 'https://api.neko.dev/account/ai/catalog' },
      {
        fetchFn: vi.fn().mockResolvedValue(
          createJsonResponse(
            createCatalogPayload({
              provider: {
                id: 'neko-account-gateway',
                name: 'neko-account-gateway',
                displayName: 'Neko Official',
                type: 'newapi',
                apiKey: 'must-not-leak',
              },
            }),
          ),
        ),
      },
    );

    await expect(client.fetchCatalog(session)).rejects.toMatchObject({
      name: 'AuthTokenError',
    });
  });
});
