/**
 * Ink Semantic Color Tokens
 *
 * Extends the CLI theme.ts semantic naming for Ink's <Text color=""> prop.
 * All color decisions centralized here — components never hardcode colors.
 *
 * Aligned with:
 * - @neko/cli/theme.ts semantic naming
 * - opencode TUI theme conventions
 * - VSCode vscode-* CSS token semantics
 */

import type { ThemeTokens } from '../types/theme';

export const tokens: ThemeTokens = {
  // Diff — unified diff coloring
  diffAdded: 'green',
  diffRemoved: 'red',
  diffContext: 'gray',

  // Status — general purpose status indicators
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'cyan',
  muted: 'gray',

  // Todo states — aligned with CLI TODO_ICONS semantics
  todoPending: 'gray',
  todoInProgress: 'yellow',
  todoCompleted: 'green',
  todoFailed: 'red',

  // Tool call states — aligned with CLI TOOL_ICONS semantics
  toolPending: 'cyan',
  toolSuccess: 'green',
  toolError: 'red',

  // TUI-specific tokens
  statusBar: { fg: 'white', bg: 'gray' },
  input: { prompt: 'cyan', placeholder: 'gray' },
  approval: { border: 'yellow', approve: 'green', reject: 'red' },
  code: {
    keyword: 'magenta',
    string: 'green',
    number: 'yellow',
    comment: 'gray',
    function: 'cyan',
  },
} as const;

/**
 * Todo status icons — aligned with CLI and opencode TUI
 */
export const INK_TODO_ICONS = {
  pending: '[ ]',
  in_progress: '[•]',
  completed: '[✓]',
  failed: '[✗]',
} as const;

/**
 * Tool call status icons
 */
export const INK_TOOL_ICONS = {
  pending: '◐',
  running: '◐',
  success: '✓',
  error: '✗',
} as const;

/**
 * Braille spinner frames — aligned with opencode TUI
 */
export const INK_BRAILLE_SPINNER = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const,
  interval: 80,
} as const;
