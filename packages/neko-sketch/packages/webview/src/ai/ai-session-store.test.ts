import { describe, expect, it } from 'vitest';
import { SketchAISessionStore } from './ai-session-store';

describe('AI session store', () => {
  it('tracks run lifecycle state', () => {
    const store = new SketchAISessionStore();

    expect(store.start('run-1', 'inpaint')).toEqual({
      runId: 'run-1',
      operation: 'inpaint',
      state: 'preparing',
      progress: 0,
      metadata: {},
    });
    expect(store.update('run-1', { state: 'running', progress: 0.5, stage: 'Generating' })).toEqual(
      expect.objectContaining({
        state: 'running',
        progress: 0.5,
        stage: 'Generating',
      }),
    );
    expect(store.finish('run-1')).toEqual(
      expect.objectContaining({
        state: 'completed',
        progress: 1,
      }),
    );
  });

  it('records failure metadata without creating missing runs', () => {
    const store = new SketchAISessionStore();

    expect(store.fail('missing', 'No run')).toBeNull();
    store.start('run-2', 'smart-selection', { source: 'test' });

    expect(store.fail('run-2', 'Model failed')).toEqual(
      expect.objectContaining({
        state: 'failed',
        metadata: { source: 'test', error: 'Model failed' },
      }),
    );
  });

  it('creates missing runs from progress messages and normalizes percentages', () => {
    const store = new SketchAISessionStore();

    expect(store.recordProgress('run-3', 'inpaint', 25, 'Generating')).toEqual(
      expect.objectContaining({
        runId: 'run-3',
        operation: 'inpaint',
        state: 'running',
        progress: 0.25,
        stage: 'Generating',
      }),
    );
    expect(store.recordProgress('run-3', 'inpaint', 0.5)).toEqual(
      expect.objectContaining({
        progress: 0.5,
      }),
    );
    expect(store.finish('run-3')).toEqual(
      expect.objectContaining({
        state: 'completed',
        progress: 1,
      }),
    );
  });

  it('stages AI results for explicit preview apply or discard', () => {
    const store = new SketchAISessionStore();
    const result = {
      kind: 'layer',
      data: {
        kind: 'webviewUri',
        ref: 'vscode-resource://ai-result.png',
        mimeType: 'image/png',
      },
      name: 'AI Result',
    } as const;

    expect(store.stageResult('run-4', 'generate', result)).toEqual(
      expect.objectContaining({
        runId: 'run-4',
        operation: 'generate',
        state: 'previewing',
        progress: 1,
        stage: 'Ready to apply',
      }),
    );
    expect(store.getPendingResult('run-4')).toEqual({
      runId: 'run-4',
      operation: 'generate',
      result,
    });

    store.clearPendingResult('run-4');
    expect(store.getPendingResult('run-4')).toBeNull();
  });

  it('notifies subscribers when runs change', () => {
    const store = new SketchAISessionStore();
    const snapshots: string[][] = [];
    const unsubscribe = store.subscribe((runs) => {
      snapshots.push(runs.map((run) => `${run.runId}:${run.state}`));
    });

    store.start('run-4', 'generate');
    store.update('run-4', { state: 'running', progress: 0.25 });
    store.delete('run-4');
    unsubscribe();
    store.start('run-5', 'inpaint');

    expect(snapshots).toEqual([[], ['run-4:preparing'], ['run-4:running'], []]);
  });

  it('prunes oldest terminal runs beyond the configured limit', () => {
    const store = new SketchAISessionStore({ maxRuns: 2 });

    store.start('run-1', 'generate');
    store.finish('run-1');
    store.start('run-2', 'inpaint');
    store.finish('run-2');
    store.start('run-3', 'upscale');
    store.finish('run-3');

    expect(store.list().map((run) => run.runId)).toEqual(['run-2', 'run-3']);
  });

  it('keeps non-terminal runs when pruning terminal history', () => {
    const store = new SketchAISessionStore({ maxRuns: 1 });

    store.start('active', 'generate');
    store.update('active', { state: 'running' });
    store.start('done', 'inpaint');
    store.finish('done');

    expect(store.list().map((run) => `${run.runId}:${run.state}`)).toEqual(['active:running']);
  });
});
