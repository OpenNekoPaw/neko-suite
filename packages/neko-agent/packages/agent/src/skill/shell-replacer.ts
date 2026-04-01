/**
 * Shell Replacer — Execute embedded shell commands in skill content
 *
 * Replaces !`command` patterns with their stdout output.
 * Uses execFile (not shell mode) to avoid command injection.
 *
 * Security: MCP-sourced skills skip shell execution entirely.
 */

import { execFile } from 'node:child_process';

const SHELL_COMMAND_PATTERN = new RegExp('!`([^`]+)`', 'g');
const DEFAULT_TIMEOUT = 5000;

export interface ShellReplacerOptions {
  /** Command timeout in ms (default 5000) */
  timeout?: number;
  /** Working directory for commands */
  cwd?: string;
}

/**
 * Replace all !`command` patterns in content with their stdout output.
 *
 * @param content - Skill content with embedded shell commands
 * @param options - Execution options
 * @returns Content with shell outputs substituted
 */
export async function replaceShellCommands(
  content: string,
  options?: ShellReplacerOptions,
): Promise<string> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const cwd = options?.cwd;

  // Find all shell command matches
  const matches: Array<{ full: string; command: string }> = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  const regex = new RegExp(SHELL_COMMAND_PATTERN.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    matches.push({ full: match[0], command: match[1]! });
  }

  if (matches.length === 0) {
    return content;
  }

  // Execute all commands in parallel
  const results = await Promise.allSettled(
    matches.map((m) => executeShellCommand(m.command, timeout, cwd)),
  );

  // Replace in order
  let result = content;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const r = results[i]!;
    const output =
      r.status === 'fulfilled' ? r.value : `[shell error: ${(r.reason as Error).message}]`;
    result = result.replace(m.full, output);
  }

  return result;
}

/**
 * Execute a single shell command and return stdout.
 */
function executeShellCommand(command: string, timeout: number, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'bash',
      ['-c', command],
      {
        timeout,
        cwd,
        maxBuffer: 64 * 1024, // 64KB max output
        env: { ...process.env, TERM: 'dumb' },
      },
      (error, stdout, stderr) => {
        if (error) {
          // Include stderr in error for debugging
          const msg = stderr?.trim() ? `${error.message}: ${stderr.trim()}` : error.message;
          reject(new Error(msg));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}
