/**
 * VSCode workspace file-reader adapter for @neko/agent input processing.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_MENTION_EXCLUDE_GLOB, type IFileReader } from '@neko/agent';
import { createWorkspaceMentionIgnoreFilter } from './workspaceIgnoreFilter';

export function createVSCodeWorkspaceFileReader(
  workspaceRoot: string,
  ignoreFilter?: Awaited<ReturnType<typeof createWorkspaceMentionIgnoreFilter>>,
): IFileReader {
  let lazyIgnoreFilter: Promise<
    Awaited<ReturnType<typeof createWorkspaceMentionIgnoreFilter>>
  > | null = ignoreFilter ? Promise.resolve(ignoreFilter) : null;
  const resolveUri = (filePath: string): vscode.Uri =>
    path.isAbsolute(filePath)
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);
  const resolveIgnoreFilter = () => {
    lazyIgnoreFilter ??= createWorkspaceMentionIgnoreFilter(workspaceRoot);
    return lazyIgnoreFilter;
  };
  const isIgnored = async (filePath: string | vscode.Uri): Promise<boolean> =>
    (await resolveIgnoreFilter()).isIgnored(filePath);
  const assertReadable = async (filePath: string): Promise<void> => {
    if (await isIgnored(filePath)) {
      throw new Error('File is ignored by workspace mention filters');
    }
  };

  return {
    async readFile(filePath: string): Promise<string> {
      await assertReadable(filePath);
      const content = await vscode.workspace.fs.readFile(resolveUri(filePath));
      return Buffer.from(content).toString('utf-8');
    },

    async exists(filePath: string): Promise<boolean> {
      if (await isIgnored(filePath)) {
        return false;
      }
      try {
        await vscode.workspace.fs.stat(resolveUri(filePath));
        return true;
      } catch {
        return false;
      }
    },

    async isFile(filePath: string): Promise<boolean> {
      if (await isIgnored(filePath)) {
        return false;
      }
      try {
        const stat = await vscode.workspace.fs.stat(resolveUri(filePath));
        return stat.type === vscode.FileType.File;
      } catch {
        return false;
      }
    },

    async isDirectory(filePath: string): Promise<boolean> {
      if (await isIgnored(filePath)) {
        return false;
      }
      try {
        const stat = await vscode.workspace.fs.stat(resolveUri(filePath));
        return stat.type === vscode.FileType.Directory;
      } catch {
        return false;
      }
    },

    async glob(pattern: string, options?: { cwd?: string }): Promise<string[]> {
      const cwd = options?.cwd ?? workspaceRoot;
      const relativePattern = new vscode.RelativePattern(cwd, pattern);
      const files = await vscode.workspace.findFiles(
        relativePattern,
        DEFAULT_MENTION_EXCLUDE_GLOB,
        100,
      );
      const filter = await resolveIgnoreFilter();
      return files
        .filter((file) => !filter.isIgnored(file))
        .map((file) => vscode.workspace.asRelativePath(file, false));
    },

    async stat(filePath: string): Promise<{
      size: number;
      isFile: boolean;
      isDirectory: boolean;
    }> {
      await assertReadable(filePath);
      const stat = await vscode.workspace.fs.stat(resolveUri(filePath));
      return {
        size: stat.size,
        isFile: stat.type === vscode.FileType.File,
        isDirectory: stat.type === vscode.FileType.Directory,
      };
    },
  };
}
