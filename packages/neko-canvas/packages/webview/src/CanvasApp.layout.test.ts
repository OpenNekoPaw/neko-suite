import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Canvas creative workbench layout boundary', () => {
  const appSource = readFileSync(resolve(__dirname, 'CanvasApp.tsx'), 'utf8');
  const toolbarSource = readFileSync(
    resolve(__dirname, 'components/toolbar/CanvasToolbar.tsx'),
    'utf8',
  );
  const nodeLibrarySource = readFileSync(
    resolve(__dirname, 'components/panels/NodeLibraryPanel.tsx'),
    'utf8',
  );

  it('uses the shared shell without changing the canvas-first main panel', () => {
    expect(appSource).toMatch(/import \{ CreativeWorkbenchShell \} from '@neko\/ui\/workbench'/);
    expect(appSource).toMatch(/<CreativeWorkbenchShell/);
    expect(appSource).toMatch(/mainKind="canvas"/);
    expect(appSource).toMatch(/leftRail=\{\s*<CanvasToolbar/);
    expect(appSource).toMatch(/mainClassName="canvas-main-panel"/);
    expect(appSource).toMatch(/className="canvas-main-surface"/);
    expect(appSource).toMatch(/<InfiniteCanvas/);
  });

  it('keeps canvas overlays and controls inside the main panel surface', () => {
    const mainStart = appSource.indexOf('className="canvas-main-surface"');
    expect(mainStart).toBeGreaterThan(-1);
    for (const token of [
      '<MiniMap',
      '<ZoomControls',
      '<FloatingPanelHost',
      '<PlaybackControllerHost',
      '<GenerationPromptPanel',
      '<ContentOverlay',
    ]) {
      expect(appSource.indexOf(token)).toBeGreaterThan(mainStart);
    }
    expect(appSource).toMatch(/id="canvas-hud-controls"/);
    expect(appSource).toMatch(/isHudVisible && \(/);
  });

  it('keeps the right node library in the right-panel responsibility', () => {
    expect(appSource).toMatch(
      /const \[isRightNodeTreeVisible, setIsRightNodeTreeVisible\] = useState\(false\)/,
    );
    expect(appSource).toMatch(/rightPanel=\{\s*isRightNodeTreeVisible \? \(/);
    expect(appSource).toMatch(/<NodeLibraryPanel/);
    expect(nodeLibrarySource).toMatch(/id="canvas-right-node-tree-panel"/);
    expect(nodeLibrarySource).toMatch(/data-canvas-right-node-tree="true"/);
  });

  it('marks primary canvas tools and visibility toggles by responsibility', () => {
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="toggle-pan-mode"/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="open-add-node-popover"/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="import-file"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="toggle-right-node-tree"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-kind="visibility-toggle"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="hud"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="right-panel"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-hud-controls"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-right-node-tree-panel"/);
  });
});
