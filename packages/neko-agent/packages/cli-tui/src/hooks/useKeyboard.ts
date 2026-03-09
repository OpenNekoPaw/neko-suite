/**
 * useKeyboard Hook
 *
 * Global keyboard shortcut handling for the TUI.
 * Uses Ink's useInput hook internally.
 */

import { useInput } from 'ink';
import { useAgentStore } from '../stores/agent-store';
import { useUIStore } from '../stores/ui-store';

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
 * - Ctrl+C: Quit (handled by Ink)
 */
export function useKeyboard(actions: KeyboardActions): void {
  const status = useAgentStore((s) => s.status);
  const pendingApproval = useUIStore((s) => s.pendingApproval);

  useInput((input, key) => {
    // Don't intercept when approval panel is active — it handles its own keys
    if (pendingApproval) return;

    // Escape → cancel running agent
    if (key.escape && status === 'running') {
      actions.onCancel();
      return;
    }

    // Ctrl+L → clear conversation
    if (input === 'l' && key.ctrl) {
      actions.onClear();
      return;
    }
  });
}
