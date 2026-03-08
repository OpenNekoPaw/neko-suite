/**
 * Tool Call Summary Generator
 *
 * Generates short human-readable summaries for tool calls.
 * Used by CLI (single-line collapsed display) and extension (tool card header).
 *
 * Aligned with neko-agent webview ToolCallDisplay summary logic.
 */

/** Tool names that operate on files — summary shows the path. */
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

/** Tool names that run shell commands — summary shows the command. */
const SHELL_TOOLS = new Set([
  'bash',
  'execute_command',
  'run_command',
  'shell',
  'terminal',
]);

/** Tool names that perform text/code search — summary shows pattern + path. */
const SEARCH_TOOLS = new Set([
  'grep',
  'search_files',
  'search',
  'web_search',
  'find_files',
  'glob',
]);

/**
 * Extract a short human-readable summary from a tool call.
 *
 * @param toolName - The tool function name
 * @param args     - Tool arguments (may be deeply nested)
 * @param maxLen   - Max character length for the summary (default 40)
 */
export function getToolSummary(
  toolName: string,
  args: Record<string, unknown>,
  maxLen = 40,
): string {
  const name = toolName.toLowerCase();

  if (FILE_TOOLS.has(name)) {
    const p = getString(args, ['path', 'file_path', 'filePath', 'file']);
    return truncate(p ?? toolName, maxLen);
  }

  if (SHELL_TOOLS.has(name)) {
    const cmd = getString(args, ['command', 'cmd', 'script']);
    return truncate(cmd ?? toolName, maxLen);
  }

  if (SEARCH_TOOLS.has(name)) {
    const pattern = getString(args, ['pattern', 'query', 'q', 'keyword']);
    const inPath = getString(args, ['path', 'directory', 'dir']);
    if (pattern && inPath) return truncate(`"${pattern}" in ${inPath}`, maxLen);
    if (pattern) return truncate(`"${pattern}"`, maxLen);
    return truncate(toolName, maxLen);
  }

  // Generic fallback: serialize first meaningful arg
  const firstVal = firstStringValue(args);
  return truncate(firstVal ?? toolName, maxLen);
}

// --- helpers ---

function getString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return undefined;
}

function firstStringValue(obj: Record<string, unknown>): string | undefined {
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' && val.length > 0) return val;
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
