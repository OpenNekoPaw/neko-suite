import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPersistedResizeState } from '@neko/ui/hooks';
import { PUPPET_RIGHT_PANEL_RESIZE } from './puppetResizeLayout';

const srcRoot = resolve(process.cwd(), 'src');

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), 'utf8');
}

describe('Puppet right panel resize layout', () => {
  it('uses a 280px default right panel with 200px-400px bounds', () => {
    expect(PUPPET_RIGHT_PANEL_RESIZE).toEqual({
      panelId: 'puppet.rightPanel',
      defaultSize: 280,
      minSize: 200,
      maxSize: 400,
    });
  });

  it('restores and clamps the persisted right panel width by panel id', () => {
    const state = {
      'neko.resizeState': {
        [PUPPET_RIGHT_PANEL_RESIZE.panelId]: { size: 160, collapsed: false },
      },
    };

    expect(
      readPersistedResizeState(
        state,
        PUPPET_RIGHT_PANEL_RESIZE.panelId,
        PUPPET_RIGHT_PANEL_RESIZE.defaultSize,
        PUPPET_RIGHT_PANEL_RESIZE,
      ),
    ).toEqual({
      size: 200,
      collapsed: false,
    });
  });

  it('keeps all puppet inspector panels and keyframe routing under the resized shell', () => {
    const app = readSource('PuppetApp.tsx');

    expect(app).not.toMatch(/w-60/);
    expect(app).toMatch(/className="puppet-right-panel"/);
    expect(app).toMatch(/usePersistedResize\(\s*PUPPET_RIGHT_PANEL_RESIZE\.panelId/);
    expect(app).toMatch(/<ResizeHandle\s+handleProps=\{rightPanelResizeHandleProps\}/);
    for (const component of [
      'PuppetNodeTree',
      'ParameterPanel',
      'ControlDriverPanel',
      'AnimationPanel',
      'PuppetKeyframeTimeline',
    ]) {
      expect(app).toMatch(new RegExp(`<${component}\\b`));
    }
    expect(app).toMatch(/handlePuppetContextMenuAction/);
  });

  it('keeps empty puppet documents inside the shared viewport shell', () => {
    const app = readSource('PuppetApp.tsx');
    const css = readSource('index.css');

    expect(app).toMatch(/createIdlePuppetSceneController/);
    expect(app).toMatch(/noPuppetSource \|\| \(puppetLoaded && puppetSceneController\)/);
    expect(app).toMatch(/<PuppetCanvas/);
    expect(app).toMatch(/emptyViewport=\{noPuppetSource\}/);
    expect(app).toMatch(/<PuppetEmptyState\s+onDropMoc3=\{handleDropMoc3\}/);
    expect(app).toMatch(/<PuppetToolbar\b/);
    expect(app).toMatch(/renderToolbar=\{\(\) => null\}/);
    expect(app).not.toMatch(/onToolbarAction=/);
    expect(app).not.toMatch(/DefaultPuppetViewportPreview/);
    expect(app).not.toMatch(/puppet-empty-inspector/);
    expect(css).toMatch(/\.puppet-left-toolbar\.neko-vtoolbar\s*\{[^}]*width: 48px !important/s);
    expect(css).toMatch(/\.puppet-left-toolbar \.neko-toolbar-btn\s*\{[^}]*height: 40px/s);
    expect(css).not.toMatch(/\.puppet-empty-actions/);
    expect(css).not.toMatch(/\.puppet-default-viewport-preview/);
  });

  it('uses a dedicated left toolbar and right dock instead of overlay protocol toolbar', () => {
    const app = readSource('PuppetApp.tsx');
    const toolbar = readSource('components/PuppetToolbar.tsx');
    const css = readSource('index.css');

    expect(app).not.toMatch(/ViewportToolbar/);
    expect(app).not.toMatch(/handlePuppetToolbarAction/);
    expect(toolbar).toMatch(/ToolbarSpacer/);
    expect(toolbar).toMatch(/aria-controls="puppet-right-panel"/);
    expect(app).toMatch(/fitViewRequest=\{fitViewRequest\}/);
    expect(app).toMatch(/isRightPanelVisible && \(/);
    expect(css).not.toMatch(/\.puppet-viewport-toolbar/);
    expect(css).toMatch(/\.puppet-right-panel-stack/);
  });
});
