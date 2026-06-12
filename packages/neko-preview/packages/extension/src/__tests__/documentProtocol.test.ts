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
  extensions: { getExtension: vi.fn() },
  env: { language: 'en' },
  EventEmitter: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile },
  readFile,
}));

vi.mock('node:os', () => ({
  default: { homedir: () => '/Users/tester' },
  homedir: () => '/Users/tester',
}));

vi.mock('../../utils/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  getErrorHtml,
  getUnresolvedVariableHtml,
  setupDocumentWebview,
} from '../providers/document/documentProviderHelper';
import {
  previewFileServer,
  UnresolvedPathVariableError,
} from '../providers/document/PreviewFileServer';
import {
  getPreviewAllowedRoots,
  resolvePreviewPath,
} from '../providers/document/workspacePathResolver';

beforeEach(() => {
  executeCommand.mockReset();
  showWarningMessage.mockReset();
  readFile.mockReset();
  workspaceFolders.length = 0;
});

describe('document preview to Agent context bridge', () => {
  it('enriches document selections with source locator and excerpt metadata', async () => {
    let messageHandler: ((message: unknown) => Promise<void>) | undefined;
    const panel = {
      webview: {
        options: {},
        html: '',
        asWebviewUri: (uri: unknown) => uri,
        onDidReceiveMessage: vi.fn((handler: (message: unknown) => Promise<void>) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
      onDidDispose: vi.fn(),
    };

    await setupDocumentWebview(
      { uri: { fsPath: '/docs/book.epub', toString: () => 'file:///docs/book.epub' } } as never,
      panel as never,
      { path: '/extension' } as never,
      'epub',
    );

    await messageHandler?.({
      type: 'document:sendToAi',
      payload: {
        text: 'Selected text',
        contentKind: 'text',
        context: { chapter: 'Chapter 1' },
        locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
      },
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'neko.agent.sendContext',
      expect.objectContaining({
        type: 'document-selection',
        data: expect.objectContaining({
          source: expect.objectContaining({
            filePath: '/docs/book.epub',
            format: 'epub',
          }),
          locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
          excerpt: expect.objectContaining({ text: 'Selected text', contentKind: 'text' }),
        }),
      }),
    );
  });
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

    expect(html).toContain('neko/settings.json');
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

    // Second call should reuse the cached port while still syncing current roots.
    const port2 = await previewFileServer.getPort();
    expect(port2).toBe(9001);
    expect(execCmd.mock.calls.length).toBe(2);

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
  it('resolves relative preview paths from the source document owning workspace', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-preview-path-'));
    const workspaceA = path.join(root, 'workspace-a');
    const workspaceB = path.join(root, 'workspace-b');
    fs.mkdirSync(path.join(workspaceB, 'cases'), { recursive: true });
    fs.writeFileSync(path.join(workspaceB, 'cases', 'book.epub'), '');
    workspaceFolders.push({ uri: { fsPath: workspaceA } }, { uri: { fsPath: workspaceB } });
    executeCommand.mockResolvedValueOnce(undefined);
    readFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === path.join(workspaceA, 'neko/settings.json') ||
        filePath === path.join(workspaceB, 'neko/settings.json')
      ) {
        return JSON.stringify({ mediaLibraries: [] });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });

    try {
      await expect(
        resolvePreviewPath('cases/book.epub', {
          sourceDocumentUri: {
            scheme: 'file',
            fsPath: path.join(workspaceB, 'books/source.nkc'),
            path: path.join(workspaceB, 'books/source.nkc'),
            toString: () => `file://${path.join(workspaceB, 'books/source.nkc')}`,
          } as never,
        }),
      ).resolves.toBe(path.join(workspaceB, 'cases/book.epub'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to workspace media library settings when neko-assets does not resolve', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    executeCommand.mockResolvedValueOnce('/${A}/epub/book.epub');
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/workspace-a/neko/settings.json') {
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
      if (filePath === '/workspace-a/neko/settings.json') {
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

describe('PreviewFileServer engine allow-list roots', () => {
  it('includes workspace and configured media library roots', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/workspace-a/neko/settings.json') {
        return JSON.stringify({
          mediaLibraries: [
            { variable: 'EPUB', path: '/Users/feng/Assets/epub', enabled: true },
            { variable: 'OFFLINE', path: '/disabled', enabled: false },
          ],
        });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });

    await expect(getPreviewAllowedRoots()).resolves.toEqual([
      '/workspace-a',
      '/Users/feng/Assets/epub',
    ]);
  });

  it('passes media library roots to neko-engine before registering files', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/workspace-a/neko/settings.json') {
        return JSON.stringify({
          mediaLibraries: [{ variable: 'EPUB', path: '/Users/feng/Assets/epub' }],
        });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });
    executeCommand.mockImplementation(async (command: string) => {
      if (command === 'neko.engine.ensureFrameServer') {
        return { port: 5010 };
      }
      return undefined;
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/dispatch')) {
        return new Response(
          JSON.stringify({
            status: 'ok',
            data: {
              token: 'tok-epub',
              fileSizeBytes: 10,
              mimeType: 'application/epub+zip',
              purpose: 'document',
              rangeUrl: '/v1/files/tok-epub',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      previewFileServer.invalidatePort();
      await previewFileServer.registerEpub('/Users/feng/Assets/epub/book.epub');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(executeCommand).toHaveBeenCalledWith('neko.engine.ensureFrameServer', [
      '/workspace-a',
      '/Users/feng/Assets/epub',
    ]);
  });

  it('normalizes supported media library root address forms before syncing to engine', async () => {
    workspaceFolders.push({ uri: { fsPath: '/workspace-a' } });
    readFile.mockImplementation(async (filePath: string) => {
      if (filePath === '/workspace-a/neko/settings.json') {
        return JSON.stringify({
          mediaLibraries: [
            { variable: 'REL', path: 'assets/epub' },
            { variable: 'WS', path: '${WORKSPACE}/shared/books' },
            { variable: 'HOME_LIB', path: '~/Books' },
            { variable: 'FILE_URI', path: 'file:///Volumes/Library%20A/epub' },
            { variable: 'CHAINED', path: '${REL}/nested' },
            { variable: 'REMOTE', path: 'https://cdn.example.test/epub' },
          ],
        });
      }
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      throw error;
    });

    await expect(getPreviewAllowedRoots()).resolves.toEqual([
      '/workspace-a',
      '/workspace-a/assets/epub',
      '/workspace-a/shared/books',
      '/Users/tester/Books',
      '/Volumes/Library A/epub',
      '/workspace-a/assets/epub/nested',
    ]);
  });
});

// ============================================================================
// Tests: PreviewFileServer retry logic source contract (NKP-006)
// ============================================================================

describe('PreviewFileServer retry logic source contract (NKP-006)', () => {
  it('withClientRetry method exists and wraps EngineClient file access helpers', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, '../providers/document/PreviewFileServer.ts'),
      'utf-8',
    );

    // withClientRetry method defined
    expect(source).toContain('private async withClientRetry');
    // Retry logic: invalidates port on connection failure
    expect(source).toContain('this.invalidatePort()');
    // PreviewFileServer is now a compatibility wrapper around EngineClient file access.
    expect(source).toContain('client.registerFile');
    expect(source).toContain('client.readFileRange');
    expect(source).toContain('client.readFileEntry');
    const retryCount = (source.match(/this\.withClientRetry/g) ?? []).length;
    expect(retryCount).toBeGreaterThanOrEqual(3);
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

describe('document viewer locator emission contracts', () => {
  it('keeps viewer send-to-agent paths on structured locators', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '../../../webview/src');
    const pdf = fs.readFileSync(path.join(root, 'shared/useDocumentSelection.ts'), 'utf-8');
    const epub = fs.readFileSync(path.join(root, 'epub/EpubViewer.tsx'), 'utf-8');
    const cbz = fs.readFileSync(path.join(root, 'cbz/CbzViewer.tsx'), 'utf-8');
    const docx = fs.readFileSync(path.join(root, 'docx/DocxViewer.tsx'), 'utf-8');

    expect(pdf).toContain("kind: 'page'");
    expect(pdf).toContain("kind: 'region'");
    expect(epub).toContain("kind: 'chapter'");
    expect(epub).toContain('chapterHref');
    expect(epub).toContain('spineIndex');
    expect(cbz).toContain('entryName');
    expect(cbz).toContain('const getPageLocator = useCallback');
    expect(docx).toContain("kind: 'text-range'");
    expect(docx).toContain('resolveDocxSelectionLocator');
    expect(docx).toContain('endChar');
  });
});
