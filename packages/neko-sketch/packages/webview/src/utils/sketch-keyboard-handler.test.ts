import { describe, expect, it, vi } from 'vitest';
import {
  handleSketchKeyboardEvent,
  SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS,
} from './sketch-keyboard-handler';

describe('handleSketchKeyboardEvent', () => {
  it('captures Select All for the sketch canvas instead of browser text selection', () => {
    const event = keyboardEvent('a', { metaKey: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    const dispatch = vi.fn();
    const clearTextSelection = vi.fn();

    const handled = handleSketchKeyboardEvent(event, {
      isKeyboardFocused: true,
      clearTextSelection,
      dispatch,
    });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(clearTextSelection).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('selectAll');
  });

  it('keeps native text editing shortcuts inside editable fields', () => {
    document.body.innerHTML = '<textarea id="prompt"></textarea>';
    const textarea = document.getElementById('prompt');
    const event = keyboardEvent('a', { metaKey: true, target: textarea });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    const dispatch = vi.fn();
    const clearTextSelection = vi.fn();

    const handled = handleSketchKeyboardEvent(event, {
      isKeyboardFocused: true,
      clearTextSelection,
      dispatch,
    });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(clearTextSelection).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('ignores shortcuts while another VSCode surface owns keyboard focus', () => {
    const event = keyboardEvent('a', { ctrlKey: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    const dispatch = vi.fn();
    const clearTextSelection = vi.fn();

    const handled = handleSketchKeyboardEvent(event, {
      isKeyboardFocused: false,
      clearTextSelection,
      dispatch,
    });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(clearTextSelection).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not clear browser text selection for non-selection shortcuts', () => {
    const event = keyboardEvent('b');
    const dispatch = vi.fn();
    const clearTextSelection = vi.fn();

    const handled = handleSketchKeyboardEvent(event, {
      isKeyboardFocused: true,
      clearTextSelection,
      dispatch,
    });

    expect(handled).toBe(true);
    expect(clearTextSelection).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('selectBrush');
  });

  it('registers keyboard events in capture phase', () => {
    expect(SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS).toEqual({ capture: true });
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
  } = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    altKey: options.altKey,
    shiftKey: options.shiftKey,
    cancelable: true,
  });
  Object.defineProperty(event, 'target', { value: options.target ?? document.body });
  return event;
}
