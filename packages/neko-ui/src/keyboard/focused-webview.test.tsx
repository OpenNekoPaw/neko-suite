import React, { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useFocusedWebviewRoot } from './focused-webview';

describe('useFocusedWebviewRoot', () => {
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
    document.body.removeAttribute('data-neko-keyboard-focused');
    host.remove();
  });

  it('syncs keyboard focus metadata to the root and body for portal-owned affordances', () => {
    act(() => {
      root.render(<FocusedRootHarness defaultFocused={false} />);
    });

    const shell = host.querySelector<HTMLElement>('[data-testid="keyboard-root"]');
    expect(shell?.getAttribute('data-neko-keyboard-focused')).toBe('false');
    expect(document.body.getAttribute('data-neko-keyboard-focused')).toBe('false');

    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });

    expect(shell?.getAttribute('data-neko-keyboard-focused')).toBe('true');
    expect(document.body.getAttribute('data-neko-keyboard-focused')).toBe('true');
  });
});

function FocusedRootHarness({
  defaultFocused,
}: {
  readonly defaultFocused: boolean;
}): React.ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const { setKeyboardFocused } = useFocusedWebviewRoot(rootRef, defaultFocused);

  return (
    <div ref={rootRef} data-testid="keyboard-root">
      <button type="button" onClick={() => setKeyboardFocused(true)}>
        Focus
      </button>
    </div>
  );
}
