// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSketchStore } from '../stores';
import { BrushPanel } from './BrushPanel';

vi.mock('./adapters/sharedSketchUiAdapter', () => ({
  mapSketchBrushToProperties: vi.fn(() => {
    throw new Error('BrushPanel must not use the legacy brush schema adapter');
  }),
  mapSketchBrushPropertyCommit: vi.fn(() => {
    throw new Error('BrushPanel must not use the legacy brush commit adapter');
  }),
  mapSketchLayersToTreeViewItems: vi.fn(),
}));

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as { React?: typeof React }).React = React;
(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as typeof ResizeObserver;

describe('Sketch BrushPanel shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useSketchStore.setState({
      activeTool: 'brush',
      brushSettings: {
        type: 'pen',
        size: 24,
        opacity: 0.75,
        hardness: 0.5,
        spacing: 0.65,
        color: '#ff00ff',
        pressureSizeEnabled: false,
        pressureOpacityEnabled: false,
      },
      showBrushPanel: true,
      symmetry: { axisX: 0, axisY: 0, mode: 'none', radialCount: 4 },
      textureStampAssets: [],
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders brush controls through composition rows and commits typed slider changes', () => {
    act(() => {
      root.render(<BrushPanel />);
    });

    expect(host.querySelector('[data-property-id="brush.size"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="brush.color"]')).not.toBeNull();
    expect(host.querySelector('[data-cut-panel-path]')).toBeNull();

    const sizeInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="brush.size"] input[type="number"]',
    );
    expect(sizeInput).not.toBeNull();

    act(() => {
      setInputValue(sizeInput, '64');
      sizeInput?.dispatchEvent(new Event('input', { bubbles: true }));
      sizeInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(useSketchStore.getState().brushSettings.size).toBe(64);
  });

  it('commits stamp texture and symmetry edits through typed brush callbacks', () => {
    useSketchStore.setState({
      brushSettings: {
        ...useSketchStore.getState().brushSettings,
        type: 'stamp',
        stampPattern: 'grain',
      },
      textureStampAssets: [
        {
          id: 'paper',
          name: 'Paper',
          dataUrl: '',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          createdAt: 1,
        },
      ],
    });

    act(() => {
      root.render(<BrushPanel />);
    });

    expect(host.querySelector('[data-property-id="brush.stampTexture"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="brush.spacing"]')).not.toBeNull();

    const spacingInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="brush.spacing"] input[type="number"]',
    );
    expect(spacingInput).not.toBeNull();

    act(() => {
      setInputValue(spacingInput, '120');
      spacingInput?.dispatchEvent(new Event('input', { bubbles: true }));
      spacingInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(useSketchStore.getState().brushSettings.spacing).toBe(1.2);
  });
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
