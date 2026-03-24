import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InstalledRegistry } from './installed-registry';
import type { InstalledPackage, AssetManifest } from '@neko/shared/types/asset';

const testDir = join(tmpdir(), 'neko-market-registry-test');
const registryFile = join(testDir, 'market-installed.json');

const mockManifest: AssetManifest = {
  id: '@test/skill-1',
  name: 'test-skill',
  version: '1.0.0',
  type: 'skill',
  source: { kind: 'registry', registry: 'official', package: '@test/skill-1', version: '1.0.0' },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockPackage: InstalledPackage = {
  packageId: '@test/skill-1',
  version: '1.0.0',
  type: 'skill',
  installedAt: Date.now(),
  installedPath: '/home/user/.neko/skills/test/skill-1',
  manifest: mockManifest,
};

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('InstalledRegistry', () => {
  it('should initialize empty', async () => {
    const registry = new InstalledRegistry(registryFile);
    await registry.load();
    expect(registry.list()).toEqual([]);
  });

  it('should add and retrieve a package', async () => {
    const registry = new InstalledRegistry(registryFile);
    await registry.load();
    await registry.add(mockPackage);

    expect(registry.get('@test/skill-1')).toEqual(mockPackage);
    expect(registry.has('@test/skill-1')).toBe(true);
  });

  it('should persist and reload', async () => {
    const registry1 = new InstalledRegistry(registryFile);
    await registry1.load();
    await registry1.add(mockPackage);

    const registry2 = new InstalledRegistry(registryFile);
    await registry2.load();
    expect(registry2.get('@test/skill-1')).toEqual(mockPackage);
  });

  it('should remove a package', async () => {
    const registry = new InstalledRegistry(registryFile);
    await registry.load();
    await registry.add(mockPackage);
    await registry.remove('@test/skill-1');

    expect(registry.has('@test/skill-1')).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it('should list all packages', async () => {
    const registry = new InstalledRegistry(registryFile);
    await registry.load();
    await registry.add(mockPackage);
    await registry.add({ ...mockPackage, packageId: '@test/skill-2', version: '2.0.0' });

    expect(registry.list()).toHaveLength(2);
  });
});
