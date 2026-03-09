/**
 * VSCode Webview messaging hook
 *
 * Provides type-safe postMessage communication with the Extension Host.
 */

import { useEffect, useCallback, useRef } from 'react';
import type { WebviewMessage, ExtensionMessage } from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('useVscodeMessage');

// Acquire VSCode API (available in webview context)
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

let vscodeApi: VsCodeApi | null = null;

function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vscodeApi = (window as any).acquireVsCodeApi?.() ?? null;
    if (!vscodeApi) {
      // Fallback for dev mode (outside VSCode)
      logger.warn('acquireVsCodeApi not available, using mock');
      vscodeApi = {
        postMessage: (msg) => logger.info(`[mock postMessage] ${JSON.stringify(msg)}`),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return vscodeApi;
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
