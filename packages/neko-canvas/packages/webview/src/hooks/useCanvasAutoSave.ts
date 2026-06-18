import { useCallback, useEffect, useRef } from 'react';
import type { CanvasData } from '@neko/shared';
import { createCanvasDocumentSaveFingerprint } from '../utils/canvasPersistence';

export interface UseCanvasAutoSaveOptions {
  readonly canvasData: CanvasData | null;
  readonly isReady: boolean;
  readonly delayMs?: number;
  readonly onBeforeSave?: () => void;
  readonly onSave: (canvasData: CanvasData) => void;
}

export interface UseCanvasAutoSaveResult {
  readonly markSaved: (canvasData: CanvasData) => void;
}

const DEFAULT_CANVAS_AUTO_SAVE_DELAY_MS = 300;

export function useCanvasAutoSave({
  canvasData,
  isReady,
  delayMs = DEFAULT_CANVAS_AUTO_SAVE_DELAY_MS,
  onBeforeSave,
  onSave,
}: UseCanvasAutoSaveOptions): UseCanvasAutoSaveResult {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);
  const pendingSaveFingerprintRef = useRef<string | null>(null);

  const clearPendingSave = useCallback(() => {
    if (!saveTimeoutRef.current) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  const markSaved = useCallback(
    (data: CanvasData) => {
      lastSavedDataRef.current = createCanvasDocumentSaveFingerprint(data);
      pendingSaveFingerprintRef.current = null;
      clearPendingSave();
    },
    [clearPendingSave],
  );

  useEffect(() => {
    if (!isReady || !canvasData) return;

    const currentDataFingerprint = createCanvasDocumentSaveFingerprint(canvasData);
    if (currentDataFingerprint === lastSavedDataRef.current) return;
    if (currentDataFingerprint === pendingSaveFingerprintRef.current) return;

    clearPendingSave();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      pendingSaveFingerprintRef.current = currentDataFingerprint;
      onBeforeSave?.();
      onSave(canvasData);
    }, delayMs);

    return clearPendingSave;
  }, [canvasData, clearPendingSave, delayMs, isReady, onBeforeSave, onSave]);

  return { markSaved };
}
