import type {
  Draft,
  ExecutionArtifactWrittenEvent,
  ExecutionPlan,
  IdcRun,
  Task,
} from '@neko-agent/types';
import type { IdcProjectedTaskArtifactBinding } from '../task/idc-projected-task';
import {
  toIdcRunArtifactBinding,
  type AnyArtifactRecord,
  type ArtifactRecord,
  type IArtifactService,
} from '../runtime/artifact-service';

export interface SessionArtifactRunPort {
  readonly getActiveRun: () => IdcRun | null;
  readonly getCompletedRuns: () => readonly IdcRun[];
  readonly setDraft: (
    draft: Draft,
    binding: NonNullable<IdcRun['artifactBindings']>[number],
  ) => void;
  readonly setPlan: (
    plan: ExecutionPlan,
    binding: NonNullable<IdcRun['artifactBindings']>[number],
  ) => void;
  readonly setTask: (task: Task, binding: NonNullable<IdcRun['artifactBindings']>[number]) => void;
  readonly bindArtifact: (binding: NonNullable<IdcRun['artifactBindings']>[number]) => void;
}

export interface SessionArtifactWorkspacePort {
  readonly getWorkspaceReadFile: () => ((path: string) => Promise<string>) | null;
  readonly isDisposed: () => boolean;
}

export interface SessionArtifactPersistencePort {
  readonly onPersist: () => void;
  readonly onWarn?: (message: string, data?: Record<string, unknown>) => void;
}

export interface SessionArtifactFacadePorts {
  readonly run: SessionArtifactRunPort;
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
  private _taskProjection: import('../task').IIdcTaskProjection | null = null;
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

  setTaskProjection(projection: import('../task').IIdcTaskProjection | null): void {
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

  getRecordsForRun(runId: string): readonly ArtifactRecord[] {
    return this._artifactService?.listByRunId(runId) ?? [];
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
    const binding = toIdcRunArtifactBinding(record);

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

    const activeRun = this._options.ports.run.getActiveRun();
    if (!activeRun || activeRun.id !== record.runId) {
      return;
    }

    switch (record.kind) {
      case 'draft':
        this._options.ports.run.setDraft(record.value, binding);
        return;
      case 'plan':
        this._options.ports.run.setPlan(record.value, binding);
        return;
      case 'task':
        this._options.ports.run.setTask(record.value, binding);
        return;
    }
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
    artifact?: IdcProjectedTaskArtifactBinding,
    runStartedAt?: number,
  ): void {
    const projection = this._taskProjection;
    if (!projection) {
      return;
    }

    this._taskProjectionPending = this._taskProjectionPending
      .then(async () => {
        await projection.syncTask({
          runId,
          ...(runStartedAt !== undefined ? { runStartedAt } : {}),
          task,
          ...(artifact ? { artifact } : {}),
        });
      })
      .catch((error) => {
        this._warn(`IDC task projection failed for ${runId}: ${String(error)}`);
      });
  }

  queueTaskProjectionClear(runId: string, runStartedAt?: number): void {
    const projection = this._taskProjection;
    if (!projection) {
      return;
    }

    this._taskProjectionPending = this._taskProjectionPending
      .then(async () => {
        await projection.clearRun(runId, runStartedAt);
      })
      .catch((error) => {
        this._warn(`IDC task projection cleanup failed for ${runId}: ${String(error)}`);
      });
  }

  replayRestoredTaskProjection(run: IdcRun | null): void {
    if (!run?.task) {
      return;
    }

    const artifactBinding = run.artifactBindings?.find((binding) => binding.kind === 'task');
    this.queueTaskProjection(
      run.id,
      run.task,
      artifactBinding
        ? {
            kind: 'task',
            artifactId: artifactBinding.artifactId,
            path: artifactBinding.path,
            updatedAt: artifactBinding.updatedAt,
          }
        : undefined,
      run.startedAt,
    );
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

    const targetRunId = runId ?? this._options.ports.run.getActiveRun()?.id ?? null;
    if (!targetRunId) {
      throw new Error('writeArtifact requires an active IDC run or an explicit runId');
    }

    return { artifactService, targetRunId };
  }

  private getKnownRunStartedAt(runId: string): number | undefined {
    const activeRun = this._options.ports.run.getActiveRun();
    if (activeRun?.id === runId) {
      return activeRun.startedAt;
    }

    const completedRun = this._options.ports.run.getCompletedRuns().find((run) => run.id === runId);
    return completedRun?.startedAt;
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
    this._options.ports.run.bindArtifact(binding);

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
