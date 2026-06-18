// @vitest-environment jsdom

import React, { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWebviewKeyboardEditableReporting,
  useWebviewKeyboardFocusReporting,
} from '../useWebviewKeyboardReporting';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Agent Webview keyboard reporting wrapper', () => {
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
    vi.useRealTimers();
  });

  it('delegates focus reporting to the shared Webview keyboard primitive', () => {
    const reporter = { postMessage: vi.fn() };

    act(() => {
      root.render(<KeyboardFocusHarness reporter={reporter} />);
    });
    act(() => {
      host
        .querySelector<HTMLElement>('[data-testid="agent-root"]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardFocus',
      focused: true,
    });
    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardFocus',
      focused: false,
    });
  });

  it('delegates editable reporting for inputs, contenteditable, pointer changes, and pagehide', () => {
    vi.useFakeTimers();
    const reporter = { postMessage: vi.fn() };

    act(() => {
      root.render(<KeyboardEditableHarness reporter={reporter} />);
    });
    act(() => {
      host.querySelector<HTMLInputElement>('input')?.focus();
    });
    act(() => {
      host
        .querySelector<HTMLElement>('[data-testid="contenteditable"]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      host
        .querySelector<HTMLElement>('[data-testid="surface"]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      vi.runOnlyPendingTimers();
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
    expect(reporter.postMessage).toHaveBeenCalledWith({
      type: 'webviewKeyboardEditable',
      editable: false,
    });
  });
});

function KeyboardFocusHarness({
  reporter,
}: {
  readonly reporter: { readonly postMessage: (message: unknown) => void };
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useWebviewKeyboardFocusReporting(rootRef, reporter);
  return <div ref={rootRef} data-testid="agent-root" tabIndex={-1} />;
}

function KeyboardEditableHarness({
  reporter,
}: {
  readonly reporter: { readonly postMessage: (message: unknown) => void };
}): React.ReactElement {
  useWebviewKeyboardEditableReporting(reporter);
  return (
    <div>
      <input type="text" />
      <div contentEditable data-testid="contenteditable" />
      <div data-testid="surface">Surface</div>
    </div>
  );
}
