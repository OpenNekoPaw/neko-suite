/**
 * CLI Semantic Color Theme
 *
 * Wraps chalk calls behind semantic token names aligned with:
 * - opencode TUI theme token naming conventions
 * - neko-agent webview vscode-* CSS token semantics
 *
 * All chalk calls in CLI should go through this module,
 * not be scattered as chalk.green/red/etc across formatter/runner.
 */

import chalk from 'chalk';

export const theme = {
  // Diff colors (aligned with opencode: diffAdded / diffRemoved)
  diffAdded:   (s: string) => chalk.green(s),
  diffRemoved: (s: string) => chalk.red(s),
  diffContext: (s: string) => chalk.gray(s),
  diffLineNum: (s: string) => chalk.dim(s),
  diffMarkerAdd:    '+',
  diffMarkerRemove: '-',
  diffMarkerCtx:    ' ',

  // Status (aligned with vscode-chart-* tokens)
  success: (s: string) => chalk.green(s),
  warning: (s: string) => chalk.yellow(s),
  error:   (s: string) => chalk.red(s),
  info:    (s: string) => chalk.cyan(s),
  muted:   (s: string) => chalk.dim(s),
  bold:    (s: string) => chalk.bold(s),

  // Todo states (aligned with opencode TUI TodoItem ASCII encoding)
  todoPending:    (s: string) => chalk.gray(s),
  todoInProgress: (s: string) => chalk.yellow(s),
  todoCompleted:  (s: string) => chalk.green(s),
  todoFailed:     (s: string) => chalk.red(s),

  // Tool call states
  toolPending:  (s: string) => chalk.cyan(s),
  toolSuccess:  (s: string) => chalk.green(s),
  toolError:    (s: string) => chalk.red(s),
} as const;

/**
 * Todo status icons aligned with opencode TUI and neko-agent webview.
 * opencode: [ ] [•] [✓]
 * webview:  ○   ●   ✓  ✗
 * CLI:      [ ] [•] [✓] [✗]
 */
export const TODO_ICONS = {
  pending:    theme.todoPending('[ ]'),
  inProgress: theme.todoInProgress('[•]'),
  completed:  theme.todoCompleted('[✓]'),
  failed:     theme.todoFailed('[✗]'),
} as const;

/**
 * Tool call status icons (single character, aligned with webview ToolCallDisplay).
 */
export const TOOL_ICONS = {
  pending: theme.toolPending('◐'),
  success: theme.toolSuccess('✓'),
  error:   theme.toolError('✗'),
} as const;

/**
 * Braille spinner frames — aligned with opencode TUI spinner implementation.
 * 80ms interval recommended.
 */
export const BRAILLE_SPINNER = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  interval: 80,
};
