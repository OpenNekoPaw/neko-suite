/**
 * useClickOutside Hook
 * Closes menu when clicking outside
 */

import { useEffect, RefObject } from 'react';

export function useClickOutside(refs: RefObject<HTMLElement>[], handlers: (() => void)[]) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      refs.forEach((ref, index) => {
        if (ref.current && !ref.current.contains(event.target as Node)) {
          handlers[index]?.();
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refs, handlers]);
}

// Simpler version for single ref
export function useClickOutsideSingle(ref: RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}
