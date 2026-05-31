import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

function hasSource(relativePath: string): boolean {
  return existsSync(resolve(srcRoot, relativePath));
}

function readCssRule(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? '';
}

describe('Route A webview boundaries', () => {
  it('keeps App Route A main viewport free of persistent R3F model mounts', () => {
    const app = readSource('App.tsx');

    expect(app).not.toMatch(/<Viewport3D\b/);
    expect(app).not.toMatch(/<ModelLoader\b/);
    expect(app).not.toMatch(/<R3FDevelopmentFallback\b/);
    expect(app).not.toMatch(/<SourceModelPreview\b/);
    expect(app).toMatch(/<VideoViewport\b/);
  });

  it('mounts Route A video viewport whenever Engine streaming is available', () => {
    const app = readSource('App.tsx');

    expect(app).toMatch(/const shouldRenderEngineViewport = enginePort !== null;/);
    expect(app).toMatch(/\{enginePort !== null \? \(/);
    expect(app).not.toMatch(/const hasEngineScene = sceneNodes\.length > 0;/);
    expect(app).not.toMatch(/<ModelEmptyState\b/);
    expect(app).not.toMatch(/emptyScene|noDocument/);
    expect(app).not.toMatch(/enginePort !== null && \(modelUrl \|\| hasEngineScene\)/);
  });

  it('routes raw GLB/GLTF/VRM documents through Engine loading only', () => {
    const app = readSource('App.tsx');
    const types = readSource('types/index.ts');
    const extension = readSource('../../extension/src/editor/ModelEditorProvider.ts');

    expect(types).not.toMatch(/ModelViewportMode|type: 'loadModel'|FileSourceRef/);
    expect(app).not.toMatch(/modelViewportMode|setModelUrl|modelUrl|SourceModelPreview/);
    expect(extension).not.toMatch(
      /postLoadModelMessage|source-preview|viewportMode|type: 'loadModel'/,
    );
    expect(extension).toMatch(
      /await this\.loadModelInEngine\(filePath, webviewPanel, generation\);/,
    );
    expect(extension).toMatch(
      /await this\.loadModelInEngine\(importPath, webviewPanel, generation\);/,
    );
    expect(extension).toMatch(
      /await this\.loadModelInEngine\(modelPath, webviewPanel, generation\);/,
    );
  });

  it('activates the VSCode custom editor entry for model documents', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(srcRoot, '../../../package.json'), 'utf8'),
    ) as {
      activationEvents?: string[];
      contributes?: {
        customEditors?: Array<{
          viewType?: string;
          selector?: Array<{ filenamePattern?: string }>;
          priority?: string;
        }>;
      };
    };

    expect(manifest.activationEvents).toContain('onCustomEditor:neko.modelEditor');
    const modelEditor = manifest.contributes?.customEditors?.find(
      (editor) => editor.viewType === 'neko.modelEditor',
    );
    expect(modelEditor?.priority).toBe('default');
    expect(modelEditor?.selector?.map((selector) => selector.filenamePattern)).toEqual([
      '*.gltf',
      '*.glb',
      '*.vrm',
      '*.nkm',
    ]);
  });

  it('loads webview bundles through hashed Vite assets to avoid stale VSCode webview cache', () => {
    const viteConfig = readFileSync(resolve(srcRoot, '../vite.config.ts'), 'utf8');
    const provider = readSource('../../extension/src/editor/ModelEditorProvider.ts');

    expect(viteConfig).toMatch(/entryFileNames:\s*'assets\/\[name\]-\[hash\]\.js'/);
    expect(viteConfig).toMatch(/assetFileNames:\s*'assets\/\[name\]-\[hash\]\[extname\]'/);
    expect(provider).toMatch(/parseViteWebviewAssets/);
    expect(provider).toMatch(/dist', 'webview', 'index\.html'/);
    expect(provider).toMatch(/asWebviewUri/);
    expect(provider).not.toMatch(/assets\/index\.js/);
    expect(provider).not.toMatch(/assets\/index\.css/);
  });

  it('does not ship a visible R3F/Three.js model fallback or dependency path', () => {
    const componentsIndex = readSource('components/index.ts');
    const packageJson = readFileSync(resolve(srcRoot, '../package.json'), 'utf8');
    const viteConfig = readFileSync(resolve(srcRoot, '../vite.config.ts'), 'utf8');

    expect(hasSource('components/R3FDevelopmentFallback.tsx')).toBe(false);
    expect(hasSource('components/Viewport3D.tsx')).toBe(false);
    expect(hasSource('components/ModelLoader.tsx')).toBe(false);
    expect(hasSource('components/TransformGizmo.tsx')).toBe(false);
    expect(componentsIndex).not.toMatch(/Viewport3D|ModelLoader|TransformGizmo/);
    expect(`${packageJson}\n${viteConfig}`).not.toMatch(
      /@react-three\/fiber|@react-three\/drei|@pixiv\/three-vrm|"three"|"@types\/three"/,
    );
  });

  it('keeps VideoViewport as Engine frame canvas plus overlay and interaction layers', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const guideOverlay = readSource('components/ViewportGuideOverlay.tsx');

    expect(videoViewport).toMatch(/<ViewportShell\b/);
    expect(videoViewport).toMatch(/<div ref=\{viewportRef\}/);
    expect(videoViewport).toMatch(/<canvas/);
    expect(videoViewport).toMatch(/model-viewport-frame/);
    expect(videoViewport).toMatch(/<ViewportGuideOverlay\b/);
    expect(videoViewport).not.toMatch(/<ViewportNavigationControls\b/);
    expect(hasSource('components/ViewportNavigationControls.tsx')).toBe(false);
    expect(videoViewport).toMatch(/<InteractionLayer\b/);
    expect(videoViewport).toMatch(/<OverlayCanvas\b/);
    expect(videoViewport).not.toMatch(/children/);
    expect(videoViewport).not.toMatch(/bg-black/);
    expect(videoViewport).not.toMatch(/<Viewport3D\b|<ModelLoader\b/);
    expect(guideOverlay).toMatch(/screen-hud/);
    expect(guideOverlay).not.toMatch(/blender-grid/);
  });

  it('integrates model ViewportShell migration through shared overlays, context menu, and hidden protocol toolbar', () => {
    const app = readSource('App.tsx');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const modelController = readSource('viewport/ModelController.ts');
    const css = readSource('index.css');

    expect(app).toMatch(/<CharacterPreviewModeSelector\b/);
    expect(videoViewport).toMatch(/controller=\{modelController\}/);
    expect(videoViewport).toMatch(/frameMeta=\{viewportFrameMeta\}/);
    expect(videoViewport).toMatch(/<OverlayRenderer frameMeta=\{frameMeta\} overlays=\{overlays\}/);
    expect(videoViewport).not.toMatch(/<ViewportToolbar/);
    expect(videoViewport).toMatch(/renderToolbar=\{\(\) => null\}/);
    expect(videoViewport).toMatch(/onContextMenuAction=\{handleViewportContextMenuAction\}/);
    expect(videoViewport).toMatch(/captureMaterialPreview\(enginePort, onSceneControlError\)/);
    expect(videoViewport).toMatch(/routeAUnavailable/);
    expect(videoViewport).toMatch(/modelErrorMessage\('error\.routeAUnavailable'\)/);
    expect(videoViewport).not.toMatch(/onToolbarAction=/);
    expect(modelController).toMatch(/getContextMenu\(request: ViewportContextMenuRequest\)/);
    expect(modelController).toMatch(/handleModelMenuAction/);
    expect(css).toMatch(/neko-viewport-context-menu/);
  });

  it('keeps model side rails full-height and moves viewport command buttons into the left toolbar', () => {
    const app = readSource('App.tsx');
    const toolbar = readSource('components/Toolbar.tsx');
    const css = readSource('index.css');

    expect(app).toMatch(/<CreativeWorkbenchShell/);
    expect(app).toMatch(/mainKind="viewport-timeline"/);
    expect(app).toMatch(/bodyClassName="model-workbench-body"/);
    expect(app).toMatch(/leftRail=\{\s*<ModelSideToolbar/);
    expect(app).toMatch(/className="model-left-toolbar"/);
    expect(app).toMatch(/width=\{48\}/);
    expect(app).toMatch(/isViewportHudVisible=\{isViewportHudVisible\}/);
    expect(app).toMatch(/const toggleViewportHud = useCallback/);
    expect(app).toMatch(/onToggleViewportHud=\{toggleViewportHud\}/);
    expect(app).toMatch(/isBottomPanelVisible=\{isBottomPanelVisible\}/);
    expect(app).toMatch(/const toggleBottomPanel = useCallback/);
    expect(app).toMatch(/onToggleBottomPanel=\{toggleBottomPanel\}/);
    expect(app).toMatch(/isRightDockVisible=\{isRightDockVisible\}/);
    expect(app).toMatch(/const toggleRightDock = useCallback/);
    expect(app).toMatch(/onToggleRightDock=\{toggleRightDock\}/);
    expect(app).toMatch(/mainClassName="model-center-panel"/);
    expect(app).toMatch(/<section className="model-viewport-area">/);
    expect(app).not.toMatch(/<ModelViewportControls/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-viewport-grid"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-performance-metrics"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="reset-camera"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-viewport-hud"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-bottom-panel"/);
    expect(toolbar).toMatch(/data-creative-left-rail-target="hud"/);
    expect(toolbar).toMatch(/data-creative-left-rail-action="toggle-bottom-panel"/);
    expect(toolbar).toMatch(/data-model-toolbar-action=\{`toggle-\$\{item.key\}`\}/);
    expect(app).toMatch(/<div id="model-viewport-hud">/);
    expect(app).toMatch(/hudVisible=\{isViewportHudVisible\}/);
    expect(app).toMatch(/<ViewportPerformanceOverlay \/>/);
    expect(app).toMatch(/\{isBottomPanelVisible \? \(\s*<TimelineDock/);
    expect(app).toMatch(/id="model-timeline-controls"/);
    expect(app).toMatch(/id="model-timeline-dock"/);
    expect(app).not.toMatch(/timelineControlsHidden/);
    expect(app).toMatch(/rightPanel=\{\s*isRightDockVisible \? \(/);
    expect(css).toMatch(/\.model-center-panel\s*\{[\s\S]*flex-direction: column;/);
    expect(css).toMatch(/\.model-viewport-area\s*\{[\s\S]*flex-direction: column;/);
    expect(css).not.toMatch(/\.model-viewport-controls\s*\{/);
    expect(css).toMatch(/#model-viewport-hud\s*\{[\s\S]*grid-template-areas:/);
    expect(css).toMatch(/#model-viewport-hud\s*\{[\s\S]*pointer-events: none;/);
    expect(css).toMatch(/\.model-lookdev-controls\s*\{[\s\S]*grid-area: lookdev;/);
    expect(css).toMatch(/\.model-selection-mode-controls\s*\{[\s\S]*grid-area: selection;/);
    expect(css).toMatch(/\.model-character-preview-modes\s*\{[\s\S]*grid-area: preview;/);

    const toolbarRule = readCssRule(css, '.model-left-toolbar.neko-vtoolbar');
    expect(toolbarRule).toMatch(/border-right:/);
    expect(toolbarRule).not.toMatch(/position: absolute/);

    const lookDevRule = readCssRule(css, '.model-lookdev-controls');
    expect(lookDevRule).not.toMatch(/position: absolute/);
    expect(lookDevRule).not.toMatch(/left:|right:|top:/);

    const selectionModesRule = readCssRule(css, '.model-selection-mode-controls');
    expect(selectionModesRule).not.toMatch(/position: absolute/);
    expect(selectionModesRule).not.toMatch(/left:|right:|top:/);

    const previewModesRule = readCssRule(css, '.model-character-preview-modes');
    expect(previewModesRule).not.toMatch(/position: absolute/);
    expect(previewModesRule).not.toMatch(/left:|right:|top:/);
    expect(previewModesRule).not.toMatch(/left: 56px;/);
  });

  it('keeps viewport performance metrics as a toggleable read-only Route A overlay', () => {
    const app = readSource('App.tsx');
    const toolbar = readSource('components/Toolbar.tsx');
    const overlay = readSource('components/ViewportPerformanceOverlay.tsx');
    const store = readSource('stores/modelStore.ts');
    const css = readSource('index.css');

    expect(app).toMatch(/isPerformanceMetricsVisible/);
    expect(app).toMatch(
      /\{isPerformanceMetricsVisible \? <ViewportPerformanceOverlay \/> : null\}/,
    );
    expect(toolbar).toMatch(/togglePerformanceMetrics/);
    expect(toolbar).toMatch(/aria-controls="model-performance-metrics"/);
    expect(toolbar).toMatch(/toolbar\.showPerformanceMetrics/);
    expect(store).toMatch(/isPerformanceMetricsVisible: false/);
    expect(store).toMatch(/togglePerformanceMetrics/);
    expect(overlay).toMatch(/authoringMetricsSnapshot/);
    expect(overlay).toMatch(/lastRenderFrameMeta/);
    expect(overlay).toMatch(/diagnostics\?\.gpuFrameTimeMs/);
    expect(overlay).toMatch(/diagnostics\?\.decodeSubmitToOutputMs/);
    expect(overlay).toMatch(/diagnostics\?\.packetToDecodeOutputMs/);
    expect(overlay).toMatch(/diagnostics\?\.decodeOutputToPresentedMs/);
    expect(overlay).toMatch(/diagnostics\?\.presentFps/);
    expect(overlay).toMatch(/diagnostics\?\.droppedBeforeDecode/);
    expect(overlay).toMatch(/diagnostics\?\.decodedDroppedBeforePresent/);
    expect(overlay).not.toMatch(/new EngineClient|postMessage\(|SceneControlSocket|WebSocket/);
    expect(overlay).not.toMatch(
      /@react-three\/fiber|@react-three\/drei|@pixiv\/three-vrm|"three"|"@types\/three"|GLTFLoader|VRMLoader|gltf-parser|parseGltf|parseVRM/,
    );
    expect(css).toMatch(/\.model-performance-overlay\s*\{/);
    expect(css).toMatch(/#model-viewport-hud\s*\{/);
  });

  it('defaults the right dock to hidden while keeping the toolbar toggle wired', () => {
    const app = readSource('App.tsx');

    expect(app).toMatch(/const \[isRightDockVisible, setIsRightDockVisible\] = useState\(false\)/);
    expect(app).toMatch(/isRightDockVisible=\{isRightDockVisible\}/);
    expect(app).toMatch(/onToggleRightDock=\{toggleRightDock\}/);
    expect(app).toMatch(/rightPanel=\{\s*isRightDockVisible \? \(/);
  });

  it('drives Blender-style workbench chrome from VSCode light and dark theme tokens', () => {
    const app = readSource('App.tsx');
    const css = readSource('index.css');
    const guideOverlay = readSource('components/ViewportGuideOverlay.tsx');

    expect(css).toMatch(/body\.vscode-dark/);
    expect(css).toMatch(/body\[data-vscode-theme-kind='vscode-dark'\]/);
    expect(css).toMatch(/body\.vscode-light/);
    expect(css).toMatch(/body\[data-vscode-theme-kind='vscode-light'\]/);
    expect(css).toMatch(/body\[data-vscode-theme-kind='vscode-high-contrast-light'\]/);
    for (const token of [
      '--model-workbench-bg',
      '--model-topbar-bg',
      '--model-viewport-bg',
      '--model-dock-bg',
      '--model-timeline-bg',
      '--model-guide-widget-bg',
      '--model-axis-x',
    ]) {
      expect(css, token).toMatch(new RegExp(`${token}:`));
    }
    expect(css).toMatch(/background: var\(--model-workbench-bg\)/);
    expect(css).toMatch(/background: var\(--model-viewport-bg\)/);
    expect(css).toMatch(/background: var\(--model-dock-bg\)/);
    expect(css).toMatch(/background: var\(--model-timeline-bg\)/);
    expect(app).toMatch(/model-quality-preview-overlay/);
    expect(app).not.toMatch(/pointer-events-none absolute inset-0 bg-black/);
    expect(guideOverlay).toMatch(/getComputedStyle/);
    expect(guideOverlay).toMatch(/MutationObserver/);
    expect(guideOverlay).toMatch(/--model-guide-widget-bg/);
  });

  it('removes the Webview WorkbenchTopBar after native status projection', () => {
    const app = readSource('App.tsx');
    const css = readSource('index.css');
    const extension = readSource('../../extension/src/extension.ts');
    const provider = readSource('../../extension/src/editor/ModelEditorProvider.ts');

    expect(app).not.toMatch(/WorkbenchTopBar/);
    expect(app).not.toMatch(/EngineDiagnosticsPanel/);
    expect(app).toMatch(/type: 'modelStatus'/);
    expect(app).toMatch(/selectedNodeName/);
    expect(app).toMatch(/sceneRevision/);
    expect(css).not.toMatch(/\.model-workbench-topbar/);
    expect(css).not.toMatch(/\.model-engine-diagnostics/);
    expect(css).not.toMatch(/--model-engine-pill/);
    expect(extension).toMatch(/new ModelStatusBar\(\)/);
    expect(provider).toMatch(/case 'modelStatus'/);
    expect(provider).toMatch(/sceneRevision/);
  });

  it('sizes Route A stream from the actual webview viewport instead of a fixed canvas', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');

    expect(videoViewport).toMatch(/new ResizeObserver/);
    expect(videoViewport).toMatch(/createViewportStreamSize/);
    expect(videoViewport).toMatch(/TARGET_VIEWPORT_STREAM_HEIGHT = 1080/);
    expect(videoViewport).toMatch(/MAX_VIEWPORT_STREAM_WIDTH = 1920/);
    expect(videoViewport).toMatch(/MAX_VIEWPORT_STREAM_HEIGHT = 1080/);
    expect(videoViewport).toMatch(/MAX_VIEWPORT_DEVICE_PIXEL_RATIO = 2/);
    expect(videoViewport).toMatch(/VIEWPORT_STREAM_FPS = 60/);
    expect(videoViewport).toMatch(/allowFpsDegrade: false/);
    expect(videoViewport).toMatch(/allowQualityDegrade: false/);
    expect(videoViewport).toMatch(/VIEWPORT_RESIZE_COMMIT_DELAY_MS/);
    expect(videoViewport).toMatch(/window\.setTimeout/);
    expect(videoViewport).toMatch(/clamped % 2 === 0/);
    expect(videoViewport).toMatch(/ctx\.imageSmoothingQuality = 'high'/);
    expect(videoViewport).toMatch(/resolution:\s*\{\s*width: streamSize\.width/);
    expect(videoViewport).not.toMatch(
      /width:\s*1280,\s*\n\s*height:\s*720,\s*\n\s*pixelRatio:\s*window\.devicePixelRatio/,
    );
  });

  it('presents Route A decoded frames through requestAnimationFrame backpressure', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const h264Client = readFileSync(
      resolve(srcRoot, '../../../../neko-client/src/H264StreamClient.ts'),
      'utf8',
    );

    expect(videoViewport).toMatch(/pendingPresentationRef/);
    expect(videoViewport).toMatch(/requestAnimationFrame\(presentLatestFrame\)/);
    expect(videoViewport).toMatch(/cancelAnimationFrame/);
    expect(videoViewport).toMatch(/previous\.frame\.close\(\)/);
    expect(videoViewport).toMatch(/updateRenderFrameMeta\(drawnMeta\)/);
    expect(videoViewport).toMatch(/RENDER_FRAME_META_STORE_INTERVAL_MS = 250/);
    expect(videoViewport).toMatch(/maxDecodeQueueDepth: 4/);
    expect(videoViewport).toMatch(/dropDeltaFramesWhenBacklogged: false/);
    expect(h264Client).toMatch(/latencyMode: this\.descriptor\?\.latencyMode/);
    expect(h264Client).toMatch(/codedWidth: this\.descriptor\?\.codedWidth/);
    expect(videoViewport).not.toMatch(/onFrame:\s*\(frame, meta\) => \{[\s\S]*ctx\.drawImage/);
    expect(h264Client).not.toMatch(/shouldDropQueuedRouteAFrame/);
  });

  it('routes viewport camera controls through scene-control websocket only', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const app = readSource('App.tsx');
    const orbitControls = readSource('components/ViewportOrbitControls.tsx');
    const toolbar = readSource('components/Toolbar.tsx');
    const modelController = readSource('viewport/ModelController.ts');

    expect(videoViewport).toMatch(/!sceneControlSocket\?\.isOpen\(\)/);
    expect(videoViewport).toMatch(/sceneControlSocket\.updateViewportCamera/);
    expect(videoViewport).toMatch(/sceneControlSocket\.requestKeyframe\(MAIN_VIEWPORT_ID\)/);
    expect(videoViewport).toMatch(/cameraUpdateInFlightRef/);
    expect(videoViewport).toMatch(/pendingCameraUpdateRef/);
    expect(videoViewport).toMatch(/VIEWPORT_CAMERA_SEND_INTERVAL_MS = 33/);
    expect(videoViewport).toMatch(/scheduleViewportCamera/);
    expect(videoViewport).toMatch(/pendingCameraFlushTimerRef/);
    expect(videoViewport).toMatch(/VIEWPORT_CAMERA_KEYFRAME_INTERVAL_MS/);
    expect(videoViewport).not.toMatch(/sendHttpFallback|updateEditorCamera/);
    expect(app).toMatch(/!socket\?\.isOpen\(\)/);
    expect(app).toMatch(/socket\s*\n\s*\.updateViewportCamera/);
    expect(app).not.toMatch(/updateEditorCamera/);
    expect(videoViewport).not.toMatch(/modelController\s*\n\s*\.updateCamera\(\)/);
    expect(modelController).toMatch(/'viewport:camera'/);
    expect(modelController).toMatch(/position: vec3ToTuple\(store\.getCameraPosition\(\)\)/);
    expect(modelController).toMatch(/target: vec3ToTuple\(store\.cameraTarget\)/);
    expect(modelController).toMatch(/kind: 'camera'/);
    expect(orbitControls).toMatch(/SEND_INTERVAL_MS = 33/);
    expect(orbitControls).toMatch(
      /onCameraChange\?: \(options\?: \{ readonly immediate\?: boolean \}\) => void/,
    );
    expect(orbitControls).toMatch(/sendCamera\(true\)/);
    expect(toolbar).toMatch(/onCameraChange\?\.\(\)/);
    expect(toolbar).toMatch(/onCameraMutated\?\.\(\)/);
    expect(orbitControls).toMatch(/zoomCamera\(-zoomStep\)/);
    expect(toolbar).not.toMatch(/zoomCamera\(|viewport\.zoomIn|viewport\.zoomOut/);
    expect(toolbar).toMatch(/onClick=\{toolbarState\.toggleViewportGrid\}/);
    expect(toolbar).toMatch(/runCameraAction\(toolbarState\.resetCamera\)/);
    expect(toolbar).toMatch(/export const ModelSideToolbar = memo/);
    expect(toolbar).toMatch(/selectViewportToolbarStoreState/);
    expect(toolbar).toMatch(/areToolbarStatesEqual/);
    expect(orbitControls).not.toMatch(/new EngineClient|updateEditorCamera/);
    expect(toolbar).not.toMatch(/new EngineClient|updateEditorCamera/);
  });

  it('enables character preview controls for a selected or single previewable scene node', () => {
    const app = readSource('App.tsx');
    const selector = readSource('components/CharacterPreviewModeSelector.tsx');

    expect(app).toMatch(/const characterPreviewTarget = resolveCharacterPreviewTarget/);
    expect(app).toMatch(/const selectedCharacterId = characterPreviewTarget\.characterId/);
    expect(app).toMatch(
      /const isCharacterPreviewDisabled = !routeAReady \|\| !selectedCharacterId/,
    );
    expect(app).toMatch(/sceneNodes\.filter\(isPreviewableSceneNode\)/);
    expect(app).toMatch(/node\.kind === 'mesh' \|\| node\.mesh !== undefined/);
    expect(app).toMatch(/statusLabel=\{characterPreviewStatusLabel\}/);
    expect(app).toMatch(/characterPreview\.status\.ready/);
    expect(selector).toMatch(/statusLabel\?: string/);
    expect(selector).toMatch(/const displayStatus =/);
  });

  it('sends typed selection queries with the same viewport contract as the engine stream', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const modelController = readSource('viewport/ModelController.ts');

    expect(videoViewport).toMatch(/const payload: ViewportSerializableRecord = viewportSize/);
    expect(videoViewport).toMatch(/sendViewportCommand\('viewport:select', payload\)/);
    expect(videoViewport).toMatch(/sceneControlSocket,\s*\n\s*getViewportRect/);
    expect(modelController).toMatch(/socket\.query\('selectionQuery'/);
    expect(modelController).toMatch(/mask: selectionMaskForWorkflow/);
    expect(videoViewport).toMatch(/viewportId: MAIN_VIEWPORT_ID,\s*\n\s*sceneId,/);
    expect(videoViewport).toMatch(/sceneRevision,\s*\n\s*x: normalizedX/);
    expect(videoViewport).toMatch(/resolution:\s*\{\s*\n\s*width: viewportSize\.width/);
    expect(videoViewport).not.toMatch(/buildViewportQueryCamera|camera:/);
  });

  it('routes model transform commits through scene-control websocket command envelopes', () => {
    const app = readSource('App.tsx');
    const modelController = readSource('viewport/ModelController.ts');

    expect(app).toMatch(/const applied = await sendRouteACommand\(\{/);
    expect(app).toMatch(/coalesceKey: `transform:\$\{nodeId\}`/);
    expect(app).toMatch(/type: 'transform'/);
    expect(app).not.toMatch(/new ModelController\(\{\s*enginePort: port/);
    expect(modelController).toMatch(/socket\.sendCommand\(envelope\)/);
    expect(modelController).toMatch(/sceneControlSocket === null/);
    expect(modelController).toMatch(/scene control websocket is disconnected/);
  });

  it('treats viewport grid as an Engine helper pass instead of a Webview overlay', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const engineClient = readFileSync(
      resolve(srcRoot, '../../../../neko-client/src/EngineClient.ts'),
      'utf8',
    );
    const sceneTypes = readFileSync(
      resolve(srcRoot, '../../../../neko-types/src/generated/scene.engine.ts'),
      'utf8',
    );

    expect(videoViewport).toMatch(/helperPassesEnabled/);
    expect(videoViewport).toMatch(/useModelStore\(\(state\) => state\.showViewportGrid\)/);
    expect(videoViewport).not.toMatch(/<ViewportGuideOverlay visible=\{showViewportGrid\}/);
    expect(engineClient).toMatch(/helperPassesEnabled: viewport\.helperPassesEnabled/);
    expect(sceneTypes).toMatch(/helperPassesEnabled\?: boolean/);
  });

  it('pauses Route A streaming when the VS Code tab is hidden', () => {
    const app = readSource('App.tsx');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const modelEditorProvider = readFileSync(
      resolve(srcRoot, '../../extension/src/editor/ModelEditorProvider.ts'),
      'utf8',
    );

    expect(modelEditorProvider).toMatch(/onDidChangeViewState/);
    expect(modelEditorProvider).toMatch(/type: 'webviewVisibility'/);
    expect(modelEditorProvider).toMatch(/hidden:destroyStream/);
    expect(app).toMatch(/webviewVisible/);
    expect(app).toMatch(/case 'webviewVisibility'/);
    expect(app).toMatch(/visibilitychange/);
    expect(app).toMatch(/visible=\{webviewVisible\}/);
    expect(videoViewport).toMatch(/visible: boolean/);
    expect(videoViewport).toMatch(/MIN_VISIBLE_VIEWPORT_DIMENSION = 64/);
    expect(videoViewport).toMatch(/!visible \|\| !isViewportStreamSizeReady\(viewportSize\)/);
  });

  it('routes scene tree visibility toggles through Route A scene control', () => {
    const app = readSource('App.tsx');
    const sceneTree = readSource('components/SceneTree.tsx');
    const sceneDocument = readSource('scene/SceneDocument.ts');

    expect(app).toMatch(/sendSceneCommand\('visibility-set', \{ nodeId, visible \}\)/);
    expect(app).toMatch(/onSetNodeVisible=\{handleSetNodeVisible\}/);
    expect(sceneTree).toMatch(/<TreeView/);
    expect(sceneTree).toMatch(/onToggleVisibility=\{onSetNodeVisible\}/);
    expect(sceneTree).toMatch(/visibilityDisabled=\{visibilityDisabled \|\| !onSetNodeVisible\}/);
    expect(sceneDocument).toMatch(/createEnvelope\(this\.context, 'visibility-set'/);
    expect(sceneTree).not.toMatch(/postMessage\(/);
  });

  it('routes animation playback, pose edits, and Root Motion through Route A scene control', () => {
    const app = readSource('App.tsx');
    const animationPlayer = readSource('components/AnimationPlayer.tsx');
    const bonePanel = readSource('components/bone-expression/BoneExpressionPanel.tsx');

    expect(app).toMatch(/sendSceneCommand\('animation-play'/);
    expect(app).toMatch(/sendSceneCommand\('animation-seek'/);
    expect(app).toMatch(/rootMotionEnabled/);
    expect(app).toMatch(/rootNodeId/);
    expect(app).toMatch(/type: 'bone-pose-set'/);
    expect(app).toMatch(/onSetJointTransform=\{handleTransformCommit\}/);
    expect(app).toMatch(/sceneNodes=\{sceneNodes\}/);
    expect(app).toMatch(/type: 'addKeyframe'/);
    expect(app).toMatch(/type: 'requestKeyframeTracks'/);
    expect(animationPlayer).toMatch(/onRootMotionChange/);
    expect(animationPlayer).toMatch(/animation\.rootMotion/);
    expect(animationPlayer).toMatch(/onCrossfade\(clipName, fadeDuration\);\s+return;/);
    expect(bonePanel).toMatch(/manualBoneId/);
    expect(bonePanel).toMatch(/buildJointCandidates/);
    expect(bonePanel).toMatch(/eulerDegreesToQuaternion/);
    expect(bonePanel).toMatch(/normalizeQuaternion/);
    expect(`${animationPlayer}\n${bonePanel}`).not.toMatch(/postMessage\(/);
  });

  it('keeps quality preview as a non-interactive overlay instead of replacing live Route A stream', () => {
    const app = readSource('App.tsx');

    expect(app).toMatch(/\{enginePort !== null \? \(/);
    expect(app).toMatch(/<VideoViewport\b/);
    expect(app).toMatch(/qualityPreviewDataUrl && shouldRenderEngineViewport/);
    expect(app).toMatch(/model-quality-preview-overlay pointer-events-none absolute inset-0/);
    expect(app).toMatch(/onCameraMutated=\{handleViewportCameraMutated\}/);
    expect(app).not.toMatch(
      /\{qualityPreviewDataUrl \? \(\s*<div className="relative h-full w-full bg-black">/,
    );
  });

  it('removes high-frequency extension postMessage paths from Route A authoring panels', () => {
    for (const file of [
      'components/face/FaceEditorPanel.tsx',
      'components/vrm/ExpressionPresetPanel.tsx',
      'components/bone-expression/BoneExpressionPanel.tsx',
      'components/shape-creator/ShapeCreatorPanel.tsx',
      'components/csg/CsgPanel.tsx',
      'components/sculpt/SculptBrushPanel.tsx',
      'components/text-editor/TextEditorPanel.tsx',
      'components/panels/LightInspectorPanel.tsx',
      'components/panels/EnvironmentPanel.tsx',
      'components/AnimationPlayer.tsx',
      'components/ModelKeyframeTimeline.tsx',
    ]) {
      expect(readSource(file), file).not.toMatch(/postMessage\(/);
      expect(readSource(file), file).not.toMatch(/expressionManager|morphTargetInfluences/);
    }
  });

  it('keeps model environment placement separate from preview view orientation', () => {
    const store = readSource('stores/modelStore.ts');
    const app = readSource('App.tsx');

    expect(app).toMatch(/case 'environmentPlacement'/);
    expect(store).toMatch(/environmentPlacement: EnvironmentPlacement \| null/);
    expect(store).toMatch(/setEnvironmentPlacement/);
    expect(store).not.toMatch(/yawDeg/);
    expect(store).not.toMatch(/pitchDeg/);
  });

  it('keeps LookDev, light, environment, and selection controls inside Route A boundaries', () => {
    const app = readSource('App.tsx');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const modelController = readSource('viewport/ModelController.ts');
    const lookDev = readSource('components/LookDevControls.tsx');
    const lightPanel = readSource('components/panels/LightInspectorPanel.tsx');
    const environmentPanel = readSource('components/panels/EnvironmentPanel.tsx');
    const selectionControls = readSource('components/SelectionModeControls.tsx');
    const packageJson = readFileSync(resolve(srcRoot, '../package.json'), 'utf8');
    const combined = [
      app,
      videoViewport,
      modelController,
      lookDev,
      lightPanel,
      environmentPanel,
      selectionControls,
      packageJson,
    ].join('\n');

    expect(app).toMatch(/<LookDevControls\b/);
    expect(app).toMatch(/<LightInspectorPanel\b/);
    expect(app).toMatch(/<EnvironmentPanel\b/);
    expect(app).toMatch(/<SelectionModeControls\b/);
    expect(videoViewport).toMatch(/renderMode: ViewportRenderMode/);
    expect(videoViewport).toMatch(/lookdev:/);
    expect(modelController).toMatch(/selectionQuery/);
    expect(modelController).toMatch(/selectionMaskForWorkflow/);
    expect(combined).not.toMatch(
      /@react-three\/fiber|@react-three\/drei|@pixiv\/three-vrm|"three"|"@types\/three"|GLTFLoader|VRMLoader|gltf-parser|parseGltf|parseVRM/,
    );
  });

  it('routes webview runtime errors through shared logger and localized messages', () => {
    const app = readSource('App.tsx');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const errorBoundary = readSource('components/ErrorBoundary.tsx');
    const errors = readSource('platform/errors.ts');
    const faceEditorPanel = readSource('components/face/FaceEditorPanel.tsx');

    expect(errors).toMatch(/IErrorHandler/);
    expect(errors).toMatch(/getLogger\('Errors'\)/);
    expect(errorBoundary).toMatch(/webviewErrorHandler\.handleError/);
    expect(errorBoundary).not.toMatch(/console\.error/);
    expect(videoViewport).toMatch(/webviewErrorHandler\.handleError/);
    expect(faceEditorPanel).toMatch(/getLogger\('FaceEditorPanel'\)/);
    expect(`${videoViewport}\n${faceEditorPanel}`).not.toMatch(/\bConsoleLogger\b/);
    expect(app).toMatch(/modelErrorMessage\('error\.sceneControlDisconnected'\)/);
    expect(app).toMatch(/modelErrorMessage\('error\.noEngineCharacterSelected'\)/);
    expect(videoViewport).toMatch(/modelErrorMessage\('error\.cameraUpdateFailed'\)/);
    expect(videoViewport).toMatch(/modelErrorMessage\('error\.engineStreamUnavailable'\)/);
    expect(videoViewport).not.toMatch(
      /'Camera update failed'|'Hit test failed'|'WebCodecs unavailable'|'Engine stream unavailable'/,
    );
  });
});
