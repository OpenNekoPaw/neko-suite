import { describe, expect, it } from 'vitest';
import {
  normalizeResizeState,
  readPersistedResizeState,
  writePersistedResizeState,
} from './useResizable';

describe('persisted resize state helpers', () => {
  it('restores a persisted panel size', () => {
    const state = {
      'neko.resizeState': {
        'model.rightDock': { size: 320, collapsed: false },
      },
    };

    expect(readPersistedResizeState(state, 'model.rightDock', 280, {
      minSize: 200,
      maxSize: 400,
    })).toEqual({
      size: 320,
      collapsed: false,
    });
  });

  it('clamps invalid persisted sizes to configured bounds', () => {
    expect(normalizeResizeState({ size: 120, collapsed: false }, 280, {
      minSize: 200,
      maxSize: 400,
    })).toEqual({
      size: 200,
      collapsed: false,
    });

    expect(normalizeResizeState({ size: 480, collapsed: false }, 280, {
      minSize: 200,
      maxSize: 400,
    })).toEqual({
      size: 400,
      collapsed: false,
    });
  });

  it('persists collapsed state', () => {
    expect(normalizeResizeState({ size: 260, collapsed: true }, 280, {
      minSize: 200,
      maxSize: 400,
    })).toEqual({
      size: 260,
      collapsed: true,
    });
  });

  it('keeps multiple panel ids independent in one Webview state object', () => {
    const first = writePersistedResizeState(undefined, 'model.rightDock', {
      size: 320,
      collapsed: false,
    });
    const second = writePersistedResizeState(first, 'model.timeline', {
      size: 180,
      collapsed: true,
    });

    expect(readPersistedResizeState(second, 'model.rightDock', 280)).toEqual({
      size: 320,
      collapsed: false,
    });
    expect(readPersistedResizeState(second, 'model.timeline', 140)).toEqual({
      size: 180,
      collapsed: true,
    });
  });
});
