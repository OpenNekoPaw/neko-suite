import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { InstalledPackage } from '@neko/shared';
import { createMarketLocalMetadataBinding } from '../market-local-metadata-binding';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Market local metadata Host parity', () => {
  it('round-trips install state between the Extension and compiled Bun TUI bindings', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-market-host-parity-'));
    temporaryDirectories.push(homedir);
    const extension = await createMarketLocalMetadataBinding({
      homedir,
      getWorkspaceTrustLevel: () => 'trusted',
    });
    const extensionPackage = createInstalledPackage({
      packageId: '@studio/extension-pack',
      name: 'extension-pack',
      installedPath: join(homedir, '.agents', 'skills', 'studio', 'extension-pack'),
      installedAt: 1_786_000_000_000,
    });
    await extension.registry.add(extensionPackage);
    await extension.dispose();

    const bunFixture = fileURLToPath(
      new URL('./fixtures/bun-market-installation-parity.ts', import.meta.url),
    );
    await execFileAsync('bun', [bunFixture], {
      env: { ...process.env, NEKO_SQLITE_TEST_HOME: homedir },
    });

    const reopened = await createMarketLocalMetadataBinding({
      homedir,
      getWorkspaceTrustLevel: () => 'trusted',
    });
    expect(reopened.registry.get('@studio/extension-pack')).toEqual(extensionPackage);
    expect(reopened.registry.get('@studio/tui-pack')).toMatchObject({
      packageId: '@studio/tui-pack',
      installedPath: join(homedir, '.agents', 'skills', 'studio', 'tui-pack'),
      status: 'active',
    });
    await reopened.dispose();
  });
});

function createInstalledPackage(options: {
  readonly packageId: string;
  readonly name: string;
  readonly installedPath: string;
  readonly installedAt: number;
}): InstalledPackage {
  return {
    packageId: options.packageId,
    version: '1.0.0',
    type: 'skill',
    installedAt: options.installedAt,
    installedPath: options.installedPath,
    manifest: {
      id: options.packageId,
      name: options.name,
      version: '1.0.0',
      type: 'skill',
      source: {
        kind: 'registry',
        registry: 'official',
        package: options.packageId,
        version: '1.0.0',
        integrity: `sha256-${options.name}`,
      },
      distributionKind: 'archive',
      typeMetadata: { type: 'skill', data: { domain: ['testing'] } },
      intent: { useCases: ['host parity'] },
      createdAt: options.installedAt,
      updatedAt: options.installedAt,
    },
    enabled: true,
    requested: true,
    status: 'active',
  };
}
