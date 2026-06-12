import type { SketchKeyboardAction } from './sketch-keyboard-shortcuts';
import { getSketchKeyboardAction } from './sketch-keyboard-shortcuts';

export interface SketchKeyboardEventHandlingOptions {
  readonly isKeyboardFocused: boolean;
  readonly dispatch: (action: SketchKeyboardAction) => void;
  readonly clearTextSelection?: () => void;
}

export const SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS = {
  capture: true,
} as const satisfies AddEventListenerOptions;

export function handleSketchKeyboardEvent(
  event: KeyboardEvent,
  options: SketchKeyboardEventHandlingOptions,
): boolean {
  if (!options.isKeyboardFocused) {
    return false;
  }

  const action = getSketchKeyboardAction(event);
  if (!action) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();

  if (action === 'selectAll') {
    options.clearTextSelection?.();
  }

  options.dispatch(action);
  return true;
}
