/**
 * useDropdownDirection — auto-detect available space and choose
 * whether a dropdown should open upward or downward.
 */

import { useCallback, type RefObject } from 'react';

export type DropdownDirection = 'up' | 'down';

/**
 * Measure trigger element position relative to viewport and determine
 * whether the dropdown should open upward or downward to avoid clipping.
 *
 * Returns a function that computes direction on demand (call it on open).
 */
export function useDropdownDirection(
  triggerRef: RefObject<HTMLElement | null>,
  preferredDirection: DropdownDirection = 'down',
): () => DropdownDirection {
  return useCallback(() => {
    const el = triggerRef.current;
    if (!el) return preferredDirection;

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;

    // If preferred direction has enough space (>200px), use it;
    // otherwise pick the side with more room.
    const threshold = 200;
    if (preferredDirection === 'down' && spaceBelow >= threshold) return 'down';
    if (preferredDirection === 'up' && spaceAbove >= threshold) return 'up';

    return spaceBelow >= spaceAbove ? 'down' : 'up';
  }, [triggerRef, preferredDirection]);
}

/** CSS class helpers for dropdown positioning */
export function dropdownPositionClass(direction: DropdownDirection): string {
  return direction === 'down' ? 'top-full mt-0.5' : 'bottom-full mb-1';
}
