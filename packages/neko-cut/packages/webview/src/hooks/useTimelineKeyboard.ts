/**
 * useTimelineKeyboard Hook
 * 管理时间轴键盘快捷键
 *
 * NOTE: Delete/Backspace handling has been moved to useKeyboardShortcuts.ts
 * to avoid duplicate event listeners and race conditions.
 * This hook is kept for potential future timeline-specific shortcuts.
 */

import { useEffect } from 'react';

export interface TimelineKeyboardOptions {
  selectedElements: Array<{ trackId: string; elementId: string }>;
  removeElement: (trackId: string, elementId: string) => void;
  clearSelectedElements: () => void;
}

/**
 * @deprecated Delete/Backspace is now handled by useKeyboardShortcuts.ts
 * This hook is kept for backwards compatibility and potential future use.
 */
export function useTimelineKeyboard({
  selectedElements: _selectedElements,
  removeElement: _removeElement,
  clearSelectedElements: _clearSelectedElements,
}: TimelineKeyboardOptions) {
  // Delete/Backspace handling moved to useKeyboardShortcuts.ts to avoid conflicts
  // Keep this hook for potential future timeline-specific shortcuts
  useEffect(() => {
    // No-op: shortcuts are handled by useKeyboardShortcuts.ts
  }, []);
}
