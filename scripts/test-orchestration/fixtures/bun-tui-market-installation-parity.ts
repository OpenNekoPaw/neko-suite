import { join } from 'node:path';
import type { InstalledPackage } from '@neko/shared';
import { createTuiMarketStorage } from '../../../apps/neko-tui/src/tui/host/tui-market-storage';

const homedir = process.env['NEKO_SQLITE_TEST_HOME'];
if (!homedir) throw new Error('NEKO_SQLITE_TEST_HOME is required');

const binding = await createTuiMarketStorage({ homedir });
try {
  const extensionPackage = binding.registry.get('@studio/extension-pack');
  if (
    extensionPackage?.installedPath !==
    join(homedir, '.agents', 'skills', 'studio', 'extension-pack')
  ) {
    throw new Error('Bun TUI could not read the Extension Market installation');
  }

  await binding.registry.add(createTuiPackage(homedir));
} finally {
  await binding.dispose();
}

function createTuiPackage(home: string): InstalledPackage {
  const installedAt = 1_786_000_100_000;
  return {
    packageId: '@studio/tui-pack',
    version: '1.0.0',
    type: 'skill',
    installedAt,
    installedPath: join(home, '.agents', 'skills', 'studio', 'tui-pack'),
    manifest: {
      id: '@studio/tui-pack',
      name: 'tui-pack',
      version: '1.0.0',
      type: 'skill',
      source: {
        kind: 'registry',
        registry: 'official',
        package: '@studio/tui-pack',
        version: '1.0.0',
        integrity: 'sha256-tui-pack',
      },
      distributionKind: 'archive',
      typeMetadata: { type: 'skill', data: { domain: ['testing'] } },
      intent: { useCases: ['host parity'] },
      createdAt: installedAt,
      updatedAt: installedAt,
    },
    enabled: true,
    requested: true,
    status: 'active',
  };
}
