import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sketch creative workbench layout boundary', () => {
  const appSource = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8');
  const toolbarSource = readFileSync(resolve(__dirname, 'components/Toolbar.tsx'), 'utf8');
  const frameTimelineSource = readFileSync(
    resolve(__dirname, 'components/FrameTimeline.tsx'),
    'utf8',
  );

  it('uses the shared shell for drawing canvas, left tool rail, right panels, and timeline', () => {
    expect(appSource).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(appSource).toMatch(/<CreativeWorkbenchShell/);
    expect(appSource).toMatch(/mainKind="drawing-canvas"/);
    expect(appSource).toMatch(/leftRail=\{<Toolbar \/>}/);
    expect(appSource).toMatch(/mainClassName="sketch-main-panel"/);
    expect(appSource).toMatch(/className="sketch-canvas-container"/);
    expect(appSource).toMatch(/bottomPanel=\{\s*showFrameTimeline \? \(/);
    expect(appSource).toMatch(/<FrameTimeline isKeyboardFocusedRef=\{isKeyboardFocusedRef\} \/>/);
  });

  it('keeps drawing tools on the left rail while sidebar controls stay in the right panel', () => {
    const uiSliceSource = readFileSync(resolve(__dirname, 'stores/slices/uiSlice.ts'), 'utf8');

    expect(uiSliceSource).toMatch(/showSidebar: false/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-kind="common-action"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-kind="visibility-toggle"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="main-panel"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="right-panel"/);
    expect(toolbarSource).toMatch(/aria-controls="sketch-frame-timeline"/);
    expect(toolbarSource).toMatch(/aria-controls="sketch-right-sidebar"/);
    expect(appSource).toMatch(/rightPanel=\{\s*showSidebar \? \(/);
    for (const token of [
      '<BrushPanel',
      '<PalettePanel',
      '<LayerPanel',
      '<FilterPanel',
      '<FrameControls',
      '<ScenePanel',
    ]) {
      expect(appSource).toMatch(new RegExp(token.replace('<', '<')));
    }
  });

  it('projects passive status to VSCode and keeps frame controls in the main workbench', () => {
    expect(appSource).toMatch(/type: 'status:update'/);
    expect(appSource).toMatch(/zoom: viewport\.zoom/);
    expect(appSource).toMatch(/activeTool/);
    expect(frameTimelineSource).toMatch(/id="sketch-frame-timeline"/);
    expect(frameTimelineSource).toMatch(/className="flex flex-col border-t/);
    expect(frameTimelineSource).toMatch(/role="listbox"/);
  });
});
