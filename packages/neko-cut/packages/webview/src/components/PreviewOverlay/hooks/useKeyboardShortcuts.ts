/**
 * useKeyboardShortcuts - 快捷键处理 Hook
 * Handles keyboard shortcuts for preview overlay editing
 */

import { useCallback, useEffect } from 'react';

export interface KeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled: boolean;
  /** Selected element IDs */
  selectedElementIds: string[];
  /** Callback for delete action */
  onDelete?: () => void;
  /** Callback for copy action */
  onCopy?: () => void;
  /** Callback for cut action */
  onCut?: () => void;
  /** Callback for paste action */
  onPaste?: () => void;
  /** Callback for duplicate action */
  onDuplicate?: () => void;
  /** Callback for select all action */
  onSelectAll?: () => void;
  /** Callback for clear selection */
  onClearSelection?: () => void;
  /** Callback for nudge (arrow key movement) */
  onNudge?: (dx: number, dy: number, large: boolean) => void;
  /** Callback for opening AI menu */
  onOpenAIMenu?: () => void;
  /** Callback for escape (cancel operation) */
  onEscape?: () => void;
  /** Callback for undo action */
  onUndo?: () => void;
  /** Callback for redo action */
  onRedo?: () => void;
}

/**
 * Nudge amount in project coordinates (0-1)
 */
const NUDGE_SMALL = 0.01; // 1% of canvas
const NUDGE_LARGE = 0.1;  // 10% of canvas (with Shift)

/**
 * Check if event target is an input element
 */
function isInputElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const tagName = (target as HTMLElement).tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

/**
 * Hook for handling keyboard shortcuts in preview overlay
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  const {
    enabled,
    selectedElementIds,
    onDelete,
    onCopy,
    onCut,
    onPaste,
    onDuplicate,
    onSelectAll,
    onClearSelection,
    onNudge,
    onOpenAIMenu,
    onEscape,
    onUndo,
    onRedo,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if disabled or focused on input
      if (!enabled || isInputElement(event.target)) {
        return;
      }

      const hasSelection = selectedElementIds.length > 0;

      // Handle shortcuts
      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          // Don't handle delete in PreviewOverlay - let timeline handle it
          // This avoids conflicts with timeline clip deletion
          console.log('[PreviewOverlay] Delete key pressed, letting timeline handle it');
          break;

        case 'c':
        case 'C':
          // Don't handle copy in PreviewOverlay - let timeline handle it
          // This avoids conflicts with timeline clip operations
          break;

        case 'x':
        case 'X':
          // Don't handle cut in PreviewOverlay - let timeline handle it
          break;

        case 'v':
        case 'V':
          // Don't handle paste in PreviewOverlay - let timeline handle it
          break;

        case 'd':
        case 'D':
          // Don't handle duplicate in PreviewOverlay - let timeline handle it
          break;

        case 'a':
        case 'A':
          // Don't handle select all in PreviewOverlay - let timeline handle it
          break;

        case 'z':
        case 'Z':
          // Don't handle undo/redo in PreviewOverlay - let timeline handle it
          break;

        case 'Escape':
          if (onEscape) {
            event.preventDefault();
            onEscape();
          } else if (onClearSelection) {
            event.preventDefault();
            onClearSelection();
          }
          break;

        case 'ArrowUp':
          if (hasSelection && onNudge) {
            event.preventDefault();
            event.stopImmediatePropagation(); // Prevent timeline navigation
            const amount = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
            onNudge(0, -amount, event.shiftKey);
          }
          break;

        case 'ArrowDown':
          if (hasSelection && onNudge) {
            event.preventDefault();
            event.stopImmediatePropagation(); // Prevent timeline navigation
            const amount = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
            onNudge(0, amount, event.shiftKey);
          }
          break;

        case 'ArrowLeft':
          if (hasSelection && onNudge) {
            event.preventDefault();
            event.stopImmediatePropagation(); // Prevent timeline navigation
            const amount = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
            onNudge(-amount, 0, event.shiftKey);
          }
          break;

        case 'ArrowRight':
          if (hasSelection && onNudge) {
            event.preventDefault();
            event.stopImmediatePropagation(); // Prevent timeline navigation
            const amount = event.shiftKey ? NUDGE_LARGE : NUDGE_SMALL;
            onNudge(amount, 0, event.shiftKey);
          }
          break;
      }
    },
    [
      enabled,
      selectedElementIds,
      onDelete,
      onCopy,
      onCut,
      onPaste,
      onDuplicate,
      onSelectAll,
      onClearSelection,
      onNudge,
      onOpenAIMenu,
      onEscape,
      onUndo,
      onRedo,
    ]
  );

  // Register global keyboard listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  return {
    // Expose constants for reference
    NUDGE_SMALL,
    NUDGE_LARGE,
  };
}

/**
 * Keyboard shortcut reference (for display in UI)
 */
export const KEYBOARD_SHORTCUTS = {
  undo: { key: '⌘Z / Ctrl+Z', description: 'Undo last action' },
  redo: { key: '⌘⇧Z / Ctrl+Shift+Z', description: 'Redo last action' },
  delete: { key: 'Delete/⌫', description: 'Delete selected elements' },
  copy: { key: '⌘C / Ctrl+C', description: 'Copy selected elements' },
  cut: { key: '⌘X / Ctrl+X', description: 'Cut selected elements' },
  paste: { key: '⌘V / Ctrl+V', description: 'Paste elements' },
  duplicate: { key: '⌘D / Ctrl+D', description: 'Duplicate selected elements' },
  selectAll: { key: '⌘A / Ctrl+A', description: 'Select all visible elements' },
  aiMenu: { key: '⌘⇧A / Ctrl+Shift+A', description: 'Open AI quick menu' },
  escape: { key: 'Esc', description: 'Clear selection / Cancel' },
  nudge: { key: '↑↓←→', description: 'Nudge selected elements' },
  nudgeLarge: { key: '⇧ + ↑↓←→', description: 'Nudge by larger amount' },
} as const;
