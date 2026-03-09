/**
 * useVSCodeMessages - Handle VSCode extension ↔ webview communication
 *
 * Manages message listeners for canvas updates, keyboard actions,
 * locale changes, and media additions from the extension host.
 */

import { useEffect, useRef, useState } from 'react';
import type { CanvasData } from '@neko/shared';
import { setLocale } from '../i18n';

// =============================================================================
// Types
// =============================================================================

/** VSCode API handle (only available in webview context) */
export type VSCodeAPI = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
} | null;

export interface UseVSCodeMessagesOptions {
  vscode: VSCodeAPI;
  defaultCanvasData: CanvasData;
  setCanvasData: (data: CanvasData) => void;
  onAddMediaFromExtension: (mediaType: string, uri: string, name: string) => void;
  onDropMedia: (files: Array<{ uri: string; name: string; mediaType: string }>) => void;
}

export interface UseVSCodeMessagesReturn {
  isReady: boolean;
  keyboardActionRef: React.MutableRefObject<(action: string) => void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useVSCodeMessages(options: UseVSCodeMessagesOptions): UseVSCodeMessagesReturn {
  const { vscode, defaultCanvasData, setCanvasData, onAddMediaFromExtension, onDropMedia } =
    options;

  const [isReady, setIsReady] = useState(false);
  const keyboardActionRef = useRef<(action: string) => void>(() => {});

  // Stable refs for callbacks to avoid re-registering listener
  const onAddMediaRef = useRef(onAddMediaFromExtension);
  onAddMediaRef.current = onAddMediaFromExtension;
  const onDropMediaRef = useRef(onDropMedia);
  onDropMediaRef.current = onDropMedia;

  useEffect(() => {
    if (vscode) {
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        switch (message.type) {
          case 'update':
            if (message.data) {
              setCanvasData(message.data as CanvasData);
            }
            setIsReady(true);
            break;
          case 'keyboardAction':
            keyboardActionRef.current(message.action as string);
            break;
          case 'setLocale':
            setLocale(message.locale as 'en' | 'zh-cn');
            break;
          case 'addMedia':
            onAddMediaRef.current(
              message.mediaType as string,
              message.uri as string,
              message.name as string,
            );
            break;
          case 'dropMedia': {
            const files = message.files as Array<{
              uri: string;
              name: string;
              mediaType: string;
            }>;
            onDropMediaRef.current(files);
            break;
          }
        }
      };

      window.addEventListener('message', handleMessage);
      vscode.postMessage({ type: 'ready' });

      return () => {
        window.removeEventListener('message', handleMessage);
      };
    } else {
      setCanvasData(defaultCanvasData);
      setIsReady(true);
    }
  }, [vscode, setCanvasData, defaultCanvasData]);

  return { isReady, keyboardActionRef };
}
