/**
 * IDC Runtime State Reader - best-effort restore helpers for
 * `.neko/state/idc-runtime.json`.
 *
 * The writer remains append-last / overwrite-only; this reader exposes the
 * runtime restore surface needed on startup: stage tracker state, active /
 * last-completed run summaries, and pending approval requests.
 */

import type {
  IdcRunRoundSummary,
  IdcRunStatus,
  IdcStage,
  StageSkipReason,
} from '@neko-agent/types';
import { getLogger } from '../utils/logger';
import type {
  IdcRuntimeStageTransition,
  PendingApprovalSnapshot,
  PersistedFeedbackGuidanceSnapshot,
  PersistedIdcRunSnapshot,
} from './idc-runtime-state-store';

const logger = getLogger('IdcRuntimeStateReader');

// =============================================================================
// Types
// =============================================================================

export interface IdcRuntimeStateReadFsOps {
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

export interface ReadIdcRuntimeStateConfig {
  filePath: string;
  fsOps: IdcRuntimeStateReadFsOps;
}

export type ReadPendingApprovalStateConfig = ReadIdcRuntimeStateConfig;

export interface IdcRuntimeRestoreState {
  updatedAt?: number;
  stage: {
    current: IdcStage | null;
    enteredAt?: number;
    transitions: readonly IdcRuntimeStageTransition[];
  };
  run: {
    active?: PersistedIdcRunSnapshot;
    lastCompleted?: PersistedIdcRunSnapshot;
  };
  approval: PendingApprovalRestoreState;
  feedback: {
    pendingGuidance: PersistedFeedbackGuidanceSnapshot | null;
  };
}

export interface PendingApprovalRestoreState {
  updatedAt?: number;
  pending: readonly PendingApprovalSnapshot[];
}

// =============================================================================
// Public API
// =============================================================================

export async function readPendingApprovalState(
  config: ReadIdcRuntimeStateConfig,
): Promise<PendingApprovalRestoreState | null> {
  const state = await readIdcRuntimeState(config);
  return state ? state.approval : null;
}

export async function readIdcRuntimeState(
  config: ReadIdcRuntimeStateConfig,
): Promise<IdcRuntimeRestoreState | null> {
  if (!config.filePath) {
    throw new Error('readIdcRuntimeState: filePath is required');
  }

  try {
    const raw = await config.fsOps.readFile(config.filePath, 'utf-8');
    return parseIdcRuntimeState(raw);
  } catch (err) {
    if (isMissingFileError(err)) {
      return null;
    }
    logger.warn(`runtime state read failed: ${String(err)}`);
    return null;
  }
}

export function parsePendingApprovalState(raw: string): PendingApprovalRestoreState | null {
  const state = parseIdcRuntimeState(raw);
  return state ? state.approval : null;
}

export function parseIdcRuntimeState(raw: string): IdcRuntimeRestoreState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = asRecord(parsed);
    if (!root) {
      return null;
    }

    const stage = asRecord(root['stage']);
    const run = asRecord(root['run']);
    const approval = asRecord(root['approval']);
    const feedback = asRecord(root['feedback']);
    const pending = Array.isArray(approval?.['pending'])
      ? approval!['pending']
          .map((entry) => toPendingApprovalSnapshot(entry))
          .filter((entry): entry is PendingApprovalSnapshot => entry !== null)
      : [];
    const pendingGuidance = toPersistedFeedbackGuidance(feedback?.['pendingGuidance']);

    const updatedAt = typeof root['updatedAt'] === 'number' ? root['updatedAt'] : undefined;
    const active = toPersistedRunSnapshot(run?.['active']);
    const lastCompleted = toPersistedRunSnapshot(run?.['lastCompleted']);

    const result: IdcRuntimeRestoreState = {
      stage: {
        current: toIdcStageOrNull(stage?.['current']),
        ...(typeof stage?.['enteredAt'] === 'number' ? { enteredAt: stage['enteredAt'] } : {}),
        transitions: Array.isArray(stage?.['transitions'])
          ? stage!['transitions']
              .map((entry) => toStageTransition(entry))
              .filter((entry): entry is IdcRuntimeStageTransition => entry !== null)
          : [],
      },
      run: {
        ...(active ? { active } : {}),
        ...(lastCompleted ? { lastCompleted } : {}),
      },
      approval: updatedAt !== undefined ? { updatedAt, pending } : { pending },
      feedback: {
        pendingGuidance,
      },
    };

    return updatedAt !== undefined ? { ...result, updatedAt } : result;
  } catch {
    return null;
  }
}

// =============================================================================
// Parsing
// =============================================================================

function toPendingApprovalSnapshot(value: unknown): PendingApprovalSnapshot | null {
  const entry = asRecord(value);
  if (!entry) return null;
  if (entry['channel'] !== 'permission') return null;

  const confirmationToken = asString(entry['confirmationToken']);
  const toolCallId = asString(entry['toolCallId']);
  const toolName = asString(entry['toolName']);
  const action = asString(entry['action']);
  const description = asString(entry['description']);
  const details = asRecord(entry['details']);

  if (!confirmationToken || !toolCallId || !toolName || !action || !description || !details) {
    return null;
  }

  return {
    channel: 'permission',
    confirmationToken,
    toolCallId,
    toolName,
    action,
    description,
    details,
  };
}

function toPersistedFeedbackGuidance(value: unknown): PersistedFeedbackGuidanceSnapshot | null {
  const entry = asRecord(value);
  if (!entry) {
    return null;
  }

  const content = asString(entry['content'])?.trim();
  if (!content) {
    return null;
  }

  const sourceRunId = asString(entry['sourceRunId']);
  const sourceRunStartedAt = asNumber(entry['sourceRunStartedAt']);

  return {
    content,
    ...(sourceRunId ? { sourceRunId } : {}),
    ...(sourceRunStartedAt !== null ? { sourceRunStartedAt } : {}),
  };
}

function toPersistedRunSnapshot(value: unknown): PersistedIdcRunSnapshot | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const id = asString(entry['id']);
  const runKind = asString(entry['runKind']);
  const status = asIdcRunStatus(entry['status']);
  const createdAt = asNumber(entry['createdAt']);
  if (!id || !runKind || !status || createdAt === null) {
    return null;
  }

  const rounds = Array.isArray(entry['rounds'])
    ? entry['rounds']
        .map((item) => toRunRoundSummary(item))
        .filter((item): item is IdcRunRoundSummary => item !== null)
    : undefined;
  const lastRound =
    toRunRoundSummary(entry['lastRound']) ??
    (rounds && rounds.length > 0 ? (rounds[rounds.length - 1] ?? undefined) : undefined);
  const roundCount =
    asNonNegativeNumber(entry['roundCount']) ?? rounds?.length ?? (lastRound ? 1 : 0);

  const artifacts = Array.isArray(entry['artifacts'])
    ? entry['artifacts']
        .map((item) => toRunArtifactBinding(item))
        .filter(
          (item): item is NonNullable<PersistedIdcRunSnapshot['artifacts']>[number] =>
            item !== null,
        )
    : undefined;
  const task = toPersistedRunTask(entry['task']);
  const error = toPersistedRunError(entry['error']);
  const startedAt = asNumber(entry['startedAt']);
  const endedAt = asNumber(entry['endedAt']);

  return {
    id,
    runKind,
    status,
    createdAt,
    ...(startedAt !== null ? { startedAt } : {}),
    ...(endedAt !== null ? { endedAt } : {}),
    roundCount,
    ...(rounds && rounds.length > 0 ? { rounds } : {}),
    ...(lastRound ? { lastRound } : {}),
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
    ...(task ? { task } : {}),
    ...(error ? { error } : {}),
  };
}

function toRunRoundSummary(value: unknown): IdcRunRoundSummary | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const round = asNonNegativeNumber(entry['round']);
  const decidedAt = asNumber(entry['decidedAt']);
  if (round === null || decidedAt === null) {
    return null;
  }

  const activated = Array.isArray(entry['activatedStages'])
    ? entry['activatedStages']
        .map((stage) => asIdcStage(stage))
        .filter((stage): stage is IdcStage => stage !== null)
    : null;
  const skipped = Array.isArray(entry['skippedStages'])
    ? entry['skippedStages']
        .map((stage) => toSkippedStage(stage))
        .filter(
          (stage): stage is NonNullable<IdcRunRoundSummary['skippedStages']>[number] =>
            stage !== null,
        )
    : null;

  if (!activated || !skipped) {
    return null;
  }

  const lastObserveHint = asString(entry['lastObserveHint']);
  return {
    round,
    activatedStages: activated,
    skippedStages: skipped,
    decidedAt,
    ...(lastObserveHint ? { lastObserveHint } : {}),
  };
}

function toSkippedStage(
  value: unknown,
): NonNullable<IdcRunRoundSummary['skippedStages']>[number] | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const stage = asIdcStage(entry['stage']);
  const reason = asStageSkipReason(entry['reason']);
  if (!stage || !reason) {
    return null;
  }

  return { stage, reason };
}

function toRunArtifactBinding(
  value: unknown,
): NonNullable<PersistedIdcRunSnapshot['artifacts']>[number] | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const kind = asArtifactKind(entry['kind']);
  const artifactId = asString(entry['artifactId']);
  const path = asString(entry['path']);
  const updatedAt = asNumber(entry['updatedAt']);
  if (!kind || !artifactId || !path || updatedAt === null) {
    return null;
  }

  return {
    kind,
    artifactId,
    path,
    updatedAt,
    ...(entry['stale'] === true ? { stale: true } : {}),
  };
}

function toPersistedRunTask(value: unknown): PersistedIdcRunSnapshot['task'] | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const id = asString(entry['id']);
  const counts = asRecord(entry['counts']);
  const pending = asNonNegativeNumber(counts?.['pending']);
  const inProgress = asNonNegativeNumber(counts?.['in_progress']);
  const completed = asNonNegativeNumber(counts?.['completed']);
  const failed = asNonNegativeNumber(counts?.['failed']);

  if (!id || pending === null || inProgress === null || completed === null || failed === null) {
    return null;
  }

  return {
    id,
    counts: {
      pending,
      in_progress: inProgress,
      completed,
      failed,
    },
  };
}

function toPersistedRunError(value: unknown): PersistedIdcRunSnapshot['error'] | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const code = asString(entry['code']);
  const message = asString(entry['message']);
  if (!code || !message) {
    return null;
  }

  return {
    code,
    message,
    ...(entry['cause'] !== undefined ? { cause: entry['cause'] } : {}),
  };
}

function toStageTransition(value: unknown): IdcRuntimeStageTransition | null {
  const entry = asRecord(value);
  if (!entry) return null;

  const from = toIdcStageOrNull(entry['from']);
  const to = asIdcStage(entry['to']);
  const at = asNumber(entry['at']);
  if (!to || at === null) {
    return null;
  }

  return { from, to, at };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNonNegativeNumber(value: unknown): number | null {
  const result = asNumber(value);
  return result !== null && result >= 0 ? result : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : null;
}

function asIdcStage(value: unknown): IdcStage | null {
  return value === 'draft' || value === 'plan' || value === 'apply' ? value : null;
}

function toIdcStageOrNull(value: unknown): IdcStage | null {
  return value === null ? null : asIdcStage(value);
}

function asIdcRunStatus(value: unknown): IdcRunStatus | null {
  return value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'aborted' ||
    value === 'failed'
    ? value
    : null;
}

function asStageSkipReason(value: unknown): StageSkipReason | null {
  return value === 'task-shape' ||
    value === 'mode' ||
    value === 'entry-rule' ||
    value === 'retry-reuse' ||
    value === 'user-suppressed'
    ? value
    : null;
}

function asArtifactKind(
  value: unknown,
): NonNullable<PersistedIdcRunSnapshot['artifacts']>[number]['kind'] | null {
  return value === 'draft' || value === 'plan' || value === 'task' ? value : null;
}

function isMissingFileError(err: unknown): boolean {
  const value = asRecord(err);
  const code = value?.['code'];
  if (code === 'ENOENT') {
    return true;
  }

  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /ENOENT|no such file/i.test(message);
}
