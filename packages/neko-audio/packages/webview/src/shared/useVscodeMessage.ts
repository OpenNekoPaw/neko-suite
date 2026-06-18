/**
 * VSCode Webview messaging hook
 *
 * Provides type-safe postMessage communication with the Extension Host.
 */

import { useEffect, useCallback, useRef } from 'react';
import { isKeyboardFocusMessage } from '@neko/ui/keyboard';
import type { WebviewMessage, ExtensionMessage } from './types';
import {
  getState as getSharedState,
  postMessage as postRawMessage,
  setState as setSharedState,
} from '@neko/shared/vscode';

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export function getVsCodeApi(): VsCodeApi {
  return {
    postMessage(message: unknown): void {
      postRawMessage(message);
    },
    getState(): unknown {
      return getSharedState();
    },
    setState(state: unknown): void {
      setSharedState(state);
    },
  };
}

/**
 * Send a message to the Extension Host
 */
export function postMessage(message: WebviewMessage): void {
  getVsCodeApi().postMessage(message);
}

/**
 * Hook to listen for messages from the Extension Host
 */
export function useExtensionMessage(handler: (message: ExtensionMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;
      if (isKeyboardFocusMessage(message)) {
        handlerRef.current(message);
        return;
      }
      if (message && typeof message.type === 'string') {
        handlerRef.current(message);
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}

/**
 * Hook that sends 'ready' on mount and provides postMessage
 */
export function useVscodeReady(): {
  postMessage: (message: WebviewMessage) => void;
} {
  const post = useCallback((message: WebviewMessage) => {
    postMessage(message);
  }, []);

  useEffect(() => {
    postMessage({ type: 'ready' });
  }, []);

  return { postMessage: post };
}
