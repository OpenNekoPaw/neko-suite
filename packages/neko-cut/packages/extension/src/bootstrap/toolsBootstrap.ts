/**
 * Tools Bootstrap
 * 注册内置工具
 */

import {
  type Tool,
  type ToolCategory,
  type ToolResult,
  type IToolRegistry,
  builtinToolGroups,
  SearchToolsTool,
  ToolGroupRegistry,
} from '@neko/agent';
import type { IToolCategoryRegistry } from '@neko/shared';
import {
  registerGenerationTools,
  registerAnalysisTools,
  registerDocumentTools,
  type AIGenerationService,
  type VisionAnalysisService,
  type DocumentGenerationService,
} from '@neko/platform';
import * as vscode from 'vscode';
import { exec, ExecOptions } from 'child_process';
import { TimelineBridge, registerTimelineTools } from '../tools/timeline-bridge';

// =============================================================================
// Plan Mode Constants (Claude Code Compatible)
// =============================================================================

/**
 * Plan file path relative to workspace root
 * Agent writes plan to this file, ExitPlanMode reads from it
 */
export const PLAN_FILE_PATH = '.neko/plan.md';

/**
 * Plans archive directory
 */
export const PLANS_ARCHIVE_DIR = '.neko/plans';

/**
 * Get the full path to the plan file
 */
export function getPlanFilePath(workspaceRoot: string): string {
  return `${workspaceRoot}/${PLAN_FILE_PATH}`;
}

// Timeline bridge singleton
let timelineBridge: TimelineBridge | null = null;

/**
 * Get or create the timeline bridge singleton
 */
export function getTimelineBridge(): TimelineBridge {
  if (!timelineBridge) {
    timelineBridge = new TimelineBridge();
  }
  return timelineBridge;
}

/**
 * Set webview for timeline bridge (called when webview is ready)
 */
export function setTimelineBridgeWebview(webview: vscode.Webview): void {
  const bridge = getTimelineBridge();
  bridge.setWebview(webview);
}

/**
 * Handle tool result from webview
 */
export function handleToolResult(
  requestId: string,
  success: boolean,
  result?: unknown,
  error?: string
): void {
  const bridge = getTimelineBridge();
  bridge.handleResponse(requestId, success, result, error);
}

/**
 * 注册内置工具
 * @param toolRegistry Tool registry to register tools to
 * @param categoryRegistry Optional category registry for tool categorization
 */
export function registerBuiltinTools(
  toolRegistry: IToolRegistry,
  categoryRegistry?: IToolCategoryRegistry
): void {
  // Shell command execution configuration
  const SHELL_TIMEOUT = 60000; // 60 seconds
  const MAX_OUTPUT_LENGTH = 100000; // 100KB output limit

  // Shell tools (executed in Extension, not bridged to Webview)
  const shellTools: Tool[] = [
    {
      name: 'Bash',
      description: 'Execute a shell command in the workspace. Returns stdout/stderr output. PLATFORM NOTE: Uses system shell (bash on macOS/Linux, cmd/PowerShell on Windows). For cross-platform file operations, prefer read_file, list_directory, run_grep tools.',
      category: 'system' as ToolCategory,
      requiresConfirmation: true,
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute (e.g., "git status", "npm run build")'
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to workspace root)'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 60000, max: 300000)'
          },
        },
        required: ['command'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const command = args.command as string;
        const cwd = (args.cwd as string) || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const timeout = Math.min(
          (args.timeout as number) || SHELL_TIMEOUT,
          300000 // Max 5 minutes
        );

        // Validate command
        if (!command || typeof command !== 'string') {
          return {
            success: false,
            error: 'Command is required and must be a string',
          };
        }

        // Validate working directory
        if (!cwd) {
          return {
            success: false,
            error: 'No workspace folder found. Please open a folder first.',
          };
        }

        // Log command execution
        console.log(`[UniEdit] Executing shell command: ${command}`);
        console.log(`[UniEdit] Working directory: ${cwd}`);

        return new Promise((resolve) => {
          const execOptions: ExecOptions = {
            cwd,
            timeout,
            maxBuffer: MAX_OUTPUT_LENGTH,
            env: {
              ...process.env,
              // Ensure color output is disabled for cleaner parsing
              FORCE_COLOR: '0',
              NO_COLOR: '1',
            },
          };

          exec(command, execOptions, (error, stdout, stderr) => {
            // Truncate output if too long
            const truncate = (str: string, max: number) => {
              if (str.length > max) {
                return str.substring(0, max) + `\n... [truncated, ${str.length - max} more characters]`;
              }
              return str;
            };

            const stdoutStr = truncate(stdout?.toString() || '', MAX_OUTPUT_LENGTH / 2);
            const stderrStr = truncate(stderr?.toString() || '', MAX_OUTPUT_LENGTH / 2);

            if (error) {
              // Command failed
              console.error(`[UniEdit] Shell command failed:`, error.message);
              resolve({
                success: false,
                error: error.message,
                data: {
                  exitCode: error.code || 1,
                  stdout: stdoutStr,
                  stderr: stderrStr,
                  killed: error.killed || false,
                  signal: error.signal || null,
                },
              });
            } else {
              // Command succeeded
              console.log(`[UniEdit] Shell command completed successfully`);
              resolve({
                success: true,
                data: {
                  exitCode: 0,
                  stdout: stdoutStr,
                  stderr: stderrStr,
                },
              });
            }
          });
        });
      },
    },
    {
      name: 'Grep',
      description: 'Search for patterns in files using regex. Cross-platform compatible. Returns matching lines with file paths and line numbers.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false,
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (supports JavaScript regex)',
          },
          path: {
            type: 'string',
            description: 'File or directory to search (defaults to workspace root)',
          },
          options: {
            type: 'object',
            description: 'Search options',
            properties: {
              ignoreCase: { type: 'boolean', description: 'Case insensitive search' },
              includePattern: { type: 'string', description: 'File pattern to include (e.g., "*.ts")' },
              excludePattern: { type: 'string', description: 'File pattern to exclude (e.g., "node_modules")' },
              contextLines: { type: 'number', description: 'Lines of context around match' },
              maxResults: { type: 'number', description: 'Maximum results to return (default: 100)' },
            },
          },
        },
        required: ['pattern'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const pattern = args.pattern as string;
        const searchPath = (args.path as string) || '';
        const options = (args.options as Record<string, unknown>) || {};
        const maxResults = (options.maxResults as number) || 100;
        const contextLines = (options.contextLines as number) || 0;
        const ignoreCase = options.ignoreCase as boolean || false;

        if (!pattern) {
          return { success: false, error: 'Pattern is required' };
        }

        try {
          // Build glob pattern for file search
          let includePattern = '**/*';
          if (options.includePattern) {
            includePattern = `**/${options.includePattern}`;
          }

          // Build exclude pattern
          const defaultExclude = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**';
          const excludePattern = options.excludePattern
            ? `${defaultExclude},**/${options.excludePattern}/**`
            : defaultExclude;

          // If specific path provided, adjust search scope
          let searchUri: vscode.Uri | undefined;
          if (searchPath) {
            let fullPath = searchPath;
            if (!searchPath.startsWith('/') && !searchPath.match(/^[A-Za-z]:\\/)) {
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceRoot) {
                fullPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), searchPath).fsPath;
              }
            }
            searchUri = vscode.Uri.file(fullPath);
          }

          // Find files matching pattern
          const files = await vscode.workspace.findFiles(
            searchUri ? new vscode.RelativePattern(searchUri, includePattern) : includePattern,
            excludePattern,
            1000
          );

          // Create regex
          const flags = ignoreCase ? 'gi' : 'g';
          const regex = new RegExp(pattern, flags);

          // Search in files
          const matches: Array<{ file: string; line: number; content: string; context?: string[] }> = [];
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

          for (const file of files) {
            if (matches.length >= maxResults) break;

            try {
              const content = await vscode.workspace.fs.readFile(file);
              const text = new TextDecoder().decode(content);
              const lines = text.split('\n');

              for (let i = 0; i < lines.length; i++) {
                if (matches.length >= maxResults) break;

                if (regex.test(lines[i])) {
                  // Reset regex lastIndex for next test
                  regex.lastIndex = 0;

                  // Get relative path
                  const relativePath = file.fsPath.startsWith(workspaceRoot)
                    ? file.fsPath.substring(workspaceRoot.length + 1)
                    : file.fsPath;

                  const match: { file: string; line: number; content: string; context?: string[] } = {
                    file: relativePath,
                    line: i + 1,
                    content: lines[i].trim(),
                  };

                  // Add context lines if requested
                  if (contextLines > 0) {
                    const start = Math.max(0, i - contextLines);
                    const end = Math.min(lines.length, i + contextLines + 1);
                    match.context = lines.slice(start, end);
                  }

                  matches.push(match);
                }
                // Reset regex lastIndex
                regex.lastIndex = 0;
              }
            } catch {
              // Skip files that can't be read (binary, permissions, etc.)
            }
          }

          return {
            success: true,
            data: {
              pattern,
              matchCount: matches.length,
              matches,
              truncated: matches.length >= maxResults,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'ListDirectory',
      description: 'List files and directories in a path with details (size, type). Cross-platform compatible.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list (defaults to workspace root)',
          },
          recursive: {
            type: 'boolean',
            description: 'List recursively (default: false)',
          },
          showHidden: {
            type: 'boolean',
            description: 'Show hidden files (default: false)',
          },
          pattern: {
            type: 'string',
            description: 'Filter by glob pattern (e.g., "*.ts")',
          },
        },
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const dirPath = (args.path as string) || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const recursive = args.recursive as boolean || false;
        const showHidden = args.showHidden as boolean || false;
        const pattern = args.pattern as string | undefined;
        const MAX_ENTRIES = 200;

        if (!dirPath) {
          return { success: false, error: 'No path specified and no workspace folder found' };
        }

        // Resolve path (cross-platform)
        let fullPath = dirPath;
        if (!dirPath.startsWith('/') && !dirPath.match(/^[A-Za-z]:\\/)) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            fullPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), dirPath).fsPath;
          }
        }

        try {
          const uri = vscode.Uri.file(fullPath);

          // Helper function to list directory entries
          const listDir = async (dirUri: vscode.Uri, depth: number = 0): Promise<Array<{name: string; type: string; path: string}>> => {
            const entries: Array<{name: string; type: string; path: string}> = [];
            const dirEntries = await vscode.workspace.fs.readDirectory(dirUri);

            for (const [name, type] of dirEntries) {
              // Skip hidden files unless requested
              if (!showHidden && name.startsWith('.')) continue;

              // Apply pattern filter
              if (pattern) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
                if (!regex.test(name)) continue;
              }

              const entryPath = vscode.Uri.joinPath(dirUri, name).fsPath;
              const typeStr = type === vscode.FileType.Directory ? 'directory' :
                             type === vscode.FileType.File ? 'file' :
                             type === vscode.FileType.SymbolicLink ? 'symlink' : 'unknown';

              entries.push({ name, type: typeStr, path: entryPath });

              // Recurse into directories
              if (recursive && type === vscode.FileType.Directory && entries.length < MAX_ENTRIES) {
                const subEntries = await listDir(vscode.Uri.joinPath(dirUri, name), depth + 1);
                entries.push(...subEntries);
              }

              if (entries.length >= MAX_ENTRIES) break;
            }

            return entries;
          };

          const entries = await listDir(uri);
          const truncated = entries.length >= MAX_ENTRIES;

          return {
            success: true,
            data: {
              path: fullPath,
              entries,
              count: entries.length,
              truncated,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'Read',
      description: 'Read the contents of a file. Cross-platform compatible.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path (relative to workspace or absolute)',
          },
          startLine: {
            type: 'number',
            description: 'Start line number (1-indexed)',
          },
          endLine: {
            type: 'number',
            description: 'End line number (1-indexed)',
          },
        },
        required: ['path'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const filePath = args.path as string;
        const startLine = args.startLine as number | undefined;
        const endLine = args.endLine as number | undefined;
        const MAX_LINES = 500;

        if (!filePath) {
          return { success: false, error: 'File path is required' };
        }

        // Resolve relative paths (cross-platform)
        let fullPath = filePath;
        if (!filePath.startsWith('/') && !filePath.match(/^[A-Za-z]:\\/)) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            fullPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath).fsPath;
          }
        }

        try {
          const uri = vscode.Uri.file(fullPath);
          const fileContent = await vscode.workspace.fs.readFile(uri);
          const decoder = new TextDecoder();
          const allLines = decoder.decode(fileContent).split('\n');

          // Calculate line range
          const start = startLine ? Math.max(1, startLine) - 1 : 0;
          const end = endLine ? Math.min(allLines.length, endLine) : Math.min(allLines.length, start + MAX_LINES);

          // Extract lines
          const selectedLines = allLines.slice(start, end);
          const content = selectedLines.join('\n');
          const truncated = !endLine && (end - start) >= MAX_LINES;

          return {
            success: true,
            data: {
              path: fullPath,
              content,
              lineCount: selectedLines.length,
              totalLines: allLines.length,
              truncated,
              range: { start: start + 1, end },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'Write',
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
      category: 'system' as ToolCategory,
      requiresConfirmation: true, // Modifying files requires confirmation
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path (relative to workspace or absolute)',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
          createDirectories: {
            type: 'boolean',
            description: 'Create parent directories if they do not exist (default: true)',
          },
        },
        required: ['path', 'content'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const filePath = args.path as string;
        const content = args.content as string;
        const createDirs = args.createDirectories !== false;

        if (!filePath) {
          return { success: false, error: 'File path is required' };
        }

        // Resolve relative paths
        let fullPath = filePath;
        if (!filePath.startsWith('/')) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            fullPath = `${workspaceRoot}/${filePath}`;
          }
        }

        try {
          const uri = vscode.Uri.file(fullPath);

          // Create parent directories if needed
          if (createDirs) {
            const parentDir = vscode.Uri.file(fullPath.substring(0, fullPath.lastIndexOf('/')));
            try {
              await vscode.workspace.fs.createDirectory(parentDir);
            } catch {
              // Directory might already exist, ignore error
            }
          }

          // Write content
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

          console.log(`[UniEdit] Wrote file: ${fullPath}`);
          return {
            success: true,
            data: {
              path: fullPath,
              bytesWritten: content.length,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'Edit',
      description: 'Edit a file by replacing content between specified line numbers. Useful for modifying specific sections of a file.',
      category: 'system' as ToolCategory,
      requiresConfirmation: true,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path (relative to workspace or absolute)',
          },
          startLine: {
            type: 'number',
            description: 'Start line number (1-indexed, inclusive)',
          },
          endLine: {
            type: 'number',
            description: 'End line number (1-indexed, inclusive)',
          },
          newContent: {
            type: 'string',
            description: 'New content to replace the specified lines',
          },
        },
        required: ['path', 'startLine', 'endLine', 'newContent'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const filePath = args.path as string;
        const startLine = args.startLine as number;
        const endLine = args.endLine as number;
        const newContent = args.newContent as string;

        if (!filePath || !startLine || !endLine) {
          return { success: false, error: 'path, startLine, and endLine are required' };
        }

        if (startLine < 1 || endLine < startLine) {
          return { success: false, error: 'Invalid line range: startLine must be >= 1 and endLine >= startLine' };
        }

        // Resolve relative paths
        let fullPath = filePath;
        if (!filePath.startsWith('/')) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            fullPath = `${workspaceRoot}/${filePath}`;
          }
        }

        try {
          const uri = vscode.Uri.file(fullPath);
          const fileContent = await vscode.workspace.fs.readFile(uri);
          const decoder = new TextDecoder();
          const lines = decoder.decode(fileContent).split('\n');

          // Validate line numbers
          if (startLine > lines.length) {
            return { success: false, error: `startLine ${startLine} exceeds file length ${lines.length}` };
          }

          // Replace lines (convert to 0-indexed)
          const newLines = newContent.split('\n');
          const actualEndLine = Math.min(endLine, lines.length);
          lines.splice(startLine - 1, actualEndLine - startLine + 1, ...newLines);

          // Write back
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(uri, encoder.encode(lines.join('\n')));

          console.log(`[UniEdit] Edited file: ${fullPath} (lines ${startLine}-${actualEndLine})`);
          return {
            success: true,
            data: {
              path: fullPath,
              linesReplaced: actualEndLine - startLine + 1,
              newLinesCount: newLines.length,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'Glob',
      description: 'Find files by name pattern in the workspace. Uses glob patterns.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false, // Read-only
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files (e.g., "**/*.ts", "**/component*.tsx")',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
          exclude: {
            type: 'string',
            description: 'Glob pattern to exclude (default: "**/node_modules/**")',
          },
        },
        required: ['pattern'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const pattern = args.pattern as string;
        const maxResults = (args.maxResults as number) || 50;
        const exclude = (args.exclude as string) || '**/node_modules/**,**/.git/**,**/dist/**,**/build/**';

        if (!pattern) {
          return { success: false, error: 'Pattern is required' };
        }

        try {
          const files = await vscode.workspace.findFiles(pattern, exclude, maxResults);
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

          const results = files.map(f => {
            // Convert to relative path if possible
            const fullPath = f.fsPath;
            if (workspaceRoot && fullPath.startsWith(workspaceRoot)) {
              return fullPath.substring(workspaceRoot.length + 1);
            }
            return fullPath;
          });

          console.log(`[UniEdit] Found ${results.length} files matching: ${pattern}`);
          return {
            success: true,
            data: {
              pattern,
              count: results.length,
              files: results,
              truncated: results.length >= maxResults,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to find files: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'GitStatus',
      description: 'Get the current Git status of the workspace, including staged, unstaged, and untracked files.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false, // Read-only
      parameters: {
        type: 'object',
        properties: {
          short: {
            type: 'boolean',
            description: 'Use short format (default: false)',
          },
        },
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const short = args.short as boolean || false;
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!cwd) {
          return { success: false, error: 'No workspace folder found' };
        }

        const command = short ? 'git status --short' : 'git status';

        return new Promise((resolve) => {
          exec(command, { cwd, timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
              resolve({
                success: false,
                error: `Git error: ${stderr?.toString() || error.message}`,
              });
            } else {
              resolve({
                success: true,
                data: {
                  output: stdout?.toString() || '',
                },
              });
            }
          });
        });
      },
    },
    {
      name: 'GitDiff',
      description: 'Show changes between commits, commit and working tree, etc.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false, // Read-only
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File or directory path to diff (optional, defaults to all)',
          },
          staged: {
            type: 'boolean',
            description: 'Show staged changes only (--cached)',
          },
          commit: {
            type: 'string',
            description: 'Compare against specific commit (e.g., "HEAD~1", "main")',
          },
        },
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const filePath = args.path as string | undefined;
        const staged = args.staged as boolean || false;
        const commit = args.commit as string | undefined;
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!cwd) {
          return { success: false, error: 'No workspace folder found' };
        }

        // Build git diff command
        let command = 'git diff';
        if (staged) command += ' --cached';
        if (commit) command += ` ${commit}`;
        if (filePath) command += ` -- "${filePath}"`;

        return new Promise((resolve) => {
          exec(command, { cwd, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
              resolve({
                success: false,
                error: `Git error: ${stderr?.toString() || error.message}`,
              });
            } else {
              const output = stdout?.toString() || '';
              resolve({
                success: true,
                data: {
                  output,
                  hasChanges: output.length > 0,
                },
              });
            }
          });
        });
      },
    },
    {
      name: 'GitLog',
      description: 'Show commit history.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false, // Read-only
      parameters: {
        type: 'object',
        properties: {
          maxCount: {
            type: 'number',
            description: 'Maximum number of commits to show (default: 10)',
          },
          oneline: {
            type: 'boolean',
            description: 'Show each commit on a single line (default: true)',
          },
          path: {
            type: 'string',
            description: 'Show commits affecting specific file/directory',
          },
        },
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const maxCount = (args.maxCount as number) || 10;
        const oneline = args.oneline !== false;
        const filePath = args.path as string | undefined;
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!cwd) {
          return { success: false, error: 'No workspace folder found' };
        }

        // Build git log command
        let command = `git log -n ${maxCount}`;
        if (oneline) command += ' --oneline';
        if (filePath) command += ` -- "${filePath}"`;

        return new Promise((resolve) => {
          exec(command, { cwd, timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
              resolve({
                success: false,
                error: `Git error: ${stderr?.toString() || error.message}`,
              });
            } else {
              const output = stdout?.toString() || '';
              const commits = output.trim().split('\n').filter(Boolean);
              resolve({
                success: true,
                data: {
                  output,
                  commitCount: commits.length,
                },
              });
            }
          });
        });
      },
    },
    {
      name: 'CreateDirectory',
      description: 'Create a directory (and parent directories if needed).',
      category: 'system' as ToolCategory,
      requiresConfirmation: true,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to create (relative to workspace or absolute)',
          },
        },
        required: ['path'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const dirPath = args.path as string;

        if (!dirPath) {
          return { success: false, error: 'Directory path is required' };
        }

        // Resolve relative paths
        let fullPath = dirPath;
        if (!dirPath.startsWith('/')) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            fullPath = `${workspaceRoot}/${dirPath}`;
          }
        }

        try {
          const uri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.createDirectory(uri);

          console.log(`[UniEdit] Created directory: ${fullPath}`);
          return {
            success: true,
            data: { path: fullPath },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'DeleteFile',
      description: 'Delete a file or empty directory.',
      category: 'system' as ToolCategory,
      requiresConfirmation: true, // Destructive operation
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File or directory path to delete (relative to workspace or absolute)',
          },
          recursive: {
            type: 'boolean',
            description: 'Delete directory and all contents recursively (default: false)',
          },
        },
        required: ['path'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const filePath = args.path as string;
        const recursive = args.recursive as boolean || false;

        if (!filePath) {
          return { success: false, error: 'File path is required' };
        }

        // Resolve relative paths
        let fullPath = filePath;
        if (!filePath.startsWith('/')) {
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            fullPath = `${workspaceRoot}/${filePath}`;
          }
        }

        try {
          const uri = vscode.Uri.file(fullPath);
          await vscode.workspace.fs.delete(uri, { recursive });

          console.log(`[UniEdit] Deleted: ${fullPath}`);
          return {
            success: true,
            data: { path: fullPath, recursive },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    {
      name: 'WebSearch',
      description: 'Search the web for information. Returns search results with titles, snippets, and URLs. Cross-platform compatible.',
      category: 'system' as ToolCategory,
      requiresConfirmation: false,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 10, max: 20)',
          },
        },
        required: ['query'],
      },
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const query = args.query as string;
        const maxResults = Math.min((args.maxResults as number) || 10, 20);

        if (!query) {
          return { success: false, error: 'Search query is required' };
        }

        try {
          // Use DuckDuckGo HTML search (no API key required)
          const encodedQuery = encodeURIComponent(query);
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

          // Use Node.js https module for the request
          const https = await import('https');

          const html = await new Promise<string>((resolve, reject) => {
            const req = https.get(searchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; UniEdit/1.0)',
              },
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.setTimeout(10000, () => {
              req.destroy();
              reject(new Error('Request timeout'));
            });
          });

          // Parse results from HTML (simple regex extraction)
          const results: Array<{ title: string; url: string; snippet: string }> = [];

          // Match result blocks
          const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
          const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/gi;

          let match;
          const urls: string[] = [];
          const titles: string[] = [];
          const snippets: string[] = [];

          while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
            urls.push(match[1]);
            titles.push(match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
          }

          while ((match = snippetRegex.exec(html)) !== null) {
            snippets.push(match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim());
          }

          for (let i = 0; i < Math.min(urls.length, maxResults); i++) {
            results.push({
              title: titles[i] || 'No title',
              url: urls[i],
              snippet: snippets[i] || '',
            });
          }

          if (results.length === 0) {
            return {
              success: true,
              data: {
                query,
                message: 'No results found',
                results: [],
              },
            };
          }

          console.log(`[UniEdit] Web search: ${query} - found ${results.length} results`);
          return {
            success: true,
            data: {
              query,
              resultCount: results.length,
              results,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
    // =========================================================================
    // EnterPlanMode - Request to enter plan mode (Claude Code Compatible)
    // =========================================================================
    {
      name: 'EnterPlanMode',
      description: `Enter plan mode for non-trivial tasks (new features, multi-file changes, architectural decisions). In plan mode: explore with read-only tools, write plan to ${PLAN_FILE_PATH}, then call ExitPlanMode. Skip for simple fixes or clear single-function tasks.`,
      category: 'system' as ToolCategory,
      requiresConfirmation: true, // Requires user approval to enter plan mode
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        // This tool signals to the system to switch to plan mode
        // The actual mode switch is handled by the permission/chat system
        return {
          success: true,
          data: {
            message: 'Entering plan mode. You can now explore the codebase using read-only tools. Write your plan to the plan file and call ExitPlanMode when ready.',
            planMode: {
              status: 'entering',
              planFilePath: PLAN_FILE_PATH,
            },
          },
        };
      },
    },
    // =========================================================================
    // ExitPlanMode - Signal plan completion (Claude Code Compatible)
    // =========================================================================
    {
      name: 'ExitPlanMode',
      description: `Signal plan completion for user approval. Prerequisites: (1) plan written to ${PLAN_FILE_PATH}, (2) ambiguities resolved via AskUserQuestion. Only for implementation planning, not research tasks.`,
      category: 'system' as ToolCategory,
      requiresConfirmation: false, // The tool itself is about getting confirmation
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      execute: async (): Promise<ToolResult> => {
        try {
          // Get workspace root
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!workspaceRoot) {
            return {
              success: false,
              error: 'No workspace folder found',
            };
          }

          // Read plan from the plan file
          const planFilePath = getPlanFilePath(workspaceRoot);
          const planFileUri = vscode.Uri.file(planFilePath);

          let planContent: string;
          try {
            const fileContent = await vscode.workspace.fs.readFile(planFileUri);
            planContent = new TextDecoder().decode(fileContent);
          } catch {
            return {
              success: false,
              error: `Plan file not found at ${PLAN_FILE_PATH}. Please write your plan to this file first using the Edit or Write tool.`,
            };
          }

          if (!planContent || planContent.trim().length === 0) {
            return {
              success: false,
              error: `Plan file is empty. Please write your plan to ${PLAN_FILE_PATH} first.`,
            };
          }

          // Extract title from plan content (first heading or first line)
          const titleMatch = planContent.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : 'Implementation Plan';

          // Archive the plan with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
          const archiveFilename = `${timestamp}-${sanitizedTitle}.md`;

          // Create archive directory
          const archiveDir = vscode.Uri.file(`${workspaceRoot}/${PLANS_ARCHIVE_DIR}`);
          try {
            await vscode.workspace.fs.createDirectory(archiveDir);
          } catch {
            // Directory might already exist
          }

          // Copy plan to archive
          const archivePath = vscode.Uri.joinPath(archiveDir, archiveFilename);
          const archiveContent = `# ${title}\n\n_Generated: ${new Date().toISOString()}_\n\n${planContent}`;
          const encoder = new TextEncoder();
          await vscode.workspace.fs.writeFile(archivePath, encoder.encode(archiveContent));

          console.log(`[UniEdit] Plan archived to: ${archivePath.fsPath}`);

          return {
            success: true,
            data: {
              message: 'Plan saved successfully. Waiting for user approval before executing.',
              filePath: archivePath.fsPath,
              planFilePath: planFilePath,
              title,
              plan: planContent,
              requiresApproval: true,
              // This signals to the UI that user needs to approve the plan
              planMode: {
                status: 'awaiting_approval',
                planFile: archivePath.fsPath,
              },
            },
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to process plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    },
  ];

  // Register shell tools (Extension-only)
  shellTools.forEach(tool => {
    toolRegistry.register(tool);
    // Register tool category if category registry is provided
    if (categoryRegistry) {
      categoryRegistry.categorizeTool(tool.name, tool.category);
    }
  });

  // Register SearchToolsTool (meta tool for discovering available tools)
  if (categoryRegistry) {
    // Create a ToolGroupRegistry with builtin tool groups for search
    const skillRegistry = new ToolGroupRegistry();
    for (const group of builtinToolGroups) {
      skillRegistry.register(group);
    }

    const searchTool = new SearchToolsTool(categoryRegistry, skillRegistry);
    toolRegistry.register(searchTool);
    categoryRegistry.categorizeTool(searchTool.name, 'system', 'core');
  } else {
    console.warn('[UniEdit] categoryRegistry is undefined, SearchToolsTool not registered');
  }

  // Register timeline bridge tools (execute in Webview via WebCodecs/WebGPU)
  // This includes: get_timeline_info, add_element, update_element, delete_element,
  // add_subtitle, import_subtitles, effects, transitions, animations, tracks, etc.
  const bridge = getTimelineBridge();
  registerTimelineTools(toolRegistry, bridge);

  // Register timeline tools to category registry
  if (categoryRegistry) {
    // Timeline tools are in 'timeline' category with 'skill' layer
    // NOTE: All tool names use PascalCase for consistency
    const timelineToolNames = [
      'GetTimelineInfo', 'GetElementInfo', 'ListElements',
      'AddElement', 'UpdateElement', 'DeleteElement',
      'ListEffects', 'AddEffect', 'UpdateEffect', 'RemoveEffect',
      'ListTransitions', 'SetTransition', 'RemoveTransition',
      'GetKeyframes', 'AddKeyframe', 'UpdateKeyframe', 'RemoveKeyframe',
      'AddShape', 'UpdateShape',
      'SetColorCorrection', 'ResetColorCorrection',
      'AddTrack', 'DeleteTrack', 'ReorderTracks', 'SetTrackProperties',
      'AddMask', 'UpdateMask', 'RemoveMask',
      'SetAudioProperties', 'AddAudioKeyframe',
      'TrimElement', 'SplitElement', 'SetPlaybackSpeed', 'SeparateAudio',
      'ExportVideo', 'GetExportProgress',
      'RenderFrame', 'RenderClip', 'GetThumbnail',
    ];
    for (const toolName of timelineToolNames) {
      categoryRegistry.categorizeTool(toolName, 'timeline', 'skill');
    }
  }
}

/**
 * Optional: Register AI generation tools
 * Call this when AI service is available
 */
export function registerAIGenerationTools(
  toolRegistry: IToolRegistry,
  aiService: AIGenerationService
): void {
  registerGenerationTools(toolRegistry, aiService);
}

/**
 * Optional: Register AI analysis tools
 * Call this when vision LLM is available
 */
export function registerAIAnalysisTools(
  toolRegistry: IToolRegistry,
  visionService: VisionAnalysisService
): void {
  registerAnalysisTools(toolRegistry, visionService);
}

/**
 * Optional: Register document tools
 * Call this when document service is available
 */
export function registerAIDocumentTools(
  toolRegistry: IToolRegistry,
  documentService: DocumentGenerationService
): void {
  registerDocumentTools(toolRegistry, documentService);
}
