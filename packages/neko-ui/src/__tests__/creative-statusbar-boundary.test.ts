import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function readRepoSource(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('creative workbench StatusBar boundary', () => {
  it('keeps Cut passive timeline and export status in the native StatusBar', () => {
    const statusBar = readRepoSource('packages/neko-cut/packages/extension/src/views/statusBar.ts');
    const provider = readRepoSource(
      'packages/neko-cut/packages/extension/src/editor/video/videoEditorProvider.ts',
    );
    const messaging = readRepoSource(
      'packages/neko-cut/packages/webview/src/hooks/useVSCodeMessaging.ts',
    );
    const app = readRepoSource('packages/neko-cut/packages/webview/src/App.tsx');
    const css = readRepoSource('packages/neko-cut/packages/webview/src/index.css');

    expect(statusBar).toMatch(/StatusBarGroup/);
    expect(statusBar).toMatch(/playState/);
    expect(statusBar).toMatch(/updateExportProgress/);
    expect(provider).toMatch(/message\.type === 'statusUpdate'/);
    expect(provider).toMatch(/updateStatusBarVisibility/);
    expect(messaging).toMatch(/type: 'statusUpdate'/);
    expect(app).not.toMatch(/WorkbenchTopBar|cut-statusbar|cut-status-bar/);
    expect(css).not.toMatch(/\.cut-statusbar|\.cut-status-bar|\.cut-topbar/);
  });

  it('projects Canvas subsystem and projection state to the native StatusBar', () => {
    const statusBar = readRepoSource(
      'packages/neko-canvas/packages/extension/src/views/canvasStatusBar.ts',
    );
    const provider = readRepoSource(
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
    );
    const app = readRepoSource('packages/neko-canvas/packages/webview/src/CanvasApp.tsx');

    expect(statusBar).toMatch(/class CanvasStatusBar/);
    expect(statusBar).toMatch(/projectionSummary/);
    expect(statusBar).toMatch(/subsystemSummary/);
    expect(provider).toMatch(/case 'canvasStatus'/);
    expect(provider).toMatch(/readCanvasProjectionSummary/);
    expect(provider).toMatch(/this\.statusBar\.update\(\{/);
    expect(app).toMatch(/type: 'canvasStatus'/);
    expect(app).toMatch(/projectionStatus,/);
    expect(app).not.toMatch(/canvas-status-badge|canvas-statusbar|canvas-status-bar/);
    expect(app).not.toMatch(/subsystemStatusBadge|projectionStatusBadge|ProjectionStatusBadge/);
  });

  it('keeps Audio file metadata in the native StatusBar instead of Webview chrome', () => {
    const statusBar = readRepoSource(
      'packages/neko-audio/packages/extension/src/views/audioStatusBar.ts',
    );
    const provider = readRepoSource(
      'packages/neko-audio/packages/extension/src/providers/AudioEditorProvider.ts',
    );
    const editor = readRepoSource(
      'packages/neko-audio/packages/webview/src/editor/AudioEditor.tsx',
    );
    const css = readRepoSource('packages/neko-audio/packages/webview/src/styles/editor.css');

    expect(statusBar).toMatch(/class AudioStatusBar/);
    expect(statusBar).toMatch(/duration/);
    expect(statusBar).toMatch(/sampleRate/);
    expect(statusBar).toMatch(/channels/);
    expect(statusBar).toMatch(/codec/);
    expect(provider).toMatch(/setStatusBar\(statusBar: AudioStatusBar\)/);
    expect(provider).toMatch(/this\._statusBar\.update\(\{/);
    expect(editor).toMatch(/<CreativeWorkbenchShell/);
    expect(editor).not.toMatch(/audio-statusbar|audio-status-bar|AudioTopBar/);
    expect(css).not.toMatch(/\.audio-statusbar|\.audio-status-bar|\.audio-topbar/);
  });

  it('keeps Model selection, object count, and engine state out of Webview TopBar', () => {
    const statusBar = readRepoSource(
      'packages/neko-model/packages/extension/src/editor/ModelStatusBar.ts',
    );
    const provider = readRepoSource(
      'packages/neko-model/packages/extension/src/editor/ModelEditorProvider.ts',
    );
    const app = readRepoSource('packages/neko-model/packages/webview/src/App.tsx');
    const css = readRepoSource('packages/neko-model/packages/webview/src/index.css');

    expect(statusBar).toMatch(/StatusBarProjectionManager/);
    expect(statusBar).toMatch(/activeCustomEditorId/);
    expect(statusBar).toMatch(/neko\.model\.selectedNode/);
    expect(statusBar).toMatch(/neko\.model\.objectCount/);
    expect(statusBar).toMatch(/neko\.model\.engineStatus/);
    expect(provider).toMatch(/case 'modelStatus'/);
    expect(app).toMatch(/type: 'modelStatus'/);
    expect(app).not.toMatch(/WorkbenchTopBar/);
    expect(css).not.toMatch(/\.model-workbench-topbar/);
  });

  it('keeps Sketch canvas status in the native StatusBar while interactive monitors stay in Webview', () => {
    const statusBar = readRepoSource(
      'packages/neko-sketch/packages/extension/src/views/sketchStatusBar.ts',
    );
    const provider = readRepoSource(
      'packages/neko-sketch/packages/extension/src/editor/sketchEditorProvider.ts',
    );
    const app = readRepoSource('packages/neko-sketch/packages/webview/src/App.tsx');
    const css = readRepoSource('packages/neko-sketch/packages/webview/src/index.css');

    expect(statusBar).toMatch(/class SketchStatusBar/);
    expect(statusBar).toMatch(/neko\.sketch\.zoom/);
    expect(statusBar).toMatch(/neko\.sketch\.tool/);
    expect(statusBar).toMatch(/neko\.sketch\.layer/);
    expect(provider).toMatch(/case 'status:update'/);
    expect(app).toMatch(/type: 'status:update'/);
    expect(app).toMatch(/<CreativeWorkbenchShell/);
    expect(css).not.toMatch(/\.sketch-statusbar|\.sketch-status-bar|\.sketch-topbar/);
  });

  it('documents Puppet as having no native passive status projection and no duplicate Webview chrome', () => {
    const app = readRepoSource('packages/neko-puppet/packages/webview/src/PuppetApp.tsx');
    const toolbar = readRepoSource(
      'packages/neko-puppet/packages/webview/src/components/PuppetToolbar.tsx',
    );
    const css = readRepoSource('packages/neko-puppet/packages/webview/src/index.css');
    const extension = readRepoSource('packages/neko-puppet/packages/extension/src/extension.ts');

    expect(app).toMatch(/<CreativeWorkbenchShell/);
    expect(toolbar).toMatch(/CreativeLeftRail/);
    expect(extension).not.toMatch(/StatusBarGroup|StatusBarProjectionManager|PuppetStatusBar/);
    expect(app).not.toMatch(/puppet-statusbar|puppet-status-bar|PuppetTopBar|WorkbenchTopBar/);
    expect(css).not.toMatch(/\.puppet-statusbar|\.puppet-status-bar|\.puppet-topbar/);
  });
});
