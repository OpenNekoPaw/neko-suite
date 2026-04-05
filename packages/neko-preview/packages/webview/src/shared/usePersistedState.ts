/**
 * Persisted state hook using VSCode webview getState()/setState().
 *
 * State survives tab hide/show cycles and webview re-creation within
 * the same editor session. Lost only when the tab is permanently closed.
 *
 * All keys share a single state object managed by VSCode's webview API.
 * Updates are debounced to avoid excessive writes during rapid changes
 * (e.g. scroll-driven page updates).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getVscodeApi } from './vscodeApi';

const DEBOUNCE_MS = 300;

type SetStateAction<T> = T | ((prev: T) => T);

/**
 * Like useState but persisted via webview state.
 * Supports both direct values and updater functions.
 *
 * ```ts
 * const [page, setPage] = usePersistedState('currentPage', 1);
 * setPage(5);
 * setPage(prev => prev + 1);
 * ```
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, (action: SetStateAction<T>) => void] {
  const [value, setValueRaw] = useState<T>(() => {
    const saved = getVscodeApi().getState();
    if (saved && key in saved) {
      return saved[key] as T;
    }
    return defaultValue;
  });

  const valueRef = useRef(value);
  valueRef.current = value;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist to webview state (debounced)
  const persistValue = useCallback(
    (next: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const api = getVscodeApi();
        const prev = api.getState() ?? {};
        api.setState({ ...prev, [key]: next });
      }, DEBOUNCE_MS);
    },
    [key],
  );

  const setValue = useCallback(
    (action: SetStateAction<T>) => {
      const next =
        typeof action === 'function' ? (action as (prev: T) => T)(valueRef.current) : action;
      setValueRaw(next);
      persistValue(next);
    },
    [persistValue],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return [value, setValue];
}
