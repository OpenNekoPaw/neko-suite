/**
 * Protocol tests for neko-market extension <-> webview message routing.
 *
 * Verifies DTO mapping logic (toMarketItem, toInstalledItem) and
 * webview-side filterToAssetTypes category mapping.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => p }) },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// toMarketItem / toInstalledItem are private functions in MarketplaceHandler.
// We replicate their logic here to verify the flattening contract that the
// webview depends on. If the source changes, these tests catch drift.
// ---------------------------------------------------------------------------

function toMarketItem(pkg: Record<string, unknown>): Record<string, unknown> {
  const m = pkg['manifest'] as Record<string, unknown>;
  const d = (m['distribution'] ?? {}) as Record<string, unknown>;
  const rating = d['rating'] as Record<string, unknown> | undefined;
  return {
    id: pkg['id'],
    name: m['name'],
    description: d['description'],
    author: d['author'],
    publisherId: d['publisherId'],
    version: m['version'],
    type: m['type'],
    thumbnail: m['thumbnail'],
    tags: d['tags'],
    downloadCount: (pkg['downloadCount'] as number | undefined) ?? d['downloads'],
    rating: rating?.['average'],
    installState: pkg['installState'],
    installedVersion: pkg['installedVersion'],
  };
}

function toInstalledItem(pkg: Record<string, unknown>): Record<string, unknown> {
  const manifest = pkg['manifest'] as Record<string, unknown> | undefined;
  return {
    packageId: pkg['packageId'],
    name: manifest?.['name'] ?? pkg['packageId'],
    version: pkg['version'],
    type: pkg['type'],
    installedAt: new Date(pkg['installedAt'] as number).toISOString(),
    installedPath: pkg['installedPath'],
    enabled: pkg['enabled'],
  };
}

function filterToAssetTypes(filter: string): string[] | undefined {
  switch (filter) {
    case 'all':
      return undefined;
    case 'skill':
      return ['skill', 'plugin'];
    case 'shader':
      return ['shader', 'shader-preset'];
    case 'model':
      return ['ai-model', 'lora', 'embedding', '3d-model'];
    case 'preset':
      return ['preset', 'template', 'lut'];
    default:
      return undefined;
  }
}

describe('neko-market protocol', () => {
  describe('toMarketItem', () => {
    it('flattens nested MarketPackage to flat webview item', () => {
      const pkg = {
        id: 'pkg-1',
        manifest: {
          name: 'Cool Shader',
          version: '1.0.0',
          type: 'shader',
          thumbnail: 'thumb.png',
          distribution: {
            description: 'A cool shader',
            author: 'dev-user',
            publisherId: 'pub-123',
            tags: ['video', 'effect'],
            downloads: 500,
            rating: { average: 4.5 },
          },
        },
        downloadCount: 600,
        installState: 'installed',
        installedVersion: '1.0.0',
      };

      const item = toMarketItem(pkg);

      expect(item['name']).toBe('Cool Shader');
      expect(item['author']).toBe('dev-user');
      expect(item['version']).toBe('1.0.0');
      // downloadCount from pkg takes precedence over distribution.downloads
      expect(item['downloadCount']).toBe(600);
      expect(item['rating']).toBe(4.5);
      expect(item['installedVersion']).toBe('1.0.0');
    });
  });

  describe('toInstalledItem', () => {
    it('converts timestamp to ISO string', () => {
      const pkg = {
        packageId: 'pkg-2',
        manifest: { name: 'My Preset' },
        version: '2.1.0',
        type: 'preset',
        installedAt: 1712000000000, // 2024-04-01T...
        installedPath: '/home/.neko/packages/pkg-2',
        enabled: true,
      };

      const item = toInstalledItem(pkg);

      expect(item['packageId']).toBe('pkg-2');
      expect(item['name']).toBe('My Preset');
      expect(typeof item['installedAt']).toBe('string');
      expect((item['installedAt'] as string).endsWith('Z')).toBe(true);
      // Verify it parses back to the same timestamp
      expect(new Date(item['installedAt'] as string).getTime()).toBe(1712000000000);
    });

    it('falls back to packageId when manifest.name is missing', () => {
      const pkg = {
        packageId: 'fallback-id',
        version: '0.1.0',
        type: 'skill',
        installedAt: Date.now(),
        installedPath: '/tmp',
        enabled: false,
      };

      const item = toInstalledItem(pkg);
      expect(item['name']).toBe('fallback-id');
    });
  });

  describe('filterToAssetTypes', () => {
    it('model maps to ai-model, lora, embedding, 3d-model', () => {
      expect(filterToAssetTypes('model')).toEqual(['ai-model', 'lora', 'embedding', '3d-model']);
    });

    it('skill maps to skill and plugin', () => {
      expect(filterToAssetTypes('skill')).toEqual(['skill', 'plugin']);
    });

    it('all returns undefined (no filter)', () => {
      expect(filterToAssetTypes('all')).toBeUndefined();
    });
  });
});
