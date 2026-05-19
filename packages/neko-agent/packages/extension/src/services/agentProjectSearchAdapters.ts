import type {
  ProjectIndexFreshness,
  ProjectIndexPartitionStatus,
  ProjectSearchAdapter,
  ProjectSearchAdapterRefreshOptions,
  ProjectSearchItem,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchProviderCapabilities,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
} from '@neko/shared';
import {
  createCompatibilityProjectSearchAdapters,
  type CompatibilityProjectSearchAdaptersOptions,
} from '@neko/search/host-vscode';
import { createEntitySearchAdapter } from '@neko/entity/projections';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';

export interface AgentEntitySearchAdapterFactoryOptions {
  readonly projectRoot: string;
  readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
}

export interface AgentProjectSearchAdapterDependencies {
  readonly createCompatibilityAdapters?: (
    options: CompatibilityProjectSearchAdaptersOptions,
  ) => readonly ProjectSearchAdapter[];
  readonly createEntityAdapter?: (
    options: AgentEntitySearchAdapterFactoryOptions,
  ) => ProjectSearchAdapter;
}

export function createAgentProjectSearchAdapters(
  options: CompatibilityProjectSearchAdaptersOptions = {},
  dependencies: AgentProjectSearchAdapterDependencies = {},
): readonly ProjectSearchAdapter[] {
  const createCompatibilityAdapters =
    dependencies.createCompatibilityAdapters ?? createCompatibilityProjectSearchAdapters;
  const createEntityAdapter = dependencies.createEntityAdapter ?? createDefaultEntitySearchAdapter;
  const compatibilityAdapters = createCompatibilityAdapters(options);
  const creativeEntityCompatibilityAdapters: ProjectSearchAdapter[] = [];
  const adapters: ProjectSearchAdapter[] = [];

  for (const adapter of compatibilityAdapters) {
    if (adapter.partition === 'creative-entities') {
      creativeEntityCompatibilityAdapters.push(adapter);
      continue;
    }
    adapters.push(adapter);
  }

  adapters.push(
    new AgentCreativeEntityProjectSearchAdapter({
      compatibilityAdapters: creativeEntityCompatibilityAdapters,
      createEntityAdapter,
      logger: options.logger,
    }),
  );

  return adapters;
}

class AgentCreativeEntityProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly entityAdaptersByProject = new Map<string, ProjectSearchAdapter>();

  constructor(
    private readonly options: {
      readonly compatibilityAdapters: readonly ProjectSearchAdapter[];
      readonly createEntityAdapter: (
        options: AgentEntitySearchAdapterFactoryOptions,
      ) => ProjectSearchAdapter;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {}

  async ensureInitialized(projectRoot: string): Promise<void> {
    const adapters = this.adaptersForProjectRoot(projectRoot);
    await this.runSettled('ensureInitialized', adapters, (adapter) =>
      adapter.ensureInitialized(projectRoot),
    );
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    if (query.partitions && !query.partitions.includes(this.partition)) {
      return [];
    }

    const adapters = this.adaptersForQuery(query, context);
    const settled = await Promise.allSettled(
      adapters.map((adapter) => adapter.query(query, context)),
    );
    const items: ProjectSearchItem[] = [];

    settled.forEach((result, index) => {
      const adapter = adapters[index];
      if (!adapter) return;
      if (result.status === 'fulfilled') {
        items.push(...result.value);
        return;
      }
      this.logAdapterFailure('query', adapter, result.reason);
    });

    return dedupeCreativeEntityItems(items);
  }

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    const adapters = this.adaptersForProjectRoot(options.projectRoot);
    await this.runSettled(
      'refresh',
      adapters,
      (adapter) => adapter.refresh?.(options) ?? adapter.ensureInitialized(options.projectRoot),
    );
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    const snapshots = this.adaptersForProjectRoot(projectRoot).map((adapter) =>
      adapter.getStatus(projectRoot),
    );
    return aggregateCreativeEntityStatus(snapshots);
  }

  dispose(): void {
    for (const adapter of this.options.compatibilityAdapters) {
      adapter.dispose?.();
    }
    for (const adapter of this.entityAdaptersByProject.values()) {
      adapter.dispose?.();
    }
    this.entityAdaptersByProject.clear();
  }

  private adaptersForQuery(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): readonly ProjectSearchAdapter[] {
    return this.adaptersForProjectRoot(query.projectRoot ?? context.projectRoot);
  }

  private adaptersForProjectRoot(projectRoot: string | undefined): readonly ProjectSearchAdapter[] {
    const adapters: ProjectSearchAdapter[] = [...this.options.compatibilityAdapters];
    if (projectRoot) {
      adapters.push(this.entityAdapterForProject(projectRoot));
    }
    return adapters;
  }

  private entityAdapterForProject(projectRoot: string): ProjectSearchAdapter {
    const existing = this.entityAdaptersByProject.get(projectRoot);
    if (existing) return existing;

    const adapter = this.options.createEntityAdapter({
      projectRoot,
      logger: this.options.logger,
    });
    this.entityAdaptersByProject.set(projectRoot, adapter);
    return adapter;
  }

  private async runSettled(
    operation: string,
    adapters: readonly ProjectSearchAdapter[],
    run: (adapter: ProjectSearchAdapter) => Promise<void>,
  ): Promise<void> {
    const settled = await Promise.allSettled(adapters.map((adapter) => run(adapter)));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      const adapter = adapters[index];
      if (!adapter) return;
      this.logAdapterFailure(operation, adapter, result.reason);
    });
  }

  private logAdapterFailure(
    operation: string,
    adapter: ProjectSearchAdapter,
    error: unknown,
  ): void {
    this.options.logger?.warn('Creative entity search adapter failed', {
      operation,
      partition: adapter.partition,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function createDefaultEntitySearchAdapter(
  options: AgentEntitySearchAdapterFactoryOptions,
): ProjectSearchAdapter {
  const { service } = createVSCodeEntityServices({
    projectRoot: options.projectRoot,
    logger: options.logger,
  });
  return createEntitySearchAdapter({
    projectRoot: options.projectRoot,
    service,
    providerId: 'neko-entity',
  });
}

function dedupeCreativeEntityItems(
  items: readonly ProjectSearchItem[],
): readonly ProjectSearchItem[] {
  const byKey = new Map<string, ProjectSearchItem>();

  for (const item of items) {
    const key = dedupeKeyForProjectSearchItem(item);
    const existing = byKey.get(key);
    if (!existing || shouldPreferProjectSearchItem(item, existing)) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()];
}

function dedupeKeyForProjectSearchItem(item: ProjectSearchItem): string {
  if (item.kind === 'creative-entity') {
    const entityKind =
      readString(item.source.metadata?.['entityKind']) ??
      readString(item.metadata?.['entityType']) ??
      item.source.sourceKind ??
      '';
    const name = normalizeSearchIdentity(item.canonicalName ?? item.label);
    if (name) {
      return `${item.kind}:${item.projectRoot}:${entityKind}:${name}`;
    }
  }
  return `id:${item.id}`;
}

function shouldPreferProjectSearchItem(
  candidate: ProjectSearchItem,
  current: ProjectSearchItem,
): boolean {
  if (isUnifiedEntityProjection(candidate) && !isUnifiedEntityProjection(current)) {
    return true;
  }
  return candidate.freshness === 'fresh' && current.freshness !== 'fresh';
}

function isUnifiedEntityProjection(item: ProjectSearchItem): boolean {
  return (
    item.source.sourceId === 'neko-entity' ||
    readString(item.navigationData?.['source']) === 'neko-entity'
  );
}

function aggregateCreativeEntityStatus(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): ProjectSearchPartitionStatusSnapshot {
  const itemCount = sumItemCount(snapshots);
  const updatedAt = latestUpdatedAt(snapshots);
  return {
    partition: 'creative-entities',
    status: aggregatePartitionStatus(snapshots),
    freshness: aggregateFreshness(snapshots),
    ...(itemCount !== undefined ? { itemCount } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    provider: COMBINED_CREATIVE_ENTITY_PROVIDER,
  };
}

const COMBINED_CREATIVE_ENTITY_PROVIDER = {
  providerId: 'agent-creative-entities',
  modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
  itemKinds: ['creative-entity', 'entity-candidate', 'generated-asset'],
  partitions: ['creative-entities'],
} satisfies ProjectSearchProviderCapabilities;

function aggregatePartitionStatus(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): ProjectIndexPartitionStatus {
  if (snapshots.length === 0) return 'idle';
  if (snapshots.every((snapshot) => snapshot.status === 'failed')) return 'failed';
  if (snapshots.some((snapshot) => snapshot.status === 'loading')) return 'loading';
  if (snapshots.some((snapshot) => snapshot.status === 'building')) return 'building';
  if (snapshots.some((snapshot) => snapshot.status === 'ready')) return 'ready';
  if (snapshots.some((snapshot) => snapshot.status === 'stale')) return 'stale';
  return 'idle';
}

function aggregateFreshness(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): ProjectIndexFreshness {
  if (snapshots.length === 0) return 'stale';
  if (snapshots.every((snapshot) => snapshot.freshness === 'failed')) return 'failed';
  if (snapshots.some((snapshot) => snapshot.freshness === 'failed')) return 'partial';
  if (snapshots.some((snapshot) => snapshot.freshness === 'building')) return 'building';
  if (snapshots.some((snapshot) => snapshot.freshness === 'stale')) return 'stale';
  return 'fresh';
}

function sumItemCount(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): number | undefined {
  let total = 0;
  let hasCount = false;
  for (const snapshot of snapshots) {
    if (snapshot.itemCount === undefined) continue;
    total += snapshot.itemCount;
    hasCount = true;
  }
  return hasCount ? total : undefined;
}

function latestUpdatedAt(
  snapshots: readonly ProjectSearchPartitionStatusSnapshot[],
): string | undefined {
  return snapshots
    .map((snapshot) => snapshot.updatedAt)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort()
    .at(-1);
}

function normalizeSearchIdentity(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
