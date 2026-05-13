import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

describe('Route A webview boundaries', () => {
  it('keeps App Route A main viewport free of persistent R3F model mounts', () => {
    const app = readSource('App.tsx');

    expect(app).not.toMatch(/<Viewport3D\b/);
    expect(app).not.toMatch(/<ModelLoader\b/);
    expect(app).toMatch(/<VideoViewport\b/);
    expect(app).toMatch(/<R3FDevelopmentFallback\b/);
  });

  it('mounts Route A video viewport for engine scene snapshots without a direct model URL', () => {
    const app = readSource('App.tsx');

    // hasEngineScene must hinge on real scene content, not on revision alone.
    // An empty .nkm publishes revision>0 with nodes=[]; gating on nodes prevents
    // a stream against an empty RenderWorld from crashing the PBR pipeline.
    expect(app).toMatch(/const hasEngineScene = sceneNodes\.length > 0;/);
    expect(app).not.toMatch(/hasEngineScene = .*sceneRevision\b/);
    expect(app).toMatch(/enginePort !== null && \(modelUrl \|\| hasEngineScene\)/);
  });

  it('keeps VideoViewport as Engine frame canvas plus overlay and interaction layers', () => {
    const videoViewport = readSource('components/VideoViewport.tsx');

    expect(videoViewport).toMatch(/<canvas/);
    expect(videoViewport).toMatch(/<InteractionLayer\b/);
    expect(videoViewport).toMatch(/<OverlayCanvas\b/);
    expect(videoViewport).not.toMatch(/children/);
    expect(videoViewport).not.toMatch(/<Viewport3D\b|<ModelLoader\b/);
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
});
