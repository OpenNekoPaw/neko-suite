import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InstalledRegistry } from './installed-registry';
import type { AssetManifest, InstalledPackage } from '@neko/shared';

const testDir = join(tmpdir(), 'neko-market-registry-test');
const registryFile = join(testDir, 'market-installed.json');

const mockManifest: AssetManifest = {
  id: '@test/skill-1',
  name: 'test-skill',
  version: '1.0.0',
  type: 'skill',
  source: {
    kind: 'registry',
    registry: 'official',
    package: '@test/skill-1',
    version: '1.0.0',
    integrity: 'sha256-test',
  },
  distributionKind: 'archive',
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
  enabled: true,
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
    expect(registry2.get('@test/skill-1')).toMatchObject({
      ...mockPackage,
      requested: true,
      status: 'active',
    });
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

  describe('enabled state', () => {
    it('should default enabled to true when adding', async () => {
      const registry = new InstalledRegistry(registryFile);
      await registry.load();
      await registry.add(mockPackage);

      const pkg = registry.get('@test/skill-1');
      expect(pkg?.enabled).toBe(true);
    });

    it('should set enabled to false', async () => {
      const registry = new InstalledRegistry(registryFile);
      await registry.load();
      await registry.add(mockPackage);
      await registry.setEnabled('@test/skill-1', false);

      const pkg = registry.get('@test/skill-1');
      expect(pkg?.enabled).toBe(false);
    });

    it('should set enabled to true after disabling', async () => {
      const registry = new InstalledRegistry(registryFile);
      await registry.load();
      await registry.add(mockPackage);
      await registry.setEnabled('@test/skill-1', false);
      await registry.setEnabled('@test/skill-1', true);

      const pkg = registry.get('@test/skill-1');
      expect(pkg?.enabled).toBe(true);
    });

    it('should persist enabled state', async () => {
      const registry1 = new InstalledRegistry(registryFile);
      await registry1.load();
      await registry1.add(mockPackage);
      await registry1.setEnabled('@test/skill-1', false);

      const registry2 = new InstalledRegistry(registryFile);
      await registry2.load();
      expect(registry2.get('@test/skill-1')?.enabled).toBe(false);
    });

    it('should ignore setEnabled for non-existent package', async () => {
      const registry = new InstalledRegistry(registryFile);
      await registry.load();

      // Should not throw
      await registry.setEnabled('nonexistent', false);
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('should backfill enabled=true for old records without enabled field', async () => {
      // Simulate old data without enabled field
      const { writeFile, mkdir: mkdirP } = await import('node:fs/promises');
      await mkdirP(testDir, { recursive: true });
      await writeFile(
        registryFile,
        JSON.stringify({
          version: 1,
          packages: {
            '@test/old-pkg': {
              packageId: '@test/old-pkg',
              version: '1.0.0',
              type: 'skill',
              installedAt: Date.now(),
              installedPath: '/some/path',
              manifest: mockManifest,
              // Note: no `enabled` field
            },
          },
        }),
        'utf-8',
      );

      const registry = new InstalledRegistry(registryFile);
      await registry.load();
      const pkg = registry.get('@test/old-pkg');
      expect(pkg?.enabled).toBe(true);
    });
  });

  describe('version migration', () => {
    it('migrates legacy records without version into v1 shape', async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(
        registryFile,
        JSON.stringify({
          packages: {
            '@test/legacy': {
              version: '1.0.0',
              type: 'skill',
              installedAt: Date.now(),
              installedPath: '/legacy/path',
              manifest: mockManifest,
            },
          },
        }),
        'utf-8',
      );

      const registry = new InstalledRegistry(registryFile);
      await registry.load();

      expect(registry.get('@test/legacy')).toMatchObject({
        packageId: '@test/legacy',
        enabled: true,
        requested: true,
        status: 'active',
      });
    });

    it('rejects future registry versions instead of overwriting user data', async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(
        registryFile,
        JSON.stringify({
          version: 999,
          packages: {},
          refs: {},
        }),
        'utf-8',
      );

      const registry = new InstalledRegistry(registryFile);

      await expect(registry.load()).rejects.toThrow('Unsupported installed registry version');
    });

    it.each([
      ['video', 'media', { type: 'media', data: { mediaKind: 'video' } }],
      ['audio', 'media', { type: 'media', data: { mediaKind: 'audio' } }],
      ['ai-model', 'model', { type: 'model', data: { modelKind: 'base' } }],
      ['lora', 'model', { type: 'model', data: { modelKind: 'lora' } }],
      ['template', 'preset', { type: 'preset', data: { presetKind: 'theme' } }],
      ['provider-card', 'provider', { type: 'provider', data: {} }],
    ])(
      'migrates legacy installed AssetType %s to v4 %s',
      async (legacyType, expectedType, expectedMetadata) => {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(
          registryFile,
          JSON.stringify({
            packages: {
              '@test/legacy': {
                packageId: '@test/legacy',
                version: '1.0.0',
                type: legacyType,
                installedAt: Date.now(),
                installedPath: '/legacy/path',
                manifest: {
                  ...mockManifest,
                  id: '@test/legacy',
                  type: legacyType,
                  typeMetadata: undefined,
                },
              },
            },
          }),
          'utf-8',
        );

        const registry = new InstalledRegistry(registryFile);
        await registry.load();

        const pkg = registry.get('@test/legacy');
        expect(pkg?.type).toBe(expectedType);
        expect(pkg?.manifest.type).toBe(expectedType);
        expect(pkg?.manifest.typeMetadata).toMatchObject(expectedMetadata);
      },
    );
  });

  describe('bundle references', () => {
    it('should add and persist references once per owner', async () => {
      const registry = new InstalledRegistry(registryFile);
      await registry.load();

      await registry.addReference('@test/content', '@test/bundle-a');
      await registry.addReference('@test/content', '@test/bundle-a');
      await registry.addReference('@test/content', '@test/bundle-b');

      expect(registry.getReference('@test/content')).toEqual({
        refCount: 2,
        owners: ['@test/bundle-a', '@test/bundle-b'],
      });

      const reloaded = new InstalledRegistry(registryFile);
      await reloaded.load();
      expect(reloaded.getReference('@test/content')?.refCount).toBe(2);
    });

    it('should remove references and delete empty ref records', async () => {
      const registry = new InstalledRegistry(registryFile);
      await registry.load();

      await registry.addReference('@test/content', '@test/bundle-a');
      await registry.addReference('@test/content', '@test/bundle-b');
      await registry.removeReference('@test/content', '@test/bundle-a');

      expect(registry.getReference('@test/content')).toEqual({
        refCount: 1,
        owners: ['@test/bundle-b'],
      });

      await registry.removeReference('@test/content', '@test/bundle-b');
      expect(registry.getReference('@test/content')).toBeUndefined();
    });
  });
});
