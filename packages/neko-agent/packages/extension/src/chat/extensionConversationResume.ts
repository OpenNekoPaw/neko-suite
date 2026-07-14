import {
  createNodeSqliteConversationStorage,
  migrateLegacyConversationCatalog,
  SqliteTaskRecoveryStorage,
  SqliteTaskStorage,
  type ConversationCatalogMigrationReport,
  type ConversationRecord,
  type ConversationResumeStorage,
} from '@neko/agent';
import {
  LocalMetadataResourceCacheManifestStore,
  createLocalMetadataRevisionCursor,
  resolveGlobalStorageLayout,
  resolveStorageLayout,
  type CatalogProjectionRepository,
  type LocalMetadataRevisionCursorPollResult,
  type EntityAssetProjectionRepository,
  type LocalMetadataPartition,
  type LocalMetadataPartitionRevision,
  type ResourceCacheManifestStore,
  type SearchDocumentRepository,
  type SemanticProjectionRepository,
  type WorkspaceStorageInspectionReport,
} from '@neko/shared';
import {
  migrateLegacyAssetGraph,
  migrateLegacyProxyManifest,
  migrateLegacyResourceCacheManifest,
  migrateLegacySemanticIndexSidecars,
  inspectWorkspaceStorage,
  type LegacyAssetGraphMigrationReport,
  type ProxyManifestMigrationReport,
  type ResourceCacheManifestMigrationReport,
  type SemanticIndexSidecarMigrationReport,
} from '@neko/shared/local-metadata/node';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  AGENT_STATE_MIGRATIONS,
  CATALOG_PROJECTION_MIGRATIONS,
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  RESOURCE_CACHE_MIGRATIONS,
  SEARCH_PROJECTION_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { join } from 'node:path';

export interface ExtensionConversationResumeBinding {
  readonly storage: ConversationResumeStorage;
  readonly initialRecords: readonly ConversationRecord[];
  readonly migrationReport: ConversationCatalogMigrationReport;
  readonly workspaceId: string;
  readonly taskStorage: SqliteTaskStorage;
  readonly taskRecoveryStorage: SqliteTaskRecoveryStorage;
  readonly workspaceResourceCacheManifestStore: ResourceCacheManifestStore;
  readonly globalResourceCacheManifestStore: ResourceCacheManifestStore;
  readonly resourceCacheMigrationReport: ResourceCacheManifestMigrationReport;
  readonly proxyMigrationReport: ProxyManifestMigrationReport;
  readonly searchPartition: LocalMetadataPartition;
  readonly semanticPartition: LocalMetadataPartition;
  readonly entityAssetPartition: LocalMetadataPartition;
  readonly searchDocuments: SearchDocumentRepository;
  readonly semanticProjections: SemanticProjectionRepository;
  readonly entityAssetProjections: EntityAssetProjectionRepository;
  readonly catalogItems: CatalogProjectionRepository;
  readonly workspaceStorageInspection: WorkspaceStorageInspectionReport;
  readonly semanticMigrationReport: SemanticIndexSidecarMigrationReport;
  readonly entityAssetMigrationReport: LegacyAssetGraphMigrationReport;
  readSearchRevision(): Promise<LocalMetadataPartitionRevision | null>;
  readEntityAssetRevision(): Promise<LocalMetadataPartitionRevision | null>;
  pollRevisions(): Promise<LocalMetadataRevisionCursorPollResult>;
  disposeHost(): Promise<void>;
}

export async function createExtensionConversationResume(options: {
  readonly homedir: string;
  readonly workDir: string;
}): Promise<ExtensionConversationResumeBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(AGENT_STATE_MIGRATIONS);
    await metadataStore.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
    await metadataStore.migrateNamespace(CATALOG_PROJECTION_MIGRATIONS);
    const binding = await createNodeSqliteConversationStorage({
      homedir: options.homedir,
      workDir: options.workDir,
      source: 'vscode',
      metadataStore,
    });
    const migrationReport = await migrateLegacyConversationCatalog({
      homedir: options.homedir,
      workDir: options.workDir,
      workspaceId: binding.workspaceIdentity.workspaceId,
      metadataStore,
    });
    const taskStorage = new SqliteTaskStorage({
      workspaceId: binding.workspaceIdentity.workspaceId,
      metadataStore,
    });
    const taskRecoveryStorage = new SqliteTaskRecoveryStorage({
      workspaceId: binding.workspaceIdentity.workspaceId,
      metadataStore,
    });
    const revisionCursor = createLocalMetadataRevisionCursor({
      store: metadataStore,
      workspaceId: binding.workspaceIdentity.workspaceId,
      domains: ['conversations', 'tasks', 'catalog', 'entity-asset-projection'],
    });
    await revisionCursor.initialize();
    const workspaceResourceCacheManifestStore = new LocalMetadataResourceCacheManifestStore({
      metadataStore,
      partition: {
        scope: 'workspace',
        workspaceId: binding.workspaceIdentity.workspaceId,
        domain: 'resource-cache',
      },
      projectRoot: options.workDir,
    });
    const globalResourceCacheManifestStore = new LocalMetadataResourceCacheManifestStore({
      metadataStore,
      partition: { scope: 'global', workspaceId: null, domain: 'resource-cache' },
    });
    const storageLayout = resolveStorageLayout(options.workDir, options.homedir);
    const resourceCacheMigrationReport = await migrateLegacyResourceCacheManifest({
      manifestPath: storageLayout.project.local.cache.resourceManifest,
      cacheRoot: storageLayout.project.local.cache.resources,
      manifestStore: workspaceResourceCacheManifestStore,
    });
    const proxyMigrationReport = await migrateLegacyProxyManifest({
      manifestPath: storageLayout.project.local.cache.proxyManifest,
      workDir: options.workDir,
      legacyProxyRoot: storageLayout.project.local.cache.proxies,
      resourceCacheRoot: storageLayout.project.local.cache.resources,
      manifestStore: workspaceResourceCacheManifestStore,
    });
    const searchPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: binding.workspaceIdentity.workspaceId,
      domain: 'project-search',
    };
    const semanticPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: binding.workspaceIdentity.workspaceId,
      domain: 'semantic-projection',
    };
    const entityAssetPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: binding.workspaceIdentity.workspaceId,
      domain: 'entity-asset-projection',
    };
    const semanticMigrationReport = await migrateLegacySemanticIndexSidecars({
      semanticIndexRoot: join(options.workDir, '.neko', 'semantic-index'),
      partition: semanticPartition,
      repository: metadataStore.repositories.semanticProjections,
    });
    const entityAssetMigrationReport = await migrateLegacyAssetGraph({
      assetGraphPath: storageLayout.project.local.cache.assetGraph,
      partition: entityAssetPartition,
      repository: metadataStore.repositories.entityAssetProjections,
    });
    const workspaceStorageInspection = await inspectWorkspaceStorage({
      workDir: options.workDir,
    });
    return {
      storage: binding.storage,
      initialRecords: await binding.storage.list(),
      migrationReport,
      workspaceId: binding.workspaceIdentity.workspaceId,
      taskStorage,
      taskRecoveryStorage,
      workspaceResourceCacheManifestStore,
      globalResourceCacheManifestStore,
      resourceCacheMigrationReport,
      proxyMigrationReport,
      searchPartition,
      semanticPartition,
      entityAssetPartition,
      searchDocuments: metadataStore.repositories.searchDocuments,
      semanticProjections: metadataStore.repositories.semanticProjections,
      entityAssetProjections: metadataStore.repositories.entityAssetProjections,
      catalogItems: metadataStore.repositories.catalogItems,
      workspaceStorageInspection,
      semanticMigrationReport,
      entityAssetMigrationReport,
      readSearchRevision: () => metadataStore.readPartitionRevision(searchPartition),
      readEntityAssetRevision: () => metadataStore.readPartitionRevision(entityAssetPartition),
      pollRevisions: () => revisionCursor.poll(),
      disposeHost: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
