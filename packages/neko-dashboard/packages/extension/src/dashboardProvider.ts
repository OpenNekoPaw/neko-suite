import * as vscode from 'vscode';
import type { DashboardTaskOutputRef } from '@neko/shared/types/dashboard-task';
import { ActivityStore } from './activityStore';
import { getDashboardHtml } from './html';
import { NOOP_DASHBOARD_LOGGER, type DashboardLogger } from './logging';
import { NavigationDispatcher } from './navigationDispatcher';
import { isSafeDashboardLocalRef } from './pathGuards';
import { createRecentActivity } from './projectHelpers';
import { ProjectScanner } from './projectScanner';
import { SkillReader } from './skillReader';
import { StatusReader } from './statusReader';
import { TaskAggregator } from './taskAggregator';
import {
  isWebviewToExtensionMessage,
  type DashboardData,
  type ExtensionToWebviewMessage,
  type WebviewToExtensionMessage,
} from './protocol';

export interface DashboardProviderOptions {
  readonly logger?: DashboardLogger;
  readonly scanner?: ProjectScanner;
  readonly statusReader?: StatusReader;
  readonly skillReader?: SkillReader;
  readonly navigation?: NavigationDispatcher;
  readonly taskAggregator?: TaskAggregator;
  readonly activityStore?: ActivityStore;
}

export class DashboardProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private refreshPromise: Promise<void> | undefined;
  private readonly logger: DashboardLogger;
  private readonly scanner: ProjectScanner;
  private readonly statusReader: StatusReader;
  private readonly skillReader: SkillReader;
  private readonly navigation: NavigationDispatcher;
  private readonly taskAggregator: TaskAggregator;
  private readonly activityStore: ActivityStore;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    options: DashboardProviderOptions = {},
  ) {
    this.logger = options.logger ?? NOOP_DASHBOARD_LOGGER;
    this.scanner = options.scanner ?? new ProjectScanner();
    this.statusReader = options.statusReader ?? new StatusReader();
    this.skillReader = options.skillReader ?? new SkillReader();
    this.navigation = options.navigation ?? new NavigationDispatcher();
    this.taskAggregator =
      options.taskAggregator ?? new TaskAggregator({ logger: this.logger.child('TaskAggregator') });
    this.activityStore = options.activityStore ?? new ActivityStore();

    this.disposables.push(this.taskAggregator);
    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        if (this.panel) void this.refresh();
      }),
    );
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (this.panel) void this.refresh();
      }),
    );
    this.disposables.push(
      this.taskAggregator.onDidChangeTask((event) => {
        this.post({ type: 'taskProgress', event });
        if (event.task.status === 'done' || event.task.status === 'error') {
          void this.activityStore
            .append(event.task)
            .catch((error) => this.logger.warn('Failed to persist dashboard activity', error));
          this.post({ type: 'taskCompleted', taskId: event.task.taskId, task: event.task });
        }
      }),
    );
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'neko.dashboard',
      'Neko Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
      },
    );

    this.panel.webview.html = getDashboardHtml({
      webview: this.panel.webview,
      extensionUri: this.context.extensionUri,
    });

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      this.disposables,
    );

    this.panel.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.handleMessage(message);
      },
      undefined,
      this.disposables,
    );

    await this.refresh();
  }

  async maybeShowOnStartup(): Promise<void> {
    const config = vscode.workspace.getConfiguration('neko.dashboard');
    if (!config.get<boolean>('showOnStartup', false)) return;
    if (!(await this.scanner.hasWorkspaceEvidence())) return;
    await this.show();
  }

  dispose(): void {
    this.panel?.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<void> {
    await this.taskAggregator.refreshSources();
    const [projects, runtime, workflows, skills] = await Promise.all([
      this.scanner.scan(),
      this.statusReader.read(),
      this.statusReader.readWorkflows(),
      this.skillReader.read(),
    ]);
    const data: DashboardData = {
      mode: projects.length > 0 ? 'work' : 'welcome',
      projects,
      recent: createRecentActivity(projects),
      tasks: this.taskAggregator.getSnapshot(),
      runtime,
      workflows,
      skills,
    };
    this.post({ type: 'update', data });
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isWebviewToExtensionMessage(message)) return;

    try {
      await this.dispatchMessage(message);
    } catch (error) {
      this.post({ type: 'error', message: String(error) });
    }
  }

  private async dispatchMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'refresh':
        await this.refresh();
        return;
      case 'openProject':
        await this.navigation.openProject(message.path);
        return;
      case 'createProject':
        await this.navigation.createProject(message.projectType);
        return;
      case 'revealInExplorer':
        await this.navigation.revealInExplorer(message.path);
        return;
      case 'cancelTask':
        await this.taskAggregator.cancel(message.taskId);
        return;
      case 'retryTask':
        await this.taskAggregator.retry(message.taskId);
        return;
      case 'revealTaskOutput':
        await this.revealTaskOutput(message.taskId);
        return;
      case 'executeCommand':
        await vscode.commands.executeCommand(message.command);
        return;
      default:
        assertNever(message);
    }
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  private async revealTaskOutput(taskId: string): Promise<void> {
    const task = this.taskAggregator.getTask(taskId);
    const output = task?.outputs?.find(
      (candidate) => candidate.kind === 'file' || candidate.kind === 'folder',
    );
    if (!output) {
      throw new Error(`No revealable output for task: ${taskId}`);
    }

    await this.revealOutput(output);
  }

  private async revealOutput(output: DashboardTaskOutputRef): Promise<void> {
    if (output.kind !== 'file' && output.kind !== 'folder') {
      throw new Error(`Unsupported output kind: ${output.kind}`);
    }
    if (!isSafeDashboardLocalRef(output.ref)) {
      throw new Error(`Unsafe output ref: ${output.ref}`);
    }

    await this.navigation.revealInExplorer(output.ref);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled dashboard message: ${JSON.stringify(value)}`);
}
