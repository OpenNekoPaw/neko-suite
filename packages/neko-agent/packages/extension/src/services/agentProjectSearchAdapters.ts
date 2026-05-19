import * as path from 'path';
import * as vscode from 'vscode';
import type {
  NekoStoryAPI,
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
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityRow,
  isDashboardCreativeEntitySourceStatus,
  isDashboardCreativeEntitySnapshot,
  isDashboardCreativeEntitySource,
  toDashboardCreativeEntityId,
  type DashboardCreativeEntityRow,
  type DashboardCreativeEntitySourceRequest,
  type DashboardCreativeEntityState,
  type DashboardCreativeEntitySource,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  createCompatibilityProjectSearchAdapters,
  type CompatibilityProjectSearchAdaptersOptions,
} from '@neko/search/host-vscode';
import { buildProjectSearchText, matchesProjectSearchItem } from '@neko/search/core';
import { createEntitySearchAdapter } from '@neko/entity/projections';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';

export interface AgentEntitySearchAdapterFactoryOptions {
  readonly projectRoot: string;
  readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
}

export type AgentDashboardCreativeEntitySourceRequest = DashboardCreativeEntitySourceRequest;

export interface AgentProjectSearchAdapterDependencies {
  readonly createCompatibilityAdapters?: (
    options: CompatibilityProjectSearchAdaptersOptions,
  ) => readonly ProjectSearchAdapter[];
  readonly createEntityAdapter?: (
    options: AgentEntitySearchAdapterFactoryOptions,
  ) => ProjectSearchAdapter;
  readonly loadDashboardCreativeEntitySources?: (
    request: AgentDashboardCreativeEntitySourceRequest,
  ) => Promise<readonly DashboardCreativeEntitySource[]>;
  readonly loadDashboardCreativeEntityState?: (
    request: AgentDashboardCreativeEntitySourceRequest,
  ) => Promise<DashboardCreativeEntityState | undefined>;
  readonly readTextFile?: (filePath: string) => Promise<string>;
  readonly getStoryApi?: () => NekoStoryAPI | undefined;
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
      loadDashboardCreativeEntitySources:
        dependencies.loadDashboardCreativeEntitySources ??
        loadDashboardCreativeEntitySourcesFromCommands,
      loadDashboardCreativeEntityState:
        dependencies.loadDashboardCreativeEntityState ??
        loadDashboardCreativeEntityStateFromCommand,
      readTextFile: dependencies.readTextFile ?? readVSCodeTextFile,
      getStoryApi: dependencies.getStoryApi ?? getStoryApi,
      logger: options.logger,
    }),
  );

  return adapters;
}

class AgentCreativeEntityProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly entityAdaptersByProject = new Map<string, ProjectSearchAdapter>();
  private readonly dashboardSourceAdapter: ProjectSearchAdapter;
  private readonly contextScriptCandidateAdapter: ProjectSearchAdapter;

  constructor(
    private readonly options: {
      readonly compatibilityAdapters: readonly ProjectSearchAdapter[];
      readonly createEntityAdapter: (
        options: AgentEntitySearchAdapterFactoryOptions,
      ) => ProjectSearchAdapter;
      readonly loadDashboardCreativeEntitySources: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<readonly DashboardCreativeEntitySource[]>;
      readonly loadDashboardCreativeEntityState: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<DashboardCreativeEntityState | undefined>;
      readonly readTextFile: (filePath: string) => Promise<string>;
      readonly getStoryApi: () => NekoStoryAPI | undefined;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {
    this.dashboardSourceAdapter = new DashboardCreativeEntitySourceProjectSearchAdapter({
      loadSources: options.loadDashboardCreativeEntitySources,
      loadState: options.loadDashboardCreativeEntityState,
      logger: options.logger,
    });
    this.contextScriptCandidateAdapter = new ContextScriptEntityCandidateProjectSearchAdapter({
      readTextFile: options.readTextFile,
      getStoryApi: options.getStoryApi,
      logger: options.logger,
    });
  }

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
    this.dashboardSourceAdapter.dispose?.();
    this.contextScriptCandidateAdapter.dispose?.();
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
    const adapters: ProjectSearchAdapter[] = [
      ...this.options.compatibilityAdapters,
      this.dashboardSourceAdapter,
      this.contextScriptCandidateAdapter,
    ];
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

class DashboardCreativeEntitySourceProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  constructor(
    private readonly options: {
      readonly loadSources: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<readonly DashboardCreativeEntitySource[]>;
      readonly loadState: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<DashboardCreativeEntityState | undefined>;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {}

  async ensureInitialized(_projectRoot: string): Promise<void> {
    return undefined;
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    if (query.partitions && !query.partitions.includes(this.partition)) {
      return [];
    }
    const projectRoot = query.projectRoot ?? context.projectRoot;
    if (!projectRoot) return [];

    const request = {
      projectRoot,
      contextFilePath: context.resolvedContextFilePath ?? query.contextFilePath,
      contextUri: query.contextUri ?? context.contextUri,
    };
    const state = await this.loadState(request);
    const items: ProjectSearchItem[] = [];

    if (state && state.rows.length > 0) {
      items.push(...this.itemsFromRows(state.rows, projectRoot));
      this.statusByProject.set(projectRoot, {
        partition: this.partition,
        status: 'ready',
        freshness: aggregateStateFreshness(state, items),
        itemCount: items.length,
        updatedAt: new Date().toISOString(),
        provider: DASHBOARD_CREATIVE_ENTITY_PROVIDER,
      });
      return items.filter((item) => matchesProjectSearchItem(item, query));
    }

    const sources = await this.loadSources(request);
    const settled = await Promise.allSettled(sources.map(async (source) => source.getSnapshot()));

    settled.forEach((result, index) => {
      const source = sources[index];
      if (!source) return;
      if (result.status === 'rejected') {
        this.options.logger?.warn('Dashboard creative entity snapshot failed', {
          source: source.source,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        return;
      }
      if (!isDashboardCreativeEntitySnapshot(result.value)) {
        this.options.logger?.warn('Ignoring invalid dashboard creative entity snapshot', {
          source: source.source,
        });
        return;
      }
      items.push(...this.itemsFromRows(result.value.rows, projectRoot));
    });

    const filtered = items.filter((item) => matchesProjectSearchItem(item, query));
    this.statusByProject.set(projectRoot, {
      partition: this.partition,
      status: 'ready',
      freshness: aggregateItemFreshness(items),
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
      provider: DASHBOARD_CREATIVE_ENTITY_PROVIDER,
    });
    return filtered;
  }

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    this.statusByProject.delete(options.projectRoot);
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return (
      this.statusByProject.get(projectRoot) ?? {
        partition: this.partition,
        status: 'idle',
        freshness: 'stale',
        provider: DASHBOARD_CREATIVE_ENTITY_PROVIDER,
      }
    );
  }

  private async loadSources(
    request: AgentDashboardCreativeEntitySourceRequest,
  ): Promise<readonly DashboardCreativeEntitySource[]> {
    try {
      return await this.options.loadSources(request);
    } catch (error) {
      this.options.logger?.warn('Dashboard creative entity source discovery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async loadState(
    request: AgentDashboardCreativeEntitySourceRequest,
  ): Promise<DashboardCreativeEntityState | undefined> {
    try {
      return await this.options.loadState(request);
    } catch (error) {
      this.options.logger?.warn('Dashboard creative entity state discovery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private itemsFromRows(
    rows: readonly DashboardCreativeEntityRow[],
    projectRoot: string,
  ): readonly ProjectSearchItem[] {
    return rows
      .filter((row) => dashboardRowBelongsToProject(row, projectRoot))
      .map((row) => dashboardRowToSearchItem(row, projectRoot));
  }
}

class ContextScriptEntityCandidateProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  constructor(
    private readonly options: {
      readonly readTextFile: (filePath: string) => Promise<string>;
      readonly getStoryApi: () => NekoStoryAPI | undefined;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {}

  async ensureInitialized(_projectRoot: string): Promise<void> {
    return undefined;
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    if (query.partitions && !query.partitions.includes(this.partition)) {
      return [];
    }
    if (query.kinds && !query.kinds.includes('entity-candidate')) {
      return [];
    }

    const projectRoot = query.projectRoot ?? context.projectRoot;
    const contextFilePath = context.resolvedContextFilePath ?? query.contextFilePath;
    if (!projectRoot || !contextFilePath || !isStoryFile(contextFilePath)) {
      return [];
    }
    if (!isPathInside(contextFilePath, projectRoot)) {
      return [];
    }

    const text = await this.readTextFile(contextFilePath);
    if (!text) return [];

    const candidates = extractScriptCharacterCandidates(text, this.options.getStoryApi());
    const items = candidates.map((candidate) =>
      scriptCandidateToSearchItem(candidate, projectRoot, contextFilePath),
    );
    const filtered = items.filter((item) => matchesProjectSearchItem(item, query));
    this.statusByProject.set(projectRoot, {
      partition: this.partition,
      status: 'ready',
      freshness: 'fresh',
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
      provider: CONTEXT_SCRIPT_ENTITY_PROVIDER,
    });
    return filtered;
  }

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    this.statusByProject.delete(options.projectRoot);
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return (
      this.statusByProject.get(projectRoot) ?? {
        partition: this.partition,
        status: 'idle',
        freshness: 'stale',
        provider: CONTEXT_SCRIPT_ENTITY_PROVIDER,
      }
    );
  }

  private async readTextFile(filePath: string): Promise<string> {
    try {
      return await this.options.readTextFile(filePath);
    } catch (error) {
      this.options.logger?.warn('Failed to read context script for entity search', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
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
  if (isDashboardEntityProjection(candidate) && !isDashboardEntityProjection(current)) {
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

function isDashboardEntityProjection(item: ProjectSearchItem): boolean {
  return readString(item.navigationData?.['source']) === item.source.sourceId;
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

const DASHBOARD_CREATIVE_ENTITY_PROVIDER = {
  providerId: 'dashboard-creative-entities',
  modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
  itemKinds: ['creative-entity', 'entity-candidate'],
  partitions: ['creative-entities'],
} satisfies ProjectSearchProviderCapabilities;

const CONTEXT_SCRIPT_ENTITY_PROVIDER = {
  providerId: 'agent-context-script-entities',
  modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
  itemKinds: ['entity-candidate'],
  partitions: ['creative-entities'],
} satisfies ProjectSearchProviderCapabilities;

const DASHBOARD_SOURCE_COMMANDS = [
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
] as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dashboardRowBelongsToProject(
  row: DashboardCreativeEntityRow,
  projectRoot: string,
): boolean {
  if (!row.ref.projectRoot) return true;
  if (path.isAbsolute(row.ref.projectRoot)) {
    return normalizeLocalPath(row.ref.projectRoot) === normalizeLocalPath(projectRoot);
  }
  return true;
}

async function loadDashboardCreativeEntityStateFromCommand(
  request: AgentDashboardCreativeEntitySourceRequest,
): Promise<DashboardCreativeEntityState | undefined> {
  try {
    const candidate = await vscode.commands.executeCommand<unknown>(
      DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND,
      request,
    );
    return readDashboardCreativeEntitySearchState(candidate);
  } catch {
    return undefined;
  }
}

function readDashboardCreativeEntitySearchState(
  value: unknown,
): DashboardCreativeEntityState | undefined {
  if (!isRecord(value)) return undefined;
  const rows = value['rows'];
  const statuses = value['statuses'];
  if (!Array.isArray(rows) || !rows.every(isDashboardCreativeEntityRow)) {
    return undefined;
  }
  if (!Array.isArray(statuses) || !statuses.every(isDashboardCreativeEntitySourceStatus)) {
    return undefined;
  }
  return { rows, statuses };
}

async function loadDashboardCreativeEntitySourcesFromCommands(
  request: AgentDashboardCreativeEntitySourceRequest,
): Promise<readonly DashboardCreativeEntitySource[]> {
  const settled = await Promise.allSettled(
    DASHBOARD_SOURCE_COMMANDS.map((command) =>
      vscode.commands.executeCommand<unknown>(command, request),
    ),
  );
  return settled.flatMap((result) =>
    result.status === 'fulfilled' && isDashboardCreativeEntitySource(result.value)
      ? [result.value]
      : [],
  );
}

async function readVSCodeTextFile(filePath: string): Promise<string> {
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return new TextDecoder().decode(raw);
}

function getStoryApi(): NekoStoryAPI | undefined {
  try {
    const extension = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    return extension?.isActive ? extension.exports : undefined;
  } catch {
    return undefined;
  }
}

function dashboardRowToSearchItem(
  row: DashboardCreativeEntityRow,
  projectRoot: string,
): ProjectSearchItem {
  const entityKind = row.kind;
  return {
    id: `dashboard:${toDashboardCreativeEntityId(row.ref)}`,
    kind: row.status === 'candidate' ? 'entity-candidate' : 'creative-entity',
    label: row.label,
    description: row.summary ?? `${row.kind} · ${row.status}`,
    icon: iconForEntityKind(row.kind),
    source: {
      partition: 'creative-entities',
      sourceId: row.ref.source,
      sourceKind: row.sourceKind,
      refId: row.ref.entityId ?? row.ref.sourceEntityId,
      metadata: {
        entityKind,
        status: row.status,
        dashboardSourceKind: row.sourceKind,
      },
    },
    projectRoot,
    canonicalName: row.label,
    aliases: row.aliases,
    searchText: buildProjectSearchText([
      row.label,
      row.aliases,
      row.kind,
      row.status,
      row.sourceKind,
      row.summary,
      row.searchText,
    ]),
    navigationData: {
      source: row.ref.source,
      sourceEntityId: row.ref.sourceEntityId,
      ...(row.ref.entityId ? { entityId: row.ref.entityId } : {}),
      entityKind,
      status: row.status,
      sourceKind: row.sourceKind,
      ...(row.ref.workspaceFolder ? { workspaceFolder: row.ref.workspaceFolder } : {}),
      projectRoot,
    },
    freshness: row.freshness,
    metadata: {
      entityType: entityKind,
      entityKind,
      status: row.status,
      sourceKind: row.sourceKind,
      ...(row.occurrenceCount !== undefined ? { occurrenceCount: row.occurrenceCount } : {}),
    },
  };
}

interface ScriptEntityCandidate {
  readonly name: string;
  readonly firstLine?: number;
}

function extractScriptCharacterCandidates(
  text: string,
  storyApi: NekoStoryAPI | undefined,
): readonly ScriptEntityCandidate[] {
  const byName = new Map<string, ScriptEntityCandidate>();
  for (const candidate of extractLineBasedScriptCharacters(text)) {
    byName.set(candidate.name, candidate);
  }

  const parsed = safeParseStoryScript(storyApi, text);
  for (const element of parsed?.elements ?? []) {
    if (element.type !== 'character') continue;
    const name = normalizeScriptCharacterName(readString(element['name']) ?? element.text);
    if (!name || byName.has(name)) continue;
    byName.set(name, { name });
  }

  return [...byName.values()].sort((a, b) => {
    const lineA = a.firstLine ?? Number.MAX_SAFE_INTEGER;
    const lineB = b.firstLine ?? Number.MAX_SAFE_INTEGER;
    return lineA - lineB || a.name.localeCompare(b.name);
  });
}

function extractLineBasedScriptCharacters(text: string): readonly ScriptEntityCandidate[] {
  const byName = new Map<string, ScriptEntityCandidate>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /^\s*@(.+?)\s*$/.exec(line);
    const name = normalizeScriptCharacterName(match?.[1]);
    if (!name || byName.has(name)) return;
    byName.set(name, { name, firstLine: index });
  });
  return [...byName.values()];
}

function safeParseStoryScript(storyApi: NekoStoryAPI | undefined, text: string) {
  try {
    return storyApi?.parseScript(text);
  } catch {
    return undefined;
  }
}

function scriptCandidateToSearchItem(
  candidate: ScriptEntityCandidate,
  projectRoot: string,
  filePath: string,
): ProjectSearchItem {
  return {
    id: `context-script-entity:${filePath}:${candidate.name}`,
    kind: 'entity-candidate',
    label: candidate.name,
    description: 'Script character candidate',
    icon: '@',
    source: {
      partition: 'creative-entities',
      sourceId: 'agent-context-script',
      sourceKind: 'script',
      filePath,
      uri: vscode.Uri.file(filePath).toString(),
      projectRelativePath: path.relative(projectRoot, filePath),
      metadata: { entityKind: 'character', status: 'candidate' },
    },
    projectRoot,
    filePath,
    canonicalName: candidate.name,
    searchText: buildProjectSearchText([
      candidate.name,
      filePath,
      'character',
      'candidate',
      'script',
    ]),
    navigationData: {
      source: 'agent-context-script',
      candidateId: candidate.name,
      entityKind: 'character',
      status: 'candidate',
      filePath,
      ...(candidate.firstLine !== undefined ? { line: candidate.firstLine } : {}),
    },
    freshness: 'fresh',
    metadata: {
      entityType: 'character',
      entityKind: 'character',
      status: 'candidate',
    },
  };
}

function normalizeScriptCharacterName(value: string | undefined): string | undefined {
  const name = value?.trim().replace(/^@+/, '').trim();
  return name ? name : undefined;
}

function isStoryFile(filePath: string): boolean {
  return filePath.endsWith('.fountain') || filePath.endsWith('.nks') || filePath.endsWith('.story');
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeLocalPath(value: string): string {
  return path.normalize(value);
}

function aggregateItemFreshness(items: readonly ProjectSearchItem[]): ProjectIndexFreshness {
  if (items.length === 0) return 'fresh';
  if (items.every((item) => item.freshness === 'failed')) return 'failed';
  if (items.some((item) => item.freshness === 'failed')) return 'partial';
  if (items.some((item) => item.freshness === 'building')) return 'building';
  if (items.some((item) => item.freshness === 'stale')) return 'stale';
  return 'fresh';
}

function aggregateStateFreshness(
  state: DashboardCreativeEntityState,
  items: readonly ProjectSearchItem[],
): ProjectIndexFreshness {
  const freshnessValues = [
    ...state.statuses.map((status) => status.freshness),
    ...items.map((item) => item.freshness),
  ];
  if (freshnessValues.length === 0) return 'fresh';
  if (freshnessValues.every((freshness) => freshness === 'failed')) return 'failed';
  if (freshnessValues.some((freshness) => freshness === 'failed')) return 'partial';
  if (freshnessValues.some((freshness) => freshness === 'building')) return 'building';
  if (freshnessValues.some((freshness) => freshness === 'stale')) return 'stale';
  return 'fresh';
}

function iconForEntityKind(kind: string): string {
  if (kind === 'character') return '@';
  if (kind === 'scene') return '#';
  if (kind === 'location') return 'location';
  if (kind === 'object') return 'object';
  if (kind === 'style') return 'style';
  if (kind === 'action') return 'action';
  return 'entity';
}
