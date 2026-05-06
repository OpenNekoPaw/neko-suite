import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssetManifest } from '@neko/shared';
import { LocalInstallService } from './local-install-service';
import { InstalledRegistry } from '../registry/installed-registry';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('LocalInstallService', () => {
  it('copies local assets under NEKO_HOME local root and removes managed copies on uninstall', async () => {
    const nekoHome = await createTempDir('neko-home-');
    const sourceDir = await createTempDir('neko-source-');
    await writeFile(join(sourceDir, 'asset.txt'), 'local asset\n', 'utf-8');
    const registry = await createInstalledRegistry();
    const service = new LocalInstallService({ nekoHome, registry, now: () => 123 });

    const record = await service.install({
      manifest: createMediaManifest(),
      sourcePath: sourceDir,
    });

    expect(record.installedPath).toContain(join(nekoHome, 'local', 'media'));
    expect(record.manifest.source).toEqual({
      kind: 'local',
      path: expect.stringMatching(/^\$\{NEKO_HOME\}\/local\/media\//),
      storageMode: 'copy-managed',
    });
    expect(record.source).toMatchObject({
      kind: 'local',
      storageMode: 'copy-managed',
      path: expect.stringMatching(/^\$\{NEKO_HOME\}\/local\/media\//),
    });
    await expect(access(join(record.installedPath, 'asset.txt'))).resolves.toBeUndefined();

    await service.uninstall(record.packageId);

    expect(registry.has(record.packageId)).toBe(false);
    await expect(access(record.installedPath)).rejects.toThrow();
  });

  it('records explicit local links and leaves external files on uninstall', async () => {
    const nekoHome = await createTempDir('neko-home-');
    const externalDir = await createTempDir('neko-linked-');
    const externalFile = join(externalDir, 'linked.txt');
    await writeFile(externalFile, 'linked asset\n', 'utf-8');
    const registry = await createInstalledRegistry();
    const service = new LocalInstallService({ nekoHome, registry, now: () => 123 });

    const record = await service.install({
      manifest: createMediaManifest({ id: '@local/linked-media', name: 'linked-media' }),
      sourcePath: externalFile,
      mode: 'local-link',
      linkedVariablePath: '${WORKSPACE}/linked/linked.txt',
    });

    expect(record.installedPath).toBe(externalFile);
    expect(record.manifest.source).toEqual({
      kind: 'local-link',
      path: '${WORKSPACE}/linked/linked.txt',
      storageMode: 'local-link',
    });
    expect(record.source).toMatchObject({
      kind: 'local-link',
      storageMode: 'local-link',
      path: '${WORKSPACE}/linked/linked.txt',
      originalPath: '${WORKSPACE}/linked/linked.txt',
    });

    await service.uninstall(record.packageId);

    expect(registry.has(record.packageId)).toBe(false);
    await expect(access(externalFile)).resolves.toBeUndefined();
  });
});

function createMediaManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    id: '@local/media',
    name: 'media',
    version: '1.0.0',
    type: 'media',
    source: {
      kind: 'local',
      path: '${WORKSPACE}/media',
    },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'media',
      data: {
        mediaKind: 'image',
        fileSize: 1,
        image: { resolution: [1, 1] },
      },
    },
    intent: {
      useCases: ['video-editing'],
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

async function createInstalledRegistry(): Promise<InstalledRegistry> {
  const dir = await createTempDir('neko-local-registry-');
  const registry = new InstalledRegistry(join(dir, 'local-installed.json'));
  await registry.load();
  return registry;
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  await mkdir(dir, { recursive: true });
  return dir;
}
