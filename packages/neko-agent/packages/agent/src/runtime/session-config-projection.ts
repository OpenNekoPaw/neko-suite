import { emitDiagnostic } from '@neko/shared';
import { createAgentSession, type AgentSession } from '../session/agent-session';
import type { AgentSessionConfig } from '../session/types';
import { getLogger } from '../utils/logger';
import type {
  AgentRuntimeConfig,
  IArtifactStore,
  ICapabilityRuntime,
  IWorkflowRuntime,
} from './types';

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
  const workflow = runtime?.workflowRuntime;
  const artifacts = runtime?.artifactStore;
  const capability = runtime?.capabilityRuntime;
  const feedback = runtime?.feedbackLoop;

  const stageTracking = mergeStageTracking(base.stageTracking, workflow, capability);
  const idcTaskProjection = base.idcTaskProjection ?? workflow?.idcTaskProjection;
  const workspace = base.workspace ?? toWorkspaceConfig(artifacts);
  const artifactService = base.artifactService ?? artifacts?.artifactService;
  const artifactWatcherFactory = base.artifactWatcherFactory ?? artifacts?.createArtifactWatcher;
  const promptFragments = base.promptFragments ?? capability?.promptFragments;
  const toolGroupRegistry = base.toolGroupRegistry ?? capability?.toolGroupRegistry;
  const toolCategoryRegistry = base.toolCategoryRegistry ?? capability?.toolCategoryRegistry;
  const skillService = base.skillService ?? capability?.skillService;
  const providerCardRegistry = base.providerCardRegistry ?? capability?.providerCardRegistry;
  const projectMemoryManager = base.projectMemoryManager ?? feedback?.projectMemoryManager;
  const feedbackCoordinator = base.feedbackCoordinator ?? feedback?.feedbackCoordinator;
  const controlPlane = base.controlPlane ?? workflow?.controlPlane;
  const externalProcessorRuntime =
    base.externalProcessorRuntime ?? capability?.externalProcessorRuntime;
  const contentAccessRuntime = base.contentAccessRuntime ?? capability?.contentAccessRuntime;
  const operationToolAdapterRegistry =
    base.operationToolAdapterRegistry ?? capability?.operationToolAdapterRegistry;
  const journalWriter = resolveJournalWriter(base, artifacts);

  return {
    ...base,
    ...(stageTracking ? { stageTracking } : {}),
    ...(idcTaskProjection ? { idcTaskProjection } : {}),
    ...(workspace ? { workspace } : {}),
    ...(artifactService ? { artifactService } : {}),
    ...(artifactWatcherFactory ? { artifactWatcherFactory } : {}),
    ...(promptFragments ? { promptFragments } : {}),
    ...(toolGroupRegistry ? { toolGroupRegistry } : {}),
    ...(toolCategoryRegistry ? { toolCategoryRegistry } : {}),
    ...(skillService ? { skillService } : {}),
    ...(providerCardRegistry ? { providerCardRegistry } : {}),
    ...(projectMemoryManager ? { projectMemoryManager } : {}),
    ...(feedbackCoordinator ? { feedbackCoordinator } : {}),
    ...(controlPlane ? { controlPlane } : {}),
    ...(externalProcessorRuntime ? { externalProcessorRuntime } : {}),
    ...(contentAccessRuntime ? { contentAccessRuntime } : {}),
    ...(operationToolAdapterRegistry ? { operationToolAdapterRegistry } : {}),
    ...(feedback?.compactLogging !== undefined && base.compactLogging === undefined
      ? { compactLogging: feedback.compactLogging }
      : {}),
    ...(feedback?.autoMemoryExtraction !== undefined && base.autoMemoryExtraction === undefined
      ? { autoMemoryExtraction: feedback.autoMemoryExtraction }
      : {}),
    ...(feedback?.memoryRecall !== undefined && base.memoryRecall === undefined
      ? { memoryRecall: feedback.memoryRecall }
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
 * explicit session config > workflow runtime > capability runtime.
 *
 * This keeps host overrides deterministic while still letting runtime
 * bootstrap fill shared skill/service references from lower layers.
 */
function mergeStageTracking(
  explicit: AgentSessionConfig['stageTracking'],
  workflow: IWorkflowRuntime | undefined,
  capability: ICapabilityRuntime | undefined,
): AgentSessionConfig['stageTracking'] {
  const runtimeStageTracking = workflow?.stageTracking;
  if (!explicit && !runtimeStageTracking) return undefined;

  const skillRegistry =
    explicit?.skillRegistry ?? runtimeStageTracking?.skillRegistry ?? capability?.skillRegistry;
  const skillService =
    explicit?.skillService ?? runtimeStageTracking?.skillService ?? capability?.skillService;

  return {
    ...(runtimeStageTracking ?? {}),
    ...(explicit ?? {}),
    ...(skillRegistry ? { skillRegistry } : {}),
    ...(skillService ? { skillService } : {}),
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
