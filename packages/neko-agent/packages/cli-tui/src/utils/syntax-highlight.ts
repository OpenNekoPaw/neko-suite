/**
 * Syntax Highlighter
 *
 * Lightweight keyword-based syntax highlighting for terminal code blocks.
 * Maps language tokens to semantic color names from the theme.
 *
 * Design: Uses regex-based token matching rather than a full parser.
 * This is intentionally simple — terminal rendering doesn't need
 * the precision of a tree-sitter grammar.
 */

import type { InkColor } from '../types/theme';
import { tokens } from '../theme/tokens';

/**
 * A highlighted token with its color
 */
export interface HighlightToken {
  readonly text: string;
  readonly color?: InkColor;
}

/**
 * Language keyword sets for common languages
 */
const KEYWORDS: Record<string, Set<string>> = {
  typescript: new Set([
    'import',
    'export',
    'from',
    'type',
    'interface',
    'class',
    'extends',
    'implements',
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'throw',
    'try',
    'catch',
    'finally',
    'new',
    'this',
    'super',
    'typeof',
    'instanceof',
    'async',
    'await',
    'yield',
    'void',
    'null',
    'undefined',
    'true',
    'false',
    'as',
    'in',
    'of',
    'readonly',
    'private',
    'protected',
    'public',
    'static',
    'abstract',
    'override',
    'declare',
    'enum',
    'namespace',
    'module',
    'default',
    'delete',
    'keyof',
    'infer',
    'satisfies',
  ]),
  javascript: new Set([
    'import',
    'export',
    'from',
    'function',
    'const',
    'let',
    'var',
    'return',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'throw',
    'try',
    'catch',
    'finally',
    'new',
    'this',
    'super',
    'typeof',
    'instanceof',
    'async',
    'await',
    'yield',
    'void',
    'null',
    'undefined',
    'true',
    'false',
    'class',
    'extends',
    'delete',
    'in',
    'of',
    'default',
  ]),
  python: new Set([
    'import',
    'from',
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'break',
    'continue',
    'try',
    'except',
    'finally',
    'with',
    'as',
    'raise',
    'pass',
    'yield',
    'lambda',
    'and',
    'or',
    'not',
    'in',
    'is',
    'None',
    'True',
    'False',
    'self',
    'async',
    'await',
    'global',
    'nonlocal',
    'del',
    'assert',
  ]),
  rust: new Set([
    'fn',
    'let',
    'mut',
    'const',
    'static',
    'struct',
    'enum',
    'impl',
    'trait',
    'type',
    'pub',
    'use',
    'mod',
    'crate',
    'self',
    'super',
    'return',
    'if',
    'else',
    'match',
    'for',
    'while',
    'loop',
    'break',
    'continue',
    'async',
    'await',
    'move',
    'ref',
    'where',
    'unsafe',
    'true',
    'false',
    'as',
    'in',
    'dyn',
    'extern',
  ]),
  bash: new Set([
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'for',
    'while',
    'do',
    'done',
    'case',
    'esac',
    'function',
    'return',
    'exit',
    'export',
    'local',
    'readonly',
    'declare',
    'unset',
    'source',
    'echo',
    'cd',
    'ls',
    'cat',
    'grep',
    'sed',
    'awk',
    'find',
    'rm',
    'cp',
    'mv',
    'mkdir',
    'true',
    'false',
  ]),
};

// Aliases
KEYWORDS['ts'] = KEYWORDS['typescript']!;
KEYWORDS['js'] = KEYWORDS['javascript']!;
KEYWORDS['py'] = KEYWORDS['python']!;
KEYWORDS['rs'] = KEYWORDS['rust']!;
KEYWORDS['sh'] = KEYWORDS['bash']!;
KEYWORDS['shell'] = KEYWORDS['bash']!;
KEYWORDS['zsh'] = KEYWORDS['bash']!;
KEYWORDS['tsx'] = KEYWORDS['typescript']!;
KEYWORDS['jsx'] = KEYWORDS['javascript']!;

/**
 * Highlight a single line of code.
 * Returns an array of tokens with optional color annotations.
 */
export function highlightLine(line: string, language?: string): HighlightToken[] {
  const keywords = language ? KEYWORDS[language] : undefined;
  const lineTokens: HighlightToken[] = [];

  // Simple regex-based tokenizer
  const tokenPattern =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|\d+(?:\.\d+)?|\b\w+\b|[^\s\w]|\s+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(line)) !== null) {
    const token = match[0];

    // String literals
    if (/^["'`]/.test(token)) {
      lineTokens.push({ text: token, color: tokens.code.string });
      continue;
    }

    // Comments (// or # or /* */)
    if (/^(\/\/|#|\/\*)/.test(token)) {
      lineTokens.push({ text: token, color: tokens.code.comment });
      continue;
    }

    // Numbers
    if (/^\d/.test(token)) {
      lineTokens.push({ text: token, color: tokens.code.number });
      continue;
    }

    // Keywords
    if (keywords?.has(token)) {
      lineTokens.push({ text: token, color: tokens.code.keyword });
      continue;
    }

    // Function calls (word followed by `(`)
    if (/^\w+$/.test(token)) {
      const remaining = line.slice((match.index ?? 0) + token.length);
      if (/^\s*\(/.test(remaining)) {
        lineTokens.push({ text: token, color: tokens.code.function });
        continue;
      }
    }

    // Default — no highlighting
    lineTokens.push({ text: token });
  }

  return lineTokens;
}

/**
 * Highlight a full code block (multiple lines).
 * Returns an array of lines, each containing highlighted tokens.
 */
export function highlightCode(code: string, language?: string): HighlightToken[][] {
  return code.split('\n').map((line) => highlightLine(line, language));
}
