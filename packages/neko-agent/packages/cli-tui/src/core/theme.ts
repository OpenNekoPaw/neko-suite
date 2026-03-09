/**
 * Simplified CLI Theme (for non-interactive `run` mode)
 *
 * Chalk wrappers with semantic names. Used by runner.ts and formatter.ts
 * when outputting to console in single-shot mode.
 * The TUI interactive mode uses Ink tokens instead (src/theme/tokens.ts).
 */

import chalk from 'chalk';

export const theme = {
  diffAdded: (s: string) => chalk.green(s),
  diffRemoved: (s: string) => chalk.red(s),
  diffContext: (s: string) => chalk.gray(s),
  diffLineNum: (s: string) => chalk.dim(s),
  diffMarkerAdd: '+',
  diffMarkerRemove: '-',
  diffMarkerCtx: ' ',

  success: (s: string) => chalk.green(s),
  warning: (s: string) => chalk.yellow(s),
  error: (s: string) => chalk.red(s),
  info: (s: string) => chalk.cyan(s),
  muted: (s: string) => chalk.dim(s),
  bold: (s: string) => chalk.bold(s),

  todoPending: (s: string) => chalk.gray(s),
  todoInProgress: (s: string) => chalk.yellow(s),
  todoCompleted: (s: string) => chalk.green(s),
  todoFailed: (s: string) => chalk.red(s),

  toolPending: (s: string) => chalk.cyan(s),
  toolSuccess: (s: string) => chalk.green(s),
  toolError: (s: string) => chalk.red(s),
} as const;

export const TODO_ICONS = {
  pending: theme.todoPending('[ ]'),
  inProgress: theme.todoInProgress('[•]'),
  completed: theme.todoCompleted('[✓]'),
  failed: theme.todoFailed('[✗]'),
} as const;

export const TOOL_ICONS = {
  pending: theme.toolPending('◐'),
  success: theme.toolSuccess('✓'),
  error: theme.toolError('✗'),
} as const;

export const BRAILLE_SPINNER = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  interval: 80,
};
