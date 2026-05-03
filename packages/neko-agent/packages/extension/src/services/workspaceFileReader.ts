/**
 * VSCode workspace file-reader adapter for @neko/agent input processing.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { IFileReader } from '@neko/agent';

export function createVSCodeWorkspaceFileReader(workspaceRoot: string): IFileReader {
  const resolveUri = (filePath: string): vscode.Uri =>
    path.isAbsolute(filePath)
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), filePath);

  return {
    async readFile(filePath: string): Promise<string> {
      const content = await vscode.workspace.fs.readFile(resolveUri(filePath));
      return Buffer.from(content).toString('utf-8');
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await vscode.workspace.fs.stat(resolveUri(filePath));
        return true;
      } catch {
        return false;
      }
    },

    async isFile(filePath: string): Promise<boolean> {
      try {
        const stat = await vscode.workspace.fs.stat(resolveUri(filePath));
        return stat.type === vscode.FileType.File;
      } catch {
        return false;
      }
    },

    async isDirectory(filePath: string): Promise<boolean> {
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
      const files = await vscode.workspace.findFiles(relativePattern, '**/node_modules/**', 100);
      return files.map((file) => vscode.workspace.asRelativePath(file, false));
    },

    async stat(filePath: string): Promise<{
      size: number;
      isFile: boolean;
      isDirectory: boolean;
    }> {
      const stat = await vscode.workspace.fs.stat(resolveUri(filePath));
      return {
        size: stat.size,
        isFile: stat.type === vscode.FileType.File,
        isDirectory: stat.type === vscode.FileType.Directory,
      };
    },
  };
}
