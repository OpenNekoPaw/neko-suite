import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { createDocumentLowLevelAccess } from '../documentLowLevelAccess';
import type { IEngineClientProvider } from '../engineClientProvider';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
}));

describe('documentLowLevelAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  });

  it('resolves path variables before identifying files', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue('/library/books/book.epub');
    vi.mocked(fs.stat).mockResolvedValue({
      size: 42,
      mtimeMs: 1000,
    } as any);

    const access = createDocumentLowLevelAccess();
    const identity = await access.identify?.('${A}/books/book.epub');

    expect(identity?.fileId).toBe('/library/books/book.epub:42:1000');
    expect(fs.stat).toHaveBeenCalledWith('/library/books/book.epub');
  });

  it('resolves path variables before registering engine range reads', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue('/library/books/book.epub');
    const engine = {
      withRegisteredFile: vi.fn(async (_request, task) =>
        task({
          token: 'token-1',
          fileSizeBytes: 8,
          mimeType: 'application/epub+zip',
          purpose: 'document',
          rangeUrl: '/v1/files/token-1',
        }),
      ),
      readFileRange: vi.fn(async () => new Uint8Array([1, 2]).buffer),
    };
    const provider: IEngineClientProvider = {
      getOptionalClient: vi.fn(async () => engine as any),
      getRequiredClient: vi.fn(async () => engine as any),
      transcodeFile: vi.fn(async () => true),
      createPerceptionClient: vi.fn(() => ({ perception: {} }) as any),
      createPerceptionClients: vi.fn(() => ({})),
    };

    const access = createDocumentLowLevelAccess(provider);
    await expect(access.readRange?.('${A}/books/book.epub', 0, 1)).resolves.toEqual(
      new Uint8Array([1, 2]),
    );

    expect(engine.withRegisteredFile).toHaveBeenCalledWith(
      { filePath: '/library/books/book.epub', purpose: 'document' },
      expect.any(Function),
    );
    expect(engine.readFileRange).toHaveBeenCalledWith('token-1', 0, 1);
  });
});
