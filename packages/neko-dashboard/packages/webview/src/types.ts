import type { DashboardTask, DashboardTaskEvent } from '@neko/shared';
import type { DashboardProjectType } from '@neko/shared/types/dashboard-project';

export type { DashboardProjectType } from '@neko/shared/types/dashboard-project';

export type DashboardMode = 'welcome' | 'work';

export interface DashboardProject {
  readonly name: string;
  readonly type: DashboardProjectType;
  readonly relativePath: string;
  readonly workspaceFolder: string;
  readonly lastModified: number;
  readonly size: number;
}

export interface DashboardRecentActivity {
  readonly file: DashboardProject;
  readonly action: 'modified';
  readonly time: number;
}

export interface RuntimeSourceStatus<TValue> {
  readonly available: boolean;
  readonly value?: TValue;
  readonly error?: string;
}

export interface DashboardRuntimeStatus {
  readonly engine?: RuntimeSourceStatus<{
    readonly state: 'idle' | 'starting' | 'ready' | 'error';
    readonly port?: number;
  }>;
  readonly agent?: RuntimeSourceStatus<{
    readonly total: number;
    readonly running: number;
  }>;
  readonly assets?: RuntimeSourceStatus<{
    readonly fileCount: number;
    readonly totalSize: number;
  }>;
}

export type WorkflowId =
  | 'filmmaking'
  | 'screenwriting'
  | 'visual'
  | 'modeling'
  | 'animation'
  | 'ai';

export interface WorkflowAvailability {
  readonly id: WorkflowId;
  readonly available: boolean;
}

export interface DashboardSkill {
  readonly id: string;
  readonly extensionId: string;
  readonly name: string;
  readonly description: string;
  readonly icon?: string;
  readonly tags?: readonly string[];
}

export interface DashboardData {
  readonly mode: DashboardMode;
  readonly projects: readonly DashboardProject[];
  readonly recent: readonly DashboardRecentActivity[];
  readonly tasks: readonly DashboardTask[];
  readonly runtime: DashboardRuntimeStatus;
  readonly workflows: readonly WorkflowAvailability[];
  readonly skills: readonly DashboardSkill[];
}

export type WebviewToExtensionMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'refresh' }
  | { readonly type: 'openProject'; readonly path: string }
  | { readonly type: 'createProject'; readonly projectType: DashboardProjectType }
  | { readonly type: 'revealInExplorer'; readonly path: string }
  | { readonly type: 'cancelTask'; readonly taskId: string }
  | { readonly type: 'retryTask'; readonly taskId: string }
  | { readonly type: 'revealTaskOutput'; readonly taskId: string }
  | { readonly type: 'executeCommand'; readonly command: string };

export type ExtensionToWebviewMessage =
  | { readonly type: 'update'; readonly data: DashboardData }
  | { readonly type: 'taskProgress'; readonly event: DashboardTaskEvent }
  | { readonly type: 'taskCompleted'; readonly taskId: string; readonly task: DashboardTask }
  | { readonly type: 'error'; readonly message: string };
