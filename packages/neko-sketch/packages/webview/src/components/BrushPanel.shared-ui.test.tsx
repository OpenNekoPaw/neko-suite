// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSketchStore } from '../stores';
import { BrushPanel } from './BrushPanel';

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

  it('renders brush controls through shared PropertyPanel and commits slider changes', () => {
    act(() => {
      root.render(<BrushPanel />);
    });

    expect(host.querySelector('[data-property-id="brush.size"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="brush.color"]')).not.toBeNull();

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
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
