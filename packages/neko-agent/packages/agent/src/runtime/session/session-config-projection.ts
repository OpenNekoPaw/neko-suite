import { emitDiagnostic } from '@neko/shared';
import { createAgentSession, type AgentSession } from '../../session/agent-session';
import type { AgentSessionConfig } from '../../session/types';
import { getLogger } from '../../utils/logger';
import type {
  AgentRuntimeConfig,
  ICapabilityRuntime,
  ICreationGuidanceRuntime,
  IWorkspaceRuntimeStore,
} from '../types';

const logger = getLogger('AgentSessionRuntimeBootstrap');

export interface AgentSessionRuntimeBootstrapConfig extends AgentSessionConfig {
  /**
   * Optional unified runtime config. When present, the bootstrap helper
   * projects these runtime-plane contracts into the concrete
   * AgentSessionConfig fields.
   */
  runtime?: AgentRuntimeConfig;
}

export function buildAgentSessionConfigWithRuntime(
  config: AgentSessionRuntimeBootstrapConfig,
): AgentSessionConfig {
  const { runtime, ...base } = config;
  const creationGuidance = runtime?.creationGuidance;
  const workspaceStore = runtime?.workspaceStore;
  const capability = runtime?.capabilityRuntime;
  const validation = runtime?.validationLoop;

  const workspace = base.workspace ?? toWorkspaceConfig(workspaceStore);
  const promptFragments = base.promptFragments ?? capability?.promptFragments;
  const toolGroupRegistry = base.toolGroupRegistry ?? capability?.toolGroupRegistry;
  const toolCategoryRegistry = capability?.toolCategoryRegistry ?? base.toolCategoryRegistry;
  const providerCardRegistry = base.providerCardRegistry ?? capability?.providerCardRegistry;
  const artifactProfileRegistry =
    base.artifactProfileRegistry ?? capability?.artifactProfileRegistry;
  const creationProfileRegistry =
    base.creationProfileRegistry ?? capability?.creationProfileRegistry;
  const providerExpressionProfileRegistry =
    base.providerExpressionProfileRegistry ?? capability?.providerExpressionProfileRegistry;
  const projectMemoryManager = base.projectMemoryManager ?? validation?.projectMemoryManager;
  const validationCoordinator = base.validationCoordinator ?? validation?.validationCoordinator;
  const validationCoordinatorFactory =
    base.validationCoordinatorFactory ?? validation?.validationCoordinatorFactory;
  const toolResultValidationAdapters =
    base.toolResultValidationAdapters ?? validation?.toolResultValidationAdapters;
  const autohealChainFactory = base.autohealChainFactory ?? creationGuidance?.autohealChainFactory;
  const externalProcessorRuntime =
    base.externalProcessorRuntime ?? capability?.externalProcessorRuntime;
  const contentAccessRuntime = base.contentAccessRuntime ?? capability?.contentAccessRuntime;
  const operationToolAdapterRegistry =
    base.operationToolAdapterRegistry ?? capability?.operationToolAdapterRegistry;
  const journalWriter = resolveJournalWriter(base, workspaceStore);

  return {
    ...base,
    ...(workspace ? { workspace } : {}),
    ...(promptFragments ? { promptFragments } : {}),
    ...(toolGroupRegistry ? { toolGroupRegistry } : {}),
    ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
    ...(providerCardRegistry ? { providerCardRegistry } : {}),
    ...(artifactProfileRegistry ? { artifactProfileRegistry } : {}),
    ...(creationProfileRegistry ? { creationProfileRegistry } : {}),
    ...(providerExpressionProfileRegistry ? { providerExpressionProfileRegistry } : {}),
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
    ...(validationCoordinator ? { validationCoordinator } : {}),
    ...(validationCoordinatorFactory ? { validationCoordinatorFactory } : {}),
    ...(toolResultValidationAdapters ? { toolResultValidationAdapters } : {}),
    ...(autohealChainFactory ? { autohealChainFactory } : {}),
    ...(externalProcessorRuntime ? { externalProcessorRuntime } : {}),
    ...(contentAccessRuntime ? { contentAccessRuntime } : {}),
    ...(operationToolAdapterRegistry ? { operationToolAdapterRegistry } : {}),
    ...(validation?.compactLogging !== undefined && base.compactLogging === undefined
      ? { compactLogging: validation.compactLogging }
      : {}),
    ...(validation?.autoMemoryExtraction !== undefined && base.autoMemoryExtraction === undefined
      ? { autoMemoryExtraction: validation.autoMemoryExtraction }
      : {}),
    ...(validation?.memoryRecall !== undefined && base.memoryRecall === undefined
      ? { memoryRecall: validation.memoryRecall }
      : {}),
    ...(journalWriter ? { journalWriter } : {}),
  };
}

export function createAgentSessionWithRuntime(
  config: AgentSessionRuntimeBootstrapConfig,
): AgentSession {
  return createAgentSession(buildAgentSessionConfigWithRuntime(config));
}

function toWorkspaceConfig(
  workspaceStore: IWorkspaceRuntimeStore | undefined,
): AgentSessionConfig['workspace'] {
  const workspace = workspaceStore?.workspace;
  if (!workspace) return undefined;

  return {
    root: workspace.root,
    fsOps: workspace.fsOps as NonNullable<AgentSessionConfig['workspace']>['fsOps'],
    ...(workspace.globalPreferencesPath
      ? { globalPreferencesPath: workspace.globalPreferencesPath }
      : {}),
  };
}

function resolveJournalWriter(
  base: AgentSessionConfig,
  workspaceStore: IWorkspaceRuntimeStore | undefined,
): AgentSessionConfig['journalWriter'] {
  if (base.journalWriter) return base.journalWriter;
  if (!base.conversationId) {
    if (workspaceStore?.createJournalWriter) {
      emitDiagnostic(logger, 'warn', {
        code: 'agent.runtime.bootstrap.journal-writer-skipped',
        reason: 'missing-conversation-id',
        message: 'Skipping runtime journal writer bootstrap because conversationId is missing.',
        context: {
          hasWorkspaceStore: true,
          hasJournalWriterFactory: true,
        },
      });
    }
    return undefined;
  }
  if (!workspaceStore?.createJournalWriter) {
    if (workspaceStore) {
      emitDiagnostic(logger, 'warn', {
        code: 'agent.runtime.bootstrap.journal-writer-skipped',
        reason: 'missing-journal-writer-factory',
        message:
          'Runtime workspace store does not provide createJournalWriter; journal persistence is disabled.',
        context: {
          conversationId: base.conversationId,
          hasWorkspaceStore: true,
        },
      });
    }
    return undefined;
  }
  return workspaceStore.createJournalWriter(
    base.conversationId,
  ) as AgentSessionConfig['journalWriter'];
}
