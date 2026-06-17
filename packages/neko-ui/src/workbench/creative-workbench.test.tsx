// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativeLeftRail, CreativeWorkbenchShell, MainPanelControlLayer } from './index';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('creative workbench shell primitives', () => {
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

  it('renders shell slots without owning domain content', () => {
    const onRightDockSizeChange = vi.fn();

    act(() => {
      root.render(
        <CreativeWorkbenchShell
          mainKind="viewport-timeline"
          leftRail={<div data-testid="left" />}
          main={<div data-testid="main" />}
          rightDock={{
            id: 'workbench-right-dock',
            size: 320,
            minSize: 200,
            maxSize: 420,
            onSizeChange: onRightDockSizeChange,
            children: <div data-testid="right" />,
          }}
          bottomPanel={<div data-testid="bottom" />}
        />,
      );
    });

    expect(host.querySelector('.neko-creative-workbench-shell')).not.toBeNull();
    expect(
      host.querySelector('.neko-creative-workbench-main')?.getAttribute('data-main-kind'),
    ).toBe('viewport-timeline');
    expect(host.querySelector('[data-testid="left"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="main"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="right"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="bottom"]')).not.toBeNull();
    expect(host.querySelector('#workbench-right-dock')).not.toBeNull();
    expect(host.querySelector('#workbench-right-dock')?.getAttribute('data-resizing')).toBe(
      'false',
    );
    expect(host.querySelector('#workbench-right-dock')?.getAttribute('style')).toContain(
      'width: 320px',
    );
    expect(host.querySelector('.neko-creative-workbench-right-resize-handle')).not.toBeNull();
  });

  it('forwards visibility toggle state from left rail actions', () => {
    const onToggle = vi.fn();
    const onSave = vi.fn();

    act(() => {
      root.render(
        <CreativeLeftRail
          label="Workbench"
          actions={[
            {
              id: 'toggle-viewport-controls',
              label: 'Toggle viewport controls',
              icon: <span />,
              kind: 'visibility-toggle',
              visibilityTarget: 'hud',
              controls: 'viewport-controls',
              active: true,
              onClick: onToggle,
            },
            {
              id: 'save',
              label: 'Save',
              icon: <span />,
              kind: 'common-action',
              onClick: onSave,
            },
          ]}
        />,
      );
    });

    const rail = host.querySelector('.neko-creative-left-rail');
    const toggle = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-viewport-controls"]',
    );
    const save = host.querySelector<HTMLButtonElement>('[data-creative-left-rail-action="save"]');

    expect(rail?.getAttribute('aria-label')).toBe('Workbench');
    expect(toggle?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('hud');
    expect(toggle?.getAttribute('aria-controls')).toBe('viewport-controls');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(save?.getAttribute('data-creative-left-rail-target')).toBeNull();
    expect(save?.getAttribute('aria-controls')).toBeNull();
    expect(save?.getAttribute('aria-expanded')).toBeNull();

    act(() => {
      toggle?.click();
      save?.click();
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('omits hidden main panel control layers from focus order', () => {
    act(() => {
      root.render(
        <>
          <MainPanelControlLayer
            id="visible-controls"
            visible={true}
            placement="overlay-top-left"
            label="Visible controls"
            role="toolbar"
          >
            <button type="button">Visible</button>
          </MainPanelControlLayer>
          <MainPanelControlLayer id="hidden-controls" visible={false} placement="transport">
            <button type="button">Hidden</button>
          </MainPanelControlLayer>
        </>,
      );
    });

    expect(host.querySelector('#visible-controls')?.getAttribute('data-placement')).toBe(
      'overlay-top-left',
    );
    expect(host.querySelector('#visible-controls')?.getAttribute('role')).toBe('toolbar');
    expect(host.querySelector('#hidden-controls')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });
});
