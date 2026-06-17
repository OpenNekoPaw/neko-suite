import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPersistedResizeState } from '@neko/ui/hooks';
import {
  MODEL_RESIZE_PANELS,
  constrainOutlinerSplitSize,
  MODEL_RIGHT_DOCK_MIN_PROPERTIES_SIZE,
  MODEL_RIGHT_DOCK_SPLIT_HANDLE_SIZE,
} from './modelResizeLayout';

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

  it('constrains the outliner split to the current right dock height', () => {
    expect(constrainOutlinerSplitSize(999, 320)).toBe(
      320 - MODEL_RIGHT_DOCK_SPLIT_HANDLE_SIZE - MODEL_RIGHT_DOCK_MIN_PROPERTIES_SIZE,
    );
    expect(constrainOutlinerSplitSize(100, 720)).toBe(MODEL_RESIZE_PANELS.outlinerSplit.minSize);
    expect(constrainOutlinerSplitSize(999, 720)).toBe(MODEL_RESIZE_PANELS.outlinerSplit.maxSize);
  });

  it('wires resize handles without changing viewport semantic control ownership', () => {
    const app = readSource('App.tsx');

    expect(app).toMatch(/panelId: MODEL_RESIZE_PANELS\.rightDock\.panelId/);
    expect(app).not.toMatch(/usePersistedResize\(dockSpec\.panelId/);
    expect(app).toMatch(/usePersistedResize\(outlinerSpec\.panelId/);
    expect(app).toMatch(/usePersistedResize\(timelineSpec\.panelId/);
    expect(app).toMatch(/const \[dockHeight, setDockHeight\] = useState\(0\)/);
    expect(app).toMatch(/constrainOutlinerSplitSize\(outlinerResize\.size, dockHeight\)/);
    expect(app).toMatch(/new ResizeObserver\(updateDockHeight\)/);
    expect(app).toMatch(
      /resizeHandleClassName: 'model-resize-handle model-right-dock-resize-handle'/,
    );
    expect(app).not.toMatch(/dockHandleProps/);
    expect(app).toMatch(/<ResizeHandle\s+handleProps=\{splitHandleProps\}/);
    expect(app).toMatch(/<ResizeHandle\s+handleProps=\{handleProps\}/);
    expect(app).toMatch(/\.sendViewportCameraLatest\(/);
    expect(app).not.toMatch(/updateEditorCamera|sendHttpFallback/);
  });
});
