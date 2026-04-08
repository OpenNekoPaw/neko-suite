import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ scheme: 'file', fsPath: p, path: p }),
    joinPath: (base: { path: string }, ...s: string[]) => ({
      scheme: 'file',
      fsPath: [base.path, ...s].join('/'),
      path: [base.path, ...s].join('/'),
    }),
  },
  commands: { executeCommand: vi.fn() },
  window: { showWarningMessage: vi.fn() },
  EventEmitter: vi.fn(),
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

    // The < and > are escaped, so the img tag cannot be parsed as HTML
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
    // Reset the singleton's internal state
    previewFileServer.invalidatePort();
  });

  it('invalidatePort() clears cached port so next getPort() re-queries engine', async () => {
    const { commands } = await import('vscode');
    const execCmd = vi.mocked(commands.executeCommand);

    // First call returns port 9001
    execCmd.mockResolvedValueOnce({ port: 9001 });
    const port1 = await previewFileServer.getPort();
    expect(port1).toBe(9001);

    // Second call should use cache (no new executeCommand call)
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
