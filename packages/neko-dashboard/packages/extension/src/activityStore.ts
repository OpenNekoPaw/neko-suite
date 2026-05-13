import * as vscode from 'vscode';
import type { DashboardTask } from '@neko/shared/types/dashboard-task';
import {
  DASHBOARD_ACTIVITY_LIMIT,
  isTerminalPersistedStatus,
  normalizeActivityFile,
  type ActivityFile,
  type DashboardActivityEntry,
} from './activityFile';

export type { DashboardActivityEntry } from './activityFile';

export type WorkspaceUriProvider = () => vscode.Uri | undefined;

export interface ActivityStoreOptions {
  readonly workspaceUriProvider?: WorkspaceUriProvider;
}

export class ActivityStore {
  private readonly workspaceUriProvider: WorkspaceUriProvider;

  constructor(options: ActivityStoreOptions = {}) {
    this.workspaceUriProvider = options.workspaceUriProvider ?? getPrimaryWorkspaceUri;
  }

  async list(): Promise<DashboardActivityEntry[]> {
    const file = await this.readFile();
    return [...file.entries];
  }

  async append(task: DashboardTask): Promise<void> {
    if (!isTerminalPersistedStatus(task.status)) return;

    const completedAt = task.completedAt ?? Date.now();
    const entry: DashboardActivityEntry = {
      taskId: task.taskId,
      title: task.title,
      source: task.source,
      status: task.status,
      outputs: task.outputs ?? [],
      completedAt,
    };

    const current = await this.readFile();
    const entries = [...current.entries.filter((item) => item.taskId !== task.taskId), entry]
      .sort((a, b) => a.completedAt - b.completedAt)
      .slice(-DASHBOARD_ACTIVITY_LIMIT);

    await this.writeFile({ version: 1, entries });
  }

  private async readFile(): Promise<ActivityFile> {
    const uri = this.getActivityUri();
    if (!uri) return { version: 1, entries: [] };

    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const decoded = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(decoded) as unknown;
      return normalizeActivityFile(parsed);
    } catch {
      return { version: 1, entries: [] };
    }
  }

  private async writeFile(file: ActivityFile): Promise<void> {
    const workspaceUri = this.workspaceUriProvider();
    if (!workspaceUri) return;

    const directory = vscode.Uri.joinPath(workspaceUri, '.neko');
    await vscode.workspace.fs.createDirectory(directory);
    const uri = vscode.Uri.joinPath(directory, 'dashboard-activity.json');
    const encoded = new TextEncoder().encode(`${JSON.stringify(file, null, 2)}\n`);
    await vscode.workspace.fs.writeFile(uri, encoded);
  }

  private getActivityUri(): vscode.Uri | undefined {
    const workspaceUri = this.workspaceUriProvider();
    return workspaceUri
      ? vscode.Uri.joinPath(workspaceUri, '.neko', 'dashboard-activity.json')
      : undefined;
  }
}

function getPrimaryWorkspaceUri(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}
