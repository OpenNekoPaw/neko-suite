// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaceParameterSlider } from './FaceParameterSlider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Model FaceParameterSlider shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
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

  it('renders the shared NumberSlider contract for face parameters', () => {
    const onChange = vi.fn();

    act(() => {
      root.render(
        <FaceParameterSlider
          onChange={onChange}
          parameter={{
            name: 'faceWidth',
            label: '脸宽',
            category: 'face',
            min: 0,
            max: 1,
            default: 0.5,
            step: 0.01,
          }}
          value={0.6}
        />,
      );
    });

    const slider = host.querySelector('[role="slider"]');
    expect(slider?.getAttribute('aria-label')).toBe('脸宽');
    expect(slider?.getAttribute('aria-valuenow')).toBe('0.6');
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('separates local preview from committed morph updates', () => {
    const onChange = vi.fn();
    const onPreviewChange = vi.fn();
    const onCommit = vi.fn();

    act(() => {
      root.render(
        <FaceParameterSlider
          onChange={onChange}
          onCommit={onCommit}
          onPreviewChange={onPreviewChange}
          parameter={{
            name: 'faceWidth',
            label: '脸宽',
            category: 'face',
            min: 0,
            max: 1,
            default: 0.5,
            step: 0.01,
          }}
          value={0.6}
        />,
      );
    });

    const numberInput = host.querySelector<HTMLInputElement>('input[type="number"]');
    expect(numberInput).not.toBeNull();

    act(() => {
      setInputValue(numberInput, '0.72');
      numberInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onPreviewChange).toHaveBeenCalledWith(0.72);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      numberInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(onCommit).toHaveBeenCalledWith(0.72);
  });
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
