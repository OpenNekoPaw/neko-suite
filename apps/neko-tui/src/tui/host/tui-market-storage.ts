import { join } from 'node:path';
import { LocalMetadataInstalledRegistry } from '@neko/market-core';
import { resolveGlobalStorageLayout } from '@neko/shared';
import { PathResolver } from '@neko/shared/path';
import {
  M1_LOCAL_METADATA_MIGRATIONS,
  MARKET_INSTALLATION_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { createTuiLocalMetadataStore } from './tui-local-metadata-store';

export interface TuiMarketStorage {
  readonly registry: LocalMetadataInstalledRegistry;
  readonly cacheDir: string;
  readonly skillsBase: string;
  dispose(): Promise<void>;
}

export async function createTuiMarketStorage(options: {
  readonly homedir: string;
}): Promise<TuiMarketStorage> {
  const layout = resolveGlobalStorageLayout(options.homedir);
  const store = await createTuiLocalMetadataStore(options.homedir);
  try {
    await store.open({ databasePath: layout.database, busyTimeoutMs: 2_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(MARKET_INSTALLATION_MIGRATIONS);
    const registry = new LocalMetadataInstalledRegistry(
      store.repositories.marketInstallations,
      new PathResolver(
        new Map([
          ['HOME', options.homedir],
          ['NEKO_HOME', join(options.homedir, '.neko')],
        ]),
      ),
      { trustSource: 'tui-policy', getTrustLevel: () => 'restricted' },
    );
    await registry.load();
    return {
      registry,
      cacheDir: layout.marketCache,
      skillsBase: layout.skills,
      dispose: () => store.dispose(),
    };
  } catch (error) {
    await store.dispose();
    throw error;
  }
}
