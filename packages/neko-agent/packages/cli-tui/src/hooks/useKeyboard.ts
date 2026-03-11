/**
 * useKeyboard Hook
 *
 * Global keyboard shortcut handling for the TUI.
 * Uses Ink's useInput hook internally.
 */

import { useInput } from 'ink';
import { useAgentStore } from '../stores/agent-store';
import { useUIStore } from '../stores/ui-store';
import type { ExecutionMode } from '../types/state';

const MODE_CYCLE: ExecutionMode[] = ['auto', 'plan', 'ask'];

export interface KeyboardActions {
  onCancel: () => void;
  onClear: () => void;
  onQuit: () => void;
}

/**
 * Register global keyboard shortcuts.
 *
 * - Escape: Cancel running agent
 * - Ctrl+L: Clear conversation
 * - Shift+Tab: Cycle execution mode (auto → plan → ask → auto)
 * - Ctrl+C: Quit (handled by Ink)
 */
export function useKeyboard(actions: KeyboardActions): void {
  const status = useAgentStore((s) => s.status);
  const pendingApproval = useUIStore((s) => s.pendingApproval);

  useInput((_input, key) => {
    // Don't intercept when approval panel is active — it handles its own keys
    if (pendingApproval) return;

    // Escape → cancel running agent
    if (key.escape && status === 'running') {
      actions.onCancel();
      return;
    }

    // Ctrl+L → clear conversation
    if (_input === 'l' && key.ctrl) {
      actions.onClear();
      return;
    }

    // Shift+Tab → cycle execution mode
    if (key.shift && key.tab) {
      const current = useAgentStore.getState().executionMode;
      const idx = MODE_CYCLE.indexOf(current);
      const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length]!;
      useAgentStore.getState().setExecutionMode(next);
      return;
    }
  });
}
