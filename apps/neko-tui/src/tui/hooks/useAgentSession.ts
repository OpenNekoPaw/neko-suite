/**
 * useAgentSession Hook
 *
 * Manages AgentSession lifecycle: initialization, execution, cleanup.
 * Owns the Neko TUI Agent session initialization path.
 * but exposes it as a React hook for Ink components.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  MCPManager,
  createAllMCPTools,
  createMcpToolCreationOptionsForExternalResearch,
  createPlanModeCreationMetadata,
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  createSystemPromptBuilder,
  createInputProcessor,
  createFileAgentWorkspaceRuntimeStateRuntime,
  mergeCreationExecutionMetadata,
  ProviderCardRegistry,
  type AgentSessionConfig,
  type IAgentSession,
  type PromptCompositionFragmentProjection,
  type InputProcessor,
  type SystemPromptBuilder,
  type SkillService,
  type SkillLifecycleRuntime,
  type IRuntimeTaskManager,
  type AgentEvent,
  type AgentWorkspaceRuntimeStatePatch,
  type AgentWorkspaceRuntimeStateRuntime,
  type AgentWorkspaceRuntimeStatus,
  type ConversationRecord,
  type ConversationResumeStorage,
  createAgentTaskResultObservationRuntime,
  type AgentTaskResultObservationRuntime,
} from '@neko/agent';
import {
  AgentEventStreamRuntimeProcessor,
  type AgentEventStreamRuntimeMessage,
  buildAgentRuntimeSessionFactoryConfig,
  buildAgentWorkspaceRuntimeSessionAssemblyInput,
  createAgentCapabilityRuntimeRegistries,
  createExternalResearchCapabilityProviderFromMcpConfig,
  createAgentRuntimeSession,
  AgentMessageQueueOperationError,
  type AgentConversationMessageQueue,
  type AgentRuntimeSessionHandle,
} from '@neko/agent/runtime';
import {
  projectLlmParameters,
  ConfigManager,
  createResourceCacheGeneratedAssetIndex,
  FileUserConfigManager,
  type GeneratedAssetIndex,
  type MediaTask,
  type Platform,
} from '@neko/platform';
import type { MediaTaskProgressDeliveryPlan } from '@neko/platform/media/media-task-progress-plan';
import type { AgentLlmConfig, AgentPhase } from '@neko-agent/types';
import type {
  AgentContinuationMetadata,
  AgentQueuedMessageDisplayKind,
  AgentQueuedMessageItem,
  AgentQueuedMessageSource,
  AgentTurnSource,
} from '@neko-agent/types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { CLIConfig } from '../core/types';
import type { SupportedLocale } from '@neko/shared/i18n';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import { presentStageGuardianIssue } from '../presentation/stage-guardian-presentation';
import { presentQueueCommand } from '../presentation/work-queue-presentation';
import {
  presentMediaBackgroundDiagnostic,
  presentContinuationDiscarded,
  presentContinuationReady,
  presentQueuedContinuation,
  presentMediaResultPersistenceFailure,
  presentResourceCacheGcFailure,
  presentResumeFallback,
  presentSkillActivationRejected,
  presentSkillDeactivationRejected,
  presentTaskResultContinuation,
  presentTaskResultObservationDiagnostic,
  presentTaskStatusRefreshFailure,
  presentWorkspaceContentDiagnostic,
  presentWorkspaceRuntimeStateFailure,
} from '../presentation/runtime-presentation';
import type { ExecutionMode, Message as TuiMessage } from '../types/state';
import {
  type AgentCapabilityProvider,
  type ChatMessage,
  type GeneratedAsset,
  type IService,
  type PerceptionCard,
  type PerceptualAssetRef,
  type Task,
  type TaskStatus,
  type ToolResultBackfillPayload,
  type ResourceCacheManifestStore,
  type SearchDocumentRecord,
  formatLocalMetadataUserDiagnostic,
  projectLocalMetadataUserDiagnostic,
} from '@neko/shared';
import type {
  TuiCapabilityPorts,
  TuiMcpServerSnapshot,
  TuiModelIdentity,
  TuiParameterValidationResult,
} from '../core/tui-command-router';
import { createCLIPlatform, createCLITaskManager } from '../core/platform-bootstrap';
import { createCliAgentRuntime, createCliToolGroupRegistry } from '../core/runtime-bootstrap';
import {
  createTuiSqliteConversationStorage,
  type TuiConversationPersistenceSnapshot,
  type TuiSqliteConversationStorageBinding,
} from '../host/tui-sqlite-conversation-storage';
import {
  createTuiCapabilityLoader,
  type TuiCapabilityLoaderResult,
} from '../core/tui-capability-loader';
import { presentReferenceLoadingDiagnostics } from '../presentation/reference-presentation';
import { presentTuiConversationIdDiagnostic } from '../presentation/conversation-presentation';
import { toQueueOperationDiagnostic } from '../core/message-queue-semantics';
import {
  connectTuiMcpServer,
  createTuiMcpServerSnapshots,
  disconnectTuiMcpServer,
  listRegisteredTuiMcpTools,
  reconnectTuiMcpServer,
} from '../core/tui-mcp-ports';
import { createTuiSessionSkillRuntime } from '../core/tui-session-skills';
import { mergeTuiMediaModelMetadata } from '../core/media-model-metadata';
import { listChatModelOptions } from '../core/config';
import {
  useTuiApplicationRuntime,
  useTuiConversationRuntime,
  useTuiConversationStores,
  type TuiConversationStores,
} from '../runtime/tui-runtime-context';
import { createEventAdapter, type IEventAdapter } from '../adapters/event-adapter';
import {
  createTuiSlashCommandCatalog,
  type TuiSlashCommandOption,
} from '../core/slash-command-catalog';
import { withTuiDefaultCapabilityProviders } from '../host/tui-default-capabilities';
import {
  activateCliDomainSkill,
  type CliSkillLifecycleSessionBridge,
  createCliSkillLifecycleRuntime,
  deactivateCliSkillLifecycle,
  wireCliSkillLifecycleSession,
} from '../core/skill-lifecycle-session';
import {
  assertCanonicalTuiConversationId,
  TuiConversationIdError,
} from '../core/tui-conversation-id';
import {
  createNodeWorkspaceContentPolicy,
  NodeWorkspaceContentError,
} from '../host/node-workspace-content-host';
import { runNodeResourceCacheStartupGc } from '../host/node-resource-cache-startup-gc';
import { NodeMediaTaskDeliveryHost } from '../host/node-media-task-delivery-host';
import { createNodePerceptionPipeline } from '../host/node-perception-pipeline';
import { createTuiMediaBackgroundTasks } from '../core/tui-media-background-tasks';
import type { TerminalTimelineMessage } from '../core/timeline-projector';

interface AgentUsageSnapshot {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

type RuntimeTerminalTimelineMessage = Extract<
  AgentEventStreamRuntimeMessage,
  TerminalTimelineMessage
>;

interface ExecutePromptOptions {
  readonly metadata?: Record<string, unknown>;
  readonly source?: AgentTurnSource;
  readonly displayKind?: AgentQueuedMessageDisplayKind | 'user-message';
  readonly continuationMetadata?: AgentContinuationMetadata;
}

interface SubmitInternalContinuationInput {
  readonly prompt: string;
  readonly source: Exclude<AgentTurnSource, 'user'>;
  readonly displayKind?: AgentQueuedMessageDisplayKind;
  readonly metadata?: AgentContinuationMetadata;
}

export interface UseAgentSessionOptions {
  readonly config: CLIConfig;
  /** Optional Platform Service (from VSCode extension) */
  readonly service?: IService;
  /** Optional shared task plane provided by the host bootstrap */
  readonly taskManager?: IRuntimeTaskManager;
  /** Host-agnostic package capability providers injected by the CLI host. */
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
  /** Optional persisted conversation id to load through the Ink TUI session path. */
  readonly resumeConversationId?: string;
  /** Invocation-local terminal presentation shared by router and Ink event projection. */
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  /** Concrete built-in prompt locale resolved once during CLI bootstrap. */
  readonly promptLocale: SupportedLocale;
  /** User metadata root; tests must point this at an isolated temporary directory. */
  readonly localMetadataHome?: string;
  /** Host composition override for isolated storage tests. */
  readonly createConversationStorage?: (
    homedir: string,
    workDir: string,
  ) => Promise<TuiSqliteConversationStorageBinding>;
}

export interface AgentSessionHandle {
  /** Submit a prompt to the agent */
  submit: (
    prompt: string,
    executionOverrides?: { metadata?: Record<string, unknown> },
  ) => Promise<void>;
  /** Cancel current execution */
  cancel: () => void;
  /** Clear conversation history */
  clearHistory: () => void;
  /** Confirm or reject a tool call */
  confirmTool: (toolCallId: string, approved: boolean) => void;
  /** Switch model and rebuild LLM service */
  updateModel: (model: string | TuiModelIdentity) => void;
  /** Switch execution mode and rebuild system prompt */
  updateMode: (mode: ExecutionMode) => void;
  /** Get the current Agent context token estimate. */
  getContextTokenCount: () => number | null;
  /** Compress the current Agent context through the runtime session path. */
  compactContext: () => Promise<import('@neko/agent').CompressionResult>;
  /** Message queue snapshot for running-turn prompt queueing. */
  getMessageQueueSnapshot: () => import('@neko-agent/types').AgentMessageQueueSnapshot | null;
  /** Resume automatic draining of accepted pending messages. */
  resumeQueuedMessages: () => Promise<void>;
  /** Promote a queued message to run next. */
  promoteQueuedMessage: (queueItemId: string) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Cancel a queued message without cancelling the active turn. */
  cancelQueuedMessage: (queueItemId: string) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Explicitly discard a queued internal continuation. */
  discardQueuedContinuation: (
    queueItemId: string,
  ) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Edit a queued message item. */
  editQueuedMessage: (
    queueItemId: string,
    content: string,
  ) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** List async runtime tasks owned by the shared task plane. */
  listTasks: (status?: TaskStatus) => Promise<readonly Task[]>;
  /** Refresh shared metadata at a TUI command/session boundary. */
  refreshSharedMetadataAtBoundary: () => Promise<void>;
  /** Validate and apply LLM parameter config. */
  validateLlmConfig: (config: AgentLlmConfig) => TuiParameterValidationResult;
  /** Apply a previously validated LLM parameter config. */
  applyLlmConfig: (result: TuiParameterValidationResult) => void;
  /** Activate a skill by name; returns false if skill not found */
  activateSkill: (name: string, args?: string) => Promise<boolean>;
  /** Deactivate the currently active skill or a scoped lifecycle record. */
  deactivateSkill: (input?: {
    readonly recordId?: string;
    readonly slot?: import('@neko/shared').SkillLifecycleSlot;
    readonly skillName?: string;
  }) => boolean;
  /** Skill service (for slash commands) */
  readonly getSkillService: () => SkillService | undefined;
  /** Tool registry (for slash commands) */
  readonly getToolRegistry: () => ToolRegistry | undefined;
  /** Snapshot MCP server connection state for /mcp. */
  readonly listMcpServers: () => readonly TuiMcpServerSnapshot[];
  /** List registered MCP tool names, optionally for one server. */
  readonly listMcpTools: (serverId?: string) => readonly string[];
  /** Connect an MCP server and register its tools. */
  readonly connectMcpServer: (serverId: string) => Promise<void>;
  /** Disconnect an MCP server. */
  readonly disconnectMcpServer: (serverId: string) => Promise<void>;
  /** Reconnect an MCP server and refresh its tools. */
  readonly reconnectMcpServer: (serverId: string) => Promise<void>;
  /** Read TUI capability provider diagnostics. */
  readonly getCapabilityProviderSummaries: TuiCapabilityPorts['getProviderSummaries'];
  /** Read TUI capability availability diagnostics. */
  readonly getCapabilityDiagnostics: TuiCapabilityPorts['getDiagnostics'];
  /** List TUI capability tools, optionally scoped by provider id. */
  readonly listCapabilityTools: TuiCapabilityPorts['listTools'];
  /** Terminal-safe `@` reference contributors loaded from capability providers. */
  readonly getReferenceContributors: () => TuiCapabilityLoaderResult['referenceContributors'];
  /** Query portable search projections shared with the Extension Host. */
  readonly querySearchDocuments: (
    query: string,
    limit: number,
  ) => Promise<readonly SearchDocumentRecord[]>;
  /** Shared resume-layer conversation storage for command handlers. */
  readonly getConversationStorage: () => ConversationResumeStorage | undefined;
  /** Current conversation id bound to the Agent session journal. */
  readonly getCurrentConversationId: () => string;
  /** Load a persisted conversation into the current Agent session. */
  readonly resumeConversation: (record: ConversationRecord) => Promise<void>;
  /** Current Agent history for history commands. */
  readonly getHistory: () => ChatMessage[];
  /** Secret-free persistence path evidence for Host diagnostics and debug automation. */
  readonly getConversationPersistenceSnapshot: () => TuiConversationPersistenceSnapshot | null;
  /** Secret-free prompt composition facts from the canonical AgentSession composer. */
  readonly getPromptCompositionProjection: () => readonly PromptCompositionFragmentProjection[];
  /** Flush the current TUI runtime projection into shared workspace state. */
  readonly syncRuntimeState: () => void;
  /** Slash command catalog for TUI autocomplete */
  readonly slashCommands: readonly TuiSlashCommandOption[];
  /** Whether session is initialized */
  readonly isReady: boolean;
}

/**
 * Hook that manages the full AgentSession lifecycle.
 *
 * Initialization:
 * 1. Create MCPManager + ToolRegistry
 * 2. Load skills
 * 3. Create LLM service adapter
 * 4. Build system prompt
 * 5. Create AgentSession
 *
 * On submit:
 * 1. Process input (file references)
 * 2. Execute session → iterate AgentEvent stream
 * 3. Route events through EventAdapter → stores
 */
function presentQueueFailure(
  error: unknown,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const projection = presentQueueCommand(toQueueOperationDiagnostic(error), presentation);
  if (projection.kind !== 'error') {
    throw new Error('Queue operation failure must project to a terminal diagnostic.');
  }
  return projection.error;
}

function presentQueueOutput(
  result: Parameters<typeof presentQueueCommand>[0],
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  const projection = presentQueueCommand(result, presentation);
  if (projection.kind !== 'output') {
    throw new Error('Queue success must project to terminal output.');
  }
  return projection.output;
}

export function useAgentSession(options: UseAgentSessionOptions): AgentSessionHandle {
  const {
    config,
    service,
    taskManager: providedTaskManager,
    capabilityProviders,
    resumeConversationId,
    presentation,
    promptLocale,
  } = options;
  const applicationRuntime = useTuiApplicationRuntime();
  const conversationRuntime = useTuiConversationRuntime();
  const stores = useTuiConversationStores();
  const initialConversationId = conversationRuntime.conversationId;
  if (!initialConversationId) {
    throw new Error('TUI conversation runtime must be bound before session initialization.');
  }
  const uiLocale = presentation.uiLocale;
  const promptDomainLocale = promptLocale === 'zh-cn' ? 'zh' : 'en';
  const sessionRef = useRef<IAgentSession | null>(null);
  const adapterRef = useRef<IEventAdapter | null>(null);
  const inputProcessorRef = useRef<InputProcessor | null>(null);
  const mcpManagerRef = useRef<MCPManager | null>(null);
  const platformRef = useRef<Platform | null>(null);
  const promptBuilderRef = useRef<SystemPromptBuilder | null>(null);
  const skillServiceRef = useRef<ReturnType<typeof createSkillService> | null>(null);
  const skillLifecycleRuntimeRef = useRef<SkillLifecycleRuntime | null>(null);
  const skillLifecycleBridgeRef = useRef<CliSkillLifecycleSessionBridge | null>(null);
  const toolRegistryRef = useRef<ToolRegistry | null>(null);
  const taskManagerRef = useRef<IRuntimeTaskManager | null>(null);
  const streamRuntimeRef = useRef(
    new AgentEventStreamRuntimeProcessor<MediaTask, MediaTaskProgressDeliveryPlan>(),
  );
  const taskResultObservationRuntimeRef = useRef<AgentTaskResultObservationRuntime | null>(null);
  const mediaDeliveryHostRef = useRef<NodeMediaTaskDeliveryHost | null>(null);
  const generatedAssetIndexRef = useRef<GeneratedAssetIndex | null>(null);
  const taskTerminalUnsubscribeRef = useRef<(() => void) | null>(null);
  const stageGuardianUnsubscribeRef = useRef<(() => void) | null>(null);
  const capabilityLoadResultRef = useRef<TuiCapabilityLoaderResult | null>(null);
  const conversationStorageRef = useRef<ConversationResumeStorage | null>(null);
  const conversationStorageBindingRef = useRef<TuiSqliteConversationStorageBinding | null>(null);
  const conversationPersistenceSnapshotRef = useRef<TuiConversationPersistenceSnapshot | null>(
    null,
  );
  const workspaceRuntimeStateRef = useRef<AgentWorkspaceRuntimeStateRuntime | null>(null);
  const runtimeConfigRef = useRef<ReturnType<typeof createCliAgentRuntime> | null>(null);
  const conversationIdRef = useRef(initialConversationId);
  const conversationCreatedAtRef = useRef(Date.now());
  const conversationTitleRef = useRef('');
  const runtimeSessionRef = useRef<AgentRuntimeSessionHandle | null>(null);
  const submitRef = useRef<AgentSessionHandle['submit'] | null>(null);
  const submitInternalContinuationRef = useRef<
    ((input: SubmitInternalContinuationInput) => Promise<void>) | null
  >(null);
  const workspaceRuntimeStateErrorRef = useRef<string | null>(null);
  const taskSummaryErrorRef = useRef<string | null>(null);
  const isReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [slashCommands, setSlashCommands] = useState<readonly TuiSlashCommandOption[]>(
    createTuiSlashCommandCatalog(undefined, presentation),
  );
  const [, setSkillCatalogVersion] = useState(0);

  const reportWorkspaceRuntimeStateError = useCallback((error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    if (workspaceRuntimeStateErrorRef.current === message) {
      return;
    }
    workspaceRuntimeStateErrorRef.current = message;
    stores.conversation
      .getState()
      .addError(new Error(presentWorkspaceRuntimeStateFailure(message, presentation)));
  }, []);

  const requireGeneratedAssetIndex = useCallback(
    async (
      workDir: string,
      manifestStore: ResourceCacheManifestStore,
    ): Promise<GeneratedAssetIndex> => {
      if (!generatedAssetIndexRef.current) {
        const binding = await createResourceCacheGeneratedAssetIndex({
          manifestStore,
          workspaceRoot: workDir,
          homedir: options.localMetadataHome ?? os.homedir(),
        });
        generatedAssetIndexRef.current = binding.index;
        if (binding.migrationReport.sourceStatus === 'quarantined') {
          stores.conversation
            .getState()
            .addError(
              new Error(
                `Generated asset index was quarantined: ${binding.migrationReport.sourceDiagnostic ?? 'invalid legacy index'}`,
              ),
            );
        }
      }
      return generatedAssetIndexRef.current;
    },
    [options.localMetadataHome],
  );

  const refreshTaskSummary = useCallback(async (): Promise<void> => {
    const taskManager = taskManagerRef.current;
    if (!taskManager) {
      stores.agent.getState().setRunningTasks([]);
      return;
    }

    try {
      const tasks = await taskManager.list();
      taskSummaryErrorRef.current = null;
      stores.agent.getState().setRunningTasks(selectRunningTasks(tasks));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (taskSummaryErrorRef.current !== message) {
        taskSummaryErrorRef.current = message;
        stores.conversation
          .getState()
          .addError(new Error(presentTaskStatusRefreshFailure(message, presentation)));
      }
      stores.agent.getState().setRunningTasks([]);
    }
  }, []);

  const syncWorkspaceRuntimeState = useCallback(
    (
      input: {
        readonly status?: AgentWorkspaceRuntimeStatus;
        readonly phase?: AgentPhase;
        readonly toolName?: string;
        readonly contextTokenCount?: number | null;
        readonly errorMessage?: string | null;
      } = {},
    ): void => {
      const contextTokenCount =
        input.contextTokenCount !== undefined
          ? input.contextTokenCount
          : (sessionRef.current?.getTokenCount() ?? null);
      stores.agent.getState().setContextTokenCount(contextTokenCount);

      const runtime = workspaceRuntimeStateRef.current;
      if (!runtime) {
        return;
      }

      const agentState = stores.agent.getState();
      const currentConfig = stores.config.getState().config;
      const queueSnapshot = agentState.messageQueue.snapshot;
      const capabilitySnapshot = capabilityLoadResultRef.current;
      const mediaModels = currentConfig.defaultMediaModels ?? {};
      const errorMessage =
        input.errorMessage !== undefined ? input.errorMessage : agentState.error?.message;

      const conversation: AgentWorkspaceRuntimeStatePatch['conversation'] = {
        conversationId: conversationIdRef.current,
        status: input.status ?? agentState.status,
        executionMode: agentState.executionMode,
        sessionMode: agentState.sessionMode,
        tokenUsage: agentState.usage,
        chatModel: {
          providerId: currentConfig.chatModel?.providerId ?? currentConfig.provider,
          modelId: currentConfig.chatModel?.modelId ?? currentConfig.model,
          ...(currentConfig.chatModel?.providerExpressionProfileId
            ? { providerExpressionProfileId: currentConfig.chatModel.providerExpressionProfileId }
            : {}),
        },
        ...(input.phase ? { phase: input.phase } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(contextTokenCount !== null ? { contextTokenCount } : {}),
        ...(queueSnapshot ? { messageQueue: queueSnapshot } : {}),
        ...(Object.keys(mediaModels).length > 0 ? { mediaModels } : {}),
        ...(agentState.activeSkillLifecycleRecords.length > 0
          ? { activeSkills: agentState.activeSkillLifecycleRecords }
          : {}),
        ...(capabilitySnapshot ? { capabilityProviders: capabilitySnapshot.providers } : {}),
        ...(capabilitySnapshot ? { capabilityDiagnostics: capabilitySnapshot.diagnostics } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      };

      void runtime
        .patch({
          activeConversationId: conversationIdRef.current,
          conversation,
        })
        .then(() => {
          workspaceRuntimeStateErrorRef.current = null;
        })
        .catch(reportWorkspaceRuntimeStateError);
    },
    [reportWorkspaceRuntimeStateError],
  );

  const persistCurrentConversation = useCallback(async (): Promise<void> => {
    const storage = conversationStorageRef.current;
    const session = sessionRef.current;
    if (!storage || !session) {
      return;
    }

    const messages = session.getHistory();
    if (messages.length === 0) {
      return;
    }

    const currentConfig = stores.config.getState().config;
    const title = conversationTitleRef.current || deriveConversationTitle(messages) || 'New Chat';
    conversationTitleRef.current = title;
    const mediaModelSelection = currentConfig.defaultMediaModels;
    const record: ConversationRecord = {
      id: conversationIdRef.current,
      version: 1,
      title,
      workDir: currentConfig.workDir,
      messages,
      createdAt: conversationCreatedAtRef.current,
      updatedAt: Date.now(),
      source: 'tui',
      chatModelSelection: {
        providerId: currentConfig.chatModel?.providerId ?? currentConfig.provider,
        modelId: currentConfig.chatModel?.modelId ?? currentConfig.model,
      },
      ...(mediaModelSelection && Object.keys(mediaModelSelection).length > 0
        ? { mediaModelSelection }
        : {}),
    };

    await storage.save(record);
    await storage.flush();
  }, []);

  const resumeConversation = useCallback(
    async (record: ConversationRecord): Promise<void> => {
      const targetRuntime =
        applicationRuntime.findConversation(record.id) ??
        applicationRuntime.createConversation({
          conversationId: record.id,
          config: stores.config.getState().config,
          activate: false,
        });
      applicationRuntime.activateRuntime(targetRuntime.runtimeId);
    },
    [applicationRuntime, stores],
  );

  // Initialize session on mount
  useEffect(() => {
    let disposed = false;
    let streamDisposed = false;
    const disposeResources = (projectState: boolean): void => {
      taskTerminalUnsubscribeRef.current?.();
      taskTerminalUnsubscribeRef.current = null;
      stageGuardianUnsubscribeRef.current?.();
      stageGuardianUnsubscribeRef.current = null;
      taskResultObservationRuntimeRef.current?.dispose();
      taskResultObservationRuntimeRef.current = null;
      mediaDeliveryHostRef.current?.dispose();
      mediaDeliveryHostRef.current = null;
      generatedAssetIndexRef.current?.dispose();
      generatedAssetIndexRef.current = null;
      if (!streamDisposed) {
        streamRuntimeRef.current.dispose();
        streamDisposed = true;
      }
      taskManagerRef.current = null;
      if (projectState) {
        stores.agent.getState().setRunningTasks([]);
      }
      runtimeSessionRef.current?.messageQueue.clear();
      runtimeSessionRef.current = null;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      platformRef.current?.dispose();
      platformRef.current = null;
      const conversationStorageBinding = conversationStorageBindingRef.current;
      conversationStorageBindingRef.current = null;
      conversationStorageRef.current = null;
      conversationPersistenceSnapshotRef.current = null;
      void conversationStorageBinding?.dispose().catch(() => undefined);
      const mcpManager = mcpManagerRef.current;
      mcpManagerRef.current = null;
      void mcpManager?.disconnectAll().catch(() => undefined);
    };
    const init = async () => {
      try {
        isReadyRef.current = false;
        setIsReady(false);
        setCapabilityRevision((revision) => revision + 1);
        const effectiveModel = config.model;

        // 1. MCP Manager
        const mcpManager = new MCPManager();
        mcpManagerRef.current = mcpManager;
        for (const serverConfig of config.mcpServers) {
          mcpManager.register(serverConfig);
        }
        if (config.mcpServers.length > 0) {
          await mcpManager.connectAll();
        }

        // 2. Tool Registry
        const toolRegistry = new ToolRegistry();
        toolRegistryRef.current = toolRegistry;
        const mcpTools = await createAllMCPTools(
          mcpManager,
          createMcpToolCreationOptionsForExternalResearch(config.externalResearch),
        );
        toolRegistry.registerMany(mcpTools);

        const contentPolicy = createNodeWorkspaceContentPolicy({ workDir: config.workDir });
        const memoryFilePath = path.join(config.workDir, '.neko', 'memory.md');
        const localMetadataHome = options.localMetadataHome ?? os.homedir();
        const conversationStorageBinding = options.createConversationStorage
          ? await options.createConversationStorage(localMetadataHome, config.workDir)
          : await createTuiSqliteConversationStorage({
              homedir: localMetadataHome,
              workDir: config.workDir,
            });
        conversationStorageBindingRef.current = conversationStorageBinding;
        conversationStorageRef.current = conversationStorageBinding.storage;
        conversationPersistenceSnapshotRef.current = {
          ...conversationStorageBinding.persistenceBackend,
          resume: { status: 'new', restoredMessageCount: 0 },
        };
        const generatedAssetIndex = await requireGeneratedAssetIndex(
          config.workDir,
          conversationStorageBinding.resourceCacheManifestStore,
        );
        const resourceCacheGcResults = await runNodeResourceCacheStartupGc({
          workDir: config.workDir,
          manifestStore: conversationStorageBinding.resourceCacheManifestStore,
        });
        for (const result of resourceCacheGcResults) {
          if (result.error) {
            const message =
              result.error instanceof Error ? result.error.message : String(result.error);
            stores.conversation
              .getState()
              .addError(new Error(presentResourceCacheGcFailure(message, presentation)));
          }
        }
        workspaceRuntimeStateRef.current = createFileAgentWorkspaceRuntimeStateRuntime({
          workDir: config.workDir,
          source: 'tui',
        });
        conversationCreatedAtRef.current = Date.now();
        conversationTitleRef.current = '';
        const explicitResumeId = resumeConversationId?.trim();
        const requestedResumeId = explicitResumeId ?? initialConversationId;
        let resumeRecord: ConversationRecord | undefined;
        if (requestedResumeId) {
          const canonicalResumeId = assertCanonicalTuiConversationId(requestedResumeId);
          resumeRecord = await conversationStorageRef.current.load(canonicalResumeId);
          if (resumeRecord) {
            conversationIdRef.current = resumeRecord.id;
            conversationCreatedAtRef.current = resumeRecord.createdAt;
            conversationTitleRef.current = resumeRecord.title;
            conversationPersistenceSnapshotRef.current = {
              ...conversationStorageBinding.persistenceBackend,
              resume: {
                status: 'restored',
                requestedConversationId: canonicalResumeId,
                restoredConversationId: resumeRecord.id,
                recordSource: resumeRecord.source,
                restoredMessageCount: resumeRecord.messages.length,
              },
            };
          } else if (explicitResumeId) {
            conversationPersistenceSnapshotRef.current = {
              ...conversationStorageBinding.persistenceBackend,
              resume: {
                status: 'not-found',
                requestedConversationId: canonicalResumeId,
                restoredMessageCount: 0,
              },
            };
            stores.conversation
              .getState()
              .addSystemMessage(presentResumeFallback(requestedResumeId, presentation));
          }
        }

        const toolGroupRegistry = createCliToolGroupRegistry();
        const providerCardRegistry = new ProviderCardRegistry();
        const profileRegistries = createAgentCapabilityRuntimeRegistries();

        // 3. Skills
        const skillLoader = createNodeSkillLoader(fs, path);
        const skillService = createSkillService();
        skillServiceRef.current = skillService;
        const sessionSkillRuntime = createTuiSessionSkillRuntime({
          skillLoader,
          config,
          locale: promptDomainLocale,
        });
        const loadedSkills = await sessionSkillRuntime.scanSkills();
        for (const skill of loadedSkills) {
          skillService.registry.registerSkill(skill);
        }
        setSlashCommands(createTuiSlashCommandCatalog(loadedSkills, presentation));
        setSkillCatalogVersion((version) => version + 1);

        const skillLifecycleRuntime = ensureHookSkillLifecycleRuntime(
          skillService,
          skillLifecycleRuntimeRef,
        );
        const capabilityLoader = createTuiCapabilityLoader({
          toolRegistry,
          skillRegistry: skillService.registry,
          toolGroupRegistry,
          providerCardRegistry,
          artifactProfileRegistry: profileRegistries.artifactProfileRegistry,
          creationProfileRegistry: profileRegistries.creationProfileRegistry,
          providerExpressionProfileRegistry: profileRegistries.providerExpressionProfileRegistry,
          locale: promptDomainLocale,
        });
        const capabilityLoadResult = capabilityLoader.registerProviders([
          ...withTuiDefaultCapabilityProviders({
            workDir: config.workDir,
            resourceCacheManifestStore: conversationStorageBinding.resourceCacheManifestStore,
            generatedAssetIndex,
            capabilityProviders,
          }),
          createExternalResearchCapabilityProviderFromMcpConfig({
            config: config.externalResearch,
            mcpManager,
          }),
        ]);
        capabilityLoadResultRef.current = capabilityLoadResult;
        setCapabilityRevision((revision) => revision + 1);

        // 4. LLM Service — use Platform for multi-provider routing
        let llmService: IService;
        let perceptionPipeline: AgentSessionConfig['perceptionPipeline'];
        const taskManager =
          providedTaskManager ??
          createCLITaskManager({
            taskStorage: conversationStorageBinding.taskStorage,
            taskRecoveryStorage: conversationStorageBinding.taskRecoveryStorage,
          });
        await taskManager.initialize();
        taskManagerRef.current = taskManager;
        taskTerminalUnsubscribeRef.current?.();
        taskTerminalUnsubscribeRef.current = taskManager.onTerminalTask(
          () => {
            void refreshTaskSummary();
          },
          { replayExisting: false },
        );
        if (service) {
          // Extension mode: use injected service directly
          llmService = service;
        } else {
          // Standalone CLI mode: create Platform with media generation support
          const cliPlatform = createCLIPlatform({
            workspacePath: config.workDir,
            toolRegistry,
            taskManager,
            providerCardRegistry,
            generatedAssetIndex,
            resourceCacheManifestStore: conversationStorageBinding.resourceCacheManifestStore,
          });
          platformRef.current = cliPlatform.platform;
          llmService = cliPlatform.service;
          perceptionPipeline = createNodePerceptionPipeline({
            platform: cliPlatform.platform,
            service: cliPlatform.service,
            assetLoader: cliPlatform.perceptionAssetLoader,
            workspaceRoot: config.workDir,
            assetIndex: generatedAssetIndex,
          });
        }

        // 5. System Prompt
        const executionMode = stores.agent.getState().executionMode;
        const basePromptBuilder = createSystemPromptBuilder({
          locale: promptDomainLocale,
          mode: executionMode === 'plan' ? 'plan' : 'default',
        });
        const systemPrompt = buildSystemPromptWithContext(basePromptBuilder, {
          ...config,
          model: effectiveModel,
        });
        const runtimeConfig = createCliAgentRuntime({
          workspaceRoot: config.workDir,
          taskManager,
          ...(skillService ? { skillService } : {}),
          ...(skillLifecycleRuntime ? { skillLifecycleRuntime } : {}),
          toolGroupRegistry,
          providerCardRegistry,
          artifactProfileRegistry: profileRegistries.artifactProfileRegistry,
          creationProfileRegistry: profileRegistries.creationProfileRegistry,
          providerExpressionProfileRegistry: profileRegistries.providerExpressionProfileRegistry,
          promptFragments: capabilityLoadResult.promptFragments,
        });
        runtimeConfigRef.current = runtimeConfig;
        // 6. Create Session (with validated model)
        const sessionAssembly = buildAgentWorkspaceRuntimeSessionAssemblyInput({
          surface: 'tui',
          effectiveConfig: {
            providerId: config.chatModel?.providerId ?? config.provider,
            modelId: effectiveModel,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            thinkingBudget: config.thinkingBudget,
            executionMode,
            ...(config.chatModel?.capabilities
              ? { modelCapabilities: config.chatModel.capabilities }
              : {}),
          },
          createService: () => llmService,
          toolRegistry,
          systemPrompt,
          workspaceRoot: config.workDir,
          authorizedReadRoots: contentPolicy.authorizedReadRoots,
          contextSettings: config.contextSettings,
          promptLocale,
          maxIterations: 50,
          taskManager,
          conversationId: conversationIdRef.current,
          capabilityRuntime: runtimeConfig.capabilityRuntime,
          getCapabilityPromptFragments: () => capabilityLoadResult.promptFragments,
          creationGuidance: runtimeConfig.creationGuidance,
          artifactStore: runtimeConfig.artifactStore,
          validationLoop: runtimeConfig.validationLoop,
          ...(perceptionPipeline ? { getPerceptionPipeline: () => perceptionPipeline } : {}),
          projectMemoryFilePath: memoryFilePath,
          onConfirmTool: async (request) => {
            // Show approval UI and wait for user decision
            return new Promise<boolean>((resolve) => {
              stores.ui.getState().showToolApproval({
                toolCallId: request.toolCall.id,
                toolName: request.toolCall.name,
                arguments: request.toolCall.arguments,
                resolve,
              });
            });
          },
        });
        const runtimeSession = await createAgentRuntimeSession(
          buildAgentRuntimeSessionFactoryConfig(sessionAssembly),
        );
        const session = runtimeSession.session;
        runtimeSessionRef.current = runtimeSession;
        promptBuilderRef.current = runtimeSession.promptBuilder;

        sessionRef.current = session;
        stageGuardianUnsubscribeRef.current?.();
        stageGuardianUnsubscribeRef.current = session.onStageGuardianIssue((issue) => {
          stores.conversation
            .getState()
            .addSystemMessage(presentStageGuardianIssue(issue, presentation));
        });
        if (resumeRecord) {
          session.loadHistory(resumeRecord.messages, resumeRecord.messageEventIds);
          stores.conversation
            .getState()
            .replaceMessages(projectAgentHistoryToTuiMessages(resumeRecord.messages));
        }
        const messageQueue = runtimeSession.messageQueue.require();
        stores.agent.getState().setMessageQueuePausedAfterCancel(false);
        stores.agent.getState().setMessageQueueSnapshot(messageQueue.snapshot());
        mediaDeliveryHostRef.current?.dispose();
        const mediaDeliveryHost = new NodeMediaTaskDeliveryHost({
          ...(platformRef.current ? { platform: platformRef.current } : {}),
          workspaceRoot: config.workDir,
          assetIndex: generatedAssetIndex,
        });
        mediaDeliveryHostRef.current = mediaDeliveryHost;
        taskResultObservationRuntimeRef.current?.dispose();
        taskResultObservationRuntimeRef.current = createAgentTaskResultObservationRuntime({
          tasks: taskManager,
          subscribeToTaskManagerTerminalTasks: false,
          agents: {
            get: (conversationId) =>
              conversationId === conversationIdRef.current
                ? {
                    recordTaskResultObservation: (input) =>
                      session.recordTaskResultObservation(input),
                    enqueuePendingMessage: (input) => {
                      const runtimeSession = runtimeSessionRef.current;
                      if (!runtimeSession) {
                        throw new Error('Agent runtime session is not initialized');
                      }
                      const queue = runtimeSession.messageQueue.require();
                      if (queue.conversationId !== input.conversationId) {
                        throw new Error(
                          `Task-result continuation conversation mismatch: expected ${queue.conversationId}, received ${input.conversationId}`,
                        );
                      }
                      const item = queue.enqueue({
                        content: input.content,
                        source: input.source,
                        displayKind: input.displayKind,
                        metadata: input.metadata,
                      });
                      const snapshot = queue.snapshot();
                      stores.agent.getState().setMessageQueueSnapshot(snapshot);
                      syncWorkspaceRuntimeState({ status: 'running' });
                      adapterRef.current?.handleEvent({
                        type: 'messageQueued',
                        content: presentQueueOutput(
                          { kind: 'enqueued', pendingCount: snapshot.pendingCount },
                          presentation,
                        ),
                        pendingCount: snapshot.pendingCount,
                        queuedMessageItem: item,
                        messageQueueSnapshot: snapshot,
                      });
                      return item;
                    },
                  }
                : undefined,
            isRunning: (conversationId) =>
              conversationId === conversationIdRef.current &&
              (session.isRunning() || stores.agent.getState().status === 'running'),
          },
          continuation: {
            requestUserContinuation: (request) => {
              stores.conversation
                .getState()
                .addSystemMessage(presentTaskResultContinuation(request.prompt, presentation));
            },
            dispatchIdleAgentTurn: async (request) => {
              const submitInternalContinuation = submitInternalContinuationRef.current;
              if (!submitInternalContinuation) {
                throw new Error('TUI submit port is not initialized for task-result follow-up');
              }
              await submitInternalContinuation({
                prompt: request.prompt,
                source: 'task-result-continuation',
                displayKind: 'task-continuation',
                metadata: {
                  observationId: request.observationId,
                  taskId: request.taskId,
                  runId: request.runId,
                  status: 'queued',
                  policy: request.policy.kind,
                },
              });
            },
          },
          onDiagnostic: (diagnostic) => {
            stores.conversation
              .getState()
              .addError(
                new Error(presentTaskResultObservationDiagnostic(diagnostic, presentation)),
              );
          },
        });
        void refreshTaskSummary();
        void syncWorkspaceRuntimeState({
          status: 'idle',
          contextTokenCount: session.getTokenCount(),
        });

        // Wire skill provider to meta tools
        if (skillService && skillLifecycleRuntime) {
          skillLifecycleBridgeRef.current = wireCliSkillLifecycleSession({
            session,
            skillService,
            conversationId: conversationIdRef.current,
            lifecycleRuntime: skillLifecycleRuntime,
            createSkill: async (input) => {
              const { created, skills } = await sessionSkillRuntime.createSkill(input);
              for (const skill of skills) {
                skillService.registry.registerSkill(skill);
              }
              setSlashCommands(createTuiSlashCommandCatalog(skills, presentation));
              setSkillCatalogVersion((version) => version + 1);
              return created;
            },
            onProjection: (projection) => {
              stores.agent.getState().setActiveSkillLifecycleRecords(projection.visibleIndicators);
              syncWorkspaceRuntimeState();
            },
          });
        }

        // 7. Input Processor
        inputProcessorRef.current = createInputProcessor({
          workspaceRoot: config.workDir,
          maxFileSize: 1024 * 1024,
          maxFiles: 20,
          includeLineNumbers: true,
          includeLanguageHints: true,
        });

        // 8. Event Adapter
        adapterRef.current = createEventAdapter({
          conversationStore: () => stores.conversation.getState(),
          agentStore: () => stores.agent.getState(),
          uiStore: () => stores.ui.getState(),
          presentation,
        });

        if (disposed) {
          return;
        }
        isReadyRef.current = true;
        setIsReady(true);
      } catch (error) {
        if (disposed) {
          return;
        }
        const localMetadataDiagnostic = projectLocalMetadataUserDiagnostic(error);
        const err =
          error instanceof NodeWorkspaceContentError
            ? new Error(presentWorkspaceContentDiagnostic(error.diagnostic, presentation))
            : error instanceof TuiConversationIdError
              ? new Error(presentTuiConversationIdDiagnostic(error.diagnostic, presentation))
              : localMetadataDiagnostic
                ? new Error(formatLocalMetadataUserDiagnostic(localMetadataDiagnostic), {
                    cause: error,
                  })
                : error instanceof Error
                  ? error
                  : new Error(String(error));
        stores.agent.getState().setError(err);
        stores.conversation.getState().addError(err);
      } finally {
        if (disposed) {
          disposeResources(false);
        }
      }
    };

    initPromiseRef.current = init();

    return () => {
      disposed = true;
      isReadyRef.current = false;
      disposeResources(true);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const executePrompt = useCallback(
    async (prompt: string, options: ExecutePromptOptions = {}): Promise<void> => {
      const session = sessionRef.current;
      const adapter = adapterRef.current;
      const inputProcessor = inputProcessorRef.current;
      if (!session || !adapter) {
        throw new Error('Session not initialized');
      }

      let finalPrompt = prompt;
      if (inputProcessor) {
        const processed = await inputProcessor.process(prompt);
        const referenceDiagnostic = presentReferenceLoadingDiagnostics(
          processed.errors,
          presentation,
        );
        if (referenceDiagnostic) {
          throw new Error(referenceDiagnostic);
        }
        finalPrompt = processed.message;
        if (processed.hasFiles) {
          finalPrompt = `${processed.message}\n\n## Referenced Files\n\n${processed.fileContents}`;
        }
      }

      adapter.reset();
      if (!options.source || options.source === 'user') {
        stores.conversation.getState().addUserMessage(prompt);
      } else {
        stores.conversation.getState().addSystemMessage({
          content: presentContinuationReady(
            options.source,
            options.continuationMetadata,
            presentation,
          ),
          source: options.source,
          displayKind: options.displayKind ?? displayKindForTurnSource(options.source),
          metadata: options.continuationMetadata,
        });
      }
      stores.agent.getState().setRunning();
      if (!conversationTitleRef.current) {
        conversationTitleRef.current = deriveConversationTitle([{ role: 'user', content: prompt }]);
      }
      syncWorkspaceRuntimeState({ status: 'running', phase: 'thinking' });

      const creationMetadata = mergeCreationExecutionMetadata(
        session.getExecutionMode() === 'plan' ? createPlanModeCreationMetadata() : undefined,
        options.metadata,
      );
      const currentConfig = config;
      const metadata = mergeTuiMediaModelMetadata(
        creationMetadata,
        currentConfig.defaultMediaModels,
        currentConfig.chatModel?.providerId ?? currentConfig.provider,
        listChatModelOptions(currentConfig.workDir),
        currentConfig.perceptionModels,
      );

      let finalUsage: AgentUsageSnapshot | undefined;
      const events = observeTuiSessionEvents(
        session.execute(finalPrompt, {
          workspaceRoot: stores.config.getState().config.workDir,
          ...(metadata ? { metadata } : {}),
        }),
        {
          onEvent: (event) => {
            handleTuiRuntimeSideEffectEvent(event, presentation, stores);
            syncWorkspaceRuntimeState(projectRuntimeStateFromEvent(event, session));
            if (event.type === 'done') {
              finalUsage = event.usage;
            }
            if (shouldRefreshTaskSummaryFromEvent(event)) {
              void refreshTaskSummary();
            }
          },
        },
      );
      const backgroundTasks =
        mediaDeliveryHostRef.current && taskResultObservationRuntimeRef.current
          ? createTuiMediaBackgroundTasks({
              ...(platformRef.current ? { platform: platformRef.current } : {}),
              deliveryHost: mediaDeliveryHostRef.current,
              taskResultObservations: taskResultObservationRuntimeRef.current,
              persistResultUrls: ({ toolCallId, taskId, urls, deliveryPlan }) => {
                if (!toolCallId || urls.length === 0) return;
                const backfill = createGeneratedMediaToolResultBackfill({
                  toolCallId,
                  taskId,
                  urls,
                  timestamp: Date.now(),
                  deliveryPlan,
                });
                void session.patchToolResult(backfill).catch((error: unknown) => {
                  stores.conversation
                    .getState()
                    .addError(new Error(presentMediaResultPersistenceFailure(error, presentation)));
                });
              },
              onTaskProgress: () => {
                void refreshTaskSummary();
              },
              onDiagnostic: (diagnostic) => {
                stores.conversation
                  .getState()
                  .addError(new Error(presentMediaBackgroundDiagnostic(diagnostic, presentation)));
              },
            })
          : undefined;
      await streamRuntimeRef.current.process({
        conversationId: conversationIdRef.current,
        events,
        postMessage: (message) => {
          if (isTerminalTimelineMessage(message)) {
            adapter.handleMessage(message);
          }
        },
        onPhaseChange: (phase, toolName) => {
          syncWorkspaceRuntimeState({
            status: 'running',
            phase,
            ...(toolName ? { toolName } : {}),
          });
        },
        ...(backgroundTasks ? { backgroundTasks } : {}),
      });
      stores.agent.getState().setIdle();
      if (finalUsage) {
        stores.agent.getState().updateUsage(finalUsage);
      }
      await persistCurrentConversation();
      void refreshTaskSummary();
      syncWorkspaceRuntimeState({
        status: stores.agent.getState().status,
        phase: 'idle',
        contextTokenCount: session.getTokenCount(),
      });
    },
    [persistCurrentConversation, refreshTaskSummary, syncWorkspaceRuntimeState],
  );

  const requireRuntimeMessageQueue = useCallback((): AgentConversationMessageQueue => {
    const runtimeSession = runtimeSessionRef.current;
    if (!runtimeSession) {
      throw new Error('Agent runtime session is not initialized');
    }
    return runtimeSession.messageQueue.require();
  }, []);

  const projectRuntimeMessageQueue = useCallback((queue: AgentConversationMessageQueue): void => {
    stores.agent.getState().setMessageQueuePausedAfterCancel(queue.isPausedAfterActiveTurnCancel());
    stores.agent.getState().setMessageQueueSnapshot(queue.snapshot());
  }, []);

  const releaseRuntimeQueuedPrompts = useCallback(async (): Promise<void> => {
    const queue = requireRuntimeMessageQueue();
    const adapter = adapterRef.current;
    if (!adapter) {
      throw new Error('Session event adapter is not initialized');
    }

    await queue.drain(async (released) => {
      const snapshot = queue.snapshot();
      projectRuntimeMessageQueue(queue);
      syncWorkspaceRuntimeState({ status: 'running' });
      adapter.handleEvent({
        type: 'messageQueued',
        pendingCount: snapshot.pendingCount,
        releasedQueuedMessageItem: released,
        messageQueueSnapshot: snapshot,
      } satisfies AgentEvent);
      await executePrompt(released.content, {
        source: normalizeTurnSource(released.source),
        displayKind: released.displayKind,
        ...(released.metadata ? { continuationMetadata: released.metadata } : {}),
        ...(released.metadata ? { metadata: { continuation: released.metadata } } : {}),
      });
    });
    projectRuntimeMessageQueue(queue);
    syncWorkspaceRuntimeState();
  }, [
    executePrompt,
    projectRuntimeMessageQueue,
    requireRuntimeMessageQueue,
    syncWorkspaceRuntimeState,
  ]);

  const submit = useCallback(
    async (prompt: string, executionOverrides?: { metadata?: Record<string, unknown> }) => {
      if (initPromiseRef.current) {
        await initPromiseRef.current;
      }

      const session = sessionRef.current;
      const adapter = adapterRef.current;

      if (!session || !adapter) {
        stores.agent.getState().setError(new Error('Session not initialized'));
        return;
      }

      if (session.isRunning() || stores.agent.getState().status === 'running') {
        try {
          const queue = requireRuntimeMessageQueue();
          if (executionOverrides?.metadata && Object.keys(executionOverrides.metadata).length > 0) {
            throw new AgentMessageQueueOperationError(
              'not-queueable',
              'Prompts with execution metadata cannot be queued while an Agent turn is running.',
            );
          }
          const item = queue.enqueue({
            content: prompt,
            source: 'user',
            displayKind: 'user-message',
          });
          const snapshot = queue.snapshot();
          projectRuntimeMessageQueue(queue);
          syncWorkspaceRuntimeState({ status: 'running' });
          adapter.handleEvent({
            type: 'messageQueued',
            content: presentQueueOutput(
              { kind: 'enqueued', pendingCount: snapshot.pendingCount },
              presentation,
            ),
            pendingCount: snapshot.pendingCount,
            queuedMessageItem: item,
            messageQueueSnapshot: snapshot,
          });
        } catch (error) {
          const message = presentQueueFailure(error, presentation);
          stores.agent.getState().setMessageQueueDiagnostic(message);
          stores.conversation.getState().addError(new Error(message));
        }
        return;
      }

      try {
        await executePrompt(prompt, { metadata: executionOverrides?.metadata, source: 'user' });
        await releaseRuntimeQueuedPrompts();

        if (stores.agent.getState().executionMode === 'plan') {
          stores.ui.getState().showPlanReview();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        stores.agent.getState().setError(err);
        stores.conversation.getState().addError(err);
        void refreshTaskSummary();
        syncWorkspaceRuntimeState({ status: 'error', phase: 'idle', errorMessage: err.message });
      }
    },
    [
      executePrompt,
      projectRuntimeMessageQueue,
      refreshTaskSummary,
      releaseRuntimeQueuedPrompts,
      requireRuntimeMessageQueue,
      syncWorkspaceRuntimeState,
    ],
  );

  const submitInternalContinuation = useCallback(
    async (input: SubmitInternalContinuationInput): Promise<void> => {
      if (initPromiseRef.current) {
        await initPromiseRef.current;
      }

      const session = sessionRef.current;
      const adapter = adapterRef.current;
      if (!session || !adapter) {
        throw new Error('Session not initialized');
      }

      const displayKind = input.displayKind ?? displayKindForTurnSource(input.source);
      const continuationMetadata: AgentContinuationMetadata = {
        ...input.metadata,
        status: input.metadata?.status ?? 'queued',
      };

      if (session.isRunning() || stores.agent.getState().status === 'running') {
        const queue = requireRuntimeMessageQueue();
        const item = queue.enqueue({
          content: input.prompt,
          source: input.source,
          displayKind,
          metadata: continuationMetadata,
        });
        const snapshot = queue.snapshot();
        projectRuntimeMessageQueue(queue);
        syncWorkspaceRuntimeState({ status: 'running' });
        adapter.handleEvent({
          type: 'messageQueued',
          content: presentQueuedContinuation(item, snapshot.pendingCount, presentation),
          pendingCount: snapshot.pendingCount,
          queuedMessageItem: item,
          messageQueueSnapshot: snapshot,
        });
        return;
      }

      try {
        await executePrompt(input.prompt, {
          source: input.source,
          displayKind,
          continuationMetadata,
          metadata: { continuation: continuationMetadata },
        });
        await releaseRuntimeQueuedPrompts();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        stores.agent.getState().setError(err);
        stores.conversation.getState().addError(err);
        void refreshTaskSummary();
        syncWorkspaceRuntimeState({ status: 'error', phase: 'idle', errorMessage: err.message });
      }
    },
    [
      executePrompt,
      projectRuntimeMessageQueue,
      refreshTaskSummary,
      releaseRuntimeQueuedPrompts,
      requireRuntimeMessageQueue,
      syncWorkspaceRuntimeState,
    ],
  );

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    const queue = runtimeSessionRef.current?.messageQueue.current();
    const wasRunning =
      Boolean(session?.isRunning()) || stores.agent.getState().status === 'running';
    session?.cancel();
    if (wasRunning && queue && queue.snapshot().pendingCount > 0) {
      queue.pauseAfterActiveTurnCancel();
      projectRuntimeMessageQueue(queue);
    }
    stores.agent.getState().setIdle();
    void refreshTaskSummary();
    syncWorkspaceRuntimeState({ status: 'idle', phase: 'idle' });
  }, [projectRuntimeMessageQueue, refreshTaskSummary, syncWorkspaceRuntimeState]);

  const getMessageQueueSnapshot = useCallback(() => {
    return runtimeSessionRef.current?.messageQueue.current()?.snapshot() ?? null;
  }, []);

  const refreshSharedMetadataAtBoundary = useCallback(async (): Promise<void> => {
    const binding = conversationStorageBindingRef.current;
    if (!binding) return;
    const result = await binding.pollRevisions();
    if (result.changedDomains.includes('tasks')) {
      const taskManager = taskManagerRef.current;
      if (!taskManager) {
        throw new Error('Task manager is not initialized for shared metadata refresh');
      }
      await taskManager.initialize();
    }
  }, []);

  const listTasks = useCallback(
    async (status?: TaskStatus): Promise<readonly Task[]> => {
      if (initPromiseRef.current) {
        await initPromiseRef.current;
      }
      const taskManager = taskManagerRef.current;
      if (!taskManager) {
        throw new Error('Task manager is not initialized');
      }
      await refreshSharedMetadataAtBoundary();
      const tasks = await taskManager.list(status);
      void refreshTaskSummary();
      return tasks;
    },
    [refreshSharedMetadataAtBoundary, refreshTaskSummary],
  );

  const resumeQueuedMessages = useCallback(async (): Promise<void> => {
    const queue = requireRuntimeMessageQueue();
    queue.resume();
    projectRuntimeMessageQueue(queue);
    if (queue.snapshot().pendingCount === 0) {
      return;
    }
    try {
      await releaseRuntimeQueuedPrompts();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      stores.agent.getState().setError(err);
      stores.conversation.getState().addError(err);
      void refreshTaskSummary();
      syncWorkspaceRuntimeState({ status: 'error', phase: 'idle', errorMessage: err.message });
    }
  }, [
    projectRuntimeMessageQueue,
    refreshTaskSummary,
    releaseRuntimeQueuedPrompts,
    requireRuntimeMessageQueue,
    syncWorkspaceRuntimeState,
  ]);

  const promoteQueuedMessage = useCallback(
    (queueItemId: string) => {
      const queue = requireRuntimeMessageQueue();
      const wasPaused = queue.isPausedAfterActiveTurnCancel();
      const item = queue.promote(queueItemId);
      if (wasPaused) {
        queue.resume();
      }
      projectRuntimeMessageQueue(queue);
      syncWorkspaceRuntimeState();
      if (wasPaused) {
        void releaseRuntimeQueuedPrompts();
      }
      return item;
    },
    [
      projectRuntimeMessageQueue,
      releaseRuntimeQueuedPrompts,
      requireRuntimeMessageQueue,
      syncWorkspaceRuntimeState,
    ],
  );

  const cancelQueuedMessage = useCallback(
    (queueItemId: string) => {
      const queue = requireRuntimeMessageQueue();
      const item = queue.remove(queueItemId);
      projectRuntimeMessageQueue(queue);
      syncWorkspaceRuntimeState();
      return item;
    },
    [projectRuntimeMessageQueue, requireRuntimeMessageQueue, syncWorkspaceRuntimeState],
  );

  const discardQueuedContinuation = useCallback(
    (queueItemId: string) => {
      const queue = requireRuntimeMessageQueue();
      const item = queue.discardContinuation(queueItemId);
      projectRuntimeMessageQueue(queue);
      stores.conversation.getState().addSystemMessage({
        content: presentContinuationDiscarded(item.id, presentation),
        source: normalizeTurnSource(item.source),
        displayKind: item.displayKind ?? displayKindForTurnSource(normalizeTurnSource(item.source)),
        metadata: item.metadata,
      });
      syncWorkspaceRuntimeState();
      return item;
    },
    [
      presentation,
      projectRuntimeMessageQueue,
      requireRuntimeMessageQueue,
      syncWorkspaceRuntimeState,
    ],
  );

  const editQueuedMessage = useCallback(
    (queueItemId: string, content: string) => {
      const queue = requireRuntimeMessageQueue();
      const item = queue.edit(queueItemId, content);
      projectRuntimeMessageQueue(queue);
      syncWorkspaceRuntimeState();
      return item;
    },
    [projectRuntimeMessageQueue, requireRuntimeMessageQueue, syncWorkspaceRuntimeState],
  );

  const clearHistory = useCallback(() => {
    sessionRef.current?.clearHistory();
    stores.conversation.getState().clearMessages();
    stores.agent.getState().setContextTokenCount(sessionRef.current?.getTokenCount() ?? null);
    void workspaceRuntimeStateRef.current
      ?.clearConversation(conversationIdRef.current)
      .catch(reportWorkspaceRuntimeStateError);
  }, [reportWorkspaceRuntimeStateError]);

  const confirmTool = useCallback(
    (toolCallId: string, approved: boolean) => {
      sessionRef.current?.confirmTool(toolCallId, approved);
      stores.ui.getState().dismissToolApproval();
      if (approved) {
        stores.agent.getState().setRunning();
        syncWorkspaceRuntimeState({ status: 'running' });
      } else {
        syncWorkspaceRuntimeState({ status: 'idle', phase: 'idle' });
      }
    },
    [presentation, syncWorkspaceRuntimeState],
  );

  const updateModel = useCallback(
    (model: string | TuiModelIdentity) => {
      const identity =
        typeof model === 'string'
          ? { providerId: stores.config.getState().config.provider, modelId: model }
          : model;
      stores.config.getState().setConfig({
        provider: identity.providerId,
        model: identity.modelId,
        chatModel: {
          providerId: identity.providerId,
          modelId: identity.modelId,
          ...(identity.providerExpressionProfileId
            ? { providerExpressionProfileId: identity.providerExpressionProfileId }
            : {}),
          ...(identity.capabilities ? { capabilities: identity.capabilities } : {}),
        },
      });
      // Platform's Service uses ModelSelector which reads from ConfigManager,
      // so we just need to pass the new modelId to the session
      const session = sessionRef.current;
      if (session) {
        session.configure({
          providerId: identity.providerId,
          modelId: identity.modelId,
          modelCapabilities: identity.capabilities,
        });
      }
      syncWorkspaceRuntimeState();
    },
    [syncWorkspaceRuntimeState],
  );

  const validateLlmConfig = useCallback(
    (llmConfig: AgentLlmConfig): TuiParameterValidationResult =>
      projectCliLlmParameters(stores.config.getState().config, llmConfig),
    [],
  );

  const applyLlmConfig = useCallback(
    (result: TuiParameterValidationResult): void => {
      const config = stores.config.getState().config;
      stores.config.getState().setConfig({
        llmConfig: result.config,
        temperature: result.chatOptions?.temperature ?? config.temperature,
        maxTokens: result.chatOptions?.maxTokens ?? config.maxTokens,
        thinkingBudget: result.chatOptions?.thinkingBudget ?? config.thinkingBudget,
      });

      sessionRef.current?.configure({
        temperature: result.chatOptions?.temperature ?? config.temperature,
        topP: result.chatOptions?.topP,
        maxTokens: result.chatOptions?.maxTokens ?? config.maxTokens,
        thinkingBudget: result.chatOptions?.thinkingBudget ?? config.thinkingBudget,
        providerOptions: result.providerOptions,
      });
      syncWorkspaceRuntimeState();
    },
    [syncWorkspaceRuntimeState],
  );

  const activateSkill = useCallback(
    async (name: string, args?: string): Promise<boolean> => {
      const skillService = skillServiceRef.current;
      const session = sessionRef.current;
      if (!skillService || !session) return false;

      const lifecycleRuntime = ensureHookSkillLifecycleRuntime(
        skillService,
        skillLifecycleRuntimeRef,
      );
      const result = await activateCliDomainSkill({
        lifecycleRuntime,
        conversationId: conversationIdRef.current,
        skillName: name,
        ...(args !== undefined ? { args } : {}),
        actor: 'user',
        syncProjection: () =>
          skillLifecycleBridgeRef.current?.syncProjection() ??
          lifecycleRuntime.project(conversationIdRef.current),
      });
      if (!result.ok) {
        stores.conversation
          .getState()
          .addSystemMessage(presentSkillActivationRejected(name, presentation));
        return false;
      }
      syncWorkspaceRuntimeState();
      return true;
    },
    [presentation, syncWorkspaceRuntimeState],
  );

  const deactivateSkill = useCallback(
    (_input?: {
      readonly recordId?: string;
      readonly slot?: import('@neko/shared').SkillLifecycleSlot;
      readonly skillName?: string;
    }): boolean => {
      const skillService = skillServiceRef.current;
      const session = sessionRef.current;
      if (!skillService || !session) return false;
      const lifecycleRuntime = ensureHookSkillLifecycleRuntime(
        skillService,
        skillLifecycleRuntimeRef,
      );
      const result = deactivateCliSkillLifecycle({
        lifecycleRuntime,
        conversationId: conversationIdRef.current,
        actor: 'user',
        target: _input,
        syncProjection: () =>
          skillLifecycleBridgeRef.current?.syncProjection() ??
          lifecycleRuntime.project(conversationIdRef.current),
      });
      if (!result.ok) {
        stores.conversation
          .getState()
          .addSystemMessage(presentSkillDeactivationRejected(presentation));
        return false;
      }
      syncWorkspaceRuntimeState();
      return true;
    },
    [presentation, syncWorkspaceRuntimeState],
  );

  const updateMode = useCallback(
    (mode: ExecutionMode) => {
      const session = sessionRef.current;
      if (!session) return;
      const config = stores.config.getState().config;
      const builder = createSystemPromptBuilder({
        locale: promptDomainLocale,
        mode: mode === 'plan' ? 'plan' : 'default',
      });
      // Reuse previously loaded AGENTS.md via sync rebuild
      if (promptBuilderRef.current) {
        builder.setAgentsContent(
          promptBuilderRef.current.getAgentsContent(),
          promptBuilderRef.current.getAgentsSource(),
        );
      }
      const systemPrompt = buildSystemPromptWithContext(builder, config);
      session.configure({
        systemPrompt,
        locale: promptDomainLocale,
        agentsOverride: builder.buildAgentsOverlay() ?? undefined,
      });
      session.setExecutionMode(mode);
      stores.agent.getState().setExecutionMode(mode);
      syncWorkspaceRuntimeState();
    },
    [promptDomainLocale, syncWorkspaceRuntimeState],
  );

  const getContextTokenCount = useCallback((): number | null => {
    const session = sessionRef.current;
    return session ? session.getTokenCount() : null;
  }, []);

  const compactContext = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      throw new Error('Session not initialized');
    }
    return session.compressContext();
  }, []);

  const listMcpServers = useCallback((): readonly TuiMcpServerSnapshot[] => {
    return createTuiMcpServerSnapshots(mcpManagerRef.current, toolRegistryRef.current);
  }, []);

  const listMcpTools = useCallback((serverId?: string): readonly string[] => {
    return listRegisteredTuiMcpTools(toolRegistryRef.current, serverId);
  }, []);

  const connectMcpServer = useCallback(async (serverId: string): Promise<void> => {
    const manager = mcpManagerRef.current;
    const registry = toolRegistryRef.current;
    if (!manager || !registry) {
      throw new Error('MCP runtime is not initialized');
    }
    await connectTuiMcpServer(manager, registry, serverId);
  }, []);

  const disconnectMcpServer = useCallback(async (serverId: string): Promise<void> => {
    const manager = mcpManagerRef.current;
    const registry = toolRegistryRef.current;
    if (!manager || !registry) {
      throw new Error('MCP runtime is not initialized');
    }
    await disconnectTuiMcpServer(manager, registry, serverId);
  }, []);

  const reconnectMcpServer = useCallback(async (serverId: string): Promise<void> => {
    const manager = mcpManagerRef.current;
    const registry = toolRegistryRef.current;
    if (!manager || !registry) {
      throw new Error('MCP runtime is not initialized');
    }
    await reconnectTuiMcpServer(manager, registry, serverId);
  }, []);

  const getCapabilityProviderSummaries = useCallback(() => {
    return capabilityLoadResultRef.current?.providers ?? [];
  }, [capabilityRevision]);

  const getCapabilityDiagnostics = useCallback(() => {
    return capabilityLoadResultRef.current?.diagnostics ?? [];
  }, [capabilityRevision]);

  const listCapabilityTools = useCallback(
    (providerId?: string): readonly string[] => {
      const tools = toolRegistryRef.current?.list() ?? [];
      if (!providerId) {
        return tools.map((tool) => tool.name);
      }
      const summary = capabilityLoadResultRef.current?.providers.find(
        (provider) => provider.providerId === providerId,
      );
      if (!summary) {
        return [];
      }
      const providerToolNames = new Set(
        summary.loaded
          .filter((contribution) => contribution.kind === 'tool')
          .map((contribution) => contribution.name),
      );
      return tools.map((tool) => tool.name).filter((toolName) => providerToolNames.has(toolName));
    },
    [capabilityRevision],
  );

  const getReferenceContributors = useCallback(() => {
    return capabilityLoadResultRef.current?.referenceContributors ?? [];
  }, [capabilityRevision]);

  const querySearchDocuments = useCallback(
    async (query: string, limit: number): Promise<readonly SearchDocumentRecord[]> => {
      if (initPromiseRef.current) await initPromiseRef.current;
      const binding = conversationStorageBindingRef.current;
      if (!binding || !(await binding.readSearchRevision())) return [];
      return binding.searchDocuments.query({
        partition: binding.searchPartition,
        text: query,
        limit,
      });
    },
    [],
  );

  useEffect(() => {
    submitRef.current = submit;
    submitInternalContinuationRef.current = submitInternalContinuation;
    return () => {
      if (submitRef.current === submit) {
        submitRef.current = null;
      }
      if (submitInternalContinuationRef.current === submitInternalContinuation) {
        submitInternalContinuationRef.current = null;
      }
    };
  }, [submit, submitInternalContinuation]);

  return {
    submit,
    cancel,
    clearHistory,
    confirmTool,
    updateModel,
    updateMode,
    getContextTokenCount,
    compactContext,
    getMessageQueueSnapshot,
    listTasks,
    refreshSharedMetadataAtBoundary,
    resumeQueuedMessages,
    promoteQueuedMessage,
    cancelQueuedMessage,
    discardQueuedContinuation,
    editQueuedMessage,
    validateLlmConfig,
    applyLlmConfig,
    activateSkill,
    deactivateSkill,
    getSkillService: () => skillServiceRef.current ?? undefined,
    getToolRegistry: () => toolRegistryRef.current ?? undefined,
    listMcpServers,
    listMcpTools,
    connectMcpServer,
    disconnectMcpServer,
    reconnectMcpServer,
    getCapabilityProviderSummaries,
    getCapabilityDiagnostics,
    listCapabilityTools,
    getReferenceContributors,
    querySearchDocuments,
    getConversationStorage: () => conversationStorageRef.current ?? undefined,
    getCurrentConversationId: () => conversationIdRef.current,
    resumeConversation,
    getHistory: () => sessionRef.current?.getHistory() ?? [],
    getConversationPersistenceSnapshot: () => conversationPersistenceSnapshotRef.current,
    getPromptCompositionProjection: () =>
      sessionRef.current?.getPromptCompositionProjection() ?? [],
    syncRuntimeState: () => syncWorkspaceRuntimeState(),
    slashCommands,
    isReady,
  };
}

/** Build system prompt with runtime context appended */
function buildSystemPromptWithContext(builder: SystemPromptBuilder, config: CLIConfig): string {
  const base = builder.buildBaseOnly();
  const context = [
    `\n\n---\n\n## Runtime Context`,
    `- Working directory: ${config.workDir}`,
    `- OS: ${process.platform} ${process.arch}`,
    `- Model: ${config.model}`,
    `- Provider: ${config.provider}`,
  ];
  return base + context.join('\n');
}

function ensureHookSkillLifecycleRuntime(
  skillService: SkillService,
  ref: import('react').MutableRefObject<SkillLifecycleRuntime | null>,
): SkillLifecycleRuntime {
  if (!ref.current) {
    ref.current = createCliSkillLifecycleRuntime(skillService);
  }
  return ref.current;
}

function projectCliLlmParameters(
  config: CLIConfig,
  llmConfig: AgentLlmConfig,
): TuiParameterValidationResult {
  const manager = new ConfigManager({
    userConfigManager: new FileUserConfigManager(),
    workspacePath: config.workDir,
  });
  try {
    const providerId = config.chatModel?.providerId ?? config.provider;
    const modelId = config.chatModel?.modelId ?? config.model;
    const provider = manager.getProvider(providerId);
    if (!provider) {
      return {
        config: llmConfig,
        diagnostics: [{ code: 'provider-not-configured', providerId }],
      };
    }
    const model = manager.getModel(modelId);
    if (!model) {
      return {
        config: llmConfig,
        diagnostics: [{ code: 'model-not-configured', modelId }],
      };
    }

    const result = projectLlmParameters({ provider, model, llmConfig });
    if (result.diagnostics.length > 0) {
      return {
        config: llmConfig,
        diagnostics: result.diagnostics.map(({ code, field }) => ({ code, field })),
      };
    }
    return {
      config: llmConfig,
      chatOptions: result.chatOptions,
      providerOptions: result.providerOptions,
    };
  } finally {
    manager.dispose();
  }
}

async function* observeTuiSessionEvents(
  events: AsyncIterable<AgentEvent>,
  options: {
    readonly onEvent: (event: AgentEvent) => void;
  },
): AsyncIterable<AgentEvent> {
  for await (const event of events) {
    options.onEvent(event);
    yield event;
  }
}

function handleTuiRuntimeSideEffectEvent(
  event: AgentEvent,
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
  stores: TuiConversationStores,
): void {
  switch (event.type) {
    case 'tool_confirmation': {
      if (!event.toolConfirmation) return;
      stores.agent.getState().setWaitingConfirmation();
      stores.ui.getState().showToolApproval({
        toolCallId: event.toolConfirmation.toolCall.id,
        toolName: event.toolConfirmation.toolCall.name,
        arguments: event.toolConfirmation.toolCall.arguments,
        resolve: () => undefined,
      });
      return;
    }
    case 'iteration': {
      if (event.iteration) {
        stores.agent.getState().setIteration(event.iteration.current, event.iteration.max);
      }
      return;
    }
    case 'error': {
      const externalMessage = readExternalErrorMessage(event);
      const error =
        event.error instanceof Error && externalMessage
          ? event.error
          : new Error(externalMessage ?? presentation.t('agent.terminal.timeline.fallback.error'));
      stores.agent.getState().setError(error);
      stores.conversation.getState().addError(error);
      return;
    }
    default:
      return;
  }
}

function isTerminalTimelineMessage(
  message: AgentEventStreamRuntimeMessage,
): message is RuntimeTerminalTimelineMessage {
  return (
    message.type === 'agentTurnTimelineUpdate' ||
    message.type === 'taskCreated' ||
    message.type === 'taskUpdated'
  );
}

function createGeneratedMediaToolResultBackfill(input: {
  readonly toolCallId: string;
  readonly taskId: string;
  readonly urls: readonly string[];
  readonly timestamp: number;
  readonly deliveryPlan?: MediaTaskProgressDeliveryPlan;
}): ToolResultBackfillPayload {
  const resultAssetRefs = input.deliveryPlan?.generatedAssets
    .map((asset) => asset.assetRef)
    .filter((ref): ref is PerceptualAssetRef => ref !== undefined);
  const primaryAsset = input.deliveryPlan?.generatedAssets.find((asset) => asset.assetRef);
  const primaryAssetRef = primaryAsset?.assetRef;

  return {
    toolCallId: input.toolCallId,
    timestamp: input.timestamp,
    dataPatch: {
      status: 'completed',
      taskId: input.taskId,
      resultUrls: [...input.urls],
      ...(resultAssetRefs && resultAssetRefs.length > 0 ? { resultAssetRefs } : {}),
      ...(primaryAssetRef ? { thumbnailAssetRef: primaryAssetRef } : {}),
    },
    ...(primaryAsset && primaryAssetRef
      ? {
          perceptionCards: [
            createGeneratedMediaPerceptionCard({
              toolCallId: input.toolCallId,
              asset: primaryAsset,
              ref: primaryAssetRef,
              createdAt: input.timestamp,
            }),
          ],
        }
      : {}),
  };
}

function createGeneratedMediaPerceptionCard(input: {
  readonly toolCallId: string;
  readonly asset: GeneratedAsset;
  readonly ref: PerceptualAssetRef;
  readonly createdAt: number;
}): PerceptionCard {
  const structural = createGeneratedMediaPerceptionStructural(input.asset);
  return {
    version: 1,
    assetId: input.asset.id,
    sourceToolCallId: input.toolCallId,
    modality: toGeneratedMediaPerceptionModality(input.asset),
    createdAt: input.createdAt,
    layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
    structural,
    perceptual: toGeneratedMediaPerceptualRefs(input.asset, input.ref),
    cacheKey: `generated-media:${input.asset.id}:provider-ref`,
  };
}

function createGeneratedMediaPerceptionStructural(
  asset: GeneratedAsset,
): PerceptionCard['structural'] {
  const base = {
    format: inferPerceptionFormat(asset.mimeType),
    mimeType: asset.mimeType,
    byteSize: 0,
  };

  switch (asset.type) {
    case 'generated-image':
      return { ...base, width: asset.width, height: asset.height };
    case 'generated-video':
      return {
        ...base,
        width: asset.width,
        height: asset.height,
        durationMs: Math.round(asset.duration * 1000),
        frameRate: asset.fps,
      };
    case 'generated-audio':
      return {
        ...base,
        durationMs: Math.round(asset.duration * 1000),
        channels: asset.channels,
        sampleRate: asset.sampleRate,
      };
    case 'generated-storyboard':
      return base;
  }
}

function toGeneratedMediaPerceptualRefs(
  asset: GeneratedAsset,
  ref: PerceptualAssetRef,
): NonNullable<PerceptionCard['perceptual']> {
  switch (asset.type) {
    case 'generated-video':
      return { keyframeRefs: [ref], multiViewRefs: [ref], thumbnailRef: ref };
    case 'generated-audio':
      return { waveformRef: ref };
    case 'generated-image':
    case 'generated-storyboard':
      return { thumbnailRef: ref };
  }
}

function toGeneratedMediaPerceptionModality(asset: GeneratedAsset): PerceptionCard['modality'] {
  switch (asset.type) {
    case 'generated-video':
      return 'video';
    case 'generated-audio':
      return 'audio';
    case 'generated-image':
      return 'image';
    case 'generated-storyboard':
      return 'mixed';
  }
}

function inferPerceptionFormat(mimeType: string): string {
  const [, subtype] = mimeType.split('/');
  return subtype?.split(';')[0]?.trim() || 'unknown';
}

function projectRuntimeStateFromEvent(
  event: AgentEvent,
  session: IAgentSession,
): {
  readonly status?: AgentWorkspaceRuntimeStatus;
  readonly phase?: AgentPhase;
  readonly toolName?: string;
  readonly contextTokenCount?: number | null;
  readonly errorMessage?: string | null;
} {
  switch (event.type) {
    case 'thinking':
    case 'thinking_content':
      return { status: 'running', phase: 'thinking', contextTokenCount: session.getTokenCount() };
    case 'text':
    case 'text_delta':
      return { status: 'running', phase: 'streaming', contextTokenCount: session.getTokenCount() };
    case 'tool_call':
      return {
        status: 'running',
        phase: 'acting',
        toolName: event.toolCall?.name,
        contextTokenCount: session.getTokenCount(),
      };
    case 'tool_confirmation':
      return {
        status: 'waiting_confirmation',
        phase: 'acting',
        toolName: event.toolConfirmation?.toolCall.name,
        contextTokenCount: session.getTokenCount(),
      };
    case 'done':
      return { status: 'idle', phase: 'idle', contextTokenCount: session.getTokenCount() };
    case 'error':
      return {
        status: 'error',
        phase: 'idle',
        contextTokenCount: session.getTokenCount(),
        errorMessage: readExternalErrorMessage(event) ?? null,
      };
    default:
      return { contextTokenCount: session.getTokenCount() };
  }
}

function readExternalErrorMessage(event: AgentEvent): string | undefined {
  const message = event.error?.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
}

function shouldRefreshTaskSummaryFromEvent(event: AgentEvent): boolean {
  return (
    event.type === 'tool_result' ||
    event.type === 'tool_result_backfill' ||
    event.type === 'tool_progress' ||
    event.type === 'done' ||
    event.type === 'error'
  );
}

function selectRunningTasks(tasks: readonly Task[]): readonly Task[] {
  const activeTasks = tasks
    .filter((task) => task.status === 'pending' || task.status === 'running')
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return activeTasks;
}

function normalizeTurnSource(source: AgentQueuedMessageSource): AgentTurnSource {
  if (source === 'composer') return 'user';
  return source;
}

function displayKindForTurnSource(source: AgentTurnSource): AgentQueuedMessageDisplayKind {
  if (source === 'task-result-continuation') return 'task-continuation';
  if (source === 'subagent-result-continuation') return 'subagent-continuation';
  if (source === 'system-continuation') return 'system-continuation';
  return 'user-message';
}

function deriveConversationTitle(messages: readonly ChatMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  if (!firstUserMessage) return '';
  const content = stringifyChatMessageContent(firstUserMessage.content).trim();
  if (!content) return '';
  return content.length > 50 ? `${content.slice(0, 50)}...` : content;
}

function projectAgentHistoryToTuiMessages(messages: readonly ChatMessage[]): TuiMessage[] {
  const now = Date.now();
  return messages
    .filter((message) => message.role !== 'tool')
    .map((message, index) => ({
      id: `history-${index + 1}`,
      role: message.role === 'assistant' || message.role === 'user' ? message.role : 'system',
      content: stringifyChatMessageContent(message.content),
      toolCalls: [],
      todos: [],
      timestamp: now + index,
      isError: false,
    }));
}

function stringifyChatMessageContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'image') return `[image] ${part.imageUrl}`;
      if (part.type === 'audio') return `[audio] ${part.audioUrl}`;
      if (part.type === 'video') return `[video] ${part.videoUrl}`;
      return '[content]';
    })
    .join('\n');
}
