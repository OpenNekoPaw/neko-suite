import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createCanvasEngineDocumentEntryReader } from './engineDocumentEntryReader';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' }, name: 'project', index: 0 }],
  },
}));

vi.mock('@neko/neko-client', () => ({
  EngineClient: vi.fn().mockImplementation(function EngineClient() {
    return {
      withRegisteredFile: vi.fn(async (_request, task) =>
        task({
          token: 'token-1',
          fileSizeBytes: 42,
          mimeType: 'application/epub+zip',
          purpose: 'document',
          rangeUrl: '/v1/files/token-1',
        }),
      ),
      readFileEntry: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    };
  }),
}));

describe('createCanvasEngineDocumentEntryReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => ['/library/books']),
        getPathVariables: vi.fn(async () => [['BOOKS', '/library/books']] as const),
      },
      activate: vi.fn(),
    } as unknown as vscode.Extension<unknown>);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command, argument) => {
      if (command === 'neko.engine.ensureFrameServer') {
        return { port: 1234 };
      }
      return undefined;
    });
  });

  it('reads document entries through neko-engine file access', async () => {
    const reader = createCanvasEngineDocumentEntryReader();

    const bytes = await reader.readEntry(
      {
        filePath: '${BOOKS}/comic.epub',
        format: 'epub',
      },
      'OPS/page-1.jpg',
    );

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.resolvePath',
      expect.anything(),
    );
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.getMediaLibraryRoots',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.engine.ensureFrameServer', [
      '/workspace/project',
      '/library/books',
      '/library/books/comic.epub',
    ]);
  });
});
