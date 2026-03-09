/**
 * Output Formatter
 *
 * Formats agent output for different output modes.
 * Rendering uses semantic theme tokens (see theme.ts) rather than raw chalk calls.
 */

import { computeDiff, computeDiffStats } from '@neko/shared';
import { theme, TODO_ICONS, TOOL_ICONS } from './theme';
import type { CLIResult } from './types';
import type { AgentStep, ToolResult } from '@neko/agent';

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Format result based on output format.
 */
export function formatResult(result: CLIResult, format: 'text' | 'json' | 'markdown'): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'markdown':
      return formatMarkdown(result);
    case 'text':
    default:
      return formatText(result);
  }
}

// ─── Text format ────────────────────────────────────────────────────────────────

/**
 * Format result as styled plain text for terminal output.
 */
export function formatText(result: CLIResult): string {
  if (!result.success) {
    return theme.error(`Error: ${result.error}`);
  }

  let output = result.output ?? '';

  if (result.agentResult?.steps && result.agentResult.steps.length > 0) {
    output += '\n\n' + theme.muted('─── Execution Steps ───') + '\n';
    for (const step of result.agentResult.steps) {
      output += '\n' + formatStep(step) + '\n';
    }
  }

  output += '\n\n' + theme.muted(`(Completed in ${result.duration}ms)`);

  return output;
}

// ─── JSON format ───────────────────────────────────────────────────────────────

/**
 * Format result as JSON (for scripting/tool-chain integration).
 */
export function formatJson(result: CLIResult): string {
  return JSON.stringify(
    {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.duration,
      steps: result.agentResult?.steps,
    },
    null,
    2,
  );
}

// ─── Markdown format ───────────────────────────────────────────────────────────

/**
 * Format result as Markdown (for documentation export).
 */
export function formatMarkdown(result: CLIResult): string {
  if (!result.success) {
    return `## Error\n\n\`\`\`\n${result.error}\n\`\`\``;
  }

  let output = `## Result\n\n${result.output ?? ''}\n`;

  if (result.agentResult?.steps && result.agentResult.steps.length > 0) {
    output += '\n## Execution Steps\n\n';
    for (const step of result.agentResult.steps) {
      output += `### ${step.type}\n\n`;
      if (step.content) output += `${step.content}\n\n`;
    }
  }

  output += `\n---\n*Completed in ${result.duration}ms*`;

  return output;
}

// ─── Step rendering ─────────────────────────────────────────────────────────────

/**
 * Render a single agent step for terminal display.
 * Tool calls show a collapsed single-line summary; use verbose=true for full args.
 */
export function formatStep(step: AgentStep, verbose = false): string {
  switch (step.type) {
    case 'think':
      return theme.muted(`[thinking] ${step.thinking ?? step.content}`);

    case 'act':
      if (step.toolCalls && step.toolCalls.length > 0) {
        return step.toolCalls
          .map((tc) => formatToolCall(tc.name, tc.arguments, 'pending', verbose))
          .join('\n');
      }
      return theme.info(`[act] ${step.content}`);

    case 'observe':
      if (step.toolResults && step.toolResults.length > 0) {
        return step.toolResults.map((tr) => formatToolResult(tr, verbose)).join('\n');
      }
      return theme.muted(`[observe] ${step.content}`);

    case 'respond':
      return step.content;

    case 'content_delta':
      return step.content;

    default:
      return theme.muted(`[${step.type}] ${step.content}`);
  }
}

/**
 * Render a tool result line.
 */
function formatToolResult(tr: ToolResult, verbose: boolean): string {
  const icon = tr.success ? TOOL_ICONS.success : TOOL_ICONS.error;
  const label = tr.success ? theme.muted('ok') : theme.error(tr.error ?? 'error');
  if (verbose && tr.data !== undefined) {
    const data = typeof tr.data === 'string' ? tr.data : JSON.stringify(tr.data, null, 2);
    return `  ${icon} ${label}\n    ${theme.muted(data.slice(0, 500))}`;
  }
  return `  ${icon} ${label}`;
}

/**
 * Render a single tool call — collapsed by default, expanded with verbose=true.
 * Aligned with webview ToolCallDisplay two-tier pattern.
 */
export function formatToolCall(
  name: string,
  args: Record<string, unknown>,
  status: 'pending' | 'success' | 'error' = 'pending',
  verbose = false,
): string {
  const icon = TOOL_ICONS[status];
  const summary = theme.muted(getToolSummary(name, args));
  const nameFmt = theme.bold(name);

  const line = `  ${icon} ${nameFmt} ${summary}`;

  if (!verbose) return line;

  const argsJson = JSON.stringify(args, null, 2).replace(/\n/g, '\n    ');
  return `${line}\n    ${theme.muted('args:')} ${argsJson}`;
}

// ─── Tool summary ───────────────────────────────────────────────────────────────

const FILE_TOOLS = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'create_file',
  'delete_file',
  'view_file',
  'open_file',
  'str_replace_editor',
  'str_replace_based_edit_tool',
]);
const SHELL_TOOLS = new Set(['bash', 'execute_command', 'run_command', 'shell', 'terminal']);
const SEARCH_TOOLS = new Set([
  'grep',
  'search_files',
  'search',
  'web_search',
  'find_files',
  'glob',
]);

/**
 * Extract a short human-readable summary from a tool call (max 40 chars).
 * Aligned with webview ToolCallDisplay summary logic.
 */
function getToolSummary(name: string, args: Record<string, unknown>, maxLen = 40): string {
  const n = name.toLowerCase();
  if (FILE_TOOLS.has(n))
    return truncate(getString(args, ['path', 'file_path', 'filePath', 'file']) ?? name, maxLen);
  if (SHELL_TOOLS.has(n))
    return truncate(getString(args, ['command', 'cmd', 'script']) ?? name, maxLen);
  if (SEARCH_TOOLS.has(n)) {
    const p = getString(args, ['pattern', 'query', 'q', 'keyword']);
    const d = getString(args, ['path', 'directory', 'dir']);
    if (p && d) return truncate(`"${p}" in ${d}`, maxLen);
    if (p) return truncate(`"${p}"`, maxLen);
    return truncate(name, maxLen);
  }
  return truncate(firstStringValue(args) ?? name, maxLen);
}

function getString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function firstStringValue(obj: Record<string, unknown>): string | undefined {
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// ─── Diff rendering ─────────────────────────────────────────────────────────────

/**
 * Render a unified-style diff for terminal output.
 * Uses computeDiff from @neko/shared (same algorithm as webview DiffBlock).
 */
export function formatDiff(oldContent: string, newContent: string, filePath?: string): string {
  const lines = computeDiff(oldContent, newContent);
  const stats = computeDiffStats(lines);

  const header = [
    filePath ? theme.bold(filePath) : '',
    theme.diffAdded(`+${stats.added}`),
    theme.diffRemoved(`-${stats.removed}`),
  ]
    .filter(Boolean)
    .join('  ');

  const body = lines
    .map((line) => {
      if (line.type === 'add') return theme.diffAdded(`+${line.content}`);
      if (line.type === 'remove') return theme.diffRemoved(`-${line.content}`);
      return theme.diffContext(` ${line.content}`);
    })
    .join('\n');

  return `${header}\n${body}`;
}

// ─── Todo rendering ─────────────────────────────────────────────────────────────

export type TodoStatus = 'pending' | 'inProgress' | 'completed' | 'failed';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

/**
 * Render a todo list for terminal display.
 * Icon encoding aligned with opencode TUI: [ ] [•] [✓] [✗]
 */
export function formatTodoList(todos: TodoItem[]): string {
  return todos.map((t) => `${TODO_ICONS[t.status]} ${t.content}`).join('\n');
}
