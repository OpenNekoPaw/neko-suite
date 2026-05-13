import * as path from 'path';
import * as vscode from 'vscode';
import { normalizePath } from './projectHelpers';
import type { DashboardProject } from './protocol';
import {
  getDashboardProjectTypeForExtension,
  SUPPORTED_PROJECT_FILE_PATTERN,
} from './projectTypes';

const EXCLUDE_PATTERN = '{**/node_modules/**,**/.git/**,**/.neko/.cache/**}';

export class ProjectScanner {
  async scan(): Promise<DashboardProject[]> {
    const uris = await vscode.workspace.findFiles(SUPPORTED_PROJECT_FILE_PATTERN, EXCLUDE_PATTERN);
    const projects: DashboardProject[] = [];

    for (const uri of uris) {
      const project = await this.toProject(uri);
      if (project) {
        projects.push(project);
      }
    }

    return projects.sort((a, b) => b.lastModified - a.lastModified);
  }

  async hasWorkspaceEvidence(): Promise<boolean> {
    if (!vscode.workspace.workspaceFolders?.length) return false;

    const projectFiles = await vscode.workspace.findFiles(
      SUPPORTED_PROJECT_FILE_PATTERN,
      EXCLUDE_PATTERN,
      1,
    );
    if (projectFiles.length > 0) return true;

    for (const folder of vscode.workspace.workspaceFolders) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, '.neko'));
        return true;
      } catch {
        // Missing .neko is expected for ordinary workspaces.
      }
    }

    return false;
  }

  private async toProject(uri: vscode.Uri): Promise<DashboardProject | undefined> {
    const extension = path.extname(uri.fsPath).toLowerCase();
    const type = getDashboardProjectTypeForExtension(extension);
    if (!type) return undefined;

    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return undefined;

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      return {
        name: path.basename(uri.fsPath),
        type,
        relativePath: normalizePath(path.relative(folder.uri.fsPath, uri.fsPath)),
        workspaceFolder: folder.name,
        lastModified: stat.mtime,
        size: stat.size,
      };
    } catch {
      return undefined;
    }
  }
}
