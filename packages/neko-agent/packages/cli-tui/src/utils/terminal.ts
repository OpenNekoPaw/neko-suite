/**
 * Terminal Capability Detection
 *
 * Detects terminal features and respects environment variables
 * for accessibility: NO_COLOR, TERM, FORCE_COLOR, etc.
 */

export interface TerminalCapabilities {
  /** Whether the terminal supports color output */
  readonly supportsColor: boolean;
  /** Whether Unicode characters are supported */
  readonly supportsUnicode: boolean;
  /** Whether the terminal supports 256 colors or truecolor */
  readonly supportsExtendedColor: boolean;
  /** Whether running in a CI environment */
  readonly isCI: boolean;
  /** Terminal columns */
  readonly columns: number;
  /** Terminal rows */
  readonly rows: number;
}

/**
 * Detect terminal capabilities from environment variables.
 *
 * Respects:
 * - NO_COLOR: https://no-color.org
 * - FORCE_COLOR: Force color output
 * - TERM: Terminal type
 * - CI: CI environment detection
 */
export function detectCapabilities(): TerminalCapabilities {
  const env = process.env;

  // NO_COLOR takes highest priority (https://no-color.org)
  const noColor = env['NO_COLOR'] !== undefined;
  const forceColor = env['FORCE_COLOR'] !== undefined && env['FORCE_COLOR'] !== '0';
  const term = env['TERM'] ?? '';

  const supportsColor = forceColor || (!noColor && term !== 'dumb' && process.stdout.isTTY === true);
  const supportsUnicode = !term.startsWith('linux') && term !== 'dumb';
  const supportsExtendedColor = supportsColor && (
    term.includes('256color') ||
    term.includes('truecolor') ||
    env['COLORTERM'] === 'truecolor' ||
    env['COLORTERM'] === '24bit'
  );

  const isCI = env['CI'] !== undefined ||
    env['GITHUB_ACTIONS'] !== undefined ||
    env['JENKINS_URL'] !== undefined ||
    env['TRAVIS'] !== undefined;

  return {
    supportsColor,
    supportsUnicode,
    supportsExtendedColor,
    isCI,
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  };
}

/**
 * Get fallback characters when Unicode is not supported.
 */
export function getFallbackChars(capabilities: TerminalCapabilities) {
  if (capabilities.supportsUnicode) {
    return {
      spinner: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'.split(''),
      check: '✓',
      cross: '✗',
      bullet: '•',
      bar: '█',
      barEmpty: '░',
      thinking: '💭',
      border: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
    };
  }

  return {
    spinner: ['-', '\\', '|', '/'],
    check: '+',
    cross: 'x',
    bullet: '*',
    bar: '#',
    barEmpty: '-',
    thinking: '[T]',
    border: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
  };
}
