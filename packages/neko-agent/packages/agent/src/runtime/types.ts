import type {
  AgentToolResultValidationAdapter,
  AgentValidationCoordinator as IValidationCoordinator,
  IProjectMemoryManager,
  IToolCategoryRegistry,
  IToolGroupRegistry,
  IArtifactProfileRegistry,
  IProviderCardRegistry,
  IProviderExpressionProfileRegistry,
  IOperationToolAdapterRegistry,
  PromptFragment,
} from '@neko/shared';
import type { AgentExternalProcessorRuntime } from './capability/external-processor-runtime';
import type { AgentContentAccessRuntime } from './capability/agent-content-access-runtime';

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
 * Workspace runtime persistence contract.
 *
 * Freezes the workspace-backed persistence plane used by session bootstrap:
 * authorized fs plumbing and an optional conversation journal writer.
 */
export interface IWorkspaceRuntimeStore {
  readonly workspace?: {
    readonly root: string;
    readonly fsOps: IRuntimeWorkspaceFsOps;
    readonly globalPreferencesPath?: string;
  };
  createJournalWriter?(conversationId: string): IRuntimeJournalWriter;
}

/**
 * Capability/runtime contract.
 *
 * Central place to expose dynamic prompt fragments, tool-group/category
 * registries, and shared skill runtime pieces to the session bootstrap.
 */
export interface ICapabilityRuntime {
  readonly skillService?: import('../skill/skill-service').SkillService;
  readonly skillLifecycleRuntime?: import('../skill/skill-lifecycle-runtime').SkillLifecycleRuntime;
  readonly skillRegistry?: import('@neko/shared').ISkillRegistry;
  readonly toolGroupRegistry?: IToolGroupRegistry;
  readonly toolCategoryRegistry?: IToolCategoryRegistry;
  readonly providerCardRegistry?: IProviderCardRegistry;
  readonly artifactProfileRegistry?: IArtifactProfileRegistry;
  readonly providerExpressionProfileRegistry?: IProviderExpressionProfileRegistry;
  readonly promptFragments?: readonly PromptFragment[];
  readonly operationToolAdapterRegistry?: IOperationToolAdapterRegistry;
  readonly externalProcessorRuntime?: AgentExternalProcessorRuntime;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
}

/**
 * Validation/runtime contract.
 *
 * Freezes the memory/journal toggles that influence observe/evaluate/
 * memorize behaviour without forcing hosts to thread these settings
 * through raw AgentSessionConfig fields.
 */
export interface IValidationLoop {
  readonly projectMemoryManager?: IProjectMemoryManager;
  readonly compactLogging?: boolean;
  readonly autoMemoryExtraction?: boolean;
  readonly memoryRecall?: boolean;
  readonly validationCoordinator?: IValidationCoordinator;
  readonly validationCoordinatorFactory?: import('@neko/shared').AgentValidationCoordinatorFactory;
  readonly toolResultValidationAdapters?: readonly AgentToolResultValidationAdapter[];
  readonly autohealChainFactory?: import('@neko/shared').AgentAutohealChainFactory;
  readonly outputValidationAdapters?: readonly import('@neko/shared').AgentOutputValidationAdapter[];
}

/**
 * Unified runtime bootstrap contract consumed by session-creation helpers.
 *
 * Hosts may supply any subset; explicit session-config fields still win.
 */
export interface AgentRuntimeConfig {
  readonly workspaceStore?: IWorkspaceRuntimeStore;
  readonly capabilityRuntime?: ICapabilityRuntime;
  readonly validationLoop?: IValidationLoop;
}
