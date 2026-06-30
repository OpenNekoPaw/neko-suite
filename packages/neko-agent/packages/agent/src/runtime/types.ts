import type {
  IProjectMemoryManager,
  ISkillRegistry,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IProviderCardRegistry,
  IOperationToolAdapterRegistry,
  PromptFragment,
} from '@neko/shared';
import type { AgentWorkflowIdentity, IdcStage } from '@neko-agent/types';
import type { IArtifactWatcher } from '../artifact';
import type { IEventBus } from '../events';
import type { SkillService } from '../skill/skill-service';
import type { SkillLifecycleRuntime } from '../skill/skill-lifecycle-runtime';
import type { IArtifactService } from './artifact-service';
import type { IFeedbackCoordinator } from '../feedback';
import type { IControlPlane } from '../control-plane';
import type { AgentExternalProcessorRuntime } from './external-processor-runtime';
import type { AgentContentAccessRuntime } from './agent-content-access-runtime';

/**
 * Minimal journal-writer contract exposed at the runtime bootstrap layer.
 *
 * This intentionally mirrors the session-facing writer shape without
 * importing AgentSession internals, so hosts can provide persistence
 * without reaching into the session package.
 */
export interface IRuntimeJournalWriter {
  appendEvent(seq: number, event: unknown): Promise<string>;
  appendSnapshot(
    seq: number,
    snapshot: {
      historyLength: number;
      executionMode: 'plan' | 'ask' | 'auto';
      versionLogSize: number;
    },
  ): Promise<void>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Minimal fs contract needed by the workspace-backed artifact/runtime plane.
 */
export interface IRuntimeWorkspaceFsOps {
  appendFile(filePath: string, data: string): Promise<void>;
  mkdir(dirPath: string, opts?: { recursive: boolean }): Promise<void>;
  readFile?(filePath: string, encoding: 'utf-8'): Promise<string>;
  writeFile?(filePath: string, data: string, encoding: 'utf-8'): Promise<void>;
}

/**
 * Workflow runtime contract.
 *
 * Owns stage-tracking and IDC entry/runtime coordination, but stays
 * intentionally narrow so different hosts can bootstrap the same
 * session/runtime stack without duplicating configuration glue.
 */
export interface IWorkflowRuntime {
  readonly workflow?: {
    readonly active?: AgentWorkflowIdentity;
  };
  readonly stageTracking?: {
    readonly skillRegistry?: ISkillRegistry;
    readonly skillService?: SkillService;
    readonly skillLifecycleRuntime?: SkillLifecycleRuntime;
    readonly initialStage?: IdcStage;
    readonly guardian?: false | Record<string, unknown>;
  };
  readonly idcTaskProjection?: import('../task').IIdcTaskProjection;
  readonly controlPlane?: IControlPlane;
}

/**
 * Artifact/runtime persistence contract.
 *
 * Freezes the workspace-backed persistence plane used by session bootstrap:
 * fs plumbing, optional journal-writer factory, and the runtime artifact
 * service that owns Draft/Plan/Task writes + run binding.
 */
export interface IArtifactStore {
  readonly workspace?: {
    readonly root: string;
    readonly fsOps: IRuntimeWorkspaceFsOps;
    readonly globalPreferencesPath?: string;
  };
  readonly artifactService?: IArtifactService;
  createJournalWriter?(conversationId: string): IRuntimeJournalWriter;
  createArtifactWatcher?(config: ArtifactWatcherRuntimeConfig): IArtifactWatcher;
}

/**
 * Minimal watcher bootstrap contract surfaced from the artifact runtime plane.
 *
 * Session owns the EventBus + active-run resolver; the artifact runtime owns
 * how draft/plan/task directories are actually watched and validated.
 */
export interface ArtifactWatcherRuntimeConfig {
  readonly eventBus: IEventBus;
  readonly getRunId: () => string | null;
  readonly getCreationId: () => string | null;
}

export type ArtifactWatcherFactory = (config: ArtifactWatcherRuntimeConfig) => IArtifactWatcher;

/**
 * Capability/runtime contract.
 *
 * Central place to expose dynamic prompt fragments, tool-group/category
 * registries, and shared skill runtime pieces to the session bootstrap.
 */
export interface ICapabilityRuntime {
  readonly skillService?: SkillService;
  readonly skillLifecycleRuntime?: SkillLifecycleRuntime;
  readonly skillRegistry?: ISkillRegistry;
  readonly toolGroupRegistry?: IToolGroupRegistry;
  readonly toolCategoryRegistry?: IToolCategoryRegistry;
  readonly providerCardRegistry?: IProviderCardRegistry;
  readonly promptFragments?: readonly PromptFragment[];
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly externalProcessorRuntime?: AgentExternalProcessorRuntime;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
}

/**
 * Feedback/runtime contract.
 *
 * Freezes the memory/journal toggles that influence observe/evaluate/
 * memorize behaviour without forcing hosts to thread these settings
 * through raw AgentSessionConfig fields.
 */
export interface IFeedbackLoop {
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly compactLogging?: boolean;
  readonly autoMemoryExtraction?: boolean;
  readonly memoryRecall?: boolean;
  readonly feedbackCoordinator?: IFeedbackCoordinator;
}

/**
 * Unified runtime bootstrap contract consumed by session-creation helpers.
 *
 * Hosts may supply any subset; explicit session-config fields still win.
 */
export interface AgentRuntimeConfig {
  readonly workflowRuntime?: IWorkflowRuntime;
  readonly artifactStore?: IArtifactStore;
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly feedbackLoop?: IFeedbackLoop;
}
