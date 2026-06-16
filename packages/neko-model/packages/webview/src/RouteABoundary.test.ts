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
    expect(provider).toMatch(/'dist'[\s\S]*'webview'[\s\S]*'index\.html'/);
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

  it('keeps selected model feedback Unity-like without viewport-sized fallback chrome', () => {
    const overlayCanvas = readSource('components/OverlayCanvas.tsx');

    expect(overlayCanvas).toMatch(/MODEL_VIEWPORT_SELECTION_STYLE/);
    expect(overlayCanvas).toMatch(/rgba\(255, 142, 28, 0\.96\)/);
    expect(overlayCanvas).toMatch(/MODEL_VIEWPORT_GIZMO_STYLE/);
    expect(overlayCanvas).toMatch(/rgba\(239, 68, 68, 0\.96\)/);
    expect(overlayCanvas).toMatch(/rgba\(34, 197, 94, 0\.96\)/);
    expect(overlayCanvas).toMatch(/rgba\(59, 130, 246, 0\.96\)/);
    expect(overlayCanvas).toMatch(/drawSelectionGizmo/);
    expect(overlayCanvas).toMatch(/drawAxisArrowHead/);
    expect(overlayCanvas).not.toMatch(/strokeRect\(12, 12, width - 24, height - 24\)/);
    expect(overlayCanvas).not.toMatch(/rgba\(96, 165, 250/);
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
    expect(toolbar).toMatch(/data-model-toolbar-action="cycle-viewport-quality"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-performance-metrics"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="reset-camera"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-viewport-hud"/);
    expect(toolbar).toMatch(/data-model-toolbar-action="toggle-bottom-panel"/);
    expect(toolbar).toMatch(/data-creative-left-rail-target="hud"/);
    expect(toolbar).toMatch(/data-creative-left-rail-action="toggle-bottom-panel"/);
    expect(toolbar).toMatch(/data-model-toolbar-action=\{`toggle-\$\{item.key\}`\}/);
    expect(app).toMatch(
      /<div id="model-viewport-hud" aria-label=\{t\('toolbar\.viewportControls'\)\}>/,
    );
    expect(app).toMatch(/hudVisible=\{isViewportHudVisible\}/);
    expect(app).toMatch(
      /<SelectionModeControls\b[\s\S]*<LookDevControls\b[\s\S]*<ViewportQualityControls\b/,
    );
    expect(app).toMatch(/shouldShowCharacterPreviewControls/);
    expect(app).toMatch(/<CharacterPreviewModeSelector\s+compact/);
    expect(app).toMatch(/<ViewportQualityControls\b/);
    expect(app).toMatch(/<ViewportPerformanceOverlay \/>/);
    expect(app).toMatch(/\{isBottomPanelVisible \? \(\s*<TimelineDock/);
    expect(app).toMatch(/id="model-timeline-controls"/);
    expect(app).toMatch(/id="model-timeline-dock"/);
    expect(app).not.toMatch(/timelineControlsHidden/);
    expect(app).toMatch(/rightPanel=\{\s*isRightDockVisible \? \(/);
    expect(app).toMatch(/const \[dockHeight, setDockHeight\] = useState\(0\)/);
    expect(app).toMatch(/constrainOutlinerSplitSize\(outlinerResize\.size, dockHeight\)/);
    expect(app).toMatch(/new ResizeObserver\(updateDockHeight\)/);
    expect(css).toMatch(/\.model-center-panel\s*\{[\s\S]*flex-direction: column;/);
    expect(css).toMatch(/\.model-viewport-area\s*\{[\s\S]*flex-direction: column;/);
    expect(css).not.toMatch(/\.model-viewport-controls\s*\{/);
    expect(css).toMatch(
      /\.model-workbench-body > \.neko-creative-workbench-right-panel\s*\{[\s\S]*align-self: stretch;/,
    );
    const rightDockRule = readCssRule(css, '.model-right-dock');
    expect(rightDockRule).toMatch(/height:\s*100%/);
    expect(rightDockRule).toMatch(/min-height:\s*0/);
    expect(readCssRule(css, '.model-right-dock-stack')).toMatch(/height:\s*100%/);
    expect(readCssRule(css, '.model-properties-pane')).toMatch(/min-height:\s*0/);
    const viewportHudRule = readCssRule(css, '#model-viewport-hud');
    expect(viewportHudRule).toMatch(/border-bottom:/);
    expect(viewportHudRule).toMatch(/min-height:\s*34px;/);
    expect(css).toMatch(/\.model-viewport-quality-controls\s*\{/);
    expect(css).toMatch(/\.model-compact-select-field\s*\{/);
    expect(css).toMatch(/\.model-compact-select\s*\{/);
    expect(viewportHudRule).not.toMatch(/position:\s*absolute/);
    expect(viewportHudRule).not.toMatch(/pointer-events:\s*none/);
    expect(viewportHudRule).not.toMatch(/grid-template-areas:/);
    expect(readCssRule(css, '.model-lookdev-controls')).not.toMatch(/grid-area:\s*lookdev/);
    expect(readCssRule(css, '.model-selection-mode-controls')).not.toMatch(
      /grid-area:\s*selection/,
    );
    expect(readCssRule(css, '.model-character-preview-modes')).not.toMatch(/grid-area:\s*preview/);
    expect(readCssRule(css, '.model-lookdev-segments')).toMatch(/display:\s*none/);
    expect(readCssRule(css, '.model-viewport-quality-segments')).toMatch(/display:\s*none/);

    const toolbarRule = readCssRule(css, '.model-left-toolbar.neko-vtoolbar');
    expect(toolbarRule).toMatch(/border-right:/);
    expect(toolbarRule).not.toMatch(/position: absolute/);

    const lookDevRule = readCssRule(css, '.model-lookdev-controls');
    expect(lookDevRule).not.toMatch(/position: absolute/);
    expect(lookDevRule).not.toMatch(/(?:^|\s)(?:left|right|top):/);

    const selectionModesRule = readCssRule(css, '.model-selection-mode-controls');
    expect(selectionModesRule).not.toMatch(/position: absolute/);
    expect(selectionModesRule).not.toMatch(/(?:^|\s)(?:left|right|top):/);

    const previewModesRule = readCssRule(css, '.model-character-preview-modes');
    expect(previewModesRule).not.toMatch(/position: absolute/);
    expect(previewModesRule).not.toMatch(/(?:^|\s)(?:left|right|top):/);
    expect(previewModesRule).not.toMatch(/left: 56px;/);
  });

  it('keeps viewport performance metrics as a toggleable read-only Route A overlay', () => {
    const app = readSource('App.tsx');
    const toolbar = readSource('components/Toolbar.tsx');
    const overlay = readSource('components/ViewportPerformanceOverlay.tsx');
    const store = readSource('stores/modelStore.ts');
    const memoryProbe = readSource('viewport/viewportMemoryProbe.ts');
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
    expect(overlay).toMatch(/metrics\.renderWindow/);
    expect(overlay).toMatch(/window\.gpuFrameTimeMs/);
    expect(overlay).toMatch(/window\.decodeSubmitToOutputMs/);
    expect(overlay).toMatch(/window\.packetToDecodeOutputMs/);
    expect(overlay).toMatch(/window\.decodeOutputToPresentedMs/);
    expect(overlay).toMatch(/diagnostics\?\.presentFps/);
    expect(overlay).toMatch(/window\.droppedBeforeDecode/);
    expect(overlay).toMatch(/window\.decodedDroppedBeforePresent/);
    expect(overlay).toMatch(/window\.webcodecsDecodeQueueSize/);
    expect(overlay).toMatch(/window\.pendingDecodeFrames/);
    expect(overlay).toMatch(/window\.decodeOutputIntervalMs/);
    expect(overlay).toMatch(/window\.decodeOutputBurst/);
    expect(overlay).toMatch(/window\.jsHeapUsedBytes/);
    expect(overlay).toMatch(/window\.jsHeapLimitBytes/);
    expect(overlay).toMatch(/window\.streamWidth/);
    expect(overlay).toMatch(/window\.codedWidth/);
    expect(overlay).toMatch(/window\.scheduledWidth/);
    expect(overlay).toMatch(/window\.scheduledFps/);
    expect(overlay).toMatch(/window\.gopSize/);
    expect(overlay).toMatch(/window\.transportBitrateBps/);
    expect(overlay).toMatch(/window\.iosurfaceCreations/);
    expect(overlay).toMatch(/window\.textureAllocations/);
    expect(overlay).toMatch(/performance\.metric\.decodedFrameSize/);
    expect(overlay).toMatch(/performance\.metric\.streamSize/);
    expect(overlay).toMatch(/performance\.metric\.codedSize/);
    expect(overlay).toMatch(/performance\.metric\.scheduledSize/);
    expect(overlay).toMatch(/performance\.metric\.transportBitrate/);
    expect(overlay).toMatch(/performance\.metric\.canvasCssSize/);
    expect(overlay).toMatch(/performance\.metric\.presentationScale/);
    expect(overlay).toMatch(/formatViewportFootprint/);
    expect(memoryProbe).toMatch(/performance as BrowserPerformanceWithMemory/);
    expect(memoryProbe).toMatch(/estimatedDecodedFrameBytes/);
    expect(memoryProbe).toMatch(/canvasPhysicalWidth/);
    expect(memoryProbe).toMatch(/devicePixelRatio/);
    expect(memoryProbe).toMatch(/presentationScaleX/);
    expect(memoryProbe).not.toMatch(/fetch\(|new EngineClient|WebSocket|postMessage\(/);
    expect(overlay).not.toMatch(/new EngineClient|postMessage\(|SceneControlSocket|WebSocket/);
    expect(overlay).not.toMatch(
      /@react-three\/fiber|@react-three\/drei|@pixiv\/three-vrm|"three"|"@types\/three"|GLTFLoader|VRMLoader|gltf-parser|parseGltf|parseVRM/,
    );
    expect(css).toMatch(/\.model-performance-overlay\s*\{/);
    const performanceRule = readCssRule(css, '.model-performance-overlay');
    const performanceGridRule = readCssRule(css, '.model-performance-grid');
    expect(performanceRule).toMatch(/pointer-events:\s*auto/);
    expect(performanceRule).toMatch(/user-select:\s*text/);
    expect(performanceRule).not.toMatch(/backdrop-filter/);
    expect(performanceRule).toMatch(/contain:\s*layout paint/);
    expect(performanceGridRule).toMatch(/overscroll-behavior:\s*contain/);
    expect(css).toMatch(/#model-viewport-hud\s*\{/);
  });

  it('defaults the right dock to visible while keeping the toolbar toggle wired', () => {
    const app = readSource('App.tsx');

    expect(app).toMatch(/const \[isRightDockVisible, setIsRightDockVisible\] = useState\(true\)/);
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
    const qualityPolicy = readSource('viewport/viewportStreamQuality.ts');
    const app = readSource('App.tsx');
    const css = readSource('index.css');

    expect(videoViewport).toMatch(/new ResizeObserver/);
    expect(videoViewport).toMatch(/createViewportStreamSize/);
    expect(app).toMatch(
      /const viewportStreamQuality = useModelStore\(\(s\) => s\.viewportStreamQuality\)/,
    );
    expect(app).toMatch(/streamQuality=\{viewportStreamQuality\}/);
    expect(qualityPolicy).toMatch(
      /DEFAULT_VIEWPORT_STREAM_QUALITY_PRESET: ViewportStreamQualityPreset = 'half'/,
    );
    expect(qualityPolicy).toMatch(/UHD_4K_PIXEL_COUNT = 3840 \* 2160/);
    expect(qualityPolicy).toMatch(/PERFORMANCE_PIXEL_COUNT_LIMIT = 2880 \* 1620/);
    expect(qualityPolicy).toMatch(/CLEAR_PIXEL_COUNT_LIMIT = UHD_4K_PIXEL_COUNT/);
    expect(qualityPolicy).toMatch(/INSPECT_PIXEL_COUNT_LIMIT = 4096 \* 3072/);
    expect(qualityPolicy).toMatch(/quarter:[\s\S]*pixelFraction: 0\.5625/);
    expect(qualityPolicy).toMatch(/half:[\s\S]*pixelFraction: 1/);
    expect(qualityPolicy).toMatch(/native:[\s\S]*pixelFraction: 1\.25/);
    expect(qualityPolicy).toMatch(/maxWidth: 4096/);
    expect(qualityPolicy).toMatch(/maxHeight: 4096/);
    expect(qualityPolicy).toMatch(/physicalHeight = cssHeight \* pixelRatio/);
    expect(qualityPolicy).toMatch(/physicalPixels = physicalWidth \* physicalHeight/);
    expect(qualityPolicy).toMatch(
      /Math\.max\(physicalPixels, UHD_4K_PIXEL_COUNT\) \* config\.pixelFraction,[\s\S]*config\.maxPixelCount/,
    );
    expect(qualityPolicy).toMatch(/Math\.ceil\(value \/ VIEWPORT_DIMENSION_BUCKET\)/);
    expect(qualityPolicy).toMatch(/clamped % 2 === 0/);
    expect(videoViewport).not.toMatch(/targetPhysicalWidth = cssWidth \* pixelRatio/);
    expect(videoViewport).not.toMatch(/targetPhysicalHeight = Math\.max\(cssHeight \* pixelRatio/);
    expect(videoViewport).toMatch(/VIEWPORT_STREAM_FPS = 60/);
    expect(videoViewport).toMatch(/H264_DEBUG_SETTINGS_STORAGE_KEY = 'neko\.model\.h264'/);
    expect(videoViewport).toMatch(/allowFpsDegrade: false/);
    expect(videoViewport).toMatch(/allowQualityDegrade: false/);
    expect(videoViewport).toMatch(/VIEWPORT_RESIZE_COMMIT_DELAY_MS/);
    expect(videoViewport).toMatch(/pendingInitialSizeFrameRef/);
    expect(videoViewport).toMatch(/window\.requestAnimationFrame/);
    expect(videoViewport).toMatch(/window\.setTimeout/);
    expect(videoViewport).toMatch(/ctx\.imageSmoothingQuality = 'high'/);
    expect(videoViewport).toMatch(/model-viewport-video-canvas/);
    expect(videoViewport).toMatch(/canvas\.getBoundingClientRect\(\)/);
    expect(videoViewport).toMatch(/resolution:\s*\{\s*width: streamSize\.width/);
    expect(css).toMatch(/\.model-viewport-video-canvas\s*\{/);
    expect(css).toMatch(/object-fit:\s*contain/);
    expect(videoViewport).not.toMatch(
      /width:\s*1280,\s*\n\s*height:\s*720,\s*\n\s*pixelRatio:\s*window\.devicePixelRatio/,
    );
  });

  it('sizes the scene tree from its dock container instead of a fixed virtual list height', () => {
    const sceneTree = readSource('components/SceneTree.tsx');

    expect(sceneTree).toMatch(/treeContainerRef/);
    expect(sceneTree).toMatch(/const \[treeHeight, setTreeHeight\] = React\.useState\(240\)/);
    expect(sceneTree).toMatch(/new ResizeObserver\(updateTreeHeight\)/);
    expect(sceneTree).toMatch(/height=\{treeHeight\}/);
    expect(sceneTree).not.toMatch(/height=\{240\}/);
    expect(sceneTree).toMatch(/flex h-full min-h-0 w-full flex-col overflow-hidden/);
  });

  it('presents Route A decoded frames without per-frame store backpressure', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const h264Client = readFileSync(
      resolve(srcRoot, '../../../../neko-client/src/H264StreamClient.ts'),
      'utf8',
    );

    expect(videoViewport).toMatch(/pendingPresentationRef/);
    expect(videoViewport).toMatch(/requestAnimationFrame\(presentLatestFrame\)/);
    expect(videoViewport).toMatch(/presentationSchedulerModeRef/);
    expect(videoViewport).toMatch(/RAF_PRESENTATION_LIMIT_STRIKES/);
    expect(videoViewport).toMatch(/window\.setTimeout\(\(\) => presentLatestFrame\(\), 0\)/);
    expect(videoViewport).toMatch(/cancelAnimationFrame/);
    expect(videoViewport).toMatch(/previous\.frame\.close\(\)/);
    expect(videoViewport).toMatch(/updateRenderFrameMeta\(drawnMeta\)/);
    expect(videoViewport).toMatch(/RENDER_FRAME_META_STORE_INTERVAL_MS = 250/);
    expect(videoViewport).toMatch(/lastAppliedSeqCommittedRef/);
    expect(videoViewport).toMatch(/drawnMeta\.appliedSeq > lastAppliedSeqCommittedRef\.current/);
    expect(videoViewport).toMatch(/maxDecodeQueueDepth: 2/);
    expect(videoViewport).toMatch(/dropDeltaFramesWhenBacklogged: true/);
    expect(videoViewport).toMatch(/latestOnly: true/);
    expect(videoViewport).toMatch(/preserveKeyframes: false/);
    expect(h264Client).toMatch(/webcodecsDecodeQueueSize/);
    expect(h264Client).toMatch(/pendingDecodeFrames/);
    expect(h264Client).toMatch(/decodeOutputBurst/);
    expect(h264Client).toMatch(/updateBackpressurePolicy/);
    expect(h264Client).toMatch(/hardwareAcceleration: normalizeHardwareAccelerationPreference/);
    expect(h264Client).toMatch(/latencyMode: this\.descriptor\?\.latencyMode/);
    expect(h264Client).toMatch(/codedWidth: this\.descriptor\?\.codedWidth/);
    expect(videoViewport).not.toMatch(/onFrame:\s*\(frame, meta\) => \{[\s\S]*ctx\.drawImage/);
    expect(h264Client).not.toMatch(/shouldDropQueuedRouteAFrame/);
  });

  it('keeps high-frequency viewport interactions off the H.264 stream lifecycle', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');

    expect(videoViewport).toMatch(
      /updateBackpressurePolicy\(backpressureForStreamProfile\(profile\)\)/,
    );
    expect(videoViewport).toMatch(/streamProfileRef/);
    expect(videoViewport).not.toMatch(/useState<ViewportStreamProfile>/);
    expect(videoViewport).not.toMatch(/h264SettingsForStreamProfile/);
    expect(videoViewport).toMatch(/VIEWPORT_H264_GOP_SIZE = 1/);
    expect(videoViewport).toMatch(/gopSize: VIEWPORT_H264_GOP_SIZE/);
    expect(videoViewport).not.toMatch(/record\.gopSize/);
    expect(videoViewport).not.toMatch(/startSceneRenderStream\([\s\S]*streamProfile,/);
    expect(videoViewport).not.toMatch(/streamProfile === 'interactive'/);
    expect(videoViewport).not.toMatch(/profileTtlMs:/);
    expect(readSource('components/LookDevControls.tsx')).not.toMatch(/lookdev\.live\.restart/);
    expect(readSource('i18n/locales/zh-cn.ts')).not.toMatch(/重启流/);
  });

  it('keeps LookDev switching on scene-control commands instead of stream restart', () => {
    const app = readSource('App.tsx');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const streamEffectDependencies =
      videoViewport.match(
        /void start\(\);[\s\S]*?return \(\) => \{[\s\S]*?\};\s*\}, \[([\s\S]*?)\]\);/,
      )?.[1] ?? '';
    const globalAckHandler =
      app.match(/onAck: \(ack\) => \{[\s\S]*?\n {12}\},\n {12}onCharacterPreviewState/)?.[0] ?? '';

    expect(app).toMatch(/store\.requestLookDevMode\(mode\)/);
    expect(app).toMatch(/store\.markLookDevPending\(mode\)/);
    expect(app).toMatch(/const sendViewportSettingsCommand = useCallback/);
    expect(app).toMatch(/void sendViewportSettingsCommand\(mode, helperPassesEnabled\)/);
    expect(app).toMatch(/liveViewportSettingsSeqsRef/);
    expect(globalAckHandler).toMatch(/liveViewportSettingsSeqsRef\.current\.has\(ack\.seq\)/);
    expect(globalAckHandler).toMatch(/rejectLookDevMode/);
    expect(app).toMatch(/type: 'viewport-settings-update'/);
    expect(app).toMatch(/createLookDevSettings\(mode, helperEnabled\)/);
    expect(app).not.toMatch(/startSceneRenderStream/);
    const liveSettingsSender =
      app.match(
        /const sendViewportSettingsCommand = useCallback\([\s\S]*?\n {2}\);\n\n {2}const handleTransformCommit/,
      )?.[0] ?? '';
    expect(liveSettingsSender).toMatch(/socket\.sendCommand\(envelope\)/);
    expect(liveSettingsSender).toMatch(/liveViewportSettingsSeqsRef\.current\.add\(seq\)/);
    expect(liveSettingsSender).toMatch(/liveViewportSettingsSeqsRef\.current\.delete\(seq\)/);
    expect(liveSettingsSender).toMatch(/rejectLookDevMode/);
    expect(liveSettingsSender).not.toMatch(/setSceneControlStatus\('error'|socket\.resync/);
    expect(videoViewport).toMatch(/const streamRenderMode = store\.lookDev\.appliedMode/);
    expect(videoViewport).toMatch(/renderModeFromFrameMeta\(drawnMeta\)/);
    expect(videoViewport).toMatch(/store\.applyLookDevMode\(frameMode\)/);
    expect(videoViewport).not.toMatch(/requestedMode \?\? appliedMode|selectedRenderMode/);
    expect(streamEffectDependencies).not.toMatch(
      /requestedLookDevMode|requestedMode|lookDev\.requestedMode/,
    );
    expect(streamEffectDependencies).not.toMatch(/appliedLookDevMode|lookDev\.appliedMode/);
    expect(streamEffectDependencies).not.toMatch(/helperPassesEnabled|showViewportGrid/);
  });

  it('keeps helper and grid toggles on live viewport settings without render-time TDZ drift', () => {
    const app = readSource('App.tsx');
    const routeAReadyIndex = app.indexOf('const routeAReady = enginePort !== null');
    const helperLiveEffectIndex = app.indexOf('const lastSentHelperPassesRef');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const streamEffectDependencies =
      videoViewport.match(
        /void start\(\);[\s\S]*?return \(\) => \{[\s\S]*?\};\s*\}, \[([\s\S]*?)\]\);/,
      )?.[1] ?? '';

    expect(routeAReadyIndex).toBeGreaterThan(-1);
    expect(helperLiveEffectIndex).toBeGreaterThan(-1);
    expect(routeAReadyIndex).toBeLessThan(helperLiveEffectIndex);
    expect(app).toMatch(/lastSentHelperPassesRef\.current === helperPassesEnabled/);
    expect(app).toMatch(/type: 'viewport-settings-update'/);
    expect(app).toMatch(/sendViewportSettingsCommand\(mode, helperPassesEnabled\)/);
    expect(app).toMatch(/showGrid: helperPassesEnabled/);
    expect(streamEffectDependencies).not.toMatch(/helperPassesEnabled|showViewportGrid/);
  });

  it('keeps optional viewport query failures from breaking the global interaction flow', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const app = readSource('App.tsx');

    expect(app).toMatch(
      /onSceneControlError=\{\(message\) => setSceneControlStatus\('error', message\)\}/,
    );
    expect(videoViewport).toMatch(/const handleViewportQueryError = React\.useCallback/);
    expect(videoViewport).toMatch(/onQueryError=\{handleViewportQueryError\}/);
    expect(videoViewport).toMatch(/sendViewportCommand\('viewport:select', payload\)/);
    expect(videoViewport).not.toMatch(
      /catch \(error\) \{[\s\S]*onSceneControlError\(modelErrorMessage\('error\.hitTestFailed'\)\)/,
    );
    expect(videoViewport).not.toMatch(/onQueryError=\{\(error\) => onSceneControlError/);
  });

  it('keeps ordinary Object and Inspect fallback off semantic picking and stream lifecycle paths', () => {
    const app = readSource('App.tsx');
    const selectionControls = readSource('components/SelectionModeControls.tsx');
    const modelController = readSource('viewport/ModelController.ts');

    expect(selectionControls).toMatch(/workflow === 'object' \|\| workflow === 'export-inspect'/);
    expect(selectionControls).toMatch(/return availableControl\(\)/);
    expect(app).toMatch(/const handleOutlinerSelectNode = useCallback/);
    expect(app).toMatch(/setIsRightDockVisible\(true\)/);
    expect(app).toMatch(/<SelectionTargetInspector target=\{inspectorRoute\.target\} \/>/);
    expect(modelController).toMatch(
      /case 'export-inspect':\s*\n\s*return \['node', 'materialSlot', 'submesh', 'primitive', 'environment'\]/,
    );
    expect(app).not.toMatch(/GLTFLoader|VRMLoader|parseGltf|parseVRM/);
    expect(`${app}\n${selectionControls}`).not.toMatch(
      /startSceneRenderStream|streamProfile|profileTtlMs/,
    );
  });

  it('keeps baseline editing from trading interaction latency for GPU or stream degradation', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const h264Client = readFileSync(
      resolve(srcRoot, '../../../../neko-client/src/H264StreamClient.ts'),
      'utf8',
    );
    const packageJson = readFileSync(resolve(srcRoot, '../package.json'), 'utf8');

    expect(readSource('viewport/viewportStreamQuality.ts')).toMatch(
      /DEFAULT_VIEWPORT_STREAM_QUALITY_PRESET: ViewportStreamQualityPreset = 'half'/,
    );
    expect(videoViewport).toMatch(/VIEWPORT_STREAM_FPS = 60/);
    expect(videoViewport).toMatch(/allowFpsDegrade: false/);
    expect(videoViewport).toMatch(/allowQualityDegrade: false/);
    expect(videoViewport).not.toMatch(/getImageData|readPixels|toDataURL|toBlob/);
    expect(videoViewport).not.toMatch(/OffscreenCanvas|ImageBitmapRenderingContext/);
    expect(videoViewport).not.toMatch(/cpuReadback|readback|gpuToCpu|fallbackRenderer/);
    expect(h264Client).toMatch(/hardwareAcceleration: normalizeHardwareAccelerationPreference/);
    expect(h264Client).toMatch(/return 'prefer-hardware'/);
    expect(h264Client).not.toMatch(/hardwareAcceleration:\s*'prefer-software'/);
    expect(`${videoViewport}\n${packageJson}`).not.toMatch(
      /@react-three\/fiber|@react-three\/drei|@pixiv\/three-vrm|"three"|"@types\/three"|GLTFLoader|VRMLoader|gltf-parser|parseGltf|parseVRM/,
    );
  });

  it('keeps render quality modes and presentation quality from being silently downgraded', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const lookDev = readSource('components/LookDevControls.tsx');
    const i18nEn = readSource('i18n/locales/en.ts');
    const i18nZh = readSource('i18n/locales/zh-cn.ts');

    for (const mode of ['pbr', 'clay', 'wireframe', 'normal', 'depth']) {
      expect(lookDev, mode).toMatch(new RegExp(`'${mode}'`));
      expect(i18nEn, mode).toMatch(new RegExp(`lookdev\\.mode\\.${mode}`));
      expect(i18nZh, mode).toMatch(new RegExp(`lookdev\\.mode\\.${mode}`));
    }
    expect(videoViewport).toMatch(/ctx\.imageSmoothingEnabled = true/);
    expect(videoViewport).toMatch(/ctx\.imageSmoothingQuality = 'high'/);
    expect(videoViewport).toMatch(/renderModeFromStreamDescriptor/);
    expect(videoViewport).toMatch(/renderModeFromFrameMeta/);
    expect(videoViewport).not.toMatch(/imageSmoothingEnabled = false/);
    expect(videoViewport).not.toMatch(/qualityTier:\s*'low'|renderMode:\s*'unlit'/);
  });

  it('routes viewport camera controls through scene-control websocket only', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const app = readSource('App.tsx');
    const orbitControls = readSource('components/ViewportOrbitControls.tsx');
    const toolbar = readSource('components/Toolbar.tsx');
    const modelController = readSource('viewport/ModelController.ts');

    expect(videoViewport).toMatch(/!sceneControlSocket\?\.isOpen\(\)/);
    expect(videoViewport).toMatch(/sceneControlSocket\.sendViewportCameraLatest/);
    expect(videoViewport).toMatch(
      /sceneControlSocket\.requestKeyframe\(MAIN_VIEWPORT_ID, sceneId\)/,
    );
    expect(videoViewport).not.toMatch(/await sceneControlSocket\.updateViewportCamera/);
    expect(videoViewport).not.toMatch(/cameraUpdateInFlightRef/);
    expect(videoViewport).not.toMatch(/pendingCameraUpdateRef/);
    expect(videoViewport).toMatch(/VIEWPORT_CAMERA_SEND_INTERVAL_MS = 33/);
    expect(videoViewport).toMatch(/scheduleViewportCamera/);
    expect(videoViewport).toMatch(/pendingCameraFlushTimerRef/);
    expect(videoViewport).toMatch(/VIEWPORT_CAMERA_KEYFRAME_INTERVAL_MS/);
    expect(videoViewport).toMatch(/setStreamProfile\('interactive'\)/);
    expect(videoViewport).toMatch(/VIEWPORT_INTERACTION_PROFILE_TTL_MS/);
    expect(videoViewport).not.toMatch(/streamProfile === 'interactive'/);
    expect(videoViewport).not.toMatch(/profileTtlMs:/);
    expect(videoViewport).not.toMatch(/startSceneRenderStream\([\s\S]*streamProfile,/);
    expect(videoViewport).not.toMatch(/sendHttpFallback|updateEditorCamera/);
    expect(app).toMatch(/!socket\?\.isOpen\(\)/);
    expect(app).toMatch(/socket\.sendViewportCameraLatest/);
    expect(app).toMatch(/options\?: \{ interactive\?: boolean \}/);
    expect(app).toMatch(/options\?\.interactive === true/);
    expect(app).toMatch(/sendEditorCameraToEngine\(\{ interactive: true \}\)/);
    expect(app).not.toMatch(/streamProfile: 'interactive'|profileTtlMs/);
    expect(modelController).not.toMatch(/VIEWPORT_INTERACTION_PROFILE_TTL_MS/);
    expect(app).not.toMatch(/socket\s*\n\s*\.updateViewportCamera/);
    expect(app).not.toMatch(/updateEditorCamera/);
    expect(videoViewport).not.toMatch(/modelController\s*\n\s*\.updateCamera\(\)/);
    expect(modelController).toMatch(/'viewport:camera'/);
    expect(modelController).toMatch(/position: vec3ToTuple\(store\.getCameraPosition\(\)\)/);
    expect(modelController).toMatch(/target: vec3ToTuple\(store\.cameraTarget\)/);
    expect(modelController).toMatch(/kind: 'camera'/);
    expect(modelController).toMatch(/socket\.sendViewportCameraLatest/);
    expect(modelController).not.toMatch(/streamProfile: 'interactive'|profileTtlMs/);
    expect(orbitControls).toMatch(/SEND_INTERVAL_MS = 33/);
    expect(orbitControls).toMatch(
      /onInteractionActivity\?: \(options\?: \{ readonly immediate\?: boolean \}\) => void/,
    );
    expect(orbitControls).toMatch(/onInteractionActivity\?\.\(\{ immediate: true \}\)/);
    expect(videoViewport).toMatch(/scheduleViewportCamera\(\{ immediate: true \}\)/);
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

  it('keeps neko-model camera hot paths fire-and-forget', () => {
    const app = readSource('App.tsx');
    const videoViewport = readSource('components/VideoViewport.tsx');
    const modelController = readSource('viewport/ModelController.ts');

    for (const source of [app, videoViewport, modelController]) {
      expect(source).not.toMatch(/await\s+\w+\.updateViewportCamera/);
      expect(source).not.toMatch(/\.updateViewportCamera\([\s\S]*\.then\(/);
    }
    expect(`${app}\n${videoViewport}\n${modelController}`).toMatch(/sendViewportCameraLatest/);
  });

  it('keeps all high-frequency editing controls on local intent before ack', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const orbitControls = readSource('components/ViewportOrbitControls.tsx');
    const modelController = readSource('viewport/ModelController.ts');
    const transformPanel = readSource('components/panels/TransformPanel.tsx');
    const faceSlider = readSource('components/face/FaceParameterSlider.tsx');
    const lightPanel = readSource('components/panels/LightInspectorPanel.tsx');
    const hotControlSources = [
      orbitControls,
      modelController,
      transformPanel,
      faceSlider,
      lightPanel,
    ].join('\n');

    expect(orbitControls).toMatch(/useModelStore\.getState\(\)\.orbitCamera/);
    expect(orbitControls).toMatch(/panCamera\(dx \* scale, dy \* scale\)/);
    expect(orbitControls).toMatch(/zoomCamera\(/);
    expect(orbitControls).toMatch(/onInteractionActivity\?\.\(\{ immediate: true \}\)/);
    expect(videoViewport).toMatch(
      /markInteractiveStreamActivity\(\);\s*\n\s*scheduleViewportCamera\(options\)/,
    );
    expect(modelController).toMatch(/this\.upsertTransformPrediction\(seq, nodeId, transform/);
    expect(modelController).toMatch(/this\.scheduleDragPrediction\(\)/);
    expect(modelController).toMatch(/const transform = node\?\.transform/);
    expect(modelController).not.toMatch(/node\.kind === 'mesh'[\s\S]*tryBeginTransformDrag/);
    expect(transformPanel).toMatch(/setDraftTransform\(nextTransform\)/);
    expect(transformPanel).toMatch(/void onTransformCommit\?\.\(node\.nodeId, nextTransform\)/);
    expect(faceSlider).toMatch(/onPreviewChange\?: \(value: number\) => void/);
    expect(faceSlider).toMatch(/onCommit\?: \(value: number\) => void/);
    expect(lightPanel).toMatch(/const \[draft, setDraft\] = React\.useState/);
    expect(lightPanel).toMatch(/onBlur=\{\(\) => \{/);
    expect(hotControlSources).not.toMatch(
      /await\s+.*(onPreviewChange|setDraftTransform|orbitCamera|panCamera|zoomCamera)/,
    );
    expect(hotControlSources).not.toMatch(/startSceneRenderStream|streamProfile|profileTtlMs/);
    expect(hotControlSources).not.toMatch(
      /viewportCameraAck|cameraUpdateInFlightRef|pendingCameraUpdateRef/,
    );
  });

  it('separates previewable mesh targets from character-authoring targets', () => {
    const app = readSource('App.tsx');
    const selector = readSource('components/CharacterPreviewModeSelector.tsx');

    expect(app).toMatch(/const characterPreviewTarget = resolveCharacterPreviewTarget/);
    expect(app).toMatch(/const selectedCharacterId = resolveSelectedCharacterId/);
    expect(app).toMatch(/const previewCharacterId = characterPreviewTarget\.characterId/);
    expect(app).toMatch(/const isCharacterPreviewDisabled = !routeAReady \|\| !previewCharacterId/);
    expect(app).toMatch(/function resolveSelectedCharacterId/);
    expect(app).toMatch(/!selected \|\| !isCharacterSceneNode\(selected\)/);
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
    const transformPanel = readSource('components/panels/TransformPanel.tsx');

    expect(app).toMatch(/const applied = await sendRouteACommand\(\{/);
    expect(app).toMatch(/coalesceKey: `transform:\$\{nodeId\}`/);
    expect(app).toMatch(/type: 'transform'/);
    expect(app).not.toMatch(/new ModelController\(\{\s*enginePort: port/);
    expect(modelController).toMatch(/const envelope: SceneCommandEnvelope = \{/);
    expect(modelController).toMatch(/baseRevision: command\.baseRevision/);
    expect(modelController).toMatch(/socket\.sendCommand\(envelope\)/);
    expect(modelController).toMatch(/sceneControlSocket === null/);
    expect(modelController).toMatch(/scene control websocket is disconnected/);
    expect(`${app}\n${modelController}\n${transformPanel}`).not.toMatch(
      /postMessage\(\{\s*type: 'updateTransform'|type: 'updateTransform'/,
    );
    expect(modelController).toMatch(
      /case 'viewport:transform':\s*\n\s*return this\.dispatchTransformOverSocket\(socket, command\)/,
    );
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
    expect(videoViewport).not.toMatch(
      /void start\(\);[\s\S]*?return \(\) => \{[\s\S]*?\};\s*\}, \[[\s\S]*helperPassesEnabled[\s\S]*\]\);/,
    );
    expect(engineClient).toMatch(/helperPassesEnabled: viewport\.helperPassesEnabled/);
    expect(sceneTypes).toMatch(/helperPassesEnabled\?: boolean/);
  });

  it('keeps Route A stream visibility ownership in the Extension Host', () => {
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
    expect(app).toMatch(/handleDocumentLifecycleSignal/);
    expect(app).toMatch(/document\.visibilityState === 'hidden' \|\| !webviewVisibleRef\.current/);
    expect(app).not.toMatch(/const initialWebviewVisible = document\.visibilityState !== 'hidden'/);
    expect(app).not.toMatch(/const visible = document\.visibilityState !== 'hidden'/);
    expect(app).not.toMatch(/applyWebviewVisibility\(visible\)/);
    expect(app).toMatch(/visible=\{webviewVisible\}/);
    expect(videoViewport).toMatch(/visible: boolean/);
    expect(videoViewport).toMatch(/MIN_VISIBLE_VIEWPORT_DIMENSION = 64/);
    expect(videoViewport).toMatch(/!visible \|\| !isViewportStreamSizeReady\(viewportSize\)/);
  });

  it('treats duplicate stream destroy as idempotent lifecycle cleanup', () => {
    const streamController = readFileSync(
      resolve(srcRoot, '../../../../neko-engine/packages/host-api/src/controllers/stream.rs'),
      'utf8',
    );

    expect(streamController).toMatch(/Err\(StreamStateError::NotFound\(_\)\) => true/);
    expect(streamController).toMatch(/"alreadyDestroyed": already_destroyed/);
    expect(streamController).toMatch(/test_destroy_stream_is_idempotent/);
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
    const qualityControls = readSource('components/ViewportQualityControls.tsx');
    const packageJson = readFileSync(resolve(srcRoot, '../package.json'), 'utf8');
    const combined = [
      app,
      videoViewport,
      modelController,
      lookDev,
      lightPanel,
      environmentPanel,
      selectionControls,
      qualityControls,
      packageJson,
    ].join('\n');

    expect(app).toMatch(/<LookDevControls\b/);
    expect(app).toMatch(/<LightInspectorPanel\b/);
    expect(app).toMatch(/<EnvironmentPanel\b/);
    expect(app).toMatch(/<SelectionModeControls\b/);
    expect(app).toMatch(/<ViewportQualityControls\b/);
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
