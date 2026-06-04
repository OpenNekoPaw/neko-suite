// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasData } from '@neko/shared';
import {
  useVSCodeMessages,
  type UseVSCodeMessagesOptions,
  type VSCodeAPI,
} from './useVSCodeMessages';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DEFAULT_CANVAS_DATA: CanvasData = {
  version: '1.0',
  name: 'Test Canvas',
  nodes: [],
  connections: [],
};

describe('useVSCodeMessages keyboard action guards', () => {
  let host: HTMLDivElement;
  let root: Root;
  let action: ReturnType<typeof vi.fn<(value: string) => void>>;
  let isComposingRef: React.MutableRefObject<boolean>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    action = vi.fn();
    isComposingRef = { current: false };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = '';
  });

  it('keeps editor-level keyboard actions inside the active text input', () => {
    act(() => {
      root.render(<VSCodeMessageHarness action={action} isComposingRef={isComposingRef} />);
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      postHostMessage({ type: 'keyboardAction', action: 'deleteSelected' });
      postHostMessage({ type: 'keyboardAction', action: 'selectNode:node-2' });
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('selectNode:node-2');
  });

  it('keeps editor-level keyboard actions out while IME composition is active', () => {
    act(() => {
      root.render(<VSCodeMessageHarness action={action} isComposingRef={isComposingRef} />);
    });

    act(() => {
      window.dispatchEvent(new Event('compositionstart'));
      postHostMessage({ type: 'keyboardAction', action: 'deleteSelected' });
      postHostMessage({ type: 'keyboardAction', action: 'selectNode:node-2' });
    });

    expect(isComposingRef.current).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('selectNode:node-2');
  });

  it('ignores host keyboard actions after the webview loses keyboard ownership', () => {
    const isKeyboardFocusedRef: React.MutableRefObject<boolean> = { current: true };

    act(() => {
      root.render(
        <VSCodeMessageHarness
          action={action}
          isComposingRef={isComposingRef}
          isKeyboardFocusedRef={isKeyboardFocusedRef}
        />,
      );
    });

    act(() => {
      postHostMessage({ type: 'keyboardFocus', focused: false });
      postHostMessage({ type: 'keyboardAction', action: 'deleteSelected' });
    });

    expect(isKeyboardFocusedRef.current).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('acknowledges canvas data readiness after applying an update message', () => {
    const vscode = createVSCodeApi();
    const setCanvasData = vi.fn();

    act(() => {
      root.render(
        <VSCodeMessageHarness
          action={action}
          isComposingRef={isComposingRef}
          options={{
            vscode,
            setCanvasData,
          }}
        />,
      );
    });

    act(() => {
      postHostMessage({ type: 'update', data: DEFAULT_CANVAS_DATA });
    });

    expect(setCanvasData).toHaveBeenCalledWith(DEFAULT_CANVAS_DATA);
    expect(vscode.postMessage).toHaveBeenCalledWith({ type: 'canvasDataReady' });
  });

  it('creates canvas connections from host node operation requests', () => {
    const vscode = createVSCodeApi();
    const createConnection = vi.fn(() => ({
      connectionId: 'connection-1',
    }));

    act(() => {
      root.render(
        <VSCodeMessageHarness
          action={action}
          isComposingRef={isComposingRef}
          options={{
            vscode,
            createConnection,
          }}
        />,
      );
    });

    act(() => {
      postHostMessage({
        type: 'nodes.createConnection',
        _requestId: 7,
        payload: {
          sourceId: 'scene-1',
          targetId: 'scene-2',
          type: 'sequence',
        },
      });
    });

    expect(createConnection).toHaveBeenCalledWith({
      sourceId: 'scene-1',
      targetId: 'scene-2',
      type: 'sequence',
    });
    expect(vscode.postMessage).toHaveBeenCalledWith({
      type: '_response',
      _requestId: 7,
      connectionId: 'connection-1',
    });
  });
});

function VSCodeMessageHarness({
  action,
  isComposingRef,
  isKeyboardFocusedRef,
  options,
}: {
  readonly action: (value: string) => void;
  readonly isComposingRef: React.MutableRefObject<boolean>;
  readonly isKeyboardFocusedRef?: React.MutableRefObject<boolean>;
  readonly options?: Partial<UseVSCodeMessagesOptions>;
}): React.ReactElement | null {
  const { keyboardActionRef } = useVSCodeMessages(
    createOptions(isComposingRef, isKeyboardFocusedRef, options),
  );
  keyboardActionRef.current = action;
  return null;
}

function createOptions(
  isComposingRef: React.MutableRefObject<boolean>,
  isKeyboardFocusedRef?: React.MutableRefObject<boolean>,
  options: Partial<UseVSCodeMessagesOptions> = {},
): UseVSCodeMessagesOptions {
  return {
    vscode: createVSCodeApi(),
    defaultCanvasData: DEFAULT_CANVAS_DATA,
    setCanvasData: vi.fn(),
    onAddMediaFromExtension: vi.fn(),
    onDropAssets: vi.fn(),
    isComposingRef,
    isKeyboardFocusedRef,
    ...options,
  };
}

function createVSCodeApi(): NonNullable<VSCodeAPI> {
  return {
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  };
}

function postHostMessage(data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}
