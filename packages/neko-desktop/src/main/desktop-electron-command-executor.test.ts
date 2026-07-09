import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NEKO_COMMANDS } from '@neko/host';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createElectronDesktopCommandExecutor,
  type ElectronSaveDialogPort,
  type ElectronShellPort,
} from './desktop-electron-command-executor';
import { createDesktopProjectFileIoAdapter } from './project-file-io';

let tempRoot: string | undefined;

describe('desktop Electron neko.* command executor', () => {
  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('searches workspace files through neko.workspace.searchFiles', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-command-'));
    await writeFile(join(tempRoot, 'scene.md'), '# scene');
    await writeFile(join(tempRoot, 'hero.png'), 'image');

    const executor = createExecutor(tempRoot);
    const result = await executor.execute(NEKO_COMMANDS.workspaceSearchFiles, {
      filter: 'scene',
      limit: 30,
    });

    expect(result).toEqual({
      files: [
        {
          path: 'scene.md',
          name: 'scene.md',
          type: 'file',
          source: 'workspace',
          icon: 'MD',
        },
      ],
    });
  });

  it('opens workspace files and rejects unsafe external URL schemes', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-command-'));
    await writeFile(join(tempRoot, 'scene.md'), '# scene');
    const shell = createShell();
    const executor = createExecutor(tempRoot, { shell });

    await expect(
      executor.execute(NEKO_COMMANDS.workspaceOpenFile, { path: 'scene.md' }),
    ).resolves.toBeUndefined();
    expect(shell.openPath).toHaveBeenCalledWith(join(tempRoot, 'scene.md'));

    await expect(
      executor.execute(NEKO_COMMANDS.externalOpenUrl, { url: 'javascript:alert(1)' }),
    ).rejects.toThrow('Unsupported external URL protocol');
  });

  it('saves SVG downloads through neko.resource.downloadSvg', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'neko-desktop-command-'));
    const outputPath = join(tempRoot, 'diagram.svg');
    const dialog: ElectronSaveDialogPort = {
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: outputPath })),
    };
    const executor = createExecutor(tempRoot, { dialog });

    await expect(
      executor.execute(NEKO_COMMANDS.resourceDownloadSvg, {
        svg: '<svg />',
        filename: 'diagram.svg',
      }),
    ).resolves.toEqual({ saved: true, filePath: outputPath });
    await expect(readFile(outputPath, 'utf-8')).resolves.toBe('<svg />');
  });
});

function createExecutor(
  workspaceRoot: string,
  options: {
    readonly shell?: ElectronShellPort;
    readonly dialog?: ElectronSaveDialogPort;
  } = {},
) {
  return createElectronDesktopCommandExecutor({
    workspaceRoot,
    getProjectFileIo: () => createDesktopProjectFileIoAdapter({ workspaceRoot }),
    shell: options.shell ?? createShell(),
    dialog:
      options.dialog ??
      ({
        showSaveDialog: vi.fn(async () => ({ canceled: true })),
      } satisfies ElectronSaveDialogPort),
    homeDir: workspaceRoot,
  });
}

function createShell(): ElectronShellPort {
  return {
    openPath: vi.fn(async () => ''),
    openExternal: vi.fn(async () => {}),
    showItemInFolder: vi.fn(),
  };
}
