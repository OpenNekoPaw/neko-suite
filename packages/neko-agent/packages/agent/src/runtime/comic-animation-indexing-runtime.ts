import type {
  ArtifactDiagnostic,
  ArtifactExecutionSummary,
  BatchExecutionItem,
  BatchExecutionPlan,
  CharacterStateChange,
  ComicAnimationDiagnostic,
  ComicAnimationIndexTask,
  ContinuityConstraint,
  CreativeEntityRef,
  IndexedRangeState,
  IndexTaskState,
  PerceptionCapabilityFacet,
  PlotEvent,
  ShotImagePrepDiagnostic,
  ShotImagePrepPlan,
  StoryContinuityLookbackLimit,
  StoryContinuityQuery,
  StoryContinuitySnapshot,
  VisualOccurrence,
} from '@neko/shared';
import {
  BATCH_EXECUTION_PLAN_KIND,
  COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
  INDEXED_RANGE_STATE_KIND,
  STORY_CONTINUITY_SNAPSHOT_KIND,
  createLocalOcrPerceptionCapabilityFacet,
  createLocalPanelDetectionPerceptionCapabilityFacet,
  createLocalReadingOrderPerceptionCapabilityFacet,
  createLocalSpeechBalloonMaskPerceptionCapabilityFacet,
  diagnosePerceptionCapabilityFacet,
  validateBatchExecutionPlan,
} from '@neko/shared';

export interface ComicAnimationAssetRegistrationInput {
  readonly assetId: string;
  readonly sourceRef: IndexedRangeState['rangeRef']['sourceRef'];
  readonly rangeId?: string;
  readonly rangeKind?: IndexedRangeState['rangeRef']['rangeKind'];
  readonly assetHash?: string;
  readonly tasks?: readonly ComicAnimationIndexTask[];
  readonly now?: string;
}

export interface IndexingTaskPlanningInput {
  readonly states: readonly IndexedRangeState[];
  readonly supportedTasks?: readonly ComicAnimationIndexTask[];
  readonly refresh?: boolean;
}

export interface IndexingTaskPlan {
  readonly reusableStates: readonly IndexedRangeState[];
  readonly scheduledTasks: readonly IndexTaskState[];
  readonly diagnostics: readonly ComicAnimationDiagnostic[];
}

export interface StoryContinuityStoreSnapshot {
  readonly events?: readonly PlotEvent[];
  readonly characterStates?: readonly CharacterStateChange[];
  readonly constraints?: readonly ContinuityConstraint[];
  readonly unresolvedQuestions?: readonly string[];
}

export interface StoryContinuityRuntimeOptions {
  readonly defaultLookbackLimit?: StoryContinuityLookbackLimit;
  readonly maxLookbackLimit?: StoryContinuityLookbackLimit;
}

export interface AssetIndexingBatchInput {
  readonly planId: string;
  readonly states: readonly IndexedRangeState[];
  readonly facets: readonly PerceptionCapabilityFacet[];
  readonly sourceArtifactRefs?: readonly string[];
  readonly approvalRequired?: boolean;
  readonly maxConcurrency?: number;
  readonly availableProviderIds?: readonly string[];
  readonly currentDeviceTier?: PerceptionCapabilityFacet['deviceTier'];
  readonly createdAt?: string;
}

export interface ShotImagePrepBatchPlanInput {
  readonly planId: string;
  readonly plans: readonly ShotImagePrepPlan[];
  readonly sourceArtifactRefs?: readonly string[];
  readonly approvalRequired?: boolean;
  readonly maxConcurrency?: number;
  readonly createdAt?: string;
}

export interface BatchExecutionRuntimeBackfillInput {
  readonly plan: BatchExecutionPlan;
  readonly completedItemIds?: readonly string[];
  readonly failedItemIds?: readonly string[];
  readonly skippedItemIds?: readonly string[];
  readonly cancelledItemIds?: readonly string[];
  readonly unavailableItemIds?: readonly string[];
  readonly outputRefsByItemId?: Readonly<Record<string, readonly string[]>>;
  readonly diagnostics?: readonly ComicAnimationDiagnostic[];
}

export interface ComicAnimationSidecarPaths {
  readonly semanticIndexRoot: '${PROJECT}/.neko/semantic-index';
  readonly memoryRoot: '${PROJECT}/.neko/memory';
  readonly runsRoot: '${PROJECT}/.neko/runs';
  readonly cacheRoot: '${PROJECT}/.neko/.cache';
}

export interface ComicAnimationSidecarRecord {
  readonly path: string;
  readonly recordKind:
    | 'semantic-evidence'
    | 'memory-fact'
    | 'run-artifact'
    | 'approval-record'
    | 'batch-summary';
  readonly content: unknown;
}

export interface ComicAnimationSidecarPort {
  read(path: string): Promise<unknown | undefined>;
  write(record: ComicAnimationSidecarRecord): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface ComicAnimationCacheProjectionPort {
  rebuildFromSidecars(records: readonly ComicAnimationSidecarRecord[]): Promise<void> | void;
  clearCache?(): Promise<void> | void;
}

export const COMIC_ANIMATION_SIDECAR_PATHS: ComicAnimationSidecarPaths = {
  semanticIndexRoot: '${PROJECT}/.neko/semantic-index',
  memoryRoot: '${PROJECT}/.neko/memory',
  runsRoot: '${PROJECT}/.neko/runs',
  cacheRoot: '${PROJECT}/.neko/.cache',
};

export function createDefaultComicAnimationPerceptionFacets(): readonly PerceptionCapabilityFacet[] {
  return [
    createLocalOcrPerceptionCapabilityFacet(),
    createLocalPanelDetectionPerceptionCapabilityFacet(),
    createLocalReadingOrderPerceptionCapabilityFacet(),
    createLocalSpeechBalloonMaskPerceptionCapabilityFacet(),
  ];
}

export function registerComicAnimationAsset(
  input: ComicAnimationAssetRegistrationInput,
): IndexedRangeState {
  const rangeId = input.rangeId ?? `${input.assetId}:${input.rangeKind ?? 'asset'}`;
  const tasks = input.tasks ?? ['ocr', 'panel-detection', 'reading-order'];
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: INDEXED_RANGE_STATE_KIND,
    rangeId,
    assetId: input.assetId,
    rangeRef: {
      rangeId,
      sourceRef: input.sourceRef,
      rangeKind: input.rangeKind ?? 'asset',
      ...(input.assetHash ? { assetHash: input.assetHash } : {}),
    },
    status: 'pending',
    tasks: tasks.map((task) => ({
      taskId: `${rangeId}:${task}`,
      task,
      status: 'pending',
      ...(input.assetHash ? { sourceHash: input.assetHash } : {}),
    })),
    ...(input.now ? { updatedAt: input.now } : {}),
  };
}

export function planComicAnimationIndexingTasks(
  input: IndexingTaskPlanningInput,
): IndexingTaskPlan {
  const supported = input.supportedTasks ? new Set(input.supportedTasks) : undefined;
  const scheduledTasks: IndexTaskState[] = [];
  const reusableStates: IndexedRangeState[] = [];
  const diagnostics: ComicAnimationDiagnostic[] = [];

  for (const state of input.states) {
    const reusableTasks = state.tasks.filter((task) => !shouldScheduleTask(task, input.refresh));
    if (reusableTasks.length === state.tasks.length) reusableStates.push(state);

    for (const task of state.tasks) {
      if (!shouldScheduleTask(task, input.refresh)) continue;
      if (supported && !supported.has(task.task)) {
        diagnostics.push(
          diagnostic(
            'warning',
            'provider-unavailable',
            ['states', state.rangeId, task.task],
            'No available perception provider supports this indexing task.',
          ),
        );
        continue;
      }
      scheduledTasks.push({
        ...task,
        status: task.status === 'running' ? 'running' : 'queued',
      });
    }
  }

  return { reusableStates, scheduledTasks, diagnostics };
}

export function isIndexedRangeTaskStale(input: {
  readonly task: IndexTaskState;
  readonly assetHash?: string;
  readonly providerId?: string;
  readonly modelVersion?: string;
  readonly refresh?: boolean;
}): boolean {
  if (input.refresh) return true;
  if (input.assetHash && input.task.sourceHash && input.task.sourceHash !== input.assetHash) {
    return true;
  }
  if (input.providerId && input.task.providerId && input.task.providerId !== input.providerId) {
    return true;
  }
  if (
    input.modelVersion &&
    input.task.modelVersion &&
    input.task.modelVersion !== input.modelVersion
  ) {
    return true;
  }
  return input.task.status === 'stale';
}

export function queryStoryContinuitySnapshot(
  store: StoryContinuityStoreSnapshot,
  query: StoryContinuityQuery,
  options: StoryContinuityRuntimeOptions = {},
): StoryContinuitySnapshot {
  const limits = clampLookbackLimit(
    query.lookbackLimit ?? options.defaultLookbackLimit ?? defaultContinuityLookbackLimit(),
    options.maxLookbackLimit ?? maxContinuityLookbackLimit(),
  );
  const characterIds = new Set((query.characterRefs ?? []).map((ref) => ref.entityId));
  const events = filterByStoryPosition(store.events ?? [], query)
    .filter((event) => matchesParticipants(event.participantRefs, characterIds))
    .slice(-limits.maxEvents!);
  const characterStates = filterByStoryPosition(store.characterStates ?? [], query)
    .filter((state) => characterIds.size === 0 || characterIds.has(state.characterRef.entityId))
    .slice(-limits.maxCharacterStates!);
  const constraints = (store.constraints ?? [])
    .filter((constraint) => matchesParticipants(constraint.entityRefs, characterIds))
    .slice(-limits.maxConstraints!);

  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: STORY_CONTINUITY_SNAPSHOT_KIND,
    snapshotId: query.queryId ?? `continuity:${query.storyPosition?.sceneId ?? 'current'}`,
    query,
    events,
    characterStates,
    constraints,
    unresolvedQuestions: store.unresolvedQuestions,
    limitsApplied: limits,
  };
}

export function createMentionResolverContinuityContext(snapshot: StoryContinuitySnapshot): {
  readonly snapshot: StoryContinuitySnapshot;
  readonly candidateEntityRefs: readonly CreativeEntityRef[];
  readonly readOnly: true;
} {
  const refs = new Map<string, CreativeEntityRef>();
  for (const event of snapshot.events) {
    for (const ref of event.participantRefs ?? []) refs.set(ref.entityId, ref);
  }
  for (const state of snapshot.characterStates)
    refs.set(state.characterRef.entityId, state.characterRef);
  for (const constraint of snapshot.constraints) {
    for (const ref of constraint.entityRefs ?? []) refs.set(ref.entityId, ref);
  }
  return {
    snapshot,
    candidateEntityRefs: Array.from(refs.values()),
    readOnly: true,
  };
}

export function createAssetIndexingBatchExecutionPlan(
  input: AssetIndexingBatchInput,
): BatchExecutionPlan {
  const availableProviderIds = input.availableProviderIds;
  const items: BatchExecutionItem[] = [];
  const diagnostics: ComicAnimationDiagnostic[] = [];

  for (const state of input.states) {
    for (const task of state.tasks) {
      const facet = input.facets.find((candidate) => candidate.tasks.includes(task.task));
      const itemDiagnostics = facet
        ? diagnosePerceptionCapabilityFacet(facet, {
            availableProviderIds,
            currentDeviceTier: input.currentDeviceTier,
            requireConfidenceForAutoBinding: true,
          })
        : [
            diagnostic(
              'warning',
              'provider-unavailable',
              ['items', state.rangeId, task.task],
              'No perception capability facet supports this task.',
            ),
          ];
      diagnostics.push(...itemDiagnostics);
      items.push({
        itemId: `${state.rangeId}:${task.task}`,
        targetRef: state.rangeId,
        capabilityId: `perception.${task.task}`,
        status: itemDiagnostics.some((item) => item.code === 'provider-unavailable')
          ? 'skipped'
          : 'planned',
        ...(facet ? { providerId: facet.providerId, requiredDeviceTier: facet.deviceTier } : {}),
        diagnostics: itemDiagnostics,
      });
    }
  }

  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: BATCH_EXECUTION_PLAN_KIND,
    planId: input.planId,
    ...(input.sourceArtifactRefs ? { sourceArtifactRefs: input.sourceArtifactRefs } : {}),
    targetDomain: 'asset-indexing',
    items,
    approvalPolicy: {
      requiresApproval:
        input.approvalRequired ??
        diagnostics.some(
          (item) => item.code === 'provider-unavailable' || item.code === 'low-confidence',
        ),
    },
    executionPolicy: {
      maxConcurrency: input.maxConcurrency ?? 1,
      failurePolicy: 'continue-approved-only',
      retryPolicy: {
        maxAttempts: 2,
        retryOn: ['provider-timeout', 'rate-limit', 'transient-error'],
      },
      allowCancellation: true,
    },
    costEstimate: { estimateState: 'unknown', diagnostics: [costUnknownDiagnostic()] },
    status: 'needs-approval',
    diagnostics: [...diagnostics, costUnknownDiagnostic()],
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
}

export function createShotImagePrepBatchExecutionPlan(
  input: ShotImagePrepBatchPlanInput,
): BatchExecutionPlan {
  const items: BatchExecutionItem[] = input.plans.map((plan) => ({
    itemId: plan.planId,
    targetRef: plan.planId,
    capabilityId: `shot-image-prep.${plan.imageStrategy}`,
    status: plan.status === 'approved' ? 'approved' : 'needs-approval',
    inputRefs: plan.sourceMediaRefs.map((ref) => ref.refId),
    diagnostics: plan.diagnostics?.map(mapShotImagePrepDiagnostic),
  }));
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: BATCH_EXECUTION_PLAN_KIND,
    planId: input.planId,
    ...(input.sourceArtifactRefs ? { sourceArtifactRefs: input.sourceArtifactRefs } : {}),
    targetDomain: 'shot-image-prep',
    items,
    approvalPolicy: {
      requiresApproval: input.approvalRequired ?? items.some((item) => item.status !== 'approved'),
    },
    executionPolicy: {
      maxConcurrency: input.maxConcurrency ?? 1,
      failurePolicy: 'continue-approved-only',
      retryPolicy: {
        maxAttempts: 2,
        retryOn: ['provider-timeout', 'rate-limit', 'transient-error'],
      },
      allowCancellation: true,
    },
    costEstimate: { estimateState: 'unknown', diagnostics: [costUnknownDiagnostic()] },
    status: 'needs-approval',
    diagnostics: [costUnknownDiagnostic()],
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
}

export function backfillBatchExecutionPlanFromSummary(input: BatchExecutionRuntimeBackfillInput): {
  readonly plan: BatchExecutionPlan;
  readonly summary: ArtifactExecutionSummary;
} {
  const completed = new Set(input.completedItemIds ?? []);
  const failed = new Set(input.failedItemIds ?? []);
  const skipped = new Set(input.skippedItemIds ?? []);
  const cancelled = new Set(input.cancelledItemIds ?? []);
  const unavailable = new Set(input.unavailableItemIds ?? []);
  const items = input.plan.items.map((item): BatchExecutionItem => {
    const status = completed.has(item.itemId)
      ? 'succeeded'
      : failed.has(item.itemId)
        ? 'failed'
        : skipped.has(item.itemId)
          ? 'skipped'
          : cancelled.has(item.itemId)
            ? 'cancelled'
            : unavailable.has(item.itemId)
              ? 'skipped'
              : item.status;
    return {
      ...item,
      status,
      outputRefs: input.outputRefsByItemId?.[item.itemId] ?? item.outputRefs,
    };
  });
  const status = summarizeBatchStatus(items);
  const plan: BatchExecutionPlan = {
    ...input.plan,
    items,
    status,
    diagnostics: [...(input.plan.diagnostics ?? []), ...(input.diagnostics ?? [])],
  };
  return {
    plan,
    summary: {
      summaryId: `${input.plan.planId}-execution`,
      artifactId: input.plan.planId,
      actionId: `batch.${input.plan.targetDomain}.execute`,
      status: mapBatchPlanStatusToExecutionStatus(status),
      diagnostics: plan.diagnostics?.map(toArtifactDiagnostic),
      metadata: {
        planId: input.plan.planId,
        targetDomain: input.plan.targetDomain,
        succeeded: items.filter((item) => item.status === 'succeeded').length,
        failed: items.filter((item) => item.status === 'failed').length,
        skipped: items.filter((item) => item.status === 'skipped').length,
        cancelled: items.filter((item) => item.status === 'cancelled').length,
      },
    },
  };
}

export function createComicAnimationSidecarRecord(input: {
  readonly recordKind: ComicAnimationSidecarRecord['recordKind'];
  readonly id: string;
  readonly content: unknown;
}): ComicAnimationSidecarRecord {
  const root = sidecarRootForRecordKind(input.recordKind);
  return {
    recordKind: input.recordKind,
    path: `${root}/${sanitizePathPart(input.id)}.json`,
    content: input.content,
  };
}

export async function writeComicAnimationSidecarFirst(input: {
  readonly sidecar: ComicAnimationSidecarPort;
  readonly projection?: ComicAnimationCacheProjectionPort;
  readonly record: ComicAnimationSidecarRecord;
}): Promise<void> {
  await input.sidecar.write(input.record);
  await input.projection?.rebuildFromSidecars([input.record]);
}

export async function rebuildComicAnimationCacheFromSidecars(input: {
  readonly sidecarRecords: readonly ComicAnimationSidecarRecord[];
  readonly projection: ComicAnimationCacheProjectionPort;
}): Promise<void> {
  await input.projection.rebuildFromSidecars(input.sidecarRecords);
}

function shouldScheduleTask(task: IndexTaskState, refresh?: boolean): boolean {
  return (
    refresh === true ||
    task.status === 'pending' ||
    task.status === 'stale' ||
    task.status === 'failed' ||
    task.status === 'partial'
  );
}

function defaultContinuityLookbackLimit(): Required<StoryContinuityLookbackLimit> {
  return { boundary: 'scene', maxEvents: 24, maxCharacterStates: 48, maxConstraints: 16 };
}

function maxContinuityLookbackLimit(): Required<StoryContinuityLookbackLimit> {
  return { boundary: 'chapter', maxEvents: 200, maxCharacterStates: 400, maxConstraints: 100 };
}

function clampLookbackLimit(
  requested: StoryContinuityLookbackLimit,
  max: StoryContinuityLookbackLimit,
): Required<StoryContinuityLookbackLimit> {
  const fallback = defaultContinuityLookbackLimit();
  return {
    boundary: requested.boundary ?? fallback.boundary,
    maxEvents: Math.min(
      requested.maxEvents ?? fallback.maxEvents,
      max.maxEvents ?? fallback.maxEvents,
    ),
    maxCharacterStates: Math.min(
      requested.maxCharacterStates ?? fallback.maxCharacterStates,
      max.maxCharacterStates ?? fallback.maxCharacterStates,
    ),
    maxConstraints: Math.min(
      requested.maxConstraints ?? fallback.maxConstraints,
      max.maxConstraints ?? fallback.maxConstraints,
    ),
  };
}

function filterByStoryPosition<
  T extends { readonly storyPosition?: unknown; readonly orderIndex?: number },
>(records: readonly T[], query: StoryContinuityQuery): readonly T[] {
  const queryOrder = query.storyPosition?.orderIndex;
  if (queryOrder === undefined) return records;
  return records.filter((record) => {
    const order = readRecordOrder(record);
    return order === undefined || order <= queryOrder;
  });
}

function readRecordOrder(record: {
  readonly storyPosition?: unknown;
  readonly orderIndex?: number;
}): number | undefined {
  if (typeof record.orderIndex === 'number') return record.orderIndex;
  if (
    typeof record.storyPosition === 'object' &&
    record.storyPosition !== null &&
    'orderIndex' in record.storyPosition &&
    typeof record.storyPosition.orderIndex === 'number'
  ) {
    return record.storyPosition.orderIndex;
  }
  return undefined;
}

function matchesParticipants(
  refs: readonly CreativeEntityRef[] | undefined,
  characterIds: ReadonlySet<string>,
): boolean {
  if (characterIds.size === 0) return true;
  return (refs ?? []).some((ref) => characterIds.has(ref.entityId));
}

function summarizeBatchStatus(items: readonly BatchExecutionItem[]): BatchExecutionPlan['status'] {
  if (items.length === 0) return 'skipped';
  if (items.every((item) => item.status === 'succeeded')) return 'succeeded';
  if (items.some((item) => item.status === 'running')) return 'running';
  if (items.some((item) => item.status === 'queued')) return 'queued';
  if (items.some((item) => item.status === 'cancelled')) return 'cancelled';
  if (items.some((item) => item.status === 'succeeded')) return 'partial';
  if (items.every((item) => item.status === 'skipped')) return 'skipped';
  if (items.some((item) => item.status === 'failed')) return 'failed';
  return 'partial';
}

function mapBatchPlanStatusToExecutionStatus(
  status: BatchExecutionPlan['status'],
): ArtifactExecutionSummary['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'partial':
    case 'skipped':
    case 'planned':
    case 'needs-approval':
    case 'approved':
    case 'queued':
    case 'running':
      return 'partial';
  }
}

function sidecarRootForRecordKind(kind: ComicAnimationSidecarRecord['recordKind']): string {
  switch (kind) {
    case 'semantic-evidence':
      return COMIC_ANIMATION_SIDECAR_PATHS.semanticIndexRoot;
    case 'memory-fact':
      return COMIC_ANIMATION_SIDECAR_PATHS.memoryRoot;
    case 'run-artifact':
    case 'approval-record':
    case 'batch-summary':
      return COMIC_ANIMATION_SIDECAR_PATHS.runsRoot;
  }
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'record';
}

function costUnknownDiagnostic(): ComicAnimationDiagnostic {
  return diagnostic(
    'warning',
    'cost-unknown',
    ['costEstimate'],
    'Batch execution cost is unknown and requires review before execution.',
  );
}

function mapShotImagePrepDiagnostic(item: ShotImagePrepDiagnostic): ComicAnimationDiagnostic {
  return {
    severity: item.severity,
    code: mapShotImagePrepDiagnosticCode(item.code),
    path: item.path,
    message: item.message,
    ...(item.expected ? { expected: item.expected } : {}),
  };
}

function mapShotImagePrepDiagnosticCode(
  code: ShotImagePrepDiagnostic['code'],
): ComicAnimationDiagnostic['code'] {
  switch (code) {
    case 'provider-unavailable':
      return 'provider-unavailable';
    case 'unsafe-runtime-handle':
      return 'unsafe-runtime-handle';
    case 'missing-required-field':
      return 'missing-required-field';
    case 'oversized-payload':
      return 'oversized-payload';
    case 'non-serializable-value':
      return 'non-serializable-value';
    default:
      return 'invalid-required-field';
  }
}

function toArtifactDiagnostic(diagnosticValue: ComicAnimationDiagnostic): ArtifactDiagnostic {
  return {
    severity: diagnosticValue.severity,
    code:
      diagnosticValue.code === 'provider-unavailable'
        ? 'provider-unavailable'
        : diagnosticValue.code === 'unsafe-runtime-handle'
          ? 'unsafe-runtime-handle'
          : diagnosticValue.code === 'missing-required-field'
            ? 'missing-required-field'
            : 'invalid-required-field',
    path: diagnosticValue.path,
    message: diagnosticValue.message,
  };
}

function diagnostic(
  severity: ComicAnimationDiagnostic['severity'],
  code: ComicAnimationDiagnostic['code'],
  path: ComicAnimationDiagnostic['path'],
  message: string,
): ComicAnimationDiagnostic {
  return { severity, code, path, message };
}
