/**
 * UI Store
 *
 * Manages TUI-specific UI state: tool approval panel,
 * selection menus, scroll position, focus, terminal dimensions.
 */

import { create } from 'zustand';
import type { TerminalSize } from '../types/state';

/**
 * Pending tool approval request (simplified from ToolConfirmationRequest)
 */
export interface PendingApproval {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

/**
 * Selection menu item
 */
export interface SelectionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** Whether this item is currently active/selected */
  readonly active?: boolean;
}

/**
 * Pending selection menu request
 */
export interface PendingSelection {
  readonly title: string;
  readonly items: SelectionMenuItem[];
  resolve: (selectedId: string | null) => void;
}

export interface UISlice {
  // State
  readonly pendingApproval: PendingApproval | null;
  readonly pendingSelection: PendingSelection | null;
  /** Whether a plan review prompt is waiting for user decision */
  readonly pendingPlanReview: boolean;
  /** Rows above the live bottom; zero means follow new output. */
  readonly scrollOffset: number;
  readonly scrollLimit: number;
  readonly inputFocused: boolean;
  readonly slashMenuOpen: boolean;
  readonly terminalSize: TerminalSize;

  // Actions
  showToolApproval: (approval: PendingApproval) => void;
  dismissToolApproval: () => void;
  showSelection: (selection: PendingSelection) => void;
  dismissSelection: () => void;
  showPlanReview: () => void;
  dismissPlanReview: () => void;
  setScrollOffset: (offset: number) => void;
  setScrollLimit: (limit: number) => void;
  scrollUp: (lines?: number) => void;
  scrollDown: (lines?: number) => void;
  scrollToBottom: () => void;
  setInputFocused: (focused: boolean) => void;
  setSlashMenuOpen: (open: boolean) => void;
  setTerminalSize: (size: TerminalSize) => void;
}

export const useUIStore = create<UISlice>((set) => ({
  pendingApproval: null,
  pendingSelection: null,
  pendingPlanReview: false,
  scrollOffset: 0,
  scrollLimit: 0,
  inputFocused: true,
  slashMenuOpen: false,
  terminalSize: {
    rows: process.stdout.rows ?? 24,
    columns: process.stdout.columns ?? 80,
  },

  showToolApproval: (approval) => {
    set({ pendingApproval: approval, inputFocused: false });
  },

  dismissToolApproval: () => {
    set({ pendingApproval: null, inputFocused: true });
  },

  showSelection: (selection) => {
    set({ pendingSelection: selection, inputFocused: false });
  },

  dismissSelection: () => {
    set({ pendingSelection: null, inputFocused: true });
  },

  showPlanReview: () => {
    set({ pendingPlanReview: true, inputFocused: false });
  },

  dismissPlanReview: () => {
    set({ pendingPlanReview: false, inputFocused: true });
  },

  setScrollOffset: (offset) => {
    set((state) => ({
      scrollOffset: Math.min(state.scrollLimit, normalizeScrollRows(offset)),
    }));
  },

  setScrollLimit: (limit) => {
    set((state) => {
      const scrollLimit = normalizeScrollRows(limit);
      if (scrollLimit === state.scrollLimit) return state;
      const growth = Math.max(0, scrollLimit - state.scrollLimit);
      return {
        scrollLimit,
        scrollOffset:
          state.scrollOffset === 0 ? 0 : Math.min(scrollLimit, state.scrollOffset + growth),
      };
    });
  },

  scrollUp: (lines = 3) => {
    set((state) => ({
      scrollOffset: Math.min(state.scrollLimit, state.scrollOffset + normalizeScrollRows(lines)),
    }));
  },

  scrollDown: (lines = 3) => {
    set((state) => ({
      scrollOffset: Math.max(0, state.scrollOffset - normalizeScrollRows(lines)),
    }));
  },

  scrollToBottom: () => {
    set({ scrollOffset: 0 });
  },

  setInputFocused: (focused) => {
    set({ inputFocused: focused });
  },

  setSlashMenuOpen: (open) => {
    set({ slashMenuOpen: open });
  },

  setTerminalSize: (size) => {
    set({ terminalSize: size });
  },
}));

function normalizeScrollRows(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('TUI scroll rows must be finite.');
  }
  return Math.max(0, Math.floor(value));
}
