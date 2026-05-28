// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutSideToolbar } from './CutSideToolbar';

const componentSource = readFileSync(resolve(__dirname, 'CutSideToolbar.tsx'), 'utf8');

vi.mock('@neko/ui/icons', () => ({
  RightPanelIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="right-panel">{size}</span>
  ),
  RightPanelOffIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
  ),
  SettingsIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="settings">{size}</span>
  ),
}));

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('CutSideToolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('exposes the property panel toggle at the bottom of the left toolbar', () => {
    const onTogglePropertyPanel = vi.fn();

    act(() => {
      root.render(
        <CutSideToolbar
          mainPanelToolsVisible={true}
          propertyPanelVisible={true}
          onToggleMainPanelTools={() => undefined}
          onTogglePropertyPanel={onTogglePropertyPanel}
        />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-property-panel"]',
    );
    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(host.querySelector('.neko-creative-left-rail')).not.toBeNull();
    expect(host.querySelector('.cut-left-toolbar')?.getAttribute('aria-label')).toBe(
      'preview.leftRail',
    );
    expect(toggle?.getAttribute('aria-controls')).toBe('cut-property-panel');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('right-panel');
    expect(toggle?.getAttribute('aria-label')).toBe('preview.hidePropertyPanel');

    act(() => {
      toggle?.click();
    });

    expect(onTogglePropertyPanel).toHaveBeenCalledTimes(1);
  });

  it('uses the collapsed state icon and label when properties are hidden', () => {
    act(() => {
      root.render(
        <CutSideToolbar
          mainPanelToolsVisible={true}
          propertyPanelVisible={false}
          onToggleMainPanelTools={() => undefined}
          onTogglePropertyPanel={() => undefined}
        />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-property-panel"]',
    );
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe('preview.showPropertyPanel');
    expect(host.querySelector('[data-icon="right-panel-off"]')).not.toBeNull();
  });

  it('keeps timeline command buttons out of the left toolbar', () => {
    act(() => {
      root.render(
        <CutSideToolbar
          mainPanelToolsVisible={true}
          propertyPanelVisible={false}
          onToggleMainPanelTools={() => undefined}
          onTogglePropertyPanel={() => undefined}
        />,
      );
    });

    const actionIds = [
      'add-media-track',
      'add-audio-track',
      'split-selection',
      'copy-selection',
      'toggle-snapping',
      'toggle-ripple-editing',
      'toggle-frame-align',
      'toggle-clip-thumbnails',
      'zoom-out',
      'zoom-in',
      'open-export',
    ];
    for (const actionId of actionIds) {
      expect(
        host.querySelector<HTMLButtonElement>(`[data-creative-left-rail-action="${actionId}"]`),
      ).toBeNull();
    }

    expect(
      host.querySelector('[data-creative-left-rail-action="toggle-main-panel-tools"]'),
    ).not.toBeNull();
  });

  it('exposes the main panel control visibility toggle', () => {
    const onToggleMainPanelTools = vi.fn();

    act(() => {
      root.render(
        <CutSideToolbar
          mainPanelToolsVisible={false}
          propertyPanelVisible={false}
          onToggleMainPanelTools={onToggleMainPanelTools}
          onTogglePropertyPanel={() => undefined}
        />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-main-panel-tools"]',
    );
    expect(toggle?.getAttribute('aria-controls')).toBe('cut-main-panel-tools');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('main-panel');
    expect(toggle?.getAttribute('aria-label')).toBe('preview.showMainPanelTools');

    act(() => {
      toggle?.click();
    });

    expect(onToggleMainPanelTools).toHaveBeenCalledTimes(1);
  });

  it('does not expose a separate timeline HUD visibility toggle', () => {
    act(() => {
      root.render(
        <CutSideToolbar
          mainPanelToolsVisible={true}
          propertyPanelVisible={true}
          onToggleMainPanelTools={() => undefined}
          onTogglePropertyPanel={() => undefined}
        />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-hud"]',
    );
    expect(toggle).toBeNull();
  });

  it('keeps visibility toggles scoped to main panel controls and right panel', () => {
    expect(componentSource).toContain('cut-main-panel-tools');
    expect(componentSource).toContain('preview.showMainPanelTools');
    expect(componentSource).toContain('preview.hideMainPanelTools');
    expect(componentSource).not.toContain('data-creative-left-rail-kind="common-action"');
    expect(componentSource).toContain("visibilityTarget: 'main-panel'");
    expect(componentSource).toContain("visibilityTarget: 'right-panel'");
    expect(componentSource).not.toContain("visibilityTarget: 'hud'");
    expect(componentSource).not.toContain('cut-timeline-minimap');
  });
});
