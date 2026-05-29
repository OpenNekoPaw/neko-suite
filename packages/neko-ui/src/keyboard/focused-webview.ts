import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { KEYBOARD_FOCUSED_ATTRIBUTE, setKeyboardFocusedAttribute } from './boundary';

export interface KeyboardFocusMessage {
  readonly type: 'keyboardFocus';
  readonly focused: boolean;
}

export function isKeyboardFocusMessage(value: unknown): value is KeyboardFocusMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { type?: unknown; focused?: unknown };
  return candidate.type === 'keyboardFocus' && typeof candidate.focused === 'boolean';
}

export function useFocusedWebviewRoot<T extends HTMLElement>(
  rootRef: React.RefObject<T | null>,
  defaultFocused = true,
): {
  readonly isKeyboardFocused: boolean;
  readonly isKeyboardFocusedRef: React.MutableRefObject<boolean>;
  readonly setKeyboardFocused: (focused: boolean) => void;
} {
  const [isKeyboardFocused, setKeyboardFocusedState] = useState(defaultFocused);
  const isKeyboardFocusedRef = useRef(defaultFocused);

  const setKeyboardFocused = (focused: boolean): void => {
    isKeyboardFocusedRef.current = focused;
    setKeyboardFocusedState(focused);
    const root = rootRef.current;
    if (root) {
      setKeyboardFocusedAttribute(root, focused);
    }
    setBodyKeyboardFocusedAttribute(focused);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (root) {
      setKeyboardFocusedAttribute(root, isKeyboardFocusedRef.current);
    }
    setBodyKeyboardFocusedAttribute(isKeyboardFocusedRef.current);

    return () => {
      document.body.removeAttribute(KEYBOARD_FOCUSED_ATTRIBUTE);
    };
  }, [rootRef]);

  return {
    isKeyboardFocused,
    isKeyboardFocusedRef,
    setKeyboardFocused,
  };
}

function setBodyKeyboardFocusedAttribute(focused: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }

  setKeyboardFocusedAttribute(document.body, focused);
}
