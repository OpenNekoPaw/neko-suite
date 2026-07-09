import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createDesktopProjectFileIoAdapter,
  resolveDesktopWorkspacePath,
} from './project-file-io';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('desktop project file IO adapter', () => {
  it('reads workspace text files through host-authorized ProjectFileOps', async () => {
    const workspaceRoot = await createTempWorkspace();
    await writeFile(join(workspaceRoot, 'notes.md'), 'hello desktop');
    const adapter = createDesktopProjectFileIoAdapter({ workspaceRoot });

    const content = await adapter.fileOps.readFile('notes.md');
    expect(new TextDecoder().decode(content)).toBe('hello desktop');
    await expect(adapter.readWorkspaceTextFile({ relativePath: 'notes.md' })).resolves.toEqual({
      relativePath: 'notes.md',
      content: 'hello desktop',
      encoding: 'utf8',
      truncated: false,
    });
  });

  it('truncates renderer text previews without changing durable file identity', async () => {
    const workspaceRoot = await createTempWorkspace();
    await writeFile(join(workspaceRoot, 'long.txt'), 'abcdef');
    const adapter = createDesktopProjectFileIoAdapter({
      workspaceRoot,
      maxTextFileBytes: 3,
    });

    await expect(adapter.readWorkspaceTextFile({ relativePath: 'long.txt' })).resolves.toEqual({
      relativePath: 'long.txt',
      content: 'abc',
      encoding: 'utf8',
      truncated: true,
    });
  });

  it('writes workspace text files through the same authorized fileOps boundary', async () => {
    const workspaceRoot = await createTempWorkspace();
    const adapter = createDesktopProjectFileIoAdapter({ workspaceRoot });

    await expect(
      adapter.writeWorkspaceTextFile({
        relativePath: 'stories/scene.md',
        content: '# Scene',
      }),
    ).resolves.toEqual({
      relativePath: 'stories/scene.md',
      encoding: 'utf8',
      bytesWritten: 7,
      written: true,
    });
    await expect(readFile(join(workspaceRoot, 'stories/scene.md'), 'utf8')).resolves.toBe(
      '# Scene',
    );
  });

  it('rejects project file paths outside the workspace for every file operation', async () => {
    const workspaceRoot = await createTempWorkspace();
    const adapter = createDesktopProjectFileIoAdapter({ workspaceRoot });
    const outsidePath = resolve(workspaceRoot, '..', 'outside.txt');

    expect(() => resolveDesktopWorkspacePath(workspaceRoot, '../outside.txt')).toThrow(
      'Workspace file path is outside the workspace',
    );
    expect(() => resolveDesktopWorkspacePath(workspaceRoot, outsidePath)).toThrow(
      'Workspace file path is outside the workspace',
    );
    await expect(adapter.fileOps.readFile('../outside.txt')).rejects.toThrow(
      'Workspace file path is outside the workspace',
    );
    await expect(
      adapter.fileOps.writeFile('../outside.txt', new TextEncoder().encode('nope')),
    ).rejects.toThrow('Workspace file path is outside the workspace');
  });

  it('keeps atomic rename overwrite behavior explicit for ProjectFileStore saves', async () => {
    const workspaceRoot = await createTempWorkspace();
    const adapter = createDesktopProjectFileIoAdapter({ workspaceRoot });
    await adapter.fileOps.writeFile('draft.tmp', new TextEncoder().encode('next'));
    await adapter.fileOps.writeFile('story.md', new TextEncoder().encode('current'));
    const renameFile = adapter.fileOps.renameFile;
    if (!renameFile) {
      throw new Error('Desktop project file IO adapter must expose renameFile.');
    }

    await expect(renameFile('draft.tmp', 'story.md')).rejects.toThrow(
      'Workspace file already exists',
    );
    await expect(renameFile('draft.tmp', 'story.md', { overwrite: true })).resolves.toBeUndefined();
    await expect(readFile(join(workspaceRoot, 'story.md'), 'utf8')).resolves.toBe('next');
  });

  it('keeps Desktop main IPC handlers on the project-file IO boundary', () => {
    const mainSource = readFileSync(resolve(packageRoot, 'src/main/index.ts'), 'utf8');

    expect(mainSource).not.toMatch(/from 'node:fs\/promises'/);
    expect(mainSource).not.toMatch(/\breadFile\(/);
    expect(mainSource).toContain('createDesktopProjectFileIoAdapter');
    expect(mainSource).toContain('readWorkspaceTextFile');
    expect(mainSource).toContain('writeWorkspaceTextFile');
  });
});

async function createTempWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'neko-desktop-project-file-io-'));
}
