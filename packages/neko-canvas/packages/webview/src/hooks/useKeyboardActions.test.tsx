// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardActions, type UseKeyboardActionsOptions } from './useKeyboardActions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useKeyboardActions editable and IME guards', () => {
  let host: HTMLDivElement;
  let root: Root;
  let options: UseKeyboardActionsOptions;

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
  });

  it('keeps Delete, Space, and primary+A inside node text inputs', () => {
    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    act(() => {
      input.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      input.dispatchEvent(createKeyEvent(' ', 'Space'));
      input.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true }));
    });

    expect(options.deleteSelected).not.toHaveBeenCalled();
    expect(options.clearSelection).not.toHaveBeenCalled();
    expect(options.resetViewport).not.toHaveBeenCalled();

    input.remove();
  });

  it('does not trigger editor-level actions during IME composition', () => {
    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete', { isComposing: true }));
      window.dispatchEvent(createKeyEvent('Escape', 'Escape', { isComposing: true }));
      window.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true, isComposing: true }));
    });

    expect(options.deleteSelected).not.toHaveBeenCalled();
    expect(options.clearSelection).not.toHaveBeenCalled();
  });

  it('still dispatches editor actions when the editor owns the key event', () => {
    act(() => {
      root.render(<KeyboardHarness options={options} />);
    });

    act(() => {
      window.dispatchEvent(createKeyEvent('Delete', 'Delete'));
      window.dispatchEvent(createKeyEvent('a', 'KeyA', { ctrlKey: true }));
    });

    expect(options.deleteSelected).toHaveBeenCalledTimes(1);
    expect(options.reportAction).toHaveBeenCalledWith('deleteNode', 'Deleted 1 node(s)');
  });
});

function KeyboardHarness({
  options,
}: {
  readonly options: UseKeyboardActionsOptions;
}): React.ReactElement | null {
  useKeyboardActions(options);
  return null;
}

function createOptions(): UseKeyboardActionsOptions {
  return {
    vscode: null,
    selectedNodeIds: ['node-1'],
    selectedConnectionIds: [],
    nodes: [{ id: 'node-1' }, { id: 'node-2' }] as UseKeyboardActionsOptions['nodes'],
    isConnecting: false,
    contextMenu: null,
    setContextMenu: vi.fn(),
    selectNode: vi.fn(),
    selectConnection: vi.fn(),
    deleteSelected: vi.fn(),
    cancelConnection: vi.fn(),
    clearSelection: vi.fn(),
    resetViewport: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    handleCopy: vi.fn(),
    handleCut: vi.fn(),
    handlePaste: vi.fn(),
    handlePasteInPlace: vi.fn(),
    handleDuplicate: vi.fn(),
    reportAction: vi.fn(),
  };
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
