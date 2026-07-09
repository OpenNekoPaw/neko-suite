import { emitDiagnostic } from '@neko/shared';
import { createAgentSession, type AgentSession } from '../../session/agent-session';
import type { AgentSessionConfig } from '../../session/types';
import { getLogger } from '../../utils/logger';
import type {
  AgentRuntimeConfig,
  IArtifactStore,
  ICapabilityRuntime,
  ICreationGuidanceRuntime,
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
  const artifacts = runtime?.artifactStore;
  const capability = runtime?.capabilityRuntime;
  const validation = runtime?.validationLoop;

  const stageTracking = mergeStageTracking(base.stageTracking, creationGuidance, capability);
  const creationTaskProjection =
    base.creationTaskProjection ?? creationGuidance?.creationTaskProjection;
  const workspace = base.workspace ?? toWorkspaceConfig(artifacts);
  const artifactService = base.artifactService ?? artifacts?.artifactService;
  const artifactWatcherFactory = base.artifactWatcherFactory ?? artifacts?.createArtifactWatcher;
  const promptFragments = base.promptFragments ?? capability?.promptFragments;
  const toolGroupRegistry = base.toolGroupRegistry ?? capability?.toolGroupRegistry;
  const toolCategoryRegistry = capability?.toolCategoryRegistry ?? base.toolCategoryRegistry;
  const skillService = base.skillService ?? capability?.skillService;
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
  const creativeProcessRecoveryPolicy =
    base.creativeProcessRecoveryPolicy ?? creationGuidance?.creativeProcessRecoveryPolicy;
  const autohealChainFactory = base.autohealChainFactory ?? creationGuidance?.autohealChainFactory;
  const externalProcessorRuntime =
    base.externalProcessorRuntime ?? capability?.externalProcessorRuntime;
  const contentAccessRuntime = base.contentAccessRuntime ?? capability?.contentAccessRuntime;
  const operationToolAdapterRegistry =
    base.operationToolAdapterRegistry ?? capability?.operationToolAdapterRegistry;
  const journalWriter = resolveJournalWriter(base, artifacts);

  return {
    ...base,
    ...(stageTracking ? { stageTracking } : {}),
    ...(creationTaskProjection ? { creationTaskProjection } : {}),
    ...(workspace ? { workspace } : {}),
    ...(artifactService ? { artifactService } : {}),
    ...(artifactWatcherFactory ? { artifactWatcherFactory } : {}),
    ...(promptFragments ? { promptFragments } : {}),
    ...(toolGroupRegistry ? { toolGroupRegistry } : {}),
    ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
    ...(skillService ? { skillService } : {}),
    ...(providerCardRegistry ? { providerCardRegistry } : {}),
    ...(artifactProfileRegistry ? { artifactProfileRegistry } : {}),
    ...(creationProfileRegistry ? { creationProfileRegistry } : {}),
    ...(providerExpressionProfileRegistry ? { providerExpressionProfileRegistry } : {}),
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
    ...(validationCoordinator ? { validationCoordinator } : {}),
    ...(validationCoordinatorFactory ? { validationCoordinatorFactory } : {}),
    ...(toolResultValidationAdapters ? { toolResultValidationAdapters } : {}),
    ...(creativeProcessRecoveryPolicy ? { creativeProcessRecoveryPolicy } : {}),
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

/**
 * Merge stage tracking bindings from three planes with a fixed precedence:
 * explicit session config > creation guidance runtime > capability runtime.
 *
 * This keeps host overrides deterministic while still letting runtime
 * bootstrap fill shared skill/service references from lower layers.
 */
function mergeStageTracking(
  explicit: AgentSessionConfig['stageTracking'],
  creationGuidance: ICreationGuidanceRuntime | undefined,
  capability: ICapabilityRuntime | undefined,
): AgentSessionConfig['stageTracking'] {
  const runtimeStageTracking = creationGuidance?.stageTracking;
  if (!explicit && !runtimeStageTracking) return undefined;

  const skillRegistry =
    explicit?.skillRegistry ?? runtimeStageTracking?.skillRegistry ?? capability?.skillRegistry;
  const skillService =
    explicit?.skillService ?? runtimeStageTracking?.skillService ?? capability?.skillService;
  const skillLifecycleRuntime =
    explicit?.skillLifecycleRuntime ??
    runtimeStageTracking?.skillLifecycleRuntime ??
    capability?.skillLifecycleRuntime;

  return {
    ...(runtimeStageTracking ?? {}),
    ...(explicit ?? {}),
    ...(skillRegistry ? { skillRegistry } : {}),
    ...(skillService ? { skillService } : {}),
    ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
  };
}

function toWorkspaceConfig(artifacts: IArtifactStore | undefined): AgentSessionConfig['workspace'] {
  const workspace = artifacts?.workspace;
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
  artifacts: IArtifactStore | undefined,
): AgentSessionConfig['journalWriter'] {
  if (base.journalWriter) return base.journalWriter;
  if (!base.conversationId) {
    if (artifacts?.createJournalWriter) {
      emitDiagnostic(logger, 'warn', {
        code: 'agent.runtime.bootstrap.journal-writer-skipped',
        reason: 'missing-conversation-id',
        message: 'Skipping runtime journal writer bootstrap because conversationId is missing.',
        context: {
          hasArtifactStore: true,
          hasJournalWriterFactory: true,
        },
      });
    }
    return undefined;
  }
  if (!artifacts?.createJournalWriter) {
    if (artifacts) {
      emitDiagnostic(logger, 'warn', {
        code: 'agent.runtime.bootstrap.journal-writer-skipped',
        reason: 'missing-journal-writer-factory',
        message:
          'Runtime artifact store does not provide createJournalWriter; journal persistence is disabled.',
        context: {
          conversationId: base.conversationId,
          hasArtifactStore: true,
        },
      });
    }
    return undefined;
  }
  return artifacts.createJournalWriter(base.conversationId) as AgentSessionConfig['journalWriter'];
}
