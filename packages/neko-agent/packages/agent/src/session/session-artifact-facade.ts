import type {
  ConversationRunScope,
  Draft,
  ExecutionArtifactWrittenEvent,
  ExecutionPlan,
  Task,
} from '@neko-agent/types';
import type { CreationProjectedTaskArtifactBinding } from '../task/creation-projected-task';
import {
  toArtifactScopeBinding,
  type ArtifactScopeBinding,
  type AnyArtifactRecord,
  type ArtifactRecord,
  type IArtifactService,
} from '../artifact/artifact-service';

export interface SessionArtifactActivityPort {
  readonly getActiveArtifactScope: () => {
    readonly id: string;
    readonly startedAt?: number;
  } | null;
  readonly getArtifactScopeStartedAt: (scopeId: string) => number | undefined;
  readonly bindArtifact?: (scopeId: string, binding: ArtifactScopeBinding) => void;
}

export interface SessionArtifactWorkspacePort {
  readonly getWorkspaceReadFile: () => ((path: string) => Promise<string>) | null;
  readonly isDisposed: () => boolean;
}

export interface SessionArtifactSessionPort {
  readonly getConversationId: () => string | null;
}

export interface SessionArtifactPersistencePort {
  readonly onPersist: () => void;
  readonly onWarn?: (message: string, data?: Record<string, unknown>) => void;
}

export interface SessionArtifactFacadePorts {
  readonly session: SessionArtifactSessionPort;
  readonly activity: SessionArtifactActivityPort;
  readonly workspace: SessionArtifactWorkspacePort;
  readonly persistence: SessionArtifactPersistencePort;
}

export interface SessionArtifactFacadeOptions {
  readonly ports: SessionArtifactFacadePorts;
}

export class SessionArtifactFacade {
  private readonly _options: SessionArtifactFacadeOptions;
  private _artifactService: IArtifactService | null = null;
  private _artifactRestoreReady: Promise<void> | null = null;
  private _artifactSyncPending: Promise<void> = Promise.resolve();
  private _taskProjection: import('../task').ICreationTaskProjection | null = null;
  private _taskProjectionPending: Promise<void> = Promise.resolve();

  constructor(options: SessionArtifactFacadeOptions) {
    this._options = options;
  }

  get hasArtifactService(): boolean {
    return this._artifactService !== null;
  }

  setArtifactService(service: IArtifactService | null): void {
    const previous = this._artifactService;
    this._artifactService = service;
    if (previous && previous !== service) {
      void previous.dispose?.();
    }
  }

  setTaskProjection(projection: import('../task').ICreationTaskProjection | null): void {
    this._taskProjection = projection;
  }

  scheduleRestore(): void {
    const artifactService = this._artifactService;
    if (!this._options.ports.workspace.getWorkspaceReadFile() || !artifactService?.restore) {
      this._artifactRestoreReady = null;
      return;
    }

    this._artifactRestoreReady = artifactService
      .restore()
      .then((records) => {
        if (
          this._options.ports.workspace.isDisposed() ||
          this._artifactService !== artifactService
        ) {
          return;
        }
        for (const record of records) {
          this.attachRecord(record);
        }
      })
      .catch((error) => {
        this._warn('Failed to restore artifacts from workspace', { error });
      });
  }

  whenRestoreReady(): Promise<void> {
    return this._artifactRestoreReady ?? Promise.resolve();
  }

  async flush(): Promise<void> {
    await this._artifactSyncPending;
    await this._taskProjectionPending;
    await (this._artifactService?.flush?.() ?? Promise.resolve());
  }

  getRecordsForRun(runId: string): readonly AnyArtifactRecord[] {
    return this._artifactService?.listByRunId(runId) ?? [];
  }

  getCreationIdForRun(runId: string): string | null {
    return this._artifactService?.getCreationIdByRunId(runId) ?? null;
  }

  listRunIds(): readonly string[] {
    return this._artifactService?.listRunIds() ?? [];
  }

  writeDraft(draft: Draft, runId?: string): Promise<ArtifactRecord<'draft'>> {
    return this._writeArtifact('draft', draft, runId);
  }

  writePlan(plan: ExecutionPlan, runId?: string): Promise<ArtifactRecord<'plan'>> {
    return this._writeArtifact('plan', plan, runId);
  }

  writeTask(task: Task, runId?: string): Promise<ArtifactRecord<'task'>> {
    return this._writeArtifact('task', task, runId);
  }

  hydrateRunArtifacts(runId: string): void {
    for (const record of this.getRecordsForRun(runId)) {
      this.attachRecord(record);
    }
  }

  attachRecord(record: AnyArtifactRecord): void {
    const binding = toArtifactScopeBinding(record);

    if (record.kind === 'task') {
      this.queueTaskProjection(
        record.runId,
        record.value,
        {
          kind: 'task',
          artifactId: binding.artifactId,
          path: binding.path,
          updatedAt: binding.updatedAt,
        },
        this.getKnownRunStartedAt(record.runId),
      );
    }

    this._options.ports.activity.bindArtifact?.(record.runId, binding);
  }

  queueObservedArtifactSync(event: ExecutionArtifactWrittenEvent): void {
    this._artifactSyncPending = this._artifactSyncPending
      .then(async () => {
        await this._syncObservedArtifact(event);
      })
      .catch((error) => {
        this._warn(`artifact sync failed for ${event.path}: ${String(error)}`);
      });
  }

  queueTaskProjection(
    runId: string,
    task: Task,
    artifact?: CreationProjectedTaskArtifactBinding,
    runStartedAt?: number,
  ): void {
    const projection = this._taskProjection;
    if (!projection) {
      return;
    }

    this._taskProjectionPending = this._taskProjectionPending
      .then(async () => {
        const conversationId = this._options.ports.session.getConversationId()?.trim();
        if (!conversationId) {
          throw new Error('Creation task projection requires a non-empty conversationId');
        }
        await projection.syncTask({
          conversationId,
          runId,
          ...(runStartedAt !== undefined ? { runStartedAt } : {}),
          task,
          ...(artifact ? { artifact } : {}),
        });
      })
      .catch((error) => {
        this._warn(`Creation task projection failed for ${runId}: ${String(error)}`);
      });
  }

  queueTaskProjectionClear(scope: ConversationRunScope, runStartedAt?: number): void {
    const projection = this._taskProjection;
    if (!projection) {
      return;
    }

    this._taskProjectionPending = this._taskProjectionPending
      .then(async () => {
        await projection.clearRun(scope, runStartedAt);
      })
      .catch((error) => {
        this._warn(
          `Creation task projection cleanup failed for ${scope.conversationId}/${scope.runId}: ${String(error)}`,
        );
      });
  }

  dispose(): void {
    void this._artifactService?.dispose?.();
    this._artifactService = null;
    this._artifactRestoreReady = null;
    this._artifactSyncPending = Promise.resolve();
    this._taskProjection = null;
    this._taskProjectionPending = Promise.resolve();
  }

  private _writeArtifact(
    kind: 'draft',
    value: Draft,
    runId?: string,
  ): Promise<ArtifactRecord<'draft'>>;
  private _writeArtifact(
    kind: 'plan',
    value: ExecutionPlan,
    runId?: string,
  ): Promise<ArtifactRecord<'plan'>>;
  private _writeArtifact(
    kind: 'task',
    value: Task,
    runId?: string,
  ): Promise<ArtifactRecord<'task'>>;
  private async _writeArtifact(
    kind: 'draft' | 'plan' | 'task',
    value: Draft | ExecutionPlan | Task,
    runId?: string,
  ): Promise<AnyArtifactRecord> {
    const { artifactService, targetRunId } = this._resolveWriteContext(runId);
    const record =
      kind === 'draft'
        ? await artifactService.writeDraft(targetRunId, value as Draft)
        : kind === 'plan'
          ? await artifactService.writePlan(targetRunId, value as ExecutionPlan)
          : await artifactService.writeTask(targetRunId, value as Task);
    this.attachRecord(record);
    this._options.ports.persistence.onPersist();
    return record;
  }

  private _resolveWriteContext(runId?: string): {
    artifactService: IArtifactService;
    targetRunId: string;
  } {
    const artifactService = this._artifactService;
    if (!artifactService) {
      throw new Error('ArtifactService is not configured for this session');
    }

    const targetRunId = runId ?? this._options.ports.activity.getActiveArtifactScope()?.id ?? null;
    if (!targetRunId) {
      throw new Error(
        'writeArtifact requires an active Agent creation session or an explicit artifact scope id',
      );
    }

    return { artifactService, targetRunId };
  }

  private getKnownRunStartedAt(runId: string): number | undefined {
    return this._options.ports.activity.getArtifactScopeStartedAt(runId);
  }

  private async _syncObservedArtifact(event: ExecutionArtifactWrittenEvent): Promise<void> {
    if (this._options.ports.workspace.isDisposed() || event.runId === 'unknown') {
      return;
    }

    const artifactService = this._artifactService;
    const existing =
      artifactService === null
        ? null
        : event.kind === 'draft'
          ? artifactService.getByRunId(event.runId, 'draft')
          : event.kind === 'plan'
            ? artifactService.getByRunId(event.runId, 'plan')
            : artifactService.getByRunId(event.runId, 'task');
    const binding = {
      kind: event.kind,
      artifactId: event.artifactId,
      path: event.path,
      updatedAt: existing && existing.path === event.path ? existing.updatedAt : event.at,
    } as const;
    this._options.ports.activity.bindArtifact?.(event.runId, binding);

    const readFile = this._options.ports.workspace.getWorkspaceReadFile();
    if (!readFile || !artifactService) {
      this._options.ports.persistence.onPersist();
      return;
    }

    const content = await readFile(event.path);
    if (existing && existing.path === event.path && existing.content === content) {
      this._options.ports.persistence.onPersist();
      return;
    }

    const record =
      event.kind === 'draft'
        ? artifactService.ingestObservedArtifact({
            kind: 'draft',
            runId: event.runId,
            path: event.path,
            content,
          })
        : event.kind === 'plan'
          ? artifactService.ingestObservedArtifact({
              kind: 'plan',
              runId: event.runId,
              path: event.path,
              content,
            })
          : artifactService.ingestObservedArtifact({
              kind: 'task',
              runId: event.runId,
              path: event.path,
              content,
            });
    this.attachRecord(record);
    this._options.ports.persistence.onPersist();
  }

  private _warn(message: string, data?: Record<string, unknown>): void {
    this._options.ports.persistence.onWarn?.(message, data);
  }
}
