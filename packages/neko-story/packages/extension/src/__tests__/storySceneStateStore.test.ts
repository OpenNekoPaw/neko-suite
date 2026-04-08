import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  EventEmitter: class MockEventEmitter<T> {
    private readonly listeners = new Set<(event: T) => void>();

    readonly event = (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    };

    fire(event: T): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    dispose(): void {
      this.listeners.clear();
    }
  },
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
    parse: (value: string) => ({
      fsPath: value.replace(/^file:\/\//, ''),
      toString: () => value,
    }),
  },
}));

import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import { buildScriptIndex } from '../services/scriptIndexBuilder';
import { StorySceneStateStore } from '../services/storySceneStateStore';

function createPersistence(initial: Record<string, unknown> = {}) {
  const storage = { ...initial };
  return {
    storage,
    get<T>(key: string, defaultValue: T): T {
      return (storage[key] as T | undefined) ?? defaultValue;
    },
    update: vi.fn(async (key: string, value: unknown) => {
      storage[key] = value;
    }),
  };
}

describe('StorySceneStateStore', () => {
  it('restores persisted state and keeps matching scenes', () => {
    const uri = vscode.Uri.file('/project/demo.fountain') as never;
    const scriptIndex = buildScriptIndex(
      uri,
      parse(`INT. OFFICE - DAY

Alice waits.`),
    );
    const sceneId = scriptIndex.scenes[0]!.sceneId;
    const persistence = createPersistence({
      'neko.story.sceneStateStore': {
        [scriptIndex.uri]: {
          [sceneId]: {
            sceneId,
            agentStatus: 'sent',
            canvasStatus: 'opened',
          },
          stale_scene: {
            sceneId: 'stale_scene',
            agentStatus: 'review',
            canvasStatus: 'queued',
          },
        },
      },
    });

    const store = new StorySceneStateStore(persistence);
    const sceneStates = store.getSceneStates(uri, scriptIndex);

    expect(sceneStates).toEqual({
      [sceneId]: {
        sceneId,
        agentStatus: 'sent',
        canvasStatus: 'opened',
      },
    });
    expect(persistence.update).toHaveBeenCalled();
  });

  it('persists pipeline write-back updates into workspace-backed storage', () => {
    const uri = vscode.Uri.file('/project/demo.fountain') as never;
    const scriptIndex = buildScriptIndex(
      uri,
      parse(`INT. OFFICE - DAY

Alice waits.`),
    );
    const sceneId = scriptIndex.scenes[0]!.sceneId;
    const persistence = createPersistence();
    const store = new StorySceneStateStore(persistence);

    store.handlePipelineEvent(
      scriptIndex,
      {
        scriptPath: '/project/demo.fountain',
        sceneId,
      },
      'pipeline-1',
      { type: 'pipeline_start' },
    );

    expect(persistence.update).toHaveBeenCalled();
    expect(store.getSceneStates(uri, scriptIndex)[sceneId]).toMatchObject({
      sceneId,
      agentStatus: 'review',
      canvasStatus: 'queued',
    });
  });
});
