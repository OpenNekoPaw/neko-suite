/**
 * Hook to capture text selection in document preview webviews.
 *
 * Listens for selectionchange events, debounces, and provides
 * selection state + a callback to send selection to AI agent.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { postMessage } from './useVscodeMessage';

export interface DocumentSelection {
  /** Selected text content */
  text: string;
  /** Bounding rect of the selection (for FAB positioning) */
  rect: DOMRect | null;
}

export interface UseDocumentSelectionOptions {
  /** Current page number (PDF/CBZ) or undefined */
  pageNumber?: number;
  /** Current chapter title (EPUB) or undefined */
  chapterTitle?: string;
  /** Whether selection is enabled */
  enabled?: boolean;
}

export function useDocumentSelection(options: UseDocumentSelectionOptions = {}) {
  const { pageNumber, chapterTitle, enabled = true } = options;
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const handleSelectionChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (text.length > 0) {
          const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
          setSelection({
            text,
            rect: range?.getBoundingClientRect() ?? null,
          });
        } else {
          setSelection(null);
        }
      }, 300);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled]);

  const sendToAi = useCallback(() => {
    if (!selection) return;
    postMessage({
      type: 'document:sendToAi',
      payload: {
        selectedText: selection.text,
        pageNumber,
        chapterTitle,
      },
    } as never); // Cast needed: WebviewMessage union doesn't include document messages yet
    // Clear selection after sending
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [selection, pageNumber, chapterTitle]);

  const sendImageToAi = useCallback(
    (imageDataUrl: string, page?: number) => {
      postMessage({
        type: 'document:sendToAi',
        payload: {
          imageDataUrl,
          pageNumber: page ?? pageNumber,
        },
      } as never);
    },
    [pageNumber],
  );

  return { selection, sendToAi, sendImageToAi, clearSelection: () => setSelection(null) };
}
