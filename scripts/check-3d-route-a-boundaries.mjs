#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'packages/neko-model/packages/extension/src';
const isWebviewRoot = root.includes('packages/neko-model/packages/webview');
const forbiddenPatterns = [
  { pattern: /\bH264StreamClient\b/, reason: 'video decoding belongs in Webview' },
  { pattern: /\bAudioStreamClient\b/, reason: 'PCM playback belongs in Webview' },
  { pattern: /\bFMP4StreamClient\b/, reason: '3D Route A must not use fMP4/MSE' },
  { pattern: /\/v1\/streams\//, reason: 'Extension Host must not proxy video frames' },
  { pattern: /\/v1\/audio\//, reason: 'Extension Host must not proxy PCM packets' },
  { pattern: /\bscenes:stream\b/, reason: 'Webview starts Route A streams directly' },
  { pattern: /\bsceneDelta\b/, reason: 'Extension Host must not relay high-frequency scene deltas' },
  { pattern: /\bSceneControlSocket\b/, reason: 'Webview owns high-frequency scene control' },
];

const findings = [];
for (const file of walk(root)) {
  const content = readFileSync(file, 'utf8');
  for (const { pattern, reason } of forbiddenPatterns) {
    if (
      isWebviewRoot &&
      (reason.includes('Extension Host') ||
        reason.includes('belongs in Webview') ||
        String(pattern).includes('SceneControlSocket') ||
        String(pattern).includes('sceneDelta') ||
        String(pattern).includes('scenes:stream'))
    ) {
      continue;
    }
    if (pattern.test(content)) {
      findings.push({ file: relative(process.cwd(), file), pattern: String(pattern), reason });
    }
  }
}
if (root.includes('packages/neko-model/packages/webview')) {
  checkWebviewRouteABoundaries(root, findings);
}

if (findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: 'failed', findings }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'passed',
      root,
      checkedFiles: [...walk(root)].length,
    },
    null,
    2,
  )}\n`,
);

function* walk(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    if (/\.(ts|tsx|js|jsx)$/.test(path)) {
      yield path;
    }
    return;
  }

  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    yield* walk(join(path, entry));
  }
}

function checkWebviewRouteABoundaries(root, findings) {
  const appPath = join(root, 'App.tsx');
  const viewportPath = join(root, 'components', 'VideoViewport.tsx');
  const panelPaths = [
    'components/face/FaceEditorPanel.tsx',
    'components/vrm/ExpressionPresetPanel.tsx',
    'components/bone-expression/BoneExpressionPanel.tsx',
    'components/shape-creator/ShapeCreatorPanel.tsx',
    'components/csg/CsgPanel.tsx',
    'components/sculpt/SculptBrushPanel.tsx',
    'components/text-editor/TextEditorPanel.tsx',
    'components/AnimationPlayer.tsx',
    'components/ModelKeyframeTimeline.tsx',
  ];

  for (const [file, pattern, reason] of [
    [appPath, /<Viewport3D\b|<ModelLoader\b/, 'Route A App main path must not mount R3F model'],
    [viewportPath, /children|<Viewport3D\b|<ModelLoader\b/, 'VideoViewport must be Engine canvas plus overlay/interaction only'],
  ]) {
    const content = readFileSync(file, 'utf8');
    if (pattern.test(content)) {
      findings.push({ file: relative(process.cwd(), file), pattern: String(pattern), reason });
    }
  }

  for (const panel of panelPaths) {
    const file = join(root, panel);
    const content = readFileSync(file, 'utf8');
    if (/postMessage\(|expressionManager|morphTargetInfluences/.test(content)) {
      findings.push({
        file: relative(process.cwd(), file),
        pattern: '/postMessage\\(|expressionManager|morphTargetInfluences/',
        reason: 'Route A authoring panels must compile to Engine commands',
      });
    }
  }
}
