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
  const cssSource = readFileSync(resolve(__dirname, 'index.css'), 'utf8');
  const baseNodeSource = readFileSync(resolve(__dirname, 'components/nodes/BaseNode.tsx'), 'utf8');
  const canvasStoreSource = readFileSync(resolve(__dirname, 'stores/canvasStore.ts'), 'utf8');
  const infiniteCanvasSource = readFileSync(
    resolve(__dirname, 'components/InfiniteCanvas.tsx'),
    'utf8',
  );
  const connectionLayerSource = readFileSync(
    resolve(__dirname, 'components/connections/ConnectionLayer.tsx'),
    'utf8',
  );
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

  it('keeps CanvasApp subscribed through focused store selectors', () => {
    expect(appSource).not.toMatch(/useCanvasStore\(\)/);
    expect(appSource).toMatch(/useCanvasStore\(\(state\) => state\.canvasData\)/);
    expect(appSource).toMatch(/useRuntimeViewportStore\(\(state\) => state\.viewport\)/);
  });

  it('keeps transform pointer frames in transient node preview state', () => {
    expect(appSource).not.toMatch(/state\.moveNode\)/);
    expect(appSource).not.toMatch(/state\.resizeNode\)/);
    expect(appSource).not.toMatch(/state\.rotateNode\)/);
    expect(canvasStoreSource).not.toMatch(/^\s{2}moveNode: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}resizeNode: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}rotateNode: /m);
    expect(appSource).not.toMatch(/onNodeDrag=\{/);
    expect(appSource).not.toMatch(/onNodeResize=\{/);
    expect(appSource).not.toMatch(/onNodeRotate=\{/);
    expect(baseNodeSource).not.toMatch(/onDrag:\s*onDrag/);
    expect(baseNodeSource).not.toMatch(/onResize,\s*disabled/);
    expect(baseNodeSource).not.toMatch(/onRotate,\s*disabled/);
    expect(baseNodeSource).toMatch(/onDragEnd:\s*onMove/);
    expect(baseNodeSource).toMatch(/onResizeEnd/);
    expect(baseNodeSource).toMatch(/onRotateEnd/);
  });

  it('keeps selected-node resize handles outside scrollable node content', () => {
    expect(baseNodeSource).toMatch(/bottom: -8/);
    expect(baseNodeSource).toMatch(/right: -8/);
    expect(baseNodeSource).not.toMatch(/bottom: -4/);
    expect(baseNodeSource).not.toMatch(/right: -4/);
  });

  it('keeps viewport writes in runtime state and webview snapshots', () => {
    expect(canvasStoreSource).not.toMatch(/^\s{2}setViewport: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}panCanvas: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}zoomCanvas: /m);
    expect(canvasStoreSource).not.toMatch(/^\s{2}resetViewport: /m);
    expect(appSource).toMatch(/createViewportSnapshotPolicy/);
    expect(appSource).toMatch(/writeCanvasViewportSnapshot/);
    expect(appSource).toMatch(/readCanvasViewportSnapshot/);
  });

  it('keeps derived projection dependencies memoized and degradable', () => {
    expect(infiniteCanvasSource).toMatch(/const renderedNodes = useMemo/);
    expect(infiniteCanvasSource).toMatch(/const renderedNodeIds = useMemo/);
    expect(infiniteCanvasSource).toMatch(/resolveCanvasRenderRefreshDecision/);
    expect(infiniteCanvasSource).toMatch(/shouldThrottleViewportProjection/);
    expect(infiniteCanvasSource).toMatch(
      /freezeProjection=\{renderRefreshDecision\.shouldFreezeConnectionProjection\}/,
    );
    expect(connectionLayerSource).toMatch(/freezeProjection\?: boolean/);
    expect(connectionLayerSource).toMatch(/latestProjectionRef/);
    expect(appSource).toMatch(/const minimapViewport = useThrottledCanvasViewport\(viewport/);
    expect(appSource).toMatch(/viewport=\{minimapViewport\}/);
  });

  it('rebounds minimap sizing observers when the canvas pane remounts', () => {
    expect(appSource).toMatch(/const setCanvasContainerRef = useCallback/);
    expect(appSource).toMatch(/setCanvasContainerElement\(element\)/);
    expect(appSource).toMatch(/const setZoomControlsRef = useCallback/);
    expect(appSource).toMatch(/setZoomControlsElement\(element\)/);
    expect(appSource).toMatch(/ref=\{setCanvasContainerRef\}/);
    expect(appSource).toMatch(/ref=\{setZoomControlsRef\}/);
    expect(appSource).not.toMatch(
      /useEffect\(\(\) => \{[\s\S]*canvasContainerRef\.current[\s\S]*\}, \[isReady\]\)/,
    );
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

  it('does not duplicate the document title as a canvas scope chip', () => {
    expect(appSource).toMatch(/function CanvasBoardNavigationBar/);
    expect(appSource).toMatch(/if \(relatedBoards\.length === 0\) return null/);
    expect(appSource).not.toMatch(/CanvasScopeNavigationBar/);
    expect(appSource).not.toMatch(/SCOPE_LABELS/);
    expect(appSource).not.toMatch(/scopeNavigation\.kind/);
    expect(appSource).not.toMatch(/scopeNavigation\.boardCount/);
  });

  it('keeps playback controls inside PlaybackWorkspace without reusing the old preview entry', () => {
    expect(appSource).not.toMatch(/<PlaybackControllerHost/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="reveal-playback-workspace"/);
    expect(toolbarSource).not.toMatch(/toggle-playback-canvas-pane/);
    expect(toolbarSource).not.toMatch(/toggle-playback-stage-pane/);
    expect(toolbarSource).not.toMatch(/toggle-playback-route-pane/);
    expect(toolbarSource).toMatch(/icon=\{<PlayIcon size=\{18\} \/>\}/);
    expect(appSource).toMatch(
      /reportAction\('revealPlaybackWorkspace', t\('toolbar\.playbackWorkspace'\)\)/,
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
    expect(appSource).toMatch(/rightDock=\{\s*isRightNodeTreeVisible/);
    expect(appSource).toMatch(/id: 'canvas-right-node-tree-panel'/);
    expect(appSource).toMatch(/panelId: 'canvas\.nodeLibraryDock'/);
    expect(appSource).toMatch(
      /const \[rightDockMode, setRightDockMode\] = useState<CanvasRightDockMode>\('basic'\)/,
    );
    expect(appSource).toMatch(/groups: \{/);
    expect(appSource).toMatch(/activeId: rightDockMode/);
    expect(appSource).toMatch(/label: t\('rightDock\.mode\.basic'\)/);
    expect(appSource).toMatch(/label: t\('rightDock\.mode\.professional'\)/);
    expect(appSource).toMatch(
      /const BASIC_CANVAS_SUBSYSTEM_IDS: readonly CanvasSubsystemId\[] = \['storyboard'\]/,
    );
    expect(appSource).toMatch(/basicNodeLibrarySubsystemManifests/);
    expect(appSource).toMatch(/basicNodeLibraryDescriptors/);
    expect(appSource).toMatch(
      /rightDockMode === 'professional'\s*\?\s*WEBVIEW_SUBSYSTEM_REGISTRY\.manifests\s*:\s*basicNodeLibrarySubsystemManifests/,
    );
    expect(appSource).toMatch(/<NodeLibraryPanel/);
    expect(appSource).toMatch(/'data-canvas-right-node-tree': 'true'/);
    expect(nodeLibrarySource).not.toMatch(/id="canvas-right-node-tree-panel"/);
    expect(nodeLibrarySource).not.toMatch(/data-canvas-right-node-tree="true"/);
  });

  it('keeps the node library visually integrated with the right dock', () => {
    expect(nodeLibrarySource).toContain('className="canvas-node-library-panel');
    expect(nodeLibrarySource).toContain('className="canvas-node-library-header');
    expect(nodeLibrarySource).toContain('className="canvas-node-library-scroll');
    expect(cssSource).toMatch(/\.canvas-right-node-tree-panel-content\s*\{[^}]*width:\s*100%/);
    expect(cssSource).toMatch(/\.canvas-node-library-panel\s*\{[^}]*width:\s*100%/);
    expect(cssSource).toMatch(/\.canvas-node-library-section\s*\{[^}]*background:\s*transparent/);
    expect(cssSource).toMatch(/\.canvas-node-library-section\s*\{[^}]*box-shadow:\s*none/);
    expect(cssSource).toMatch(/#canvas-right-node-tree-panel \.neko-creative-tree-view/);
    expect(cssSource).toMatch(
      /#canvas-right-node-tree-panel \[role="treeitem"\] > button:first-child/,
    );
    expect(cssSource).toMatch(
      /#canvas-right-node-tree-panel \[role="treeitem"\] > button:first-child\.invisible\s*\{[^}]*display:\s*none/,
    );
  });

  it('marks primary canvas tools and visibility toggles by responsibility', () => {
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="toggle-pan-mode"/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="open-add-node-popover"/);
    expect(toolbarSource).not.toMatch(/data-creative-left-rail-action="import-file"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="reveal-playback-workspace"/);
    expect(toolbarSource).not.toMatch(/onTogglePlaybackPane/);
    expect(toolbarSource).not.toMatch(/playbackPaneState/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-export"/);
    expect(toolbarSource).toMatch(/data-creative-left-rail-action="open-package"/);
    expect(toolbarSource).toMatch(/onRevealPlaybackWorkspace\?: \(\) => void/);
    expect(toolbarSource).toMatch(/onOpenExport\?: \(\) => void/);
    expect(toolbarSource).toMatch(/onOpenPackage\?: \(\) => void/);
    expect(appSource).toMatch(
      /reportAction\('revealPlaybackWorkspace', t\('toolbar\.playbackWorkspace'\)\)/,
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
