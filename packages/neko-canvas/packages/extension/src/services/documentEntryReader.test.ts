import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { createCanvasDocumentEntryReader } from './documentEntryReader';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    parse: (value: string) => ({
      scheme: value.split(':', 1)[0],
      fsPath: value.replace(/^file:\/\//, ''),
    }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace/project' }, name: 'project', index: 0 }],
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn(() => '/home/user'),
  };
});

describe('createCanvasDocumentEntryReader', () => {
  let root: string;
  let projectRoot: string;
  let libraryRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function prepareProject(): Promise<void> {
    root = await mkdtemp(join(tmpdir(), 'neko-canvas-entry-reader-'));
    projectRoot = join(root, 'project');
    libraryRoot = join(root, 'books');
    await mkdir(join(projectRoot, 'neko'), { recursive: true });
    await mkdir(join(projectRoot, '.neko'), { recursive: true });
    await mkdir(libraryRoot, { recursive: true });
    await writeFile(
      join(projectRoot, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ variable: 'BOOKS', path: libraryRoot }],
      }),
    );
    await writeFile(
      join(projectRoot, '.neko', 'settings.local.json'),
      JSON.stringify({ mediaLibraryOverrides: {} }),
    );
    const zip = new AdmZip();
    zip.addFile('OPS/page-1.jpg', Buffer.from([1, 2, 3]));
    zip.addFile('OPS/images/moe-018893.jpg', Buffer.from([4, 5, 6]));
    zip.writeZip(join(libraryRoot, 'comic.epub'));

    (vscode.workspace.workspaceFolders as Array<{
      uri: { fsPath: string };
      name: string;
      index: number;
    }>) = [{ uri: { fsPath: projectRoot }, name: 'project', index: 0 }];
  }

  it('resolves project media-library variables before reading document entries', async () => {
    await prepareProject();
    const reader = createCanvasDocumentEntryReader(projectRoot);

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
  });

  it('falls back to a unique archive entry basename', async () => {
    await prepareProject();
    const reader = createCanvasDocumentEntryReader(projectRoot);

    const bytes = await reader.readEntry(
      {
        filePath: '${BOOKS}/comic.epub',
        format: 'epub',
      },
      'moe-018893.jpg',
    );

    expect(bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('does not resolve ambiguous archive entry basenames', async () => {
    await prepareProject();
    const zip = new AdmZip(join(libraryRoot, 'comic.epub'));
    zip.addFile('duplicate/moe-018893.jpg', Buffer.from([7, 8, 9]));
    zip.writeZip(join(libraryRoot, 'comic.epub'));
    const reader = createCanvasDocumentEntryReader(projectRoot);

    const bytes = await reader.readEntry(
      {
        filePath: '${BOOKS}/comic.epub',
        format: 'epub',
      },
      'moe-018893.jpg',
    );

    expect(bytes).toBeNull();
  });
});
