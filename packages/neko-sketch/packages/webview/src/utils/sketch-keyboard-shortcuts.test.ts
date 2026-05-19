import { describe, expect, it } from 'vitest';
import { getSketchKeyboardAction } from './sketch-keyboard-shortcuts';

describe('getSketchKeyboardAction', () => {
  it('maps editing and tool shortcuts when the sketch webview owns the key event', () => {
    expect(getSketchKeyboardAction(keyboardEvent('b'))).toBe('selectBrush');
    expect(getSketchKeyboardAction(keyboardEvent('Backspace'))).toBe('deleteSelected');
    expect(getSketchKeyboardAction(keyboardEvent('z', { metaKey: true }))).toBe('undo');
    expect(getSketchKeyboardAction(keyboardEvent('z', { metaKey: true, shiftKey: true }))).toBe(
      'redo',
    );
    expect(getSketchKeyboardAction(keyboardEvent('a', { ctrlKey: true }))).toBe('selectAll');
  });

  it('ignores text-editing targets, modifier variants, and IME composition', () => {
    document.body.innerHTML = '<textarea id="prompt"></textarea>';
    const textarea = document.getElementById('prompt');

    expect(getSketchKeyboardAction(keyboardEvent('b', { target: textarea }))).toBeNull();
    expect(getSketchKeyboardAction(keyboardEvent('b', { altKey: true }))).toBeNull();
    expect(getSketchKeyboardAction(keyboardEvent('b', { shiftKey: true }))).toBeNull();
    expect(getSketchKeyboardAction(keyboardEvent('b', { isComposing: true }))).toBeNull();
  });
});

function keyboardEvent(
  key: string,
  options: {
    readonly target?: EventTarget | null;
    readonly ctrlKey?: boolean;
    readonly metaKey?: boolean;
    readonly altKey?: boolean;
    readonly shiftKey?: boolean;
    readonly isComposing?: boolean;
  } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    altKey: options.altKey,
    shiftKey: options.shiftKey,
  });
  Object.defineProperty(event, 'target', { value: options.target ?? document.body });
  Object.defineProperty(event, 'isComposing', { value: options.isComposing ?? false });
  return event;
}
