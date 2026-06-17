// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerData } from '../types';
import { useSketchStore } from '../stores';
import { LayerPanel } from './LayerPanel';

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as { React?: typeof React }).React = React;

describe('Sketch LayerPanel shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useSketchStore.setState({
      activeLayerId: 'layer-499',
      layers: Array.from({ length: 500 }, (_, index) =>
        createLayer({
          id: `layer-${index}`,
          name: `Layer ${index}`,
          visible: index !== 2,
          locked: index === 499,
        }),
      ),
      showLayerPanel: true,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    useSketchStore.setState({ activeLayerId: null, layers: [] });
  });

  it('uses shared TreeView virtualization for 500 visible layers', () => {
    act(() => {
      root.render(<LayerPanel />);
    });

    expect(host.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe(
      'sketch.panel.layers',
    );
    expect(host.querySelector('[data-virtualized="true"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="treeitem"]').length).toBeLessThan(500);
  });

  it('delegates selection, visibility, and lock changes through shared TreeView', () => {
    act(() => {
      root.render(<LayerPanel />);
    });

    act(() => {
      host.querySelector<HTMLElement>('[data-tree-item-id="layer-499"]')?.click();
    });
    expect(useSketchStore.getState().activeLayerId).toBe('layer-499');

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-tree-item-id="layer-499"] button[aria-label="sketch.layer.hide"]',
        )
        ?.click();
    });
    expect(
      useSketchStore.getState().layers.find((layer) => layer.id === 'layer-499')?.visible,
    ).toBe(false);

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[data-tree-item-id="layer-499"] button[aria-label="sketch.layer.unlock"]',
        )
        ?.click();
    });
    expect(useSketchStore.getState().layers.find((layer) => layer.id === 'layer-499')?.locked).toBe(
      false,
    );
  });

  it('preserves keyboard focus and selection behavior through shared TreeView', () => {
    act(() => {
      root.render(<LayerPanel />);
    });

    const tree = host.querySelector<HTMLElement>('[role="tree"]');
    act(() => {
      tree?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
    act(() => {
      tree?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(useSketchStore.getState().activeLayerId).toBe('layer-498');
  });

  it('localizes adjustment actions and layer status badges', () => {
    useSketchStore.setState({
      activeLayerId: 'adjustment-layer',
      layers: [
        createLayer({
          id: 'adjustment-layer',
          name: 'Adjustment',
          type: 'adjustment',
          clippingMask: true,
          alphaLock: true,
        }),
      ],
    });

    act(() => {
      root.render(<LayerPanel />);
    });

    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="sketch.layer.addAdjustment"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain('sketch.layer.badge.adjustment');
    expect(host.textContent).toContain('sketch.layer.badge.clippingMask');
    expect(host.textContent).toContain('sketch.layer.badge.alphaLock');

    const removeAction = host.querySelector<HTMLButtonElement>(
      '[data-tree-item-id="adjustment-layer"] button[aria-label="sketch.layer.remove"]',
    );
    expect(removeAction).not.toBeNull();
  });
});

function createLayer(overrides: Partial<LayerData>): LayerData {
  return {
    id: 'layer',
    name: 'Layer',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null,
    alphaLock: false,
    ...overrides,
  };
}
