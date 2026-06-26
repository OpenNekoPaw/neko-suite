import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthorizedMediaLibraryReadRoots } from '../documentPathResolver';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('documentPathResolver', () => {
  const fixtureRoot = path.resolve(
    process.cwd(),
    '.test-workspaces',
    `document-path-resolver-${process.pid}`,
  );
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const mediaRoot = path.join(fixtureRoot, 'media');
  const overrideRoot = path.join(fixtureRoot, 'override-media');

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(path.join(workspaceRoot, 'neko'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko'), { recursive: true });
    await fs.mkdir(mediaRoot, { recursive: true });
    await fs.mkdir(overrideRoot, { recursive: true });
    vi.mocked(vscode.extensions.getExtension).mockReturnValue(undefined);
    (vscode.workspace.workspaceFolders as unknown) = [
      { uri: { fsPath: workspaceRoot }, name: 'fixture', index: 0 },
    ];
  });

  afterEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('loads enabled media library roots from project settings and local overrides', async () => {
    await fs.writeFile(
      path.join(workspaceRoot, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [
          { variable: 'EPUBS', path: mediaRoot, enabled: true },
          { variable: 'DISABLED', path: path.join(fixtureRoot, 'disabled'), enabled: false },
        ],
      }),
      'utf-8',
    );
    await fs.writeFile(
      path.join(workspaceRoot, '.neko', 'settings.local.json'),
      JSON.stringify({ mediaLibraryOverrides: { EPUBS: overrideRoot } }),
      'utf-8',
    );

    await expect(loadAuthorizedMediaLibraryReadRoots()).resolves.toEqual([overrideRoot]);
  });

  it('keeps project settings roots when an available assets API result is empty', async () => {
    await fs.writeFile(
      path.join(workspaceRoot, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ variable: 'EPUBS', path: mediaRoot, enabled: true }],
      }),
      'utf-8',
    );
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => []),
      },
    } as never);

    await expect(loadAuthorizedMediaLibraryReadRoots()).resolves.toEqual([mediaRoot]);
  });

  it('merges available assets API roots with project settings roots', async () => {
    const apiRoot = path.join(fixtureRoot, 'api-media');
    await fs.mkdir(apiRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ variable: 'EPUBS', path: mediaRoot, enabled: true }],
      }),
      'utf-8',
    );
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      isActive: true,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => [apiRoot, mediaRoot]),
      },
    } as never);

    await expect(loadAuthorizedMediaLibraryReadRoots()).resolves.toEqual([apiRoot, mediaRoot]);
  });
});
