import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  validateAgentInternalInvocation,
  validateCreativeAiRunSnapshot,
  validateExternalCreativeAiInvocation,
  type AgentInternalInvocation,
  type CreativeAiDiagnostic,
  type CreativeAiLaneKind,
  type CreativeAiLaneSnapshot,
  type CreativeAiModelSnapshotRef,
  type CreativeAiRoutingDecision,
  type CreativeAiRunAggregateSnapshot,
  type CreativeAiRunSnapshot,
  type CreativeAiRunStatus,
  type CreativeAiTargetRef,
  type CreativeAiWorkItemSnapshot,
  type CreativeAiWorkItemStatus,
  type ExternalCreativeAiInvocation,
} from '@neko/shared/types/creative-ai-invocation';
import type { SubAgentWorkItemEvent } from '@neko-agent/types';

export type CreativeAiRunEventType =
  | 'run-started'
  | 'run-completed'
  | 'run-cancelled'
  | 'run-failed'
  | 'work-item-started'
  | 'work-item-progress'
  | 'work-item-completed'
  | 'work-item-cancelled'
  | 'work-item-failed'
  | 'work-item-stale-target'
  | 'work-item-apply-failed'
  | 'work-item-generated-observation';

export interface CreativeAiRunEvent {
  readonly type: CreativeAiRunEventType;
  readonly conversationId: string;
  readonly runId: string;
  readonly workItemId?: string;
  readonly snapshot: CreativeAiRunSnapshot;
  readonly workItem?: CreativeAiWorkItemSnapshot;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
  readonly source?: 'creative-run-runtime' | 'subagent';
  readonly subAgentId?: string;
  readonly emittedAt: string;
}

export interface CreativeAiRunRuntimeOptions {
  readonly now?: () => number;
  readonly createRunId?: (input: CreativeAiRunIdInput) => string;
  readonly createWorkItemId?: (input: CreativeAiWorkItemIdInput) => string;
  readonly laneLimits?: Partial<Record<CreativeAiLaneKind, number>>;
  readonly emit?: (event: CreativeAiRunEvent) => void;
}

export interface CreativeAiRunIdInput {
  readonly conversationId: string;
  readonly invocationId: string;
  readonly sequence: number;
  readonly createdAt: number;
}

export interface CreativeAiWorkItemIdInput {
  readonly runId: string;
  readonly sequence: number;
  readonly createdAt: number;
}

export interface AcceptCreativeAiInvocationInput {
  readonly invocation: unknown;
  readonly routingDecision: CreativeAiRoutingDecision;
  readonly modelSnapshot?: CreativeAiModelSnapshotRef;
}

export type CreativeAiRunAcceptResult =
  | {
      readonly status: 'created';
      readonly snapshot: CreativeAiRunSnapshot;
      readonly events: readonly CreativeAiRunEvent[];
    }
  | {
      readonly status: 'existing';
      readonly snapshot: CreativeAiRunSnapshot;
      readonly events: readonly CreativeAiRunEvent[];
    }
  | {
      readonly status: 'rejected';
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

export interface StartCreativeAiWorkItemInput {
  readonly runId: string;
  readonly laneKind?: CreativeAiLaneKind;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef?: CreativeAiTargetRef;
  readonly parentWorkItemId?: string;
  readonly execute?: (context: CreativeAiBackgroundWorkItemContext) => Promise<void> | void;
}

export interface CreativeAiBackgroundWorkItemContext {
  readonly runId: string;
  readonly workItemId: string;
  readonly conversationId: string;
  readonly runtime: CreativeAiRunRuntime;
}

export interface ProjectCreativeAiSubAgentEventInput {
  readonly runId: string;
  readonly workItemId?: string;
  readonly parentWorkItemId?: string;
  readonly event: SubAgentWorkItemEvent;
}

interface CreativeAiRunRecord {
  snapshot: CreativeAiRunSnapshot;
  workItems: Map<string, CreativeAiWorkItemSnapshot>;
}

interface QueuedCreativeAiWorkItemExecution {
  readonly runId: string;
  readonly workItemId: string;
  readonly execute?: (context: CreativeAiBackgroundWorkItemContext) => Promise<void> | void;
}

const CREATIVE_AI_LANE_KINDS: readonly CreativeAiLaneKind[] = [
  'image',
  'audio',
  'video',
  'text',
  'judge',
];

const DEFAULT_CREATIVE_AI_LANE_LIMITS: Record<CreativeAiLaneKind, number> = {
  image: 2,
  audio: 1,
  video: 1,
  text: 4,
  judge: 1,
};

export class CreativeAiRunRuntime {
  private readonly runs = new Map<string, CreativeAiRunRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly events: CreativeAiRunEvent[] = [];
  private readonly mainTurnChains = new Map<string, Promise<unknown>>();
  private readonly queuedExecutions = new Map<
    CreativeAiLaneKind,
    QueuedCreativeAiWorkItemExecution[]
  >();
  private runSequence = 0;
  private workItemSequence = 0;

  constructor(private readonly options: CreativeAiRunRuntimeOptions = {}) {}

  acceptInvocation(input: AcceptCreativeAiInvocationInput): CreativeAiRunAcceptResult {
    const normalized = normalizeInvocation(input.invocation);
    if (normalized.status === 'rejected') {
      return normalized;
    }

    const idempotencyKey = buildIdempotencyLookupKey(normalized.invocation, input.routingDecision);
    const existingRunId = this.idempotencyIndex.get(idempotencyKey);
    if (existingRunId) {
      const existing = this.runs.get(existingRunId);
      if (!existing) {
        throw new Error(`Creative AI idempotency index points at missing run: ${existingRunId}`);
      }
      return {
        status: 'existing',
        snapshot: cloneRunSnapshot(existing.snapshot),
        events: [],
      };
    }

    const createdAt = this.now();
    const runId = this.createRunId(
      input.routingDecision.conversationId,
      normalized.invocation,
      createdAt,
    );
    const snapshot = buildRunSnapshot({
      invocation: normalized.invocation,
      routingDecision: input.routingDecision,
      runId,
      modelSnapshot: input.modelSnapshot,
      createdAt,
    });
    const validation = validateCreativeAiRunSnapshot(snapshot);
    if (!validation.valid) {
      return {
        status: 'rejected',
        diagnostics: validation.diagnostics,
      };
    }

    this.runs.set(runId, {
      snapshot,
      workItems: new Map(),
    });
    this.idempotencyIndex.set(idempotencyKey, runId);
    const event = this.emitEvent('run-started', snapshot);

    return {
      status: 'created',
      snapshot: cloneRunSnapshot(snapshot),
      events: [event],
    };
  }

  enqueueMainTurn<T>(conversationId: string, task: () => Promise<T> | T): Promise<T> {
    const previous = this.mainTurnChains.get(conversationId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.mainTurnChains.set(
      conversationId,
      next.finally(() => {
        if (this.mainTurnChains.get(conversationId) === next) {
          this.mainTurnChains.delete(conversationId);
        }
      }),
    );
    return next;
  }

  startBackgroundWorkItem(input: StartCreativeAiWorkItemInput): CreativeAiWorkItemSnapshot {
    const record = this.requireRun(input.runId);
    const createdAt = this.now();
    const workItemId = this.createWorkItemId(input.runId, createdAt);
    const laneKind = input.laneKind ?? 'text';
    const canStart = this.getActiveLaneCount(laneKind) < this.getLaneLimit(laneKind);
    const workItem: CreativeAiWorkItemSnapshot = {
      workItemId,
      status: canStart ? 'running' : 'queued',
      laneKind,
      ...(input.targetRef ? { targetRef: input.targetRef } : {}),
      ...(input.candidateTargetRef ? { candidateTargetRef: input.candidateTargetRef } : {}),
      ...(input.parentWorkItemId ? { parentWorkItemId: input.parentWorkItemId } : {}),
    };
    record.workItems.set(workItemId, workItem);
    this.updateRunSnapshot(record, 'running');
    this.emitEvent(
      canStart ? 'work-item-started' : 'work-item-progress',
      record.snapshot,
      workItem,
    );

    if (canStart) {
      this.runBackgroundWorkItemExecution(input.runId, workItemId, input.execute);
    } else {
      this.enqueueLaneExecution(laneKind, {
        runId: input.runId,
        workItemId,
        execute: input.execute,
      });
    }

    return cloneWorkItem(workItem);
  }

  updateWorkItemProgress(
    runId: string,
    workItemId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    return this.updateWorkItem(runId, workItemId, 'running', 'work-item-progress', diagnostics);
  }

  completeWorkItem(runId: string, workItemId: string): CreativeAiWorkItemSnapshot {
    const item = this.updateWorkItem(runId, workItemId, 'completed', 'work-item-completed');
    this.completeRunIfTerminal(runId);
    return item;
  }

  cancelWorkItem(
    runId: string,
    workItemId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    const item = this.updateWorkItem(
      runId,
      workItemId,
      'cancelled',
      'work-item-cancelled',
      diagnostics,
    );
    this.completeRunIfTerminal(runId);
    return item;
  }

  failWorkItem(
    runId: string,
    workItemId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    const item = this.updateWorkItem(runId, workItemId, 'failed', 'work-item-failed', diagnostics);
    this.completeRunIfTerminal(runId);
    return item;
  }

  markWorkItemStale(
    runId: string,
    workItemId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    const item = this.updateWorkItem(
      runId,
      workItemId,
      'stale-target',
      'work-item-stale-target',
      diagnostics,
    );
    this.completeRunIfTerminal(runId);
    return item;
  }

  failWorkItemApply(
    runId: string,
    workItemId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    const item = this.updateWorkItem(
      runId,
      workItemId,
      'apply-failed',
      'work-item-apply-failed',
      diagnostics,
    );
    this.completeRunIfTerminal(runId);
    return item;
  }

  markGeneratedObservation(
    runId: string,
    workItemId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    return this.updateWorkItem(
      runId,
      workItemId,
      'generated-observation',
      'work-item-generated-observation',
      diagnostics,
    );
  }

  cancelRun(
    runId: string,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiRunSnapshot {
    const record = this.requireRun(runId);
    for (const workItem of record.workItems.values()) {
      if (!isTerminalWorkItemStatus(workItem.status)) {
        record.workItems.set(workItem.workItemId, {
          ...workItem,
          status: 'cancelled',
          diagnostics,
        });
      }
    }
    this.updateRunSnapshot(record, 'cancelled', diagnostics);
    this.emitEvent('run-cancelled', record.snapshot, undefined, diagnostics);
    return cloneRunSnapshot(record.snapshot);
  }

  projectSubAgentEvent(input: ProjectCreativeAiSubAgentEventInput): CreativeAiRunEvent {
    const record = this.requireRun(input.runId);
    if (input.event.conversationId !== record.snapshot.conversationId) {
      throw new Error('SubAgent event conversationId must match creative AI run conversationId.');
    }
    const workItemId = input.workItemId ?? input.event.subAgentId;
    const existing = record.workItems.get(workItemId);
    const status = toWorkItemStatusFromSubAgentEvent(input.event);
    const workItem: CreativeAiWorkItemSnapshot = {
      workItemId,
      status,
      ...(existing?.targetRef ? { targetRef: existing.targetRef } : {}),
      ...(existing?.candidateTargetRef ? { candidateTargetRef: existing.candidateTargetRef } : {}),
      ...((input.parentWorkItemId ?? existing?.parentWorkItemId)
        ? { parentWorkItemId: input.parentWorkItemId ?? existing?.parentWorkItemId }
        : {}),
      ...(input.event.data?.error
        ? { diagnostics: [diagnostic('creative-ai-subagent-error', input.event.data.error)] }
        : existing?.diagnostics
          ? { diagnostics: existing.diagnostics }
          : {}),
    };
    record.workItems.set(workItemId, workItem);
    this.updateRunSnapshot(record, status === 'running' ? 'running' : record.snapshot.status);
    return this.emitEvent(
      toEventTypeFromWorkItemStatus(status),
      record.snapshot,
      workItem,
      workItem.diagnostics,
      {
        source: 'subagent',
        subAgentId: input.event.subAgentId,
      },
    );
  }

  getRunSnapshot(runId: string): CreativeAiRunSnapshot | undefined {
    const record = this.runs.get(runId);
    return record ? cloneRunSnapshot(record.snapshot) : undefined;
  }

  getEvents(): readonly CreativeAiRunEvent[] {
    return this.events.map(cloneRunEvent);
  }

  getConversationRunIds(conversationId: string): readonly string[] {
    return Array.from(this.runs.values())
      .filter((record) => record.snapshot.conversationId === conversationId)
      .map((record) => record.snapshot.runId);
  }

  private updateWorkItem(
    runId: string,
    workItemId: string,
    status: CreativeAiWorkItemStatus,
    eventType: CreativeAiRunEventType,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): CreativeAiWorkItemSnapshot {
    const record = this.requireRun(runId);
    const existing = record.workItems.get(workItemId);
    if (!existing) {
      throw new Error(`Creative AI work item does not exist: ${workItemId}`);
    }
    const updated: CreativeAiWorkItemSnapshot = {
      ...existing,
      status,
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    };
    record.workItems.set(workItemId, updated);
    this.updateRunSnapshot(record, toRunStatusFromWorkItemStatus(status), diagnostics);
    this.emitEvent(eventType, record.snapshot, updated, diagnostics);
    if (isTerminalWorkItemStatus(status) && existing.laneKind) {
      this.drainLane(existing.laneKind);
    }
    return cloneWorkItem(updated);
  }

  private completeRunIfTerminal(runId: string): void {
    const record = this.requireRun(runId);
    const workItems = Array.from(record.workItems.values());
    if (
      workItems.length === 0 ||
      workItems.some((item) => !isTerminalWorkItemStatus(item.status))
    ) {
      return;
    }
    const status = workItems.some((item) => item.status === 'apply-failed')
      ? 'apply-failed'
      : workItems.some((item) => item.status === 'stale-target')
        ? 'stale-target'
        : workItems.some((item) => item.status === 'failed')
          ? 'failed'
          : workItems.every((item) => item.status === 'cancelled')
            ? 'cancelled'
            : 'completed';
    this.updateRunSnapshot(record, status);
    this.emitEvent(toRunTerminalEventType(status), record.snapshot);
  }

  private updateRunSnapshot(
    record: CreativeAiRunRecord,
    status: CreativeAiRunStatus,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
  ): void {
    record.snapshot = {
      ...record.snapshot,
      status,
      updatedAt: new Date(this.now()).toISOString(),
      workItems: Array.from(record.workItems.values()).map(cloneWorkItem),
      aggregate: buildRunAggregateSnapshot(
        record.snapshot.runId,
        Array.from(record.workItems.values()),
        {
          laneLimits: (laneKind) => this.getLaneLimit(laneKind),
        },
      ),
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    };
  }

  private emitEvent(
    type: CreativeAiRunEventType,
    snapshot: CreativeAiRunSnapshot,
    workItem?: CreativeAiWorkItemSnapshot,
    diagnostics: readonly CreativeAiDiagnostic[] = [],
    extras: Partial<Pick<CreativeAiRunEvent, 'source' | 'subAgentId'>> = {},
  ): CreativeAiRunEvent {
    const event: CreativeAiRunEvent = {
      type,
      conversationId: snapshot.conversationId,
      runId: snapshot.runId,
      ...(workItem ? { workItemId: workItem.workItemId, workItem: cloneWorkItem(workItem) } : {}),
      snapshot: cloneRunSnapshot(snapshot),
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
      source: extras.source ?? 'creative-run-runtime',
      ...(extras.subAgentId ? { subAgentId: extras.subAgentId } : {}),
      emittedAt: new Date(this.now()).toISOString(),
    };
    this.events.push(event);
    this.options.emit?.(cloneRunEvent(event));
    return cloneRunEvent(event);
  }

  private requireRun(runId: string): CreativeAiRunRecord {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Creative AI run does not exist: ${runId}`);
    }
    return record;
  }

  private createRunId(
    conversationId: string,
    invocation: AgentInternalInvocation | ExternalCreativeAiInvocation,
    createdAt: number,
  ): string {
    this.runSequence += 1;
    return (
      this.options.createRunId?.({
        conversationId,
        invocationId: invocation.invocationId,
        sequence: this.runSequence,
        createdAt,
      }) ?? `${conversationId}:creative-run:${createdAt}:${this.runSequence}`
    );
  }

  private createWorkItemId(runId: string, createdAt: number): string {
    this.workItemSequence += 1;
    return (
      this.options.createWorkItemId?.({
        runId,
        sequence: this.workItemSequence,
        createdAt,
      }) ?? `${runId}:work-item:${this.workItemSequence}`
    );
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private getLaneLimit(laneKind: CreativeAiLaneKind): number {
    const configured = this.options.laneLimits?.[laneKind];
    if (configured !== undefined) {
      if (!Number.isInteger(configured) || configured < 1) {
        throw new Error(`Creative AI lane limit must be a positive integer: ${laneKind}`);
      }
      return configured;
    }
    return DEFAULT_CREATIVE_AI_LANE_LIMITS[laneKind];
  }

  private getActiveLaneCount(laneKind: CreativeAiLaneKind): number {
    let count = 0;
    for (const record of this.runs.values()) {
      for (const workItem of record.workItems.values()) {
        if (workItem.laneKind === laneKind && workItem.status === 'running') {
          count += 1;
        }
      }
    }
    return count;
  }

  private enqueueLaneExecution(
    laneKind: CreativeAiLaneKind,
    execution: QueuedCreativeAiWorkItemExecution,
  ): void {
    const queue = this.queuedExecutions.get(laneKind) ?? [];
    queue.push(execution);
    this.queuedExecutions.set(laneKind, queue);
  }

  private drainLane(laneKind: CreativeAiLaneKind): void {
    const queue = this.queuedExecutions.get(laneKind);
    if (!queue || queue.length === 0) return;
    while (queue.length > 0 && this.getActiveLaneCount(laneKind) < this.getLaneLimit(laneKind)) {
      const next = queue.shift();
      if (!next) return;
      const record = this.runs.get(next.runId);
      const workItem = record?.workItems.get(next.workItemId);
      if (!record || !workItem || workItem.status !== 'queued') {
        continue;
      }
      const running: CreativeAiWorkItemSnapshot = {
        ...workItem,
        status: 'running',
      };
      record.workItems.set(next.workItemId, running);
      this.updateRunSnapshot(record, 'running');
      this.emitEvent('work-item-started', record.snapshot, running);
      this.runBackgroundWorkItemExecution(next.runId, next.workItemId, next.execute);
    }
    if (queue.length === 0) {
      this.queuedExecutions.delete(laneKind);
    }
  }

  private runBackgroundWorkItemExecution(
    runId: string,
    workItemId: string,
    execute?: (context: CreativeAiBackgroundWorkItemContext) => Promise<void> | void,
  ): void {
    if (!execute) return;
    const record = this.requireRun(runId);
    void Promise.resolve()
      .then(() =>
        execute({
          runId,
          workItemId,
          conversationId: record.snapshot.conversationId,
          runtime: this,
        }),
      )
      .then(() => {
        const latest = this.runs.get(runId)?.workItems.get(workItemId);
        if (latest && latest.status === 'running') {
          this.completeWorkItem(runId, workItemId);
        }
      })
      .catch((error: unknown) => {
        this.failWorkItem(runId, workItemId, [
          diagnostic(
            'creative-ai-background-work-item-failed',
            error instanceof Error ? error.message : String(error),
          ),
        ]);
      });
  }
}

export function createCreativeAiRunRuntime(
  options: CreativeAiRunRuntimeOptions = {},
): CreativeAiRunRuntime {
  return new CreativeAiRunRuntime(options);
}

function normalizeInvocation(invocation: unknown):
  | {
      readonly status: 'accepted';
      readonly invocation: AgentInternalInvocation | ExternalCreativeAiInvocation;
    }
  | { readonly status: 'rejected'; readonly diagnostics: readonly CreativeAiDiagnostic[] } {
  const external = validateExternalCreativeAiInvocation(invocation);
  if (external.valid && external.value) {
    return { status: 'accepted', invocation: external.value };
  }
  const internal = validateAgentInternalInvocation(invocation);
  if (internal.valid && internal.value) {
    if (!internal.value.sourceRef) {
      return {
        status: 'rejected',
        diagnostics: [
          diagnostic(
            'creative-ai-run-missing-source-ref',
            'Accepted creative AI runs require a sourceRef snapshot.',
            'sourceRef',
          ),
        ],
      };
    }
    return { status: 'accepted', invocation: internal.value };
  }
  return {
    status: 'rejected',
    diagnostics: [...external.diagnostics, ...internal.diagnostics],
  };
}

function buildRunSnapshot(input: {
  readonly invocation: AgentInternalInvocation | ExternalCreativeAiInvocation;
  readonly routingDecision: CreativeAiRoutingDecision;
  readonly runId: string;
  readonly modelSnapshot?: CreativeAiModelSnapshotRef;
  readonly createdAt: number;
}): CreativeAiRunSnapshot {
  const invocation = input.invocation;
  const external = invocation.domain === 'external-creative-package' ? invocation : undefined;
  const internal = invocation.domain === 'agent-internal' ? invocation : undefined;
  const sourceRef = external?.sourceRef ?? internal?.sourceRef;
  if (!sourceRef) {
    throw new Error('Creative AI run snapshot requires sourceRef after validation.');
  }
  const writeback = external?.writeback ?? internal?.writeback ?? { kind: 'none' };
  const idempotencyKey =
    external?.idempotencyKey ??
    internal?.idempotencyKey ??
    `${input.routingDecision.conversationId}:${invocation.invocationId}`;

  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    runId: input.runId,
    conversationId: input.routingDecision.conversationId,
    invocationId: invocation.invocationId,
    invocationDomain: invocation.domain,
    sourcePackage: external?.sourcePackage ?? sourceRef.packageId,
    ...(input.routingDecision.associationKey
      ? { associationKey: input.routingDecision.associationKey }
      : {}),
    routingReason: input.routingDecision.routingReason,
    sourceRef,
    ...((external?.documentRef ?? sourceRef.documentRef)
      ? { documentRef: external?.documentRef ?? sourceRef.documentRef }
      : {}),
    ...((external?.targetRef ?? internal?.targetRef)
      ? { targetRef: external?.targetRef ?? internal?.targetRef }
      : {}),
    ...((external?.candidateTargetRef ?? internal?.candidateTargetRef)
      ? { candidateTargetRef: external?.candidateTargetRef ?? internal?.candidateTargetRef }
      : {}),
    intent: invocation.intent,
    mode: invocation.mode,
    writeback,
    ...(external?.documentRevision ? { documentRevision: external.documentRevision } : {}),
    ...(external?.targetRevision ? { targetRevision: external.targetRevision } : {}),
    ...(input.modelSnapshot ? { modelSnapshot: input.modelSnapshot } : {}),
    idempotencyKey,
    status: 'accepted',
    createdAt: new Date(input.createdAt).toISOString(),
  };
}

function buildIdempotencyLookupKey(
  invocation: AgentInternalInvocation | ExternalCreativeAiInvocation,
  routingDecision: CreativeAiRoutingDecision,
): string {
  const targetId =
    invocation.targetRef?.id ?? invocation.candidateTargetRef?.id ?? 'candidate-or-readonly';
  const idempotencyKey =
    invocation.idempotencyKey ?? `${routingDecision.conversationId}:${invocation.invocationId}`;
  return [
    routingDecision.conversationId,
    routingDecision.associationKey ?? 'agent-selected',
    targetId,
    idempotencyKey,
  ].join('|');
}

function buildRunAggregateSnapshot(
  runId: string,
  workItems: readonly CreativeAiWorkItemSnapshot[],
  options: { readonly laneLimits: (laneKind: CreativeAiLaneKind) => number },
): CreativeAiRunAggregateSnapshot {
  const lanes = CREATIVE_AI_LANE_KINDS.map((laneKind): CreativeAiLaneSnapshot => {
    const laneItems = workItems.filter((item) => item.laneKind === laneKind);
    const runningCount = laneItems.filter((item) => item.status === 'running').length;
    const queuedCount = laneItems.filter((item) => item.status === 'queued').length;
    const completedCount = laneItems.filter((item) => item.status === 'completed').length;
    const failedCount = laneItems.filter(
      (item) =>
        item.status === 'failed' ||
        item.status === 'stale-target' ||
        item.status === 'apply-failed',
    ).length;
    const cancelledCount = laneItems.filter((item) => item.status === 'cancelled').length;
    return {
      laneKind,
      maxActive: options.laneLimits(laneKind),
      activeCount: runningCount,
      queuedCount,
      runningCount,
      completedCount,
      failedCount,
      ...(cancelledCount > 0 ? { cancelledCount } : {}),
    };
  });
  return {
    runId,
    totalCount: workItems.length,
    completedCount: workItems.filter((item) => item.status === 'completed').length,
    failedCount: workItems.filter(
      (item) =>
        item.status === 'failed' ||
        item.status === 'stale-target' ||
        item.status === 'apply-failed',
    ).length,
    runningCount: workItems.filter((item) => item.status === 'running').length,
    queuedCount: workItems.filter((item) => item.status === 'queued').length,
    lanes,
  };
}

function toWorkItemStatusFromSubAgentEvent(event: SubAgentWorkItemEvent): CreativeAiWorkItemStatus {
  switch (event.type) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'started':
    case 'progress':
      return 'running';
    case 'spawned':
      return 'queued';
  }
}

function toEventTypeFromWorkItemStatus(status: CreativeAiWorkItemStatus): CreativeAiRunEventType {
  switch (status) {
    case 'completed':
      return 'work-item-completed';
    case 'cancelled':
      return 'work-item-cancelled';
    case 'stale-target':
      return 'work-item-stale-target';
    case 'failed':
      return 'work-item-failed';
    case 'apply-failed':
      return 'work-item-apply-failed';
    case 'generated-observation':
      return 'work-item-generated-observation';
    case 'queued':
    case 'running':
      return 'work-item-progress';
  }
}

function toRunStatusFromWorkItemStatus(status: CreativeAiWorkItemStatus): CreativeAiRunStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'stale-target':
      return 'stale-target';
    case 'apply-failed':
      return 'apply-failed';
    case 'failed':
      return 'failed';
    case 'generated-observation':
    case 'queued':
    case 'running':
      return 'running';
  }
}

function toRunTerminalEventType(status: CreativeAiRunStatus): CreativeAiRunEventType {
  switch (status) {
    case 'cancelled':
      return 'run-cancelled';
    case 'failed':
    case 'stale-target':
    case 'apply-failed':
      return 'run-failed';
    case 'completed':
    case 'accepted':
    case 'running':
      return 'run-completed';
  }
}

function isTerminalWorkItemStatus(status: CreativeAiWorkItemStatus): boolean {
  return (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'failed' ||
    status === 'stale-target' ||
    status === 'apply-failed'
  );
}

function cloneRunSnapshot(snapshot: CreativeAiRunSnapshot): CreativeAiRunSnapshot {
  return {
    ...snapshot,
    workItems: snapshot.workItems?.map(cloneWorkItem),
    diagnostics: snapshot.diagnostics ? [...snapshot.diagnostics] : undefined,
  };
}

function cloneWorkItem(workItem: CreativeAiWorkItemSnapshot): CreativeAiWorkItemSnapshot {
  return {
    ...workItem,
    diagnostics: workItem.diagnostics ? [...workItem.diagnostics] : undefined,
  };
}

function cloneRunEvent(event: CreativeAiRunEvent): CreativeAiRunEvent {
  return {
    ...event,
    snapshot: cloneRunSnapshot(event.snapshot),
    workItem: event.workItem ? cloneWorkItem(event.workItem) : undefined,
    diagnostics: event.diagnostics ? [...event.diagnostics] : undefined,
  };
}

function diagnostic(code: string, message: string, target?: string): CreativeAiDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    ...(target ? { target } : {}),
  };
}
