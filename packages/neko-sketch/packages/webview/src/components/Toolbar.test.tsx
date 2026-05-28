// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { useSketchStore } from '../stores';

vi.mock('@neko/ui/icons', () => ({
  LayersIcon: ({ size = 16 }: { readonly size?: number }) => <span data-icon="layers">{size}</span>,
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
    useSketchStore.setState({ activeTool: 'brush', showSidebar: true, showFrameTimeline: true });
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
      '[data-creative-left-rail-action="toggle-right-sidebar"]',
    );
    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(host.querySelector('.sketch-left-toolbar')?.getAttribute('aria-label')).toBe(
      'sketch.toolbar.ariaLabel',
    );
    expect(toggle?.getAttribute('aria-controls')).toBe('sketch-right-sidebar');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('right-panel');

    act(() => {
      toggle?.click();
    });

    expect(useSketchStore.getState().showSidebar).toBe(false);
  });

  it('renders the frame timeline visibility toggle as a main panel control switch', () => {
    act(() => {
      root.render(<Toolbar />);
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-frame-timeline"]',
    );
    expect(toggle?.getAttribute('aria-controls')).toBe('sketch-frame-timeline');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(toggle?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('main-panel');
    expect(toggle?.getAttribute('aria-label')).toBe('sketch.timeline.hideFrameTimeline');

    act(() => {
      toggle?.click();
    });

    expect(useSketchStore.getState().showFrameTimeline).toBe(false);
  });

  it('marks primary drawing tools as left rail common actions', () => {
    act(() => {
      root.render(<Toolbar />);
    });

    const brush = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="select-brush"]',
    );
    const eraser = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="select-eraser"]',
    );

    expect(brush?.getAttribute('data-creative-left-rail-kind')).toBe('common-action');
    expect(brush?.getAttribute('aria-pressed')).toBe('true');
    expect(eraser?.getAttribute('data-creative-left-rail-kind')).toBe('common-action');

    act(() => {
      eraser?.click();
    });

    expect(useSketchStore.getState().activeTool).toBe('eraser');
  });
});
