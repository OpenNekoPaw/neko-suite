import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

const { executeCommand, showWarningMessage, workspaceFolders, readFile } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  showWarningMessage: vi.fn(),
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
  readFile: vi.fn(),
}));

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }),
    joinPath: (base: { path: string }, ...s: string[]) => ({
      scheme: 'file',
      fsPath: [base.path, ...s].join('/'),
      path: [base.path, ...s].join('/'),
    }),
  },
  commands: { executeCommand },
  window: { showWarningMessage },
  workspace: { workspaceFolders },
  EventEmitter: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile },
  readFile,
}));

vi.mock('../../utils/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  getErrorHtml,
  getUnresolvedVariableHtml,
} from '../providers/document/documentProviderHelper';
import {
  previewFileServer,
  UnresolvedPathVariableError,
} from '../providers/document/PreviewFileServer';

beforeEach(() => {
  executeCommand.mockReset();
  showWarningMessage.mockReset();
  readFile.mockReset();
  workspaceFolders.length = 0;
});

// ============================================================================
// Tests: HTML escaping (real production functions)
// ============================================================================

describe('getErrorHtml -- XSS prevention', () => {
  it('escapes <script> tags in error messages', () => {
    const html = getErrorHtml('<script>alert("xss")</script>');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/script&gt;');
  });

  it('escapes ampersands and double-quotes', () => {
    const html = getErrorHtml('A & B "quoted"');

    expect(html).toContain('A &amp; B');
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('escapes nested HTML injection attempts', () => {
    const html = getErrorHtml('"><img src=x onerror=alert(1)>');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&quot;&gt;');
  });
});

describe('getUnresolvedVariableHtml -- file path escaping', () => {
  it('escapes angle brackets in file paths', () => {
    const html = getUnresolvedVariableHtml('MEDIA', '/foo/<bar>/baz');

    expect(html).toContain('&lt;bar&gt;');
    expect(html).not.toContain('>/foo/<bar>');
  });

  it('renders the variable name in the description', () => {
    const html = getUnresolvedVariableHtml('MY_LIB', '/some/path');

    expect(html).toContain('${MY_LIB}');
    expect(html).toContain('Media Library Not Configured');
  });

  it('renders setup instructions', () => {
    const html = getUnresolvedVariableHtml('ASSETS', '/x');

    expect(html).toContain('.neko/settings.json');
    expect(html).toContain('neko-assets');
  });
});

// ============================================================================
// Tests: UnresolvedPathVariableError (real production class)
// ============================================================================

describe('UnresolvedPathVariableError', () => {
  it('stores variable and originalPath', () => {
    const err = new UnresolvedPathVariableError('MEDIA', '/${MEDIA}/file.pdf');

    expect(err.variable).toBe('MEDIA');
    expect(err.originalPath).toBe('/${MEDIA}/file.pdf');
    expect(err.name).toBe('UnresolvedPathVariableError');
    expect(err.message).toContain('MEDIA');
  });
});

// ============================================================================
// Tests: PreviewFileServer port cache invalidation (NKP-003)
// ============================================================================

describe('PreviewFileServer -- port cache invalidation (NKP-003)', () => {
  beforeEach(() => {
    previewFileServer.invalidatePort();
  });

  it('invalidatePort() clears cached port so next getPort() re-queries engine', async () => {
    const { commands } = await import('vscode');
    const execCmd = vi.mocked(commands.executeCommand);

    execCmd.mockResolvedValueOnce({ port: 9001 });
    const port1 = await previewFileServer.getPort();
    expect(port1).toBe(9001);

    // Second call should use cache
    const callCountBefore = execCmd.mock.calls.length;
    const port2 = await previewFileServer.getPort();
    expect(port2).toBe(9001);
    expect(execCmd.mock.calls.length).toBe(callCountBefore);

    // After invalidation, next call should re-query
    previewFileServer.invalidatePort();
    execCmd.mockResolvedValueOnce({ port: 9002 });
    const port3 = await previewFileServer.getPort();
    expect(port3).toBe(9002);
  });

  it('getPort() throws when engine is not running', async () => {
    const { commands } = await import('vscode');
    vi.mocked(commands.executeCommand).mockResolvedValueOnce(null);

    await expect(previewFileServer.getPort()).rejects.toThrow('Neko Engine is not running');
  });
});

describe('PreviewFileServer path resolution fallback', () => {
  it('falls back to workspace media library settings when neko-assets does not resolve', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    executeCommand.mockResolvedValueOnce('/${A}/epub/book.epub');
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/workspace-a/.neko/settings.json') {
        return JSON.stringify({
          mediaLibraries: [{ variable: 'A', path: '/Volumes/LibraryA', enabled: true }],
        });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });

    const resolved = await (
      previewFileServer as unknown as { resolvePath: (filePath: string) => Promise<string> }
    ).resolvePath('/${A}/epub/book.epub');

    expect(resolved).toBe('/Volumes/LibraryA/epub/book.epub');
  });

  it('prefers settings.local.json overrides when resolving workspace media library paths', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    executeCommand.mockResolvedValueOnce('/${A}/epub/book.epub');
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/workspace-a/.neko/settings.json') {
        return JSON.stringify({
          mediaLibraries: [{ variable: 'A', path: '/Volumes/LibraryA', enabled: true }],
        });
      }
      if (filePath === '/workspace-a/.neko/settings.local.json') {
        return JSON.stringify({
          mediaLibraryOverrides: { A: '/Users/feng/LibraryA' },
        });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });

    const resolved = await (
      previewFileServer as unknown as { resolvePath: (filePath: string) => Promise<string> }
    ).resolvePath('/${A}/epub/book.epub');

    expect(resolved).toBe('/Users/feng/LibraryA/epub/book.epub');
  });
});

// ============================================================================
// Tests: PreviewFileServer retry logic source contract (NKP-006)
// ============================================================================

describe('PreviewFileServer retry logic source contract (NKP-006)', () => {
  it('_fetchWithRetry method exists and is used by registerFile/registerEpub/unregisterFile', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../providers/document/PreviewFileServer.ts'),
      'utf-8',
    );

    // _fetchWithRetry method defined
    expect(source).toContain('private async _fetchWithRetry');
    // Retry logic: invalidates port on connection failure
    expect(source).toContain('this.invalidatePort()');
    // All public methods use _fetchWithRetry
    const fetchWithRetryCount = (source.match(/this\._fetchWithRetry/g) ?? []).length;
    expect(fetchWithRetryCount).toBeGreaterThanOrEqual(3);
  });

  it('invalidatePort + getPort re-query cycle works (real code)', async () => {
    const { commands } = await import('vscode');
    const execCmd = vi.mocked(commands.executeCommand);

    previewFileServer.invalidatePort();

    execCmd.mockResolvedValueOnce({ port: 5001 });
    const port1 = await previewFileServer.getPort();
    expect(port1).toBe(5001);

    // Invalidate + re-query
    previewFileServer.invalidatePort();
    execCmd.mockResolvedValueOnce({ port: 5002 });
    const port2 = await previewFileServer.getPort();
    expect(port2).toBe(5002);
  });
});
