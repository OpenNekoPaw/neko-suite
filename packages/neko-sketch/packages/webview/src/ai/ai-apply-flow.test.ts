import { describe, expect, it, vi } from 'vitest';
import type { SketchAIApplyResult } from './ai-result-applier';
import { applySketchAIResultWithSession, type SketchAIApplySnapshot } from './ai-apply-flow';
import type { SketchAIResult } from './ai-progress-types';
import { SketchAISessionStore } from './ai-session-store';

const layerResult: SketchAIResult = {
  kind: 'layer',
  data: {
    kind: 'webviewUri',
    ref: 'vscode-resource://ai-result.png',
    mimeType: 'image/png',
  },
  name: 'AI Result',
};

describe('AI apply flow', () => {
  it('rolls back and preserves cancelled state when cancel arrives while apply is pending', async () => {
    const sessionStore = new SketchAISessionStore();
    sessionStore.stageResult('run-race', 'generate', layerResult);
    const history: Array<{ readonly type: string }> = [];
    const notifications: Array<{ readonly success: boolean; readonly reason?: string }> = [];
    const rollbackSnapshot = vi.fn();
    let resolveApply: (result: SketchAIApplyResult) => void = () => undefined;
    const applyResult = vi.fn(
      () =>
        new Promise<SketchAIApplyResult>((resolve) => {
          resolveApply = resolve;
        }),
    );

    const applying = applySketchAIResultWithSession('run-race', 'generate', layerResult, {
      sessionStore,
      applyResult,
      captureSnapshot: () => ({ state: { layers: [], activeLayerId: null } }),
      rollbackSnapshot,
      pushHistorySnapshot: (entry) => history.push({ type: entry.type }),
      notifyDocumentEdited: vi.fn(),
      notifyResultApplied: (_runId, success, reason) => {
        notifications.push({ success, reason });
      },
    });

    expect(sessionStore.get('run-race')?.state).toBe('applying');
    sessionStore.cancel('run-race');
    resolveApply({ applied: true, target: 'layer', layerId: 'generated' });
    await applying;

    expect(sessionStore.get('run-race')?.state).toBe('cancelled');
    expect(rollbackSnapshot).toHaveBeenCalledWith({
      state: { layers: [], activeLayerId: null },
    } satisfies SketchAIApplySnapshot);
    expect(history).toEqual([]);
    expect(notifications).toEqual([{ success: false, reason: 'cancelled' }]);
  });

  it('does not start applying when the run has already been cancelled', async () => {
    const sessionStore = new SketchAISessionStore();
    sessionStore.stageResult('run-cancelled', 'generate', layerResult);
    sessionStore.cancel('run-cancelled');
    const applyResult = vi.fn<() => Promise<SketchAIApplyResult>>();
    const notifications: Array<{ readonly success: boolean; readonly reason?: string }> = [];

    await applySketchAIResultWithSession('run-cancelled', 'generate', layerResult, {
      sessionStore,
      applyResult,
      captureSnapshot: () => ({ state: {} }),
      rollbackSnapshot: vi.fn(),
      pushHistorySnapshot: vi.fn(),
      notifyDocumentEdited: vi.fn(),
      notifyResultApplied: (_runId, success, reason) => {
        notifications.push({ success, reason });
      },
    });

    expect(applyResult).not.toHaveBeenCalled();
    expect(sessionStore.get('run-cancelled')?.state).toBe('cancelled');
    expect(notifications).toEqual([{ success: false, reason: 'cancelled' }]);
  });
});
