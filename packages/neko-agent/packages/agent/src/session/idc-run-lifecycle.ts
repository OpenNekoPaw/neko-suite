import type { IdcRun } from '@neko-agent/types';
import type { IStageGuardian, StageTracker } from '../skill';
import type { AnyArtifactRecord } from '../runtime/artifact-service';
import type { IIdcRunStore } from '../executor';

export interface IdcRunRuntimePort {
  readonly getRunStore: () => IIdcRunStore | null;
  readonly getStageTracker: () => StageTracker | null;
  readonly getStageGuardian: () => IStageGuardian | null;
  readonly onPersist: () => void;
}

export interface IdcRunArtifactPort {
  readonly hasArtifactService: () => boolean;
  readonly listArtifactsByRunId: (runId: string) => readonly AnyArtifactRecord[];
  readonly hydrateRunArtifacts: (runId: string) => void;
  readonly queueTaskProjectionClear: (runId: string, runStartedAt?: number) => void;
  readonly replayRestoredTaskProjection: (run: IdcRun | null) => void;
}

export interface IdcRunRestorePort {
  readonly restoreRunFromSnapshot: (
    snapshot: import('../workspace').PersistedIdcRunSnapshot | undefined,
    records: readonly AnyArtifactRecord[],
    options?: { markMissingArtifactsStale?: boolean },
  ) => IdcRun | null;
  readonly isActiveRunStatus: (status: IdcRun['status']) => boolean;
  readonly isTerminalRunStatus: (status: IdcRun['status']) => boolean;
}

export interface IdcRunLifecyclePorts {
  readonly runtime: IdcRunRuntimePort;
  readonly artifacts: IdcRunArtifactPort;
  readonly restore: IdcRunRestorePort;
}

export interface IdcRunLifecycleOptions {
  readonly maxPersistedStageTransitions: number;
  readonly ports: IdcRunLifecyclePorts;
}

export class IdcRunLifecycle {
  private readonly _options: IdcRunLifecycleOptions;
  private _stageTransitions: import('../workspace').IdcRuntimeStageTransition[] = [];

  constructor(options: IdcRunLifecycleOptions) {
    this._options = options;
  }

  get stageTransitions(): readonly import('../workspace').IdcRuntimeStageTransition[] {
    return this._stageTransitions;
  }

  startRun(runKind: string, runId?: string): string | null {
    const runStore = this._options.ports.runtime.getRunStore();
    if (!runStore) return null;
    const nextRunId = runStore.startRun({ runKind, runId });
    this._options.ports.artifacts.hydrateRunArtifacts(nextRunId);
    this._options.ports.runtime.onPersist();
    return nextRunId;
  }

  closeActiveRun(status: 'completed' | 'failed' | 'aborted', error?: IdcRun['error']): void {
    const runStore = this._options.ports.runtime.getRunStore();
    const activeRun = runStore?.getActive();
    if (!runStore || !activeRun) return;
    runStore.endRun(status, error);
    this._options.ports.artifacts.queueTaskProjectionClear(activeRun.id, activeRun.startedAt);
  }

  recordStageTransition(event: {
    previous: import('@neko-agent/types').IdcStage | null;
    stage: import('@neko-agent/types').IdcStage;
    at: number;
  }): void {
    this._stageTransitions.push({
      from: event.previous,
      to: event.stage,
      at: event.at,
    });
    if (this._stageTransitions.length > this._options.maxPersistedStageTransitions) {
      this._stageTransitions.splice(
        0,
        this._stageTransitions.length - this._options.maxPersistedStageTransitions,
      );
    }
    this._options.ports.runtime.onPersist();
  }

  restore(input: import('../workspace').IdcRuntimeRestoreState): void {
    this._restoreStageRuntimeState(input.stage);
    this._restoreRunState(input.run);
  }

  private _restoreStageRuntimeState(
    state: import('../workspace').IdcRuntimeRestoreState['stage'],
  ): void {
    const stageTracker = this._options.ports.runtime.getStageTracker();
    if (!stageTracker) {
      return;
    }
    const runStore = this._options.ports.runtime.getRunStore();
    if (
      this._stageTransitions.length > 0 ||
      runStore?.getActive() ||
      (runStore?.listCompleted().length ?? 0) > 0
    ) {
      return;
    }

    this._stageTransitions = [...state.transitions].slice(
      -this._options.maxPersistedStageTransitions,
    );
    stageTracker.restore({
      current: state.current,
      ...(state.enteredAt !== undefined ? { enteredAt: state.enteredAt } : {}),
    });
    this._options.ports.runtime.getStageGuardian()?.restore({
      current: state.current,
      ...(state.enteredAt !== undefined ? { enteredAt: state.enteredAt } : {}),
      visitedStages: collectVisitedStages(state.transitions, state.current),
    });
  }

  private _restoreRunState(state: import('../workspace').IdcRuntimeRestoreState['run']): void {
    const runStore = this._options.ports.runtime.getRunStore();
    if (!runStore) {
      return;
    }
    if (runStore.getActive() || runStore.listCompleted().length > 0) {
      return;
    }

    const activeCandidate = this._options.ports.restore.restoreRunFromSnapshot(
      state.active,
      state.active ? this._options.ports.artifacts.listArtifactsByRunId(state.active.id) : [],
      { markMissingArtifactsStale: this._options.ports.artifacts.hasArtifactService() },
    );
    const lastCompletedCandidate = this._options.ports.restore.restoreRunFromSnapshot(
      state.lastCompleted,
      state.lastCompleted
        ? this._options.ports.artifacts.listArtifactsByRunId(state.lastCompleted.id)
        : [],
      { markMissingArtifactsStale: this._options.ports.artifacts.hasArtifactService() },
    );

    runStore.restore({
      ...(activeCandidate && this._options.ports.restore.isActiveRunStatus(activeCandidate.status)
        ? { active: activeCandidate }
        : {}),
      completed: [
        ...(lastCompletedCandidate &&
        this._options.ports.restore.isTerminalRunStatus(lastCompletedCandidate.status)
          ? [lastCompletedCandidate]
          : []),
        ...(!lastCompletedCandidate &&
        activeCandidate &&
        this._options.ports.restore.isTerminalRunStatus(activeCandidate.status)
          ? [activeCandidate]
          : []),
      ],
    });

    this._options.ports.artifacts.replayRestoredTaskProjection(activeCandidate);
    this._options.ports.artifacts.replayRestoredTaskProjection(lastCompletedCandidate);

    if (
      lastCompletedCandidate &&
      this._options.ports.restore.isTerminalRunStatus(lastCompletedCandidate.status)
    ) {
      this._options.ports.artifacts.queueTaskProjectionClear(
        lastCompletedCandidate.id,
        lastCompletedCandidate.startedAt,
      );
    } else if (
      activeCandidate &&
      this._options.ports.restore.isTerminalRunStatus(activeCandidate.status)
    ) {
      this._options.ports.artifacts.queueTaskProjectionClear(
        activeCandidate.id,
        activeCandidate.startedAt,
      );
    }
  }
}

function collectVisitedStages(
  transitions: readonly import('../workspace').IdcRuntimeStageTransition[],
  current: import('@neko-agent/types').IdcStage | null,
): readonly import('@neko-agent/types').IdcStage[] {
  const visited = new Set<import('@neko-agent/types').IdcStage>();
  for (const transition of transitions) {
    if (transition.from) {
      visited.add(transition.from);
    }
    visited.add(transition.to);
  }
  if (current) {
    visited.add(current);
  }
  return Array.from(visited);
}
