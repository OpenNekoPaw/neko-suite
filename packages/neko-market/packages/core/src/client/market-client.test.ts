import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketApiError, MarketClient } from './market-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 304 ? 'Not Modified' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    statusText: 'No Content',
    headers: new Headers(),
    json: () => Promise.resolve(undefined),
    text: () => Promise.resolve(''),
  } as Response;
}

describe('MarketClient', () => {
  let client: MarketClient;

  beforeEach(() => {
    client = new MarketClient({
      registryUrl: 'https://test.api/v1',
      maxRetries: 1,
      sleep: () => Promise.resolve(),
    });
  });

  describe('search', () => {
    it('sends v1 discovery query params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));

      await client.search({
        text: 'warm lut',
        types: ['preset'],
        category: 'tooling',
        tags: ['cinematic'],
        visibility: ['public', 'paid'],
        pricing: 'paid',
        publisher: 'studio',
        sort: 'featured',
        order: 'desc',
        limit: 20,
        offset: 40,
        cursor: 'next',
        semantic: {
          warmth: { min: 0.7 },
          mood: ['cinematic', 'nostalgic'],
        },
        intent: {
          useCases: ['vlog', 'wedding'],
          audience: 'beginner',
          notFor: 'NSFW',
        },
        embedding: {
          modelId: 'clip-vit-base',
          query: 'warm vintage',
        },
      });

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain('q=warm+lut');
      expect(url).toContain('types=preset');
      expect(url).toContain('category=tooling');
      expect(url).toContain('tags=cinematic');
      expect(url).toContain('visibility=public%2Cpaid');
      expect(url).toContain('pricing=paid');
      expect(url).toContain('publisher=studio');
      expect(url).toContain('sort=featured');
      expect(url).toContain('order=desc');
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=40');
      expect(url).toContain('cursor=next');
      expect(url).toContain('semantic.warmth%3E%3D=0.7');
      expect(url).toContain('semantic.mood=cinematic%2Cnostalgic');
      expect(url).toContain('intent.useCases=vlog%2Cwedding');
      expect(url).toContain('intent.audience=beginner');
      expect(url).toContain('intent.notFor=NSFW');
      expect(url).toContain('embedding.modelId=clip-vit-base');
      expect(url).toContain('embedding.query=warm+vintage');
    });

    it('normalizes legacy intent.useCase to intent.useCases and does not encode page fields', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));

      await client.search({
        intent: { useCase: ['legacy'] },
        limit: 20,
        offset: 40,
        ...({ page: 3, pageSize: 10 } as Record<string, unknown>),
      });

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain('intent.useCases=legacy');
      expect(url).toContain('limit=20');
      expect(url).toContain('offset=40');
      expect(url).not.toContain('page=');
      expect(url).not.toContain('pageSize=');
    });

    it('returns search result envelope', async () => {
      const result = { items: [{ id: '@test/skill' }], total: 1, hasMore: false };
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const response = await client.search({ text: 'test' });
      expect(response.total).toBe(1);
    });
  });

  describe('getPackage', () => {
    it('returns package details', async () => {
      const pkg = { id: '@test/skill', manifest: {}, installState: 'not-installed' };
      mockFetch.mockResolvedValueOnce(jsonResponse(pkg));

      const result = await client.getPackage('@test/skill');
      expect(result?.id).toBe('@test/skill');
    });

    it('returns undefined for 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      const result = await client.getPackage('@test/nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('versions and featured', () => {
    it('parses versions envelope', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ versions: [{ version: '1.0.0' }, { version: '1.1.0' }] }),
      );

      const result = await client.getVersions('@test/skill');
      expect(result).toHaveLength(2);
    });

    it('parses featured envelope', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [{ id: '@test/skill' }] }));

      const result = await client.getFeatured('skill');
      expect(result).toEqual([{ id: '@test/skill' }]);

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain('type=skill');
    });
  });

  describe('downloads', () => {
    it('returns download descriptor and deprecated URL helper', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            url: 'https://cdn/file.tar.gz',
            expiresAt: 123,
            size: 456,
            integrity: 'sha256-abc',
            resumable: true,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            url: 'https://cdn/file.tar.gz',
            expiresAt: 123,
            size: 456,
            integrity: 'sha256-abc',
            resumable: true,
          }),
        );

      await expect(client.getDownloadDescriptor('@test/skill', '1.0.0')).resolves.toMatchObject({
        integrity: 'sha256-abc',
      });
      await expect(client.getDownloadUrl('@test/skill', '1.0.0')).resolves.toBe(
        'https://cdn/file.tar.gz',
      );
    });

    it('models sparse, variant, proxy, and delta endpoints', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ version: '1.1.0', capabilities: ['sparse', 'variant', 'proxy', 'delta'] }),
        )
        .mockResolvedValueOnce(jsonResponse({ items: [], totalSize: 0 }))
        .mockResolvedValueOnce(noContentResponse())
        .mockResolvedValueOnce(
          jsonResponse({
            url: 'https://cdn/fp16',
            expiresAt: 1,
            size: 2,
            integrity: 'sha256-variant',
            resumable: true,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            url: 'https://cdn/proxy',
            expiresAt: 1,
            size: 2,
            integrity: 'sha256-proxy',
            resumable: true,
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            url: 'https://cdn/delta',
            size: 2,
            integrity: 'sha256-delta',
            patchFormat: 'xdelta3',
          }),
        );

      await expect(client.getSparseManifest('@test/model')).resolves.toEqual({
        items: [],
        totalSize: 0,
      });
      await expect(
        client.reportSparseSelection('@test/model', '1.0.0', ['a']),
      ).resolves.toBeUndefined();
      await expect(
        client.getVariantDownloadDescriptor('@test/model', 'fp16'),
      ).resolves.toMatchObject({
        integrity: 'sha256-variant',
      });
      await expect(
        client.getProxyVariantDownloadDescriptor('@test/model', 'low'),
      ).resolves.toMatchObject({
        integrity: 'sha256-proxy',
      });
      await expect(
        client.getDeltaDownloadDescriptor('@test/model', '1.0.0', '1.1.0'),
      ).resolves.toMatchObject({ patchFormat: 'xdelta3' });

      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it('blocks optional endpoints before request when capability is absent', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ version: '1.0.0', capabilities: [] }));

      await expect(
        client.getDeltaDownloadDescriptor('@test/model', '1.0.0', '1.1.0'),
      ).rejects.toMatchObject({
        status: 501,
        problem: expect.objectContaining({
          type: 'urn:neko:market:unsupported-capability',
          capability: 'delta',
        }),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('entitlement, billing, ontology, and curation', () => {
    it('handles entitlement endpoints and 304 changes', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ entitlements: [], etag: 'v1' }))
        .mockResolvedValueOnce(jsonResponse({}, 304))
        .mockResolvedValueOnce(jsonResponse({ entitlements: [], etag: 'v2' }))
        .mockResolvedValueOnce(jsonResponse({ allowed: true, reason: 'free' }))
        .mockResolvedValueOnce(jsonResponse({ url: 'https://pay', expiresAt: 123 }));

      await expect(client.listEntitlements()).resolves.toMatchObject({ etag: 'v1' });
      await expect(client.getEntitlementChanges('v1')).resolves.toBeUndefined();
      await expect(client.refreshEntitlements()).resolves.toMatchObject({ etag: 'v2' });
      await expect(client.checkEntitlement('@test/skill', '1.0.0')).resolves.toMatchObject({
        allowed: true,
      });
      await expect(
        client.getCheckoutUrl('@test/skill', 'vscode://return', 'zh-CN'),
      ).resolves.toMatchObject({
        url: 'https://pay',
      });
    });

    it('handles ontology and deprecation endpoints', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ version: '1.1.0', capabilities: ['ontology', 'deprecation'] }),
        )
        .mockResolvedValueOnce(jsonResponse({ schemas: {} }))
        .mockResolvedValueOnce(
          jsonResponse({
            useCases: [],
            workflowStage: [],
            goals: [],
            audience: [],
            domain: [],
            notFor: [],
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ deprecation: { since: 123 } }));

      await expect(client.getSemanticOntology('preset', 'lut')).resolves.toEqual({ schemas: {} });
      await expect(client.getIntentOntology()).resolves.toMatchObject({ useCases: [] });
      await expect(client.getDeprecation('@test/old')).resolves.toMatchObject({
        deprecation: { since: 123 },
      });
    });
  });

  describe('server info and errors', () => {
    it('probes server capabilities', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ version: '1.1.0', capabilities: ['sparse'] }));

      await expect(client.getServerInfo()).resolves.toEqual({
        version: '1.1.0',
        capabilities: ['sparse'],
      });
    });

    it('falls back when version endpoint is absent', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      await expect(client.getServerInfo()).resolves.toEqual({
        version: '1.0.0',
        capabilities: [],
      });
    });

    it('throws MarketApiError for non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ title: 'Server error' }, 500));

      await expect(client.getVersions('@test/skill')).rejects.toThrow(MarketApiError);
    });

    it('parses RFC 7807 Problem Details as a typed error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            type: 'https://market.neko.dev/problems/entitlement',
            title: 'Entitlement required',
            status: 403,
            detail: 'Purchase is required',
            instance: '/requests/abc',
            entitlementState: 'not-purchased',
          },
          403,
          { 'Content-Type': 'application/problem+json' },
        ),
      );

      await expect(client.getVersions('@test/paid')).rejects.toMatchObject({
        status: 403,
        title: 'Entitlement required',
        detail: 'Purchase is required',
        type: 'https://market.neko.dev/problems/entitlement',
        instance: '/requests/abc',
        problem: expect.objectContaining({
          entitlementState: 'not-purchased',
        }),
      });
    });

    it('retries 429 responses using Retry-After before returning data', async () => {
      const sleep = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      client = new MarketClient({
        registryUrl: 'https://test.api/v1',
        maxRetries: 1,
        sleep,
      });
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ type: 'rate-limit', title: 'Too many requests', status: 429 }, 429, {
            'Content-Type': 'application/problem+json',
            'Retry-After': '2',
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ versions: [{ version: '1.0.0' }] }));

      await expect(client.getVersions('@test/skill')).resolves.toEqual([{ version: '1.0.0' }]);
      expect(sleep).toHaveBeenCalledWith(2000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('injects and removes bearer auth token', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }))
        .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));

      client.setAuthToken('token-a');
      await client.search({});
      expect(mockFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
        Authorization: 'Bearer token-a',
        Accept: 'application/json, application/problem+json',
      });

      client.setAuthToken(null);
      await client.search({});
      expect(mockFetch.mock.calls[1]?.[1]?.headers).not.toHaveProperty('Authorization');
    });
  });
});
