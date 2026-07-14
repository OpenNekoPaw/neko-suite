import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PathResolver } from '@neko/shared/path';
import { resolveGlobalStorageLayout, type InstalledPackage } from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  M1_LOCAL_METADATA_MIGRATIONS,
  MARKET_INSTALLATION_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { LocalMetadataInstalledRegistry } from './local-metadata-installed-registry';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('LocalMetadataInstalledRegistry', () => {
  it('maps runtime install paths to portable receipts and restores them on reload', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-market-registry-'));
    temporaryDirectories.push(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(MARKET_INSTALLATION_MIGRATIONS);
    const pathResolver = new PathResolver(
      new Map([
        ['HOME', homedir],
        ['NEKO_HOME', join(homedir, '.neko')],
      ]),
    );
    const installedPath = join(homedir, '.agents', 'skills', 'studio', 'storyboard');
    const pkg: InstalledPackage = {
      packageId: '@studio/storyboard',
      version: '1.0.0',
      type: 'skill',
      installedAt: 1_786_000_000_000,
      installedPath,
      manifest: {
        id: '@studio/storyboard',
        name: 'storyboard',
        version: '1.0.0',
        type: 'skill',
        source: {
          kind: 'registry',
          registry: 'official',
          package: '@studio/storyboard',
          version: '1.0.0',
          integrity: 'sha256-storyboard',
        },
        distributionKind: 'archive',
        typeMetadata: { type: 'skill', data: { domain: ['story'] } },
        intent: { useCases: ['storyboarding'] },
        createdAt: 1_785_000_000_000,
        updatedAt: 1_786_000_000_000,
      },
      enabled: true,
      requested: true,
      status: 'active',
    };
    const first = new LocalMetadataInstalledRegistry(
      store.repositories.marketInstallations,
      pathResolver,
      {
        now: () => 1_786_000_000_001,
        trustSource: 'vscode-workspace',
        getTrustLevel: () => 'trusted',
      },
    );
    await first.load();
    await first.add(pkg);

    await expect(store.repositories.marketInstallations.get(pkg.packageId)).resolves.toMatchObject({
      packageId: pkg.packageId,
      installLocation: '${HOME}/.agents/skills/studio/storyboard',
      trustDecision: {
        level: 'trusted',
        source: 'vscode-workspace',
        decidedAt: 1_786_000_000_001,
      },
    });

    const reloaded = new LocalMetadataInstalledRegistry(
      store.repositories.marketInstallations,
      pathResolver,
      { now: () => 1_786_000_000_002, trustSource: 'vscode-workspace' },
    );
    await reloaded.load();
    expect(reloaded.get(pkg.packageId)).toEqual(pkg);
    await store.dispose();
  });
});
