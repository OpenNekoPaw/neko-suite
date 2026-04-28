import type {
  SketchAIRun,
  SketchAIRunState,
  SketchAIOperationType,
  SketchAIResult,
} from './ai-progress-types';

export interface PendingSketchAIResult {
  readonly runId: string;
  readonly operation: SketchAIOperationType;
  readonly result: SketchAIResult;
}

export interface SketchAISessionStoreOptions {
  readonly maxRuns?: number;
}

const DEFAULT_MAX_RUNS = 32;
const TERMINAL_RUN_STATES = new Set<SketchAIRunState>(['completed', 'failed', 'cancelled']);

export class SketchAISessionStore {
  private readonly runs = new Map<string, SketchAIRun>();
  private readonly pendingResults = new Map<string, PendingSketchAIResult>();
  private readonly listeners = new Set<(runs: readonly SketchAIRun[]) => void>();
  private readonly maxRuns: number;

  constructor(options: SketchAISessionStoreOptions = {}) {
    this.maxRuns = Math.max(1, Math.floor(options.maxRuns ?? DEFAULT_MAX_RUNS));
  }

  subscribe(listener: (runs: readonly SketchAIRun[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => {
      this.listeners.delete(listener);
    };
  }

  list(): readonly SketchAIRun[] {
    return Array.from(this.runs.values());
  }

  start(
    runId: string,
    operation: SketchAIOperationType,
    metadata: Record<string, unknown> = {},
  ): SketchAIRun {
    const run: SketchAIRun = {
      runId,
      operation,
      state: 'preparing',
      progress: 0,
      metadata,
    };
    this.runs.set(runId, run);
    this.pruneRuns();
    this.emitChange();
    return run;
  }

  update(
    runId: string,
    update: Partial<Pick<SketchAIRun, 'progress' | 'stage' | 'metadata'>> & {
      readonly state?: SketchAIRunState;
    },
  ): SketchAIRun | null {
    const current = this.runs.get(runId);
    if (!current) return null;
    const next: SketchAIRun = {
      ...current,
      ...update,
      metadata: update.metadata ?? current.metadata,
    };
    this.runs.set(runId, next);
    this.pruneRuns();
    this.emitChange();
    return next;
  }

  recordProgress(
    runId: string,
    operation: SketchAIOperationType,
    percent: number,
    stage?: string,
  ): SketchAIRun {
    if (!this.runs.has(runId)) {
      this.start(runId, operation);
    }
    return this.update(runId, {
      state: 'running',
      progress: normalizeProgress(percent),
      stage,
    })!;
  }

  stageResult(
    runId: string,
    operation: SketchAIOperationType,
    result: SketchAIResult,
  ): SketchAIRun {
    if (!this.runs.has(runId)) {
      this.start(runId, operation);
    }
    this.pendingResults.set(runId, { runId, operation, result });
    return this.update(runId, {
      state: 'previewing',
      progress: 1,
      stage: 'Ready to apply',
    })!;
  }

  getPendingResult(runId: string): PendingSketchAIResult | null {
    return this.pendingResults.get(runId) ?? null;
  }

  clearPendingResult(runId: string): void {
    if (this.pendingResults.delete(runId)) {
      this.emitChange();
    }
  }

  get(runId: string): SketchAIRun | null {
    return this.runs.get(runId) ?? null;
  }

  finish(runId: string): SketchAIRun | null {
    return this.update(runId, { state: 'completed', progress: 1 });
  }

  fail(runId: string, message: string): SketchAIRun | null {
    return this.update(runId, {
      state: 'failed',
      metadata: { ...(this.runs.get(runId)?.metadata ?? {}), error: message },
    });
  }

  cancel(runId: string, stage?: string): SketchAIRun | null {
    this.pendingResults.delete(runId);
    return this.update(runId, { state: 'cancelled', stage });
  }

  delete(runId: string): void {
    this.runs.delete(runId);
    this.pendingResults.delete(runId);
    this.emitChange();
  }

  clear(): void {
    this.runs.clear();
    this.pendingResults.clear();
    this.emitChange();
  }

  private emitChange(): void {
    const runs = this.list();
    for (const listener of this.listeners) {
      listener(runs);
    }
  }

  private pruneRuns(): void {
    if (this.runs.size <= this.maxRuns) {
      return;
    }

    for (const run of this.runs.values()) {
      if (this.runs.size <= this.maxRuns) {
        break;
      }
      if (!TERMINAL_RUN_STATES.has(run.state) || this.pendingResults.has(run.runId)) {
        continue;
      }
      this.runs.delete(run.runId);
      this.pendingResults.delete(run.runId);
    }
  }
}

function normalizeProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}
