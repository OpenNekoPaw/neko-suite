import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketClient, MarketApiError } from './market-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

describe('MarketClient', () => {
  const client = new MarketClient({ registryUrl: 'https://test.api/v1' });

  describe('search', () => {
    it('should send search query params', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [], total: 0, hasMore: false }));

      await client.search({ text: 'video', types: ['skill'], page: 1 });

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain('q=video');
      expect(url).toContain('types=skill');
      expect(url).toContain('page=1');
    });

    it('should return search result', async () => {
      const result = { items: [{ id: 'test' }], total: 1, hasMore: false };
      mockFetch.mockResolvedValueOnce(jsonResponse(result));

      const response = await client.search({ text: 'test' });
      expect(response.total).toBe(1);
    });
  });

  describe('getPackage', () => {
    it('should return package details', async () => {
      const pkg = { id: '@test/skill', manifest: {} };
      mockFetch.mockResolvedValueOnce(jsonResponse(pkg));

      const result = await client.getPackage('@test/skill');
      expect(result?.id).toBe('@test/skill');
    });

    it('should return undefined for 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      const result = await client.getPackage('@test/nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getVersions', () => {
    it('should return versions array', async () => {
      const versions = [{ version: '1.0.0' }, { version: '1.1.0' }];
      mockFetch.mockResolvedValueOnce(jsonResponse(versions));

      const result = await client.getVersions('@test/skill');
      expect(result).toHaveLength(2);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return download URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ url: 'https://cdn/file.tar.gz' }));

      const url = await client.getDownloadUrl('@test/skill', '1.0.0');
      expect(url).toBe('https://cdn/file.tar.gz');
    });
  });

  describe('getFeatured', () => {
    it('should fetch featured packages', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const result = await client.getFeatured('skill');
      expect(result).toEqual([]);

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain('type=skill');
    });
  });

  describe('error handling', () => {
    it('should throw MarketApiError for non-404 errors', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      await expect(client.getVersions('@test/skill')).rejects.toThrow(MarketApiError);
    });
  });
});
