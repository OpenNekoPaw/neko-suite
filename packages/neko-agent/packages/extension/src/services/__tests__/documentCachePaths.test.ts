import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  getDocumentImageCacheFsPath,
  getLegacyDocumentImageCacheUri,
  getWorkspaceCacheUri,
} from '../documentCachePaths';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/tester'),
}));

describe('document cache paths', () => {
  it('uses the workspace cache scratch area for newly extracted document images', () => {
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;

    expect(getDocumentImageCacheFsPath(context)).toBe(
      '/mock/workspace/.neko/.cache/document-image-cache',
    );
  });

  it('exposes the workspace cache root for unified resource cache projection', () => {
    expect(getWorkspaceCacheUri()?.fsPath).toBe('/mock/workspace/.neko/.cache');
  });

  it('keeps the legacy agent document image cache addressable for old results', () => {
    const context = {
      globalStorageUri: vscode.Uri.file('/global/neko-agent'),
    } as vscode.ExtensionContext;

    expect(getLegacyDocumentImageCacheUri(context).fsPath).toBe(
      '/global/neko-agent/document-image-cache',
    );
  });
});
