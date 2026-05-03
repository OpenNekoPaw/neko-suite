import { describe, it, expect } from 'vitest';
import { LicenseManager } from './license-manager';
import type { AssetManifest } from '@neko/shared';

function makeManifest(visibility?: string): AssetManifest {
  return {
    id: 'test',
    name: 'test',
    version: '1.0.0',
    type: 'skill',
    source: { kind: 'local', path: '/tmp/test' },
    distribution: visibility
      ? {
          license: 'MIT',
          author: 'test',
          tags: [],
          checksum: '',
          visibility: visibility as 'public' | 'private' | 'shared' | 'paid',
        }
      : undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('LicenseManager', () => {
  const manager = new LicenseManager();

  it('should allow public assets', async () => {
    const result = await manager.verify(makeManifest('public'));
    expect(result.allowed).toBe(true);
  });

  it('should allow free assets', async () => {
    const result = await manager.verify(makeManifest('free'));
    expect(result.allowed).toBe(true);
  });

  it('should allow shared assets', async () => {
    const result = await manager.verify(makeManifest('shared'));
    expect(result.allowed).toBe(true);
  });

  it('should allow assets without distribution', async () => {
    const result = await manager.verify(makeManifest());
    expect(result.allowed).toBe(true);
  });

  it('should deny paid assets (Phase 1 stub)', async () => {
    const result = await manager.verify(makeManifest('paid'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Paid');
  });

  it('should deny private assets (Phase 1 stub)', async () => {
    const result = await manager.verify(makeManifest('private'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Private');
  });
});
