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
  const baseNodeSource = readFileSync(resolve(__dirname, 'components/nodes/BaseNode.tsx'), 'utf8');
  const containerRendererSource = readFileSync(
    resolve(__dirname, 'components/content/ContainerRenderer.tsx'),
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
      '<GenerationPromptPanel',
      '<ContentOverlay',
    ]) {
      expect(appSource.indexOf(token)).toBeGreaterThan(mainStart);
    }
    expect(appSource).toMatch(/id="canvas-hud-controls"/);
    expect(appSource).toMatch(/isHudVisible && \(/);
  });

  it('keeps playback controls owned by the Preview panel, with Canvas exposing only the entry point', () => {
    expect(appSource).not.toMatch(/<PlaybackControllerHost/);
    expect(appSource).not.toMatch(/<CanvasPlaybackController/);
    expect(appSource).not.toMatch(/createCanvasPlaybackPlan\(/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-narrative-preview"/);
    expect(toolbarSource).toMatch(/icon=\{<PlayIcon size=\{18\} \/>\}/);
    expect(appSource).toMatch(
      /reportAction\('openNarrativePreview', t\('toolbar\.narrativePreview'\)\)/,
    );
  });

  it('keeps playback highlight as visual state separate from selection props', () => {
    expect(baseNodeSource).toMatch(/state\.activePlayingNodeId/);
    expect(baseNodeSource).toMatch(/data-playback-active=\{isPlaybackActive/);
    expect(baseNodeSource).toMatch(/isSelected \|\| isPlaybackActive/);
    expect(containerRendererSource).toMatch(/state\.activePlayingNodeId === childNode\.id/);
    expect(containerRendererSource).toMatch(/data-playback-active=\{isPlaybackActive/);
    expect(appSource).not.toMatch(/setActivePlayingNode\(/);
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
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-narrative-preview"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-export"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-package"/);
    expect(toolbarSource).toMatch(/onOpenNarrativePreview\?: \(\) => void/);
    expect(toolbarSource).toMatch(/onOpenExport\?: \(\) => void/);
    expect(toolbarSource).toMatch(/onOpenPackage\?: \(\) => void/);
    expect(appSource).toMatch(
      /reportAction\('openNarrativePreview', t\('toolbar\.narrativePreview'\)\)/,
    );
    expect(appSource).toMatch(/reportAction\('openExport', t\('toolbar\.export'\)\)/);
    expect(appSource).toMatch(
      /reportAction\('openPackage', t\('toolbar\.package'\), undefined, canvasData\)/,
    );
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="toggle-right-node-tree"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-kind="visibility-toggle"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="hud"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-target="right-panel"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-hud-controls"/);
    expect(toolbarSource).toMatch(/aria-controls="canvas-right-node-tree-panel"/);
  });
});
