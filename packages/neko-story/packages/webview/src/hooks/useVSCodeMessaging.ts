import { useEffect, useRef } from 'react';
import { postMessage as postRawMessage } from '@neko/shared/vscode';
import type { MessageToWebview } from '../types';

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
    postRawMessage({ type: 'ready' });

    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);
}

/**
 * Navigate to a specific line in the editor
 */
export function navigateToLine(line: number, character = 0) {
  postRawMessage({ type: 'navigate', line, character });
}
