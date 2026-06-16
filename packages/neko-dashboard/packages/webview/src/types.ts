import type {
  DashboardTask,
  DashboardTaskEvent,
  SkillCatalogActionRequest,
  SkillCatalogMeta,
} from '@neko/shared';
import type {
  DashboardCreativeEntityActionRequest,
  DashboardCreativeEntityActionResult,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRow,
  DashboardCreativeEntitySourceStatus,
} from '@neko/shared/types/dashboard-creative-entity';
import type { NekoEngineConnectionEndpoint } from '@neko/shared/types/extension-api';
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
    readonly endpoint?: NekoEngineConnectionEndpoint;
    readonly health?: 'unknown' | 'healthy' | 'unhealthy';
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

export type WorkflowId = 'fountain' | 'nkc' | 'nkv' | 'nka' | 'nkm' | 'nkp' | 'nks';

export interface WorkflowAvailability {
  readonly id: WorkflowId;
  readonly available: boolean;
  readonly state?: 'missing' | 'inactive' | 'ready' | 'error';
  readonly extensionId?: string;
  readonly command?: string;
  readonly error?: string;
}

export interface DashboardSkill {
  readonly id: string;
  readonly extensionId: string;
  readonly name: string;
  readonly description: string;
  readonly locale: string;
  readonly icon?: string;
  readonly command?: string;
  readonly tags?: readonly string[];
  readonly catalog: SkillCatalogMeta;
}

export interface DashboardSkillInvocation {
  readonly id: string;
  readonly extensionId: string;
  readonly name: string;
  readonly description: string;
  readonly locale: string;
  readonly tags?: readonly string[];
}

export interface DashboardData {
  readonly mode: DashboardMode;
  readonly projects: readonly DashboardProject[];
  readonly recent: readonly DashboardRecentActivity[];
  readonly tasks: readonly DashboardTask[];
  readonly creativeEntities: DashboardCreativeEntityState;
  readonly runtime: DashboardRuntimeStatus;
  readonly workflows: readonly WorkflowAvailability[];
  readonly skills: readonly DashboardSkill[];
}

export interface DashboardCreativeEntityState {
  readonly statuses: readonly DashboardCreativeEntitySourceStatus[];
  readonly rows: readonly DashboardCreativeEntityRow[];
  readonly selectedRef?: DashboardCreativeEntityRef;
  readonly detail?: DashboardCreativeEntityDetail;
}

export type WebviewToExtensionMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'refresh' }
  | { readonly type: 'refreshCreativeEntities' }
  | { readonly type: 'selectCreativeEntity'; readonly ref: DashboardCreativeEntityRef }
  | {
      readonly type: 'creativeEntityAction';
      readonly request: DashboardCreativeEntityActionRequest;
    }
  | { readonly type: 'openProject'; readonly path: string }
  | { readonly type: 'createProject'; readonly projectType: DashboardProjectType }
  | { readonly type: 'revealInExplorer'; readonly path: string }
  | { readonly type: 'cancelTask'; readonly taskId: string }
  | { readonly type: 'retryTask'; readonly taskId: string }
  | { readonly type: 'revealTaskOutput'; readonly taskId: string }
  | {
      readonly type: 'executeCommand';
      readonly command: string;
      readonly intent?: string;
      readonly skill?: DashboardSkillInvocation;
    }
  | {
      readonly type: 'skillAction';
      readonly request: SkillCatalogActionRequest;
    };

export type ExtensionToWebviewMessage =
  | { readonly type: 'update'; readonly data: DashboardData }
  | { readonly type: 'taskProgress'; readonly event: DashboardTaskEvent }
  | { readonly type: 'taskCompleted'; readonly taskId: string; readonly task: DashboardTask }
  | {
      readonly type: 'creativeEntitiesChanged';
      readonly state: DashboardCreativeEntityState;
      readonly event?: DashboardCreativeEntityEvent;
    }
  | {
      readonly type: 'creativeEntityActionResult';
      readonly result: DashboardCreativeEntityActionResult;
    }
  | { readonly type: 'error'; readonly message: string };
