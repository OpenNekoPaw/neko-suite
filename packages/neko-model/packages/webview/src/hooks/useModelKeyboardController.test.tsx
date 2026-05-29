// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import {
  useModelKeyboardController,
  type ModelKeyboardState,
  type UseModelKeyboardControllerOptions,
} from './useModelKeyboardController';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useModelKeyboardController', () => {
  let host: HTMLDivElement;
  let root: Root;
  let options: UseModelKeyboardControllerOptions;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    options = createOptions();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = '';
  });

  it('handles editor and viewport shortcuts when the Model webview owns focus', () => {
    const viewport = document.createElement('div');
    setBoundary(viewport, 'viewport');
    document.body.appendChild(viewport);

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Escape', 'Escape'));
      viewport.dispatchEvent(createKeyEvent('0', 'Digit0'));
    });

    expect(options.onClearSelection).toHaveBeenCalledTimes(1);
    expect(options.onResetView).toHaveBeenCalledTimes(1);
  });

  it('keeps text/property input shortcuts inside the input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    setBoundary(input, 'text-input', [
      'Backspace',
      'Delete',
      'Enter',
      'Escape',
      'Space',
      'Tab',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]);
    document.body.appendChild(input);
    input.focus();

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      input.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      input.dispatchEvent(createKeyEvent('Backspace', 'Backspace'));
      input.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true }));
      input.dispatchEvent(createKeyEvent(' ', 'Space'));
      input.dispatchEvent(createKeyEvent('Escape', 'Escape'));
    });

    expect(options.onClearSelection).not.toHaveBeenCalled();
    expect(options.onResetView).not.toHaveBeenCalled();
  });

  it('blocks editor shortcuts during IME composition', () => {
    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Escape', 'Escape', { isComposing: true }));
      window.dispatchEvent(createKeyEvent('0', 'Digit0', { isComposing: true }));
    });

    expect(options.onClearSelection).not.toHaveBeenCalled();
    expect(options.onResetView).not.toHaveBeenCalled();
  });

  it('ignores retained webview key events while unfocused', () => {
    options = createOptions({ isKeyboardFocused: false });

    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Escape', 'Escape'));
      window.dispatchEvent(createKeyEvent('0', 'Digit0'));
    });

    expect(options.onClearSelection).not.toHaveBeenCalled();
    expect(options.onResetView).not.toHaveBeenCalled();
  });
});

function KeyboardHarness({
  options,
}: {
  readonly options: UseModelKeyboardControllerOptions;
}): React.ReactElement | null {
  useModelKeyboardController(options);
  return null;
}

function createOptions(
  stateOverrides: Partial<ModelKeyboardState> = {},
): UseModelKeyboardControllerOptions {
  return {
    state: {
      hasSelection: true,
      isKeyboardFocused: true,
      ...stateOverrides,
    },
    onClearSelection: vi.fn(),
    onResetView: vi.fn(),
  };
}

function setBoundary(
  element: HTMLElement,
  scope: 'text-input' | 'viewport',
  ownedKeys?: Parameters<typeof getKeyboardBoundaryMetadata>[0]['ownedKeys'],
): void {
  const metadata = getKeyboardBoundaryMetadata({
    scope,
    ownerId: scope,
    ownedKeys,
  });
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      element.setAttribute(key, value);
    }
  }
}

function createKeyEvent(key: string, code: string, options: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key,
    ...options,
  });
}
