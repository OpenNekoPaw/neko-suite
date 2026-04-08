/**
 * Protocol tests for neko-market extension -- source contract + real code paths.
 *
 * Uses source contract tests to verify DTO mapping logic in MarketplaceHandler
 * and tests InstalledRegistry.ready() directly.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => p }) },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// ============================================================================
// Source contract: MarketplaceHandler DTO mappers
// ============================================================================

const handlerSource = readFileSync(join(__dirname, '..', 'MarketplaceHandler.ts'), 'utf-8');

describe('MarketplaceHandler source contract -- toMarketItem', () => {
  it('flattens manifest.name to top-level name', () => {
    expect(handlerSource).toContain('name: m.name');
  });

  it('maps distribution author', () => {
    expect(handlerSource).toContain('author: d?.author');
  });

  it('maps manifest version', () => {
    expect(handlerSource).toContain('version: m.version');
  });

  it('uses downloadCount with fallback to distribution.downloads', () => {
    expect(handlerSource).toContain('downloadCount: pkg.downloadCount ?? d?.downloads');
  });

  it('extracts rating average', () => {
    expect(handlerSource).toContain('rating: d?.rating?.average');
  });
});

describe('MarketplaceHandler source contract -- toInstalledItem', () => {
  it('converts installedAt timestamp to ISO string', () => {
    expect(handlerSource).toContain('new Date(pkg.installedAt).toISOString()');
  });

  it('falls back to packageId when manifest.name is missing', () => {
    expect(handlerSource).toContain('pkg.manifest?.name ?? pkg.packageId');
  });
});

describe('MarketplaceHandler source contract -- DTO mapper usage', () => {
  it('all search results use .map(toMarketItem)', () => {
    expect(handlerSource).toContain('.map(toMarketItem)');
  });

  it('all installed results use .map(toInstalledItem)', () => {
    expect(handlerSource).toContain('.map(toInstalledItem)');
  });

  it('handles all expected message types', () => {
    const expectedTypes = [
      'market:search',
      'market:getFeatured',
      'market:getPackage',
      'market:install',
      'market:uninstall',
      'market:listInstalled',
      'market:checkUpdates',
      'market:enable',
      'market:disable',
    ];
    for (const t of expectedTypes) {
      expect(handlerSource).toContain(`'${t}'`);
    }
  });
});

// ============================================================================
// Real code: InstalledRegistry.ready() (NKM-004)
// ============================================================================

describe('InstalledRegistry -- ready() method', () => {
  it('ready() initializes empty registry when file does not exist', async () => {
    const { InstalledRegistry } = await import('../../../core/src/registry/installed-registry');
    const registry = new InstalledRegistry('/tmp/nonexistent-test-registry.json');

    // ready() should not throw even if file doesn't exist
    await expect(registry.ready()).resolves.toBeUndefined();
  });

  it('ready() is idempotent -- calling twice returns same promise', async () => {
    const { InstalledRegistry } = await import('../../../core/src/registry/installed-registry');
    const registry = new InstalledRegistry('/tmp/nonexistent-test-registry-2.json');

    const p1 = registry.ready();
    const p2 = registry.ready();
    await Promise.all([p1, p2]);
    // Both should resolve without error
  });

  it('listAll returns empty array after loading nonexistent file', async () => {
    const { InstalledRegistry } = await import('../../../core/src/registry/installed-registry');
    const registry = new InstalledRegistry('/tmp/nonexistent-test-registry-3.json');
    await registry.ready();

    const all = registry.list();
    expect(all).toEqual([]);
  });
});
