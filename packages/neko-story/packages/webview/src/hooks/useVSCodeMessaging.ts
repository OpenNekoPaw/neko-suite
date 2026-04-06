// TODO: Duplicated hook — neko-cut has a much larger useVSCodeMessaging (462 lines)
// with domain-specific logic (timeline, export, context menu, AI actions).
// This version is a thin wrapper (56 lines) over acquireVsCodeApi + message listener.
// The thin wrapper pattern could be extracted to @neko/shared/hooks/useVSCodeMessaging
// as a generic base, with domain hooks composing on top of it.

import { useEffect, useCallback, useRef } from 'react';
import type { MessageToWebview, MessageToExtension } from '../types';

declare const acquireVsCodeApi: () => {
  postMessage: (message: MessageToExtension) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

type MessageHandler = (message: MessageToWebview) => void;

/**
 * Hook for VSCode webview messaging
 */
export function useVSCodeMessaging(onMessage: MessageHandler) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const handler = (event: MessageEvent<MessageToWebview>) => {
      handlerRef.current(event.data);
    };

    window.addEventListener('message', handler);

    // Notify extension that webview is ready
    vscode.postMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  const postMessage = useCallback((message: MessageToExtension) => {
    vscode.postMessage(message);
  }, []);

  return { postMessage };
}

/**
 * Navigate to a specific line in the editor
 */
export function navigateToLine(line: number, character = 0) {
  vscode.postMessage({ type: 'navigate', line, character });
}

/**
 * Report scroll position to extension
 */
export function reportScroll(line: number) {
  vscode.postMessage({ type: 'scroll', line });
}
