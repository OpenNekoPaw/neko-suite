/**
 * useTimelineKeyboard Hook
 * 管理时间轴键盘快捷键
 */

import { useEffect } from 'react';

export interface TimelineKeyboardOptions {
  selectedElements: Array<{ trackId: string; elementId: string }>;
  removeElement: (trackId: string, elementId: string) => void;
  clearSelectedElements: () => void;
}

export function useTimelineKeyboard({
  selectedElements,
  removeElement,
  clearSelectedElements,
}: TimelineKeyboardOptions) {
  // Handle keyboard shortcuts for deleting selected elements
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete/Backspace to remove selected elements
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElements.length > 0) {
        // Prevent default backspace navigation
        e.preventDefault();

        // Delete all selected elements
        selectedElements.forEach(({ trackId, elementId }) => {
          removeElement(trackId, elementId);
        });

        // Clear selection
        clearSelectedElements();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedElements, removeElement, clearSelectedElements]);
}
