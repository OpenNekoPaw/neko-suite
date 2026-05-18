// =============================================================================
// Project Cache/Search Contracts
// =============================================================================

export type ProjectSearchItemKind =
  | 'story-scene'
  | 'story-section'
  | 'script-role'
  | 'creative-entity'
  | 'entity-candidate'
  | 'asset'
  | 'media'
  | 'document'
  | 'generated-asset';

export type ProjectSearchPartitionKind =
  | 'story-symbols'
  | 'creative-entities'
  | 'asset-library'
  | 'media-library'
  | 'documents'
  | 'generated-assets';

export type ProjectIndexFreshness = 'fresh' | 'stale' | 'building' | 'partial' | 'failed';

export type ProjectIndexPartitionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'building'
  | 'stale'
  | 'failed';

export type ProjectSearchFreshnessPolicy = 'allow-stale' | 'fresh-only';

export type ProjectSearchMode =
  | 'mention'
  | 'global'
  | 'asset-picker'
  | 'entity-picker'
  | 'document'
  | 'agent-tool';

export type ProjectSearchScopeKind =
  | 'project'
  | 'workspace'
  | 'media-library'
  | 'document'
  | 'current-file';

export interface ProjectSearchScope {
  readonly kind: ProjectSearchScopeKind;
  readonly id?: string;
  readonly filePath?: string;
  readonly uri?: string;
}

export interface ProjectSemanticProviderMetadata {
  readonly providerId: string;
  readonly model?: string;
  readonly modelVersion?: string;
  readonly chunkingVersion?: string;
  readonly sourceIdentity?: string;
  readonly indexVersion?: string;
}

export interface ProjectSearchProviderCapabilities {
  readonly providerId?: string;
  readonly semantic?: boolean;
  readonly vector?: boolean;
  readonly rag?: boolean;
  readonly modes?: readonly ProjectSearchMode[];
  readonly itemKinds?: readonly ProjectSearchItemKind[];
  readonly partitions?: readonly ProjectSearchPartitionKind[];
}

export type ProjectIndexUpdateReason =
  | 'project-open'
  | 'manual-refresh'
  | 'document-change'
  | 'file-create'
  | 'file-change'
  | 'file-delete'
  | 'settings-change'
  | 'asset-change'
  | 'entity-change'
  | 'generated-index-change'
  | 'cache-load'
  | 'cache-rebuild';

export interface ProjectSearchSourceRef {
  readonly partition: ProjectSearchPartitionKind;
  readonly sourceId?: string;
  readonly sourceKind?: string;
  readonly refId?: string;
  readonly filePath?: string;
  readonly uri?: string;
  readonly projectRelativePath?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectSearchScoreHints {
  readonly priority?: number;
  readonly exact?: boolean;
  readonly currentProject?: boolean;
  readonly sourceOrder?: number;
  readonly recentlyUsed?: boolean;
}

export interface ProjectSearchItem {
  readonly id: string;
  readonly kind: ProjectSearchItemKind;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly source: ProjectSearchSourceRef;
  readonly projectRoot: string;
  readonly filePath?: string;
  readonly canonicalName?: string;
  readonly aliases?: readonly string[];
  readonly searchText: string;
  readonly scoreHints?: ProjectSearchScoreHints;
  readonly navigationData?: Record<string, unknown>;
  readonly thumbnailUri?: string;
  readonly freshness: ProjectIndexFreshness;
  readonly metadata?: Record<string, unknown>;
}

export interface ProjectSearchQuery {
  readonly text: string;
  readonly mode?: ProjectSearchMode;
  readonly contextFilePath?: string;
  readonly contextUri?: string;
  readonly projectRoot?: string;
  readonly kinds?: readonly ProjectSearchItemKind[];
  readonly partitions?: readonly ProjectSearchPartitionKind[];
  readonly fileTypes?: readonly string[];
  readonly mediaTypes?: readonly string[];
  readonly scopes?: readonly ProjectSearchScope[];
  readonly limit?: number;
  readonly freshness?: ProjectSearchFreshnessPolicy;
}

export interface ProjectSearchQueryContext {
  readonly projectRoot?: string;
  readonly resolvedContextFilePath?: string;
  readonly contextUri?: string;
  readonly fallbackDerived?: boolean;
}

export interface ProjectNormalizedSearchQuery {
  readonly raw: string;
  readonly normalized: string;
  readonly tokens: readonly string[];
}

export interface ProjectSearchPartitionStatusSnapshot {
  readonly partition: ProjectSearchPartitionKind;
  readonly status: ProjectIndexPartitionStatus;
  readonly freshness: ProjectIndexFreshness;
  readonly itemCount?: number;
  readonly generation?: number;
  readonly updatedAt?: string;
  readonly error?: string;
  readonly provider?: ProjectSearchProviderCapabilities;
  readonly semantic?: ProjectSemanticProviderMetadata;
}

export interface ProjectSearchResult {
  readonly query: ProjectSearchQuery;
  readonly context: ProjectSearchQueryContext;
  readonly items: readonly ProjectSearchItem[];
  readonly partitions: readonly ProjectSearchPartitionStatusSnapshot[];
  readonly freshness: ProjectIndexFreshness;
  readonly generation?: number;
}

export interface ProjectIndexChangedRef {
  readonly kind: ProjectSearchItemKind | ProjectSearchPartitionKind | 'file' | 'settings';
  readonly id?: string;
  readonly filePath?: string;
  readonly uri?: string;
}

export interface ProjectIndexChangeEvent {
  readonly projectRoot: string;
  readonly partition?: ProjectSearchPartitionKind;
  readonly reason: ProjectIndexUpdateReason;
  readonly changedRefs: readonly ProjectIndexChangedRef[];
  readonly generation: number;
  readonly freshness: ProjectIndexFreshness;
  readonly updatedAt: string;
}

export interface ProjectSearchCachePartitionManifest {
  readonly partition: ProjectSearchPartitionKind;
  readonly version: number;
  readonly generation: number;
  readonly freshness: ProjectIndexFreshness;
  readonly itemCount: number;
  readonly sourceIdentity?: string;
  readonly updatedAt: string;
}

export interface ProjectSearchCacheManifest {
  readonly version: 1;
  readonly projectRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly generation: number;
  readonly sourceIdentity?: string;
  readonly partitions: readonly ProjectSearchCachePartitionManifest[];
}

export interface ProjectSearchAdapterRefreshOptions {
  readonly reason: ProjectIndexUpdateReason;
  readonly projectRoot: string;
  readonly changedRefs?: readonly ProjectIndexChangedRef[];
}

export interface ProjectSearchAdapter {
  readonly partition: ProjectSearchPartitionKind;
  ensureInitialized(projectRoot: string): Promise<void>;
  query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]>;
  refresh?(options: ProjectSearchAdapterRefreshOptions): Promise<void>;
  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot;
  dispose?(): void;
}

export const PROJECT_SEARCH_ITEM_KINDS: readonly ProjectSearchItemKind[] = [
  'story-scene',
  'story-section',
  'script-role',
  'creative-entity',
  'entity-candidate',
  'asset',
  'media',
  'document',
  'generated-asset',
] as const;

export const PROJECT_SEARCH_PARTITION_KINDS: readonly ProjectSearchPartitionKind[] = [
  'story-symbols',
  'creative-entities',
  'asset-library',
  'media-library',
  'documents',
  'generated-assets',
] as const;

export const PROJECT_INDEX_FRESHNESS_VALUES: readonly ProjectIndexFreshness[] = [
  'fresh',
  'stale',
  'building',
  'partial',
  'failed',
] as const;

export const PROJECT_INDEX_PARTITION_STATUS_VALUES: readonly ProjectIndexPartitionStatus[] = [
  'idle',
  'loading',
  'ready',
  'building',
  'stale',
  'failed',
] as const;

export const PROJECT_SEARCH_MODES: readonly ProjectSearchMode[] = [
  'mention',
  'global',
  'asset-picker',
  'entity-picker',
  'document',
  'agent-tool',
] as const;

export const PROJECT_SEARCH_SCOPE_KINDS: readonly ProjectSearchScopeKind[] = [
  'project',
  'workspace',
  'media-library',
  'document',
  'current-file',
] as const;

export function isProjectSearchItemKind(value: unknown): value is ProjectSearchItemKind {
  return includesString(PROJECT_SEARCH_ITEM_KINDS, value);
}

export function isProjectSearchPartitionKind(value: unknown): value is ProjectSearchPartitionKind {
  return includesString(PROJECT_SEARCH_PARTITION_KINDS, value);
}

export function isProjectIndexFreshness(value: unknown): value is ProjectIndexFreshness {
  return includesString(PROJECT_INDEX_FRESHNESS_VALUES, value);
}

export function isProjectIndexPartitionStatus(
  value: unknown,
): value is ProjectIndexPartitionStatus {
  return includesString(PROJECT_INDEX_PARTITION_STATUS_VALUES, value);
}

export function isProjectSearchMode(value: unknown): value is ProjectSearchMode {
  return includesString(PROJECT_SEARCH_MODES, value);
}

export function isProjectSearchScopeKind(value: unknown): value is ProjectSearchScopeKind {
  return includesString(PROJECT_SEARCH_SCOPE_KINDS, value);
}

export function isProjectSearchProviderCapabilities(
  value: unknown,
): value is ProjectSearchProviderCapabilities {
  if (!isRecord(value)) return false;
  return (
    optionalString(value['providerId']) &&
    optionalBoolean(value['semantic']) &&
    optionalBoolean(value['vector']) &&
    optionalBoolean(value['rag']) &&
    optionalProjectSearchModes(value['modes']) &&
    optionalProjectSearchKinds(value['itemKinds']) &&
    optionalProjectSearchPartitions(value['partitions'])
  );
}

export function isProjectSemanticProviderMetadata(
  value: unknown,
): value is ProjectSemanticProviderMetadata {
  if (!isRecord(value) || typeof value['providerId'] !== 'string') return false;
  return (
    optionalString(value['model']) &&
    optionalString(value['modelVersion']) &&
    optionalString(value['chunkingVersion']) &&
    optionalString(value['sourceIdentity']) &&
    optionalString(value['indexVersion'])
  );
}

export function isProjectSearchPartitionStatusSnapshot(
  value: unknown,
): value is ProjectSearchPartitionStatusSnapshot {
  if (!isRecord(value)) return false;
  return (
    isProjectSearchPartitionKind(value['partition']) &&
    isProjectIndexPartitionStatus(value['status']) &&
    isProjectIndexFreshness(value['freshness']) &&
    optionalNumber(value['itemCount']) &&
    optionalNumber(value['generation']) &&
    optionalString(value['updatedAt']) &&
    optionalString(value['error']) &&
    optionalProjectSearchProviderCapabilities(value['provider']) &&
    optionalProjectSemanticProviderMetadata(value['semantic'])
  );
}

export function isProjectSearchQuery(value: unknown): value is ProjectSearchQuery {
  if (!isRecord(value) || typeof value['text'] !== 'string') return false;
  return (
    optionalString(value['contextFilePath']) &&
    optionalString(value['contextUri']) &&
    optionalString(value['projectRoot']) &&
    optionalProjectSearchMode(value['mode']) &&
    optionalProjectSearchKinds(value['kinds']) &&
    optionalProjectSearchPartitions(value['partitions']) &&
    optionalStringArray(value['fileTypes']) &&
    optionalStringArray(value['mediaTypes']) &&
    optionalProjectSearchScopes(value['scopes']) &&
    optionalNumber(value['limit']) &&
    optionalFreshnessPolicy(value['freshness'])
  );
}

export function isProjectSearchItem(value: unknown): value is ProjectSearchItem {
  if (!isRecord(value) || !isRecord(value['source'])) return false;
  return (
    typeof value['id'] === 'string' &&
    isProjectSearchItemKind(value['kind']) &&
    typeof value['label'] === 'string' &&
    isProjectSearchPartitionKind(value['source']['partition']) &&
    typeof value['projectRoot'] === 'string' &&
    typeof value['searchText'] === 'string' &&
    isProjectIndexFreshness(value['freshness'])
  );
}

export function isProjectSearchCacheManifest(value: unknown): value is ProjectSearchCacheManifest {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    typeof value['projectRoot'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    typeof value['generation'] === 'number' &&
    optionalString(value['sourceIdentity']) &&
    Array.isArray(value['partitions']) &&
    value['partitions'].every((partition) => isProjectSearchCachePartitionManifest(partition))
  );
}

function isProjectSearchCachePartitionManifest(
  value: unknown,
): value is ProjectSearchCachePartitionManifest {
  if (!isRecord(value)) return false;
  return (
    isProjectSearchPartitionKind(value['partition']) &&
    typeof value['version'] === 'number' &&
    typeof value['generation'] === 'number' &&
    isProjectIndexFreshness(value['freshness']) &&
    typeof value['itemCount'] === 'number' &&
    optionalString(value['sourceIdentity']) &&
    typeof value['updatedAt'] === 'string'
  );
}

function optionalProjectSearchKinds(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchItemKind(item)))
  );
}

function optionalProjectSearchPartitions(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchPartitionKind(item)))
  );
}

function optionalProjectSearchMode(value: unknown): boolean {
  return value === undefined || isProjectSearchMode(value);
}

function optionalProjectSearchModes(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchMode(item)))
  );
}

function optionalProjectSearchScopes(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isProjectSearchScope(item)))
  );
}

function optionalProjectSearchProviderCapabilities(value: unknown): boolean {
  return value === undefined || isProjectSearchProviderCapabilities(value);
}

function optionalProjectSemanticProviderMetadata(value: unknown): boolean {
  return value === undefined || isProjectSemanticProviderMetadata(value);
}

function isProjectSearchScope(value: unknown): value is ProjectSearchScope {
  return (
    isRecord(value) &&
    isProjectSearchScopeKind(value['kind']) &&
    optionalString(value['id']) &&
    optionalString(value['filePath']) &&
    optionalString(value['uri'])
  );
}

function optionalFreshnessPolicy(value: unknown): boolean {
  return value === undefined || value === 'allow-stale' || value === 'fresh-only';
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalStringArray(value: unknown): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === 'number';
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
