import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readPersistedResizeState } from '@neko/ui/hooks';
import { PUPPET_RIGHT_PANEL_RESIZE } from './puppetResizeLayout';

const srcRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

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
});
