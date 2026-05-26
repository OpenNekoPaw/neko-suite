// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollapsiblePanel } from './CollapsiblePanel';

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as { React?: typeof React }).React = React;

describe('Sketch CollapsiblePanel shared UI migration', () => {
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

  it('renders through @neko/ui Collapsible with legacy shell classes and toggles content', () => {
    act(() => {
      root.render(
        <CollapsiblePanel titleKey="sketch.panel.layers">
          <div data-testid="panel-body">Layers</div>
        </CollapsiblePanel>,
      );
    });

    const header = host.querySelector<HTMLButtonElement>('.neko-collapsible-header');
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain('sketch.panel.layers');
    expect(header?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-testid="panel-body"]')).not.toBeNull();

    act(() => {
      header?.click();
    });

    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-testid="panel-body"]')).toBeNull();
  });

  it('honors defaultExpanded=false', () => {
    act(() => {
      root.render(
        <CollapsiblePanel titleKey="sketch.panel.filters" defaultExpanded={false}>
          <div data-testid="panel-body">Filters</div>
        </CollapsiblePanel>,
      );
    });

    const header = host.querySelector<HTMLButtonElement>('.neko-collapsible-header');
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-testid="panel-body"]')).toBeNull();
  });
});
