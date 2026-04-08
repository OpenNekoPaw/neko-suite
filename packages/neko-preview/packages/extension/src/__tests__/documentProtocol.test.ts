import { describe, it, expect, vi } from 'vitest';

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

import {
  getErrorHtml,
  getUnresolvedVariableHtml,
} from '../providers/document/documentProviderHelper';
import type { DocumentDataMessage } from '../types/document-messages';

// ============================================================================
// Tests
// ============================================================================

describe('getErrorHtml — HTML entity escaping', () => {
  it('escapes angle brackets so they are not rendered as tags', () => {
    const html = getErrorHtml('<script>alert("xss")</script>');

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes ampersands and double-quotes', () => {
    const html = getErrorHtml('A & B "quoted"');

    expect(html).toContain('A &amp; B');
    expect(html).toContain('&quot;quoted&quot;');
  });
});

describe('getUnresolvedVariableHtml — file path escaping', () => {
  it('escapes angle brackets inside the file path block', () => {
    const html = getUnresolvedVariableHtml('MEDIA', '/foo/<bar>/baz');

    expect(html).toContain('&lt;bar&gt;');
    expect(html).not.toContain('>/foo/<bar>');
  });

  it('renders the variable name in the description', () => {
    const html = getUnresolvedVariableHtml('MY_LIB', '/some/path');

    expect(html).toContain('${MY_LIB}');
    expect(html).toContain('Media Library Not Configured');
  });
});

describe('DocumentDataMessage type structure', () => {
  it('allows fileName and fileSize to be omitted', () => {
    const msg: DocumentDataMessage = {
      type: 'document:data',
      payload: { url: 'http://localhost:9000/doc.pdf' },
    };

    expect(msg.payload.fileName).toBeUndefined();
    expect(msg.payload.fileSize).toBeUndefined();
    expect(msg.type).toBe('document:data');
  });

  it('accepts fileName and fileSize when provided', () => {
    const msg: DocumentDataMessage = {
      type: 'document:data',
      payload: { url: 'http://localhost:9000/doc.pdf', fileName: 'doc.pdf', fileSize: 1024 },
    };

    expect(msg.payload.fileName).toBe('doc.pdf');
    expect(msg.payload.fileSize).toBe(1024);
  });
});
