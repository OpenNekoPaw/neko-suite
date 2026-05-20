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

    expect(videoViewport).toMatch(/<canvas/);
    expect(videoViewport).toMatch(/model-viewport-frame/);
    expect(videoViewport).toMatch(/<ViewportGuideOverlay\b/);
    expect(videoViewport).toMatch(/<ViewportNavigationControls\b/);
    expect(videoViewport).toMatch(/<InteractionLayer\b/);
    expect(videoViewport).toMatch(/<OverlayCanvas\b/);
    expect(videoViewport).not.toMatch(/children/);
    expect(videoViewport).not.toMatch(/bg-black/);
    expect(videoViewport).not.toMatch(/<Viewport3D\b|<ModelLoader\b/);
    expect(guideOverlay).toMatch(/screen-hud/);
    expect(guideOverlay).not.toMatch(/blender-grid/);
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
    expect(css).toMatch(/background: var\(--model-topbar-bg\)/);
    expect(css).toMatch(/background: var\(--model-viewport-bg\)/);
    expect(css).toMatch(/background: var\(--model-dock-bg\)/);
    expect(css).toMatch(/background: var\(--model-timeline-bg\)/);
    expect(app).toMatch(/model-quality-preview-overlay/);
    expect(app).not.toMatch(/pointer-events-none absolute inset-0 bg-black/);
    expect(guideOverlay).toMatch(/getComputedStyle/);
    expect(guideOverlay).toMatch(/MutationObserver/);
    expect(guideOverlay).toMatch(/--model-guide-widget-bg/);
  });

  it('sizes Route A stream from the actual webview viewport instead of a fixed canvas', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');

    expect(videoViewport).toMatch(/new ResizeObserver/);
    expect(videoViewport).toMatch(/createViewportStreamSize/);
    expect(videoViewport).toMatch(/MAX_VIEWPORT_STREAM_PIXELS/);
    expect(videoViewport).toMatch(/1920 \* 1080/);
    expect(videoViewport).toMatch(/MAX_VIEWPORT_DEVICE_PIXEL_RATIO = 1\.5/);
    expect(videoViewport).toMatch(/VIEWPORT_STREAM_FPS = 60/);
    expect(videoViewport).toMatch(/bucketed % 2 === 0/);
    expect(videoViewport).toMatch(/resolution:\s*\{\s*width: streamSize\.width/);
    expect(videoViewport).not.toMatch(
      /width:\s*1280,\s*\n\s*height:\s*720,\s*\n\s*pixelRatio:\s*window\.devicePixelRatio/,
    );
  });

  it('routes viewport camera controls through scene control before HTTP fallback', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');
    const orbitControls = readSource('components/ViewportOrbitControls.tsx');
    const navigationControls = readSource('components/ViewportNavigationControls.tsx');

    expect(videoViewport).toMatch(/sceneControlSocket\s*\n\s*\.updateViewportCamera/);
    expect(videoViewport).toMatch(
      /sceneId,\s*\n\s*sceneRevision,\s*\n\s*viewportId: MAIN_VIEWPORT_ID/,
    );
    expect(videoViewport).toMatch(/resolution: viewportSize \?\? undefined/);
    expect(videoViewport).toMatch(/isViewportCameraAckCompatible/);
    expect(videoViewport).toMatch(/sceneControlSocket\.requestKeyframe\(MAIN_VIEWPORT_ID\)/);
    expect(videoViewport).toMatch(
      /updateEditorCamera\(position, target, undefined, MAIN_VIEWPORT_ID\)/,
    );
    expect(orbitControls).toMatch(/SEND_INTERVAL_MS = 16/);
    expect(navigationControls).toMatch(/CAMERA_SEND_INTERVAL_MS = 16/);
    expect(orbitControls).not.toMatch(/new EngineClient|updateEditorCamera/);
    expect(navigationControls).not.toMatch(/new EngineClient|updateEditorCamera/);
  });

  it('sends hit-test queries with the same viewport contract as the engine stream', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');

    expect(videoViewport).toMatch(/query\('hitTest', \{/);
    expect(videoViewport).toMatch(/viewportId: MAIN_VIEWPORT_ID,\s*\n\s*sceneId,/);
    expect(videoViewport).toMatch(/sceneRevision,\s*\n\s*resolution: viewportSize \?\? undefined/);
    expect(videoViewport).not.toMatch(/buildViewportQueryCamera|camera:/);
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

  it('routes scene tree visibility toggles through Route A scene control', () => {
    const app = readSource('App.tsx');
    const sceneTree = readSource('components/SceneTree.tsx');
    const sceneDocument = readSource('scene/SceneDocument.ts');

    expect(app).toMatch(/sendSceneCommand\('visibility-set', \{ nodeId, visible \}\)/);
    expect(app).toMatch(/onSetNodeVisible=\{handleSetNodeVisible\}/);
    expect(sceneTree).toMatch(/model-tree-visibility-toggle/);
    expect(sceneTree).toMatch(/onSetNodeVisible\?\.\(node\.nodeId, !isVisible\)/);
    expect(sceneDocument).toMatch(/createEnvelope\(this\.context, 'visibility-set'/);
    expect(sceneTree).not.toMatch(/postMessage\(/);
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
