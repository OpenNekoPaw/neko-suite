// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProperties } from './AudioProperties';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('AudioProperties shared UI migration', () => {
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

  it('renders fixed audio properties through composition rows and preserves typed callbacks', () => {
    const onVolumeChange = vi.fn();
    const onPanChange = vi.fn();
    const onGainChange = vi.fn();

    act(() => {
      root.render(
        <AudioProperties
          gain={0}
          onGainChange={onGainChange}
          onPanChange={onPanChange}
          onVolumeChange={onVolumeChange}
          pan={0}
          volume={1}
        />,
      );
    });

    expect(host.querySelector('[data-audio-composition-path="properties"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.properties.volume"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.properties.pan"]')).not.toBeNull();
    expect(host.querySelector('[data-property-id="audio.properties.gain"]')).not.toBeNull();

    const volumeInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="audio.properties.volume"] input[type="number"]',
    );
    expect(volumeInput).not.toBeNull();

    act(() => {
      setInputValue(volumeInput, '50');
      volumeInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onVolumeChange).toHaveBeenCalledWith(0.5);
    expect(onPanChange).not.toHaveBeenCalled();
    expect(onGainChange).not.toHaveBeenCalled();
  });
});

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
