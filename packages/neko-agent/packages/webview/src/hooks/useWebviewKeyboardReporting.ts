import { useEffect, useRef } from 'react';
import type React from 'react';

interface WebviewKeyboardFocusMessage {
  readonly type: 'webviewKeyboardFocus';
  readonly focused: boolean;
}

interface WebviewKeyboardEditableMessage {
  readonly type: 'webviewKeyboardEditable';
  readonly editable: boolean;
}

interface WebviewKeyboardReporter {
  readonly postMessage: (
    message: WebviewKeyboardFocusMessage | WebviewKeyboardEditableMessage,
  ) => void;
}

export function useWebviewKeyboardFocusReporting<T extends HTMLElement>(
  _rootRef: React.RefObject<T | null>,
  reporter: WebviewKeyboardReporter | null | undefined,
): void {
  const focusedRef = useRef<boolean | null>(null);
  const reporterRef = useLatestRef(reporter);
  const hasReporter = reporter !== null && reporter !== undefined;

  useEffect(() => {
    if (!reporter) return;

    const report = (focused: boolean): void => {
      if (focusedRef.current === focused) return;
      focusedRef.current = focused;
      reporterRef.current?.postMessage({ type: 'webviewKeyboardFocus', focused });
    };
    const forceReportFocused = (): void => {
      focusedRef.current = true;
      reporterRef.current?.postMessage({ type: 'webviewKeyboardFocus', focused: true });
    };
    const handleWindowFocus = (): void => {
      if (document.hasFocus()) report(true);
    };
    const handleFocusIn = (): void => report(true);
    const handleWindowBlur = (): void => report(false);
    const handlePageHide = (): void => report(false);
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') report(false);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('pointerdown', forceReportFocused, { capture: true });
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (document.hasFocus()) report(true);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('pointerdown', forceReportFocused, { capture: true });
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      report(false);
    };
  }, [hasReporter]);
}

export function useWebviewKeyboardEditableReporting(
  reporter: WebviewKeyboardReporter | null | undefined,
): void {
  const editableRef = useRef<boolean | null>(null);
  const reporterRef = useLatestRef(reporter);
  const hasReporter = reporter !== null && reporter !== undefined;

  useEffect(() => {
    if (!reporter) return;
    let windowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    let focusOutTimer: number | null = null;

    const report = (editable: boolean): void => {
      if (editableRef.current === editable) return;
      editableRef.current = editable;
      reporterRef.current?.postMessage({ type: 'webviewKeyboardEditable', editable });
    };
    const clearFocusOutTimer = (): void => {
      if (focusOutTimer === null) return;
      window.clearTimeout(focusOutTimer);
      focusOutTimer = null;
    };
    const reportActiveElement = (): void => {
      report(windowFocused && isEditableTarget(document.activeElement));
    };
    const handleFocusIn = (): void => {
      clearFocusOutTimer();
      windowFocused = true;
      reportActiveElement();
    };
    const handleFocusOut = (): void => {
      clearFocusOutTimer();
      focusOutTimer = window.setTimeout(() => {
        focusOutTimer = null;
        reportActiveElement();
      }, 0);
    };
    const handlePointerDown = (event: PointerEvent): void => {
      clearFocusOutTimer();
      windowFocused = true;
      report(isEditableTarget(event.target));
    };
    const handleWindowFocus = (): void => {
      clearFocusOutTimer();
      windowFocused = true;
      reportActiveElement();
    };
    const handleWindowBlur = (): void => {
      clearFocusOutTimer();
      windowFocused = false;
      report(false);
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        clearFocusOutTimer();
        report(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    reportActiveElement();

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pagehide', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearFocusOutTimer();
      report(false);
    };
  }, [hasReporter]);
}

function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

const EDITABLE_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]',
  '[role="textbox"]',
  '[data-neko-keyboard-scope="text-input"]',
].join(',');

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  const element = target.closest(EDITABLE_TARGET_SELECTOR);
  if (!element) return false;

  if (element instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(element.type);
  }

  if (element instanceof HTMLElement && element.isContentEditable) return true;

  const contentEditable = element.getAttribute('contenteditable');
  if (contentEditable !== null) return contentEditable.toLowerCase() !== 'false';

  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.getAttribute('role') === 'textbox' ||
    element.getAttribute('data-neko-keyboard-scope') === 'text-input'
  );
}
