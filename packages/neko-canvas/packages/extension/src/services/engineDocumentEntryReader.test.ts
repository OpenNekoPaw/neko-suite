import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createCanvasEngineDocumentEntryReader } from './engineDocumentEntryReader';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
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
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command, argument) => {
      if (command === 'neko.assets.resolvePath') {
        return argument === '${BOOKS}/comic.epub' ? '/library/books/comic.epub' : argument;
      }
      if (command === 'neko.assets.getMediaLibraryRoots') {
        return ['/library/books'];
      }
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
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'neko.assets.resolvePath',
      '${BOOKS}/comic.epub',
    );
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.engine.ensureFrameServer', [
      '/library/books',
      '/library/books/comic.epub',
    ]);
  });
});
