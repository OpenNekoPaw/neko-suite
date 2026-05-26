// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutSideToolbar } from './CutSideToolbar';

vi.mock('@neko/ui/icons', () => ({
  RightPanelIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="right-panel">{size}</span>
  ),
  RightPanelOffIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
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
          propertyPanelVisible={true}
          onTogglePropertyPanel={onTogglePropertyPanel}
        />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-cut-toolbar-action="toggle-property-panel"]',
    );
    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(toggle?.getAttribute('aria-controls')).toBe('cut-property-panel');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.getAttribute('aria-label')).toBe('preview.hidePropertyPanel');

    act(() => {
      toggle?.click();
    });

    expect(onTogglePropertyPanel).toHaveBeenCalledTimes(1);
  });

  it('uses the collapsed state icon and label when properties are hidden', () => {
    act(() => {
      root.render(
        <CutSideToolbar propertyPanelVisible={false} onTogglePropertyPanel={() => undefined} />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-cut-toolbar-action="toggle-property-panel"]',
    );
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe('preview.showPropertyPanel');
    expect(host.querySelector('[data-icon="right-panel-off"]')).not.toBeNull();
  });
});
