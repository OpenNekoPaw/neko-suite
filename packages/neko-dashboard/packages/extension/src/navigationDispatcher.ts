import * as path from 'path';
import * as vscode from 'vscode';
import { isSafeDashboardLocalRef } from './pathGuards';
import type { DashboardProjectType } from './protocol';
import { getProjectCreateCommand } from './projectTypes';

export class NavigationDispatcher {
  async openProject(relativePath: string): Promise<void> {
    const uri = await this.resolveExistingWorkspacePath(relativePath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  async revealInExplorer(relativePath: string): Promise<void> {
    const uri = await this.resolveExistingWorkspacePath(relativePath);
    await vscode.commands.executeCommand('revealInExplorer', uri);
  }

  async createProject(projectType: DashboardProjectType): Promise<void> {
    await vscode.commands.executeCommand(getProjectCreateCommand(projectType));
  }

  resolveWorkspacePath(relativePath: string): vscode.Uri {
    if (!isSafeDashboardLocalRef(relativePath)) {
      throw new Error(`Unsafe workspace path: ${relativePath}`);
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      throw new Error('No workspace folder is open.');
    }

    return vscode.Uri.joinPath(folders[0]!.uri, ...relativePath.split('/'));
  }

  async resolveExistingWorkspacePath(relativePath: string): Promise<vscode.Uri> {
    if (!isSafeDashboardLocalRef(relativePath)) {
      throw new Error(`Unsafe workspace path: ${relativePath}`);
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      throw new Error('No workspace folder is open.');
    }

    const segments = relativePath.split('/');
    for (const folder of folders) {
      const uri = vscode.Uri.joinPath(folder.uri, ...segments);
      try {
        await vscode.workspace.fs.stat(uri);
        return uri;
      } catch {
        // Try next workspace folder.
      }
    }

    return vscode.Uri.joinPath(folders[0]!.uri, ...segments);
  }
}
