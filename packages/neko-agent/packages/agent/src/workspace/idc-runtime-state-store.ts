/**
 * IDC Runtime State Store - snapshot writer for `.neko/state/idc-runtime.json`.
 *
 * The logs/ plane stays append-only (`events.jsonl`, `audits.jsonl`, `steps.jsonl`).
 * This store owns the complementary mutable snapshot plane:
 *   - current IDC stage + transition trail
 *   - active / last completed run summary
 *   - pending approval requests that must survive a restart
 *   - pending feedback guidance waiting for the next turn
 *
 * The file is overwritten on each update. Callers own the source-of-truth
 * state and push snapshots here when lifecycle changes happen.
 */

import type { IdcRunRoundSummary, IdcRunStatus, IdcStage } from '@neko-agent/types';
import { classifyCommonFailureReason, emitDiagnostic } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('IdcRuntimeStateStore');

// =============================================================================
// Types
// =============================================================================

export interface IdcRuntimeStageTransition {
  from: IdcStage | null;
  to: IdcStage;
  at: number;
}

export interface PersistedIdcRunSnapshot {
  id: string;
  runKind?: string;
  workflowId?: string;
  status: IdcRunStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  roundCount: number;
  rounds?: readonly IdcRunRoundSummary[];
  lastRound?: IdcRunRoundSummary;
  artifacts?: readonly {
    kind: 'draft' | 'plan' | 'task';
    artifactId: string;
    path: string;
    updatedAt: number;
    stale?: boolean;
  }[];
  task?: {
    id: string;
    counts: {
      pending: number;
      in_progress: number;
      completed: number;
      failed: number;
    };
  };
  error?: {
    code: string;
    message: string;
    cause?: unknown;
  };
}

export interface PendingApprovalSnapshot {
  channel: 'permission';
  confirmationToken: string;
  toolCallId: string;
  toolName: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
}

export interface PersistedFeedbackGuidanceSnapshot {
  content: string;
  sourceRunId?: string;
  sourceRunStartedAt?: number;
}

export interface IdcRuntimeStateSnapshot {
  schemaVersion: 1;
  updatedAt: number;
  conversationId?: string;
  stage: {
    current: IdcStage | null;
    enteredAt?: number;
    transitions: readonly IdcRuntimeStageTransition[];
  };
  run: {
    active?: PersistedIdcRunSnapshot;
    lastCompleted?: PersistedIdcRunSnapshot;
  };
  approval: {
    pending: readonly PendingApprovalSnapshot[];
  };
  feedback: {
    pendingGuidance: PersistedFeedbackGuidanceSnapshot | null;
  };
}

export type IdcRuntimeStateInput = Omit<IdcRuntimeStateSnapshot, 'schemaVersion' | 'updatedAt'>;

export interface IdcRuntimeStateFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

export interface IdcRuntimeStateStoreConfig {
  filePath: string;
  fsOps: IdcRuntimeStateFsOps;
  now?: () => number;
}

export interface IIdcRuntimeStateStore {
  update(snapshot: IdcRuntimeStateInput): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

// =============================================================================
// Implementation
// =============================================================================

class IdcRuntimeStateStore implements IIdcRuntimeStateStore {
  private readonly _filePath: string;
  private readonly _fsOps: IdcRuntimeStateFsOps;
  private readonly _now: () => number;
  private _dirEnsured = false;
  private _pending: Promise<void> = Promise.resolve();
  private _disposed = false;
  private _lastWriteError: unknown | null = null;

  constructor(config: IdcRuntimeStateStoreConfig) {
    if (!config.filePath) {
      throw new Error('IdcRuntimeStateStore: filePath is required');
    }
    this._filePath = config.filePath;
    this._fsOps = config.fsOps;
    this._now = config.now ?? (() => Date.now());
  }

  update(snapshot: IdcRuntimeStateInput): void {
    if (this._disposed) {
      logger.warn('update() after dispose ignored');
      return;
    }

    const payload: IdcRuntimeStateSnapshot = {
      schemaVersion: 1,
      updatedAt: this._now(),
      ...snapshot,
    };
    let serialized: string;
    try {
      serialized = JSON.stringify(payload, null, 2) + '\n';
    } catch (err) {
      emitDiagnostic(logger, 'warn', {
        code: 'agent.runtime-state.snapshot-skipped',
        reason: classifyCommonFailureReason(err),
        message: 'Skipping IDC runtime state snapshot because serialization failed.',
        context: {
          filePath: this._filePath,
          conversationId: snapshot.conversationId ?? null,
          hasActiveRun: Boolean(snapshot.run.active),
        },
        error: err,
      });
      return;
    }

    this._pending = this._pending
      .then(async () => {
        await this._ensureDir();
        await this._fsOps.writeFile(this._filePath, serialized, 'utf-8');
        this._lastWriteError = null;
      })
      .catch((err) => {
        this._lastWriteError = err;
        emitDiagnostic(logger, 'warn', {
          code: 'agent.runtime-state.write-failed',
          reason: classifyCommonFailureReason(err),
          message: 'Failed to write IDC runtime state snapshot.',
          context: {
            filePath: this._filePath,
            conversationId: snapshot.conversationId ?? null,
            hasActiveRun: Boolean(snapshot.run.active),
          },
          error: err,
        });
      });
  }

  async flush(): Promise<void> {
    await this._pending;
    if (this._lastWriteError !== null) {
      throw this._lastWriteError;
    }
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await this.flush();
  }

  private async _ensureDir(): Promise<void> {
    if (this._dirEnsured) return;
    const dir = this._filePath.replace(/[/\\][^/\\]+$/, '');
    if (dir && dir !== this._filePath) {
      await this._fsOps.mkdir(dir, { recursive: true });
    }
    this._dirEnsured = true;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createIdcRuntimeStateStore(
  config: IdcRuntimeStateStoreConfig,
): IIdcRuntimeStateStore {
  return new IdcRuntimeStateStore(config);
}
