import type { HistoryActionType, HistoryStateSnapshot } from '../types';
import type { SketchAIApplyResult } from './ai-result-applier';
import type { SketchAIOperationType, SketchAIResult, SketchAIRun } from './ai-progress-types';

export interface SketchAIApplySnapshot {
  readonly state: HistoryStateSnapshot;
}

export interface SketchAIApplySession {
  get(runId: string): SketchAIRun | null;
  start(runId: string, operation: SketchAIOperationType): SketchAIRun;
  clearPendingResult(runId: string): void;
  update(runId: string, update: { readonly state: SketchAIRun['state'] }): SketchAIRun | null;
  fail(runId: string, message: string): SketchAIRun | null;
  finish(runId: string): SketchAIRun | null;
}

export interface SketchAIApplyFlowDependencies<TSnapshot extends SketchAIApplySnapshot> {
  readonly sessionStore: SketchAIApplySession;
  readonly applyResult: (result: SketchAIResult) => Promise<SketchAIApplyResult>;
  readonly captureSnapshot: (result: SketchAIResult) => TSnapshot;
  readonly rollbackSnapshot: (snapshot: TSnapshot) => void;
  readonly pushHistorySnapshot: (params: {
    readonly type: HistoryActionType;
    readonly label: string;
    readonly before: HistoryStateSnapshot;
    readonly after: HistoryStateSnapshot;
  }) => void;
  readonly notifyDocumentEdited: (description: string) => void;
  readonly notifyResultApplied: (runId: string, success: boolean, reason?: string) => void;
}

export async function applySketchAIResultWithSession<TSnapshot extends SketchAIApplySnapshot>(
  runId: string,
  operation: SketchAIOperationType,
  result: SketchAIResult,
  deps: SketchAIApplyFlowDependencies<TSnapshot>,
): Promise<void> {
  if (!deps.sessionStore.get(runId)) {
    deps.sessionStore.start(runId, operation);
  }

  if (isCancelled(deps.sessionStore.get(runId))) {
    deps.sessionStore.clearPendingResult(runId);
    deps.notifyResultApplied(runId, false, 'cancelled');
    return;
  }

  deps.sessionStore.clearPendingResult(runId);
  deps.sessionStore.update(runId, { state: 'applying' });

  const before = deps.captureSnapshot(result);
  try {
    const applyResult = await deps.applyResult(result);
    if (isCancelled(deps.sessionStore.get(runId))) {
      deps.rollbackSnapshot(before);
      deps.notifyResultApplied(runId, false, 'cancelled');
      return;
    }

    if (!applyResult.applied) {
      deps.sessionStore.fail(runId, applyResult.reason);
      deps.notifyResultApplied(runId, false, applyResult.reason);
      return;
    }

    if (applyResult.target === 'layer' || applyResult.target === 'selection') {
      deps.pushHistorySnapshot({
        type: applyResult.target === 'selection' ? 'selection' : 'layer-add',
        label: `Apply AI result: ${runId}`,
        before: before.state,
        after: deps.captureSnapshot(result).state,
      });
    }

    deps.sessionStore.finish(runId);
    if (applyResult.target === 'layer') {
      deps.notifyDocumentEdited(`Apply AI result: ${runId}`);
    }
    deps.notifyResultApplied(runId, true);
  } catch (error) {
    if (isCancelled(deps.sessionStore.get(runId))) {
      deps.rollbackSnapshot(before);
      deps.notifyResultApplied(runId, false, 'cancelled');
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    deps.sessionStore.fail(runId, message);
    deps.notifyResultApplied(runId, false, message);
  }
}

function isCancelled(run: SketchAIRun | null): boolean {
  return run?.state === 'cancelled';
}
