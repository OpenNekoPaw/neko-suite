import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPersistedResizeState } from '@neko/shared/components';
import { MODEL_RESIZE_PANELS } from './modelResizeLayout';

const srcRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

describe('Model resize layout contract', () => {
  it('defines bounded persisted panel ids for every migrated model workbench panel', () => {
    expect(MODEL_RESIZE_PANELS.rightDock).toEqual({
      panelId: 'model.rightDock',
      defaultSize: 320,
      minSize: 260,
      maxSize: 460,
    });
    expect(MODEL_RESIZE_PANELS.outlinerSplit).toEqual({
      panelId: 'model.outlinerSplit',
      defaultSize: 210,
      minSize: 150,
      maxSize: 360,
    });
    expect(MODEL_RESIZE_PANELS.timelineExpanded).toMatchObject({
      panelId: 'model.timelineDock.expanded',
      minSize: 140,
      maxSize: 360,
    });
  });

  it('restores model panel sizes independently and clamps persisted values', () => {
    const state = {
      'neko.resizeState': {
        [MODEL_RESIZE_PANELS.rightDock.panelId]: { size: 999, collapsed: false },
        [MODEL_RESIZE_PANELS.outlinerSplit.panelId]: { size: 180, collapsed: false },
        [MODEL_RESIZE_PANELS.timelineExpanded.panelId]: { size: 120, collapsed: false },
      },
    };

    expect(
      readPersistedResizeState(
        state,
        MODEL_RESIZE_PANELS.rightDock.panelId,
        MODEL_RESIZE_PANELS.rightDock.defaultSize,
        MODEL_RESIZE_PANELS.rightDock,
      ).size,
    ).toBe(460);
    expect(
      readPersistedResizeState(
        state,
        MODEL_RESIZE_PANELS.outlinerSplit.panelId,
        MODEL_RESIZE_PANELS.outlinerSplit.defaultSize,
        MODEL_RESIZE_PANELS.outlinerSplit,
      ).size,
    ).toBe(180);
    expect(
      readPersistedResizeState(
        state,
        MODEL_RESIZE_PANELS.timelineExpanded.panelId,
        MODEL_RESIZE_PANELS.timelineExpanded.defaultSize,
        MODEL_RESIZE_PANELS.timelineExpanded,
      ).size,
    ).toBe(140);
  });

  it('wires resize handles without changing viewport semantic control ownership', () => {
    const app = readSource('App.tsx');

    expect(app).toMatch(/usePersistedResize\(dockSpec\.panelId/);
    expect(app).toMatch(/usePersistedResize\(outlinerSpec\.panelId/);
    expect(app).toMatch(/usePersistedResize\(timelineSpec\.panelId/);
    expect(app).toMatch(/<ResizeHandle\s+handleProps=\{dockHandleProps\}/);
    expect(app).toMatch(/<ResizeHandle\s+handleProps=\{splitHandleProps\}/);
    expect(app).toMatch(/<ResizeHandle\s+handleProps=\{handleProps\}/);
    expect(app).toMatch(/\.updateViewportCamera\(/);
    expect(app).not.toMatch(/updateEditorCamera|sendHttpFallback/);
  });
});
