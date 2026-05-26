// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { useSketchStore } from '../stores';

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

describe('Sketch Toolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useSketchStore.setState({ activeTool: 'brush', showSidebar: true });
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

  it('renders the right sidebar toggle at the bottom of the left toolbar', () => {
    act(() => {
      root.render(<Toolbar />);
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-sketch-toolbar-action="toggle-right-sidebar"]',
    );
    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(toggle?.getAttribute('aria-controls')).toBe('sketch-right-sidebar');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      toggle?.click();
    });

    expect(useSketchStore.getState().showSidebar).toBe(false);
  });
});
