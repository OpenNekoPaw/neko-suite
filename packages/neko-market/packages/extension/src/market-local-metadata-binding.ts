import { join } from 'node:path';
import { LocalMetadataInstalledRegistry } from '@neko/market-core';
import { resolveGlobalStorageLayout, type WorkspaceTrustLevel } from '@neko/shared';
import { PathResolver } from '@neko/shared/path';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  M1_LOCAL_METADATA_MIGRATIONS,
  MARKET_INSTALLATION_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';

export interface MarketLocalMetadataBinding {
  readonly registry: LocalMetadataInstalledRegistry;
  dispose(): Promise<void>;
}

export async function createMarketLocalMetadataBinding(options: {
  readonly homedir: string;
  readonly getWorkspaceTrustLevel: () => WorkspaceTrustLevel;
}): Promise<MarketLocalMetadataBinding> {
  const layout = resolveGlobalStorageLayout(options.homedir);
  const store = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
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
      {
        trustSource: 'vscode-workspace',
        getTrustLevel: options.getWorkspaceTrustLevel,
      },
    );
    await registry.load();
    return { registry, dispose: () => store.dispose() };
  } catch (error) {
    await store.dispose();
    throw error;
  }
}
