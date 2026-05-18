import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

import * as vscode from 'vscode';
import { createChatLocalResourceRoots } from '../chatProvider';

describe('chatProvider', () => {
  it('authorizes the extension, document image cache, and workspace roots', () => {
    const extensionUri = vscode.Uri.file('/ext/neko-agent');
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;

    const roots = createChatLocalResourceRoots(extensionUri, context).map((uri) => uri.fsPath);

    expect(roots).toEqual([
      '/ext/neko-agent',
      '/global/neko-agent/document-image-cache',
      '/mock/workspace',
    ]);
  });
});
