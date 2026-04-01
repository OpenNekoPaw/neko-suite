/**
 * Tests for shell-replacer — !`command` substitution in skill content
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replaceShellCommands } from '../shell-replacer';

// Mock child_process.execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

function setupExecFile(results: Record<string, { stdout?: string; error?: Error }>): void {
  mockExecFile.mockImplementation(function (_cmd, args, _opts, callback) {
    const command = (args as string[])[1];
    const result = command ? results[command] : undefined;
    if (result?.error) {
      (callback as ExecCallback)(result.error, '', result.error.message);
    } else {
      (callback as ExecCallback)(null, result?.stdout ?? '', '');
    }
    return {} as ReturnType<typeof execFile>;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('replaceShellCommands', () => {
  it('should replace single shell command', async () => {
    setupExecFile({ 'echo hello': { stdout: 'hello' } });

    const result = await replaceShellCommands('Output: !`echo hello`');
    expect(result).toBe('Output: hello');
  });

  it('should replace multiple shell commands', async () => {
    setupExecFile({
      'echo a': { stdout: 'A' },
      'echo b': { stdout: 'B' },
    });

    const result = await replaceShellCommands('First: !`echo a` Second: !`echo b`');
    expect(result).toBe('First: A Second: B');
  });

  it('should return content unchanged when no shell commands', async () => {
    const content = 'No shell commands here.';
    const result = await replaceShellCommands(content);
    expect(result).toBe(content);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should handle command errors gracefully', async () => {
    setupExecFile({
      'bad-command': { error: new Error('command not found') },
    });

    const result = await replaceShellCommands('Result: !`bad-command`');
    expect(result).toContain('[shell error:');
    expect(result).toContain('command not found');
  });

  it('should trim command output whitespace', async () => {
    setupExecFile({ 'echo hello': { stdout: '  hello  \n' } });

    const result = await replaceShellCommands('!`echo hello`');
    expect(result).toBe('hello');
  });

  it('should execute with provided cwd', async () => {
    setupExecFile({ pwd: { stdout: '/test/dir' } });

    await replaceShellCommands('!`pwd`', { cwd: '/test/dir' });

    expect(mockExecFile).toHaveBeenCalledWith(
      'bash',
      ['-c', 'pwd'],
      expect.objectContaining({ cwd: '/test/dir' }),
      expect.any(Function),
    );
  });
});
