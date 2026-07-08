/**
 * useAgentSession Hook
 *
 * Manages AgentSession lifecycle: initialization, execution, cleanup.
 * Mirrors the initialization pattern from @neko/cli runner.ts
 * but exposes it as a React hook for Ink components.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  MCPManager,
  createAllMCPTools,
  createPlanModeCreationMetadata,
  createFileProjectMemoryManager,
  createSkillService,
  createNodeSkillLoader,
  ToolRegistry,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  createInputProcessor,
  createCoreTools,
  createFileAgentWorkspaceRuntimeStateRuntime,
  createFileConversationStorage,
  mergeCreationExecutionMetadata,
  ProviderCardRegistry,
  type AgentSessionConfig,
  type IAgentSession,
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
  type FileConversationStorage,
} from '@neko/agent';
import { createAgentSessionWithRuntime } from '@neko/agent/runtime';
import {
  projectLlmParameters,
  ConfigManager,
  FileUserConfigManager,
  type Platform,
} from '@neko/platform';
import type { AgentLlmConfig, AgentPhase } from '@neko-agent/types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CLIConfig } from '../core/types';
import type { ExecutionMode, Message as TuiMessage } from '../types/state';
import { type AgentCapabilityProvider, type ChatMessage, type IService } from '@neko/shared';
import { getProviderModels, updateDefaultModel } from '../core/config';
import type {
  TuiCapabilityPorts,
  TuiMcpServerSnapshot,
  TuiModelIdentity,
  TuiParameterValidationResult,
} from '../core/tui-command-router';
import { createCLIPlatform, createCLITaskManager } from '../core/platform-bootstrap';
import { createCliAgentRuntime, createCliToolGroupRegistry } from '../core/runtime-bootstrap';
import {
  createTuiCapabilityLoader,
  type TuiCapabilityLoaderResult,
} from '../core/tui-capability-loader';
import { detectTuiLocale } from '../core/tui-locale';
import { formatTuiReferenceDiagnostics } from '../core/reference-diagnostics';
import {
  TuiMessageQueueError,
  createTuiMessageQueue,
  formatTuiQueueError,
  type TuiMessageQueue,
} from '../core/message-queue';
import {
  connectTuiMcpServer,
  createTuiMcpServerSnapshots,
  disconnectTuiMcpServer,
  listRegisteredTuiMcpTools,
  reconnectTuiMcpServer,
} from '../core/tui-mcp-ports';
import { loadTuiSessionSkills } from '../core/tui-session-skills';
import { mergeTuiMediaModelMetadata } from '../core/media-model-metadata';
import { useConfigStore } from '../stores/config-store';
import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore, type SelectionMenuItem } from '../stores/ui-store';
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
import { createCliConversationId } from '../core/tui-conversation-id';
import { createNodeWorkspaceContentPolicy } from '../host/node-workspace-content-host';

export interface UseAgentSessionOptions {
  readonly config: CLIConfig;
  /** Optional Platform Service (from VSCode extension) */
  readonly service?: IService;
  /** Optional shared task plane provided by the host bootstrap */
  readonly taskManager?: IRuntimeTaskManager;
  /** Host-agnostic package capability providers injected by the CLI host. */
  readonly capabilityProviders?: readonly AgentCapabilityProvider[];
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
  /** Promote a queued message to run next. */
  promoteQueuedMessage: (queueItemId: string) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Cancel a queued message without cancelling the active turn. */
  cancelQueuedMessage: (queueItemId: string) => import('@neko-agent/types').AgentQueuedMessageItem;
  /** Edit a queued message item. */
  editQueuedMessage: (
    queueItemId: string,
    content: string,
  ) => import('@neko-agent/types').AgentQueuedMessageItem;
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
  /** Shared resume-layer conversation storage for command handlers. */
  readonly getConversationStorage: () => FileConversationStorage | undefined;
  /** Current conversation id bound to the Agent session journal. */
  readonly getCurrentConversationId: () => string;
  /** Load a persisted conversation into the current Agent session. */
  readonly resumeConversation: (record: ConversationRecord) => Promise<void>;
  /** Current Agent history for history commands. */
  readonly getHistory: () => ChatMessage[];
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
export function useAgentSession(options: UseAgentSessionOptions): AgentSessionHandle {
  const { config, service, taskManager: providedTaskManager, capabilityProviders } = options;
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
  const capabilityLoadResultRef = useRef<TuiCapabilityLoaderResult | null>(null);
  const conversationStorageRef = useRef<FileConversationStorage | null>(null);
  const workspaceRuntimeStateRef = useRef<AgentWorkspaceRuntimeStateRuntime | null>(null);
  const runtimeConfigRef = useRef<ReturnType<typeof createCliAgentRuntime> | null>(null);
  const conversationIdRef = useRef(createCliConversationId());
  const conversationCreatedAtRef = useRef(Date.now());
  const conversationTitleRef = useRef('');
  const messageQueueRef = useRef<TuiMessageQueue | null>(null);
  const drainingQueueRef = useRef(false);
  const workspaceRuntimeStateErrorRef = useRef<string | null>(null);
  const isReadyRef = useRef(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [slashCommands, setSlashCommands] = useState<readonly TuiSlashCommandOption[]>(
    createTuiSlashCommandCatalog(),
  );
  const [, setSkillCatalogVersion] = useState(0);

  const reportWorkspaceRuntimeStateError = useCallback((error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    if (workspaceRuntimeStateErrorRef.current === message) {
      return;
    }
    workspaceRuntimeStateErrorRef.current = message;
    useConversationStore
      .getState()
      .addError(new Error(`Workspace runtime state sync failed: ${message}`));
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
      const runtime = workspaceRuntimeStateRef.current;
      if (!runtime) {
        return;
      }

      const agentState = useAgentStore.getState();
      const currentConfig = useConfigStore.getState().config;
      const contextTokenCount =
        input.contextTokenCount !== undefined
          ? input.contextTokenCount
          : (sessionRef.current?.getTokenCount() ?? null);
      const queueSnapshot = agentState.messageQueue.snapshot;
      const capabilitySnapshot = capabilityLoadResultRef.current;
      const mediaModels = currentConfig.defaultMediaModels ?? {};
      const errorMessage =
        input.errorMessage !== undefined ? input.errorMessage : agentState.error?.message;
      const llmParameterSummary = formatLlmParameterSummary(currentConfig.llmConfig);

      const conversation: AgentWorkspaceRuntimeStatePatch['conversation'] = {
        conversationId: conversationIdRef.current,
        status: input.status ?? agentState.status,
        executionMode: agentState.executionMode,
        sessionMode: agentState.sessionMode,
        tokenUsage: agentState.usage,
        chatModel: {
          providerId: currentConfig.chatModel?.providerId ?? currentConfig.provider,
          modelId: currentConfig.chatModel?.modelId ?? currentConfig.model,
        },
        ...(input.phase ? { phase: input.phase } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        ...(contextTokenCount !== null ? { contextTokenCount } : {}),
        ...(queueSnapshot ? { messageQueue: queueSnapshot } : {}),
        ...(Object.keys(mediaModels).length > 0 ? { mediaModels } : {}),
        ...(llmParameterSummary ? { llmParameterSummary } : {}),
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

    const currentConfig = useConfigStore.getState().config;
    const title =
      conversationTitleRef.current || deriveConversationTitle(messages) || 'New Chat';
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
      ...(mediaModelSelection && Object.keys(mediaModelSelection).length > 0
        ? { mediaModelSelection }
        : {}),
    };

    await storage.save(record);
    await storage.flush();
  }, []);

  const resumeConversation = useCallback(
    async (record: ConversationRecord): Promise<void> => {
      const session = sessionRef.current;
      if (!session) {
        throw new Error('Session not initialized');
      }
      const runtimeConfig = runtimeConfigRef.current;
      const journalWriter = runtimeConfig?.artifactStore?.createJournalWriter?.(record.id);
      if (!journalWriter) {
        throw new Error('Runtime journal writer is not available for resumed conversation');
      }

      const nextConfig: Partial<AgentSessionConfig> = {
        conversationId: record.id,
        journalWriter,
      };
      session.configure(nextConfig);
      session.loadHistory(record.messages, record.messageEventIds);
      conversationIdRef.current = record.id;
      conversationCreatedAtRef.current = record.createdAt;
      conversationTitleRef.current = record.title;
      messageQueueRef.current = createTuiMessageQueue({ conversationId: record.id });
      useAgentStore.getState().setMessageQueueSnapshot(messageQueueRef.current.snapshot());
      useConversationStore
        .getState()
        .replaceMessages(projectAgentHistoryToTuiMessages(record.messages));
      syncWorkspaceRuntimeState({
        status: 'idle',
        contextTokenCount: session.getTokenCount(),
      });
    },
    [syncWorkspaceRuntimeState],
  );

  // Initialize session on mount
  useEffect(() => {
    const init = async () => {
      try {
        isReadyRef.current = false;
        setIsReady(false);
        setCapabilityRevision((revision) => revision + 1);
        // Resolve effective model — block on model picker if defaultModel is invalid
        let effectiveModel = config.model;

        if (config.modelNotFound) {
          const chatModels = getProviderModels(config.provider, config.workDir);
          if (chatModels.length > 0) {
            useConversationStore
              .getState()
              .addSystemMessage(
                `Model "${config.modelNotFound}" not found. Please select a model:`,
              );
            const items: SelectionMenuItem[] = chatModels.map((m) => ({
              id: m,
              label: m,
            }));
            const selectedId = await new Promise<string | null>((resolve) => {
              useUIStore.getState().showSelection({
                title: 'Select Model',
                items,
                resolve: (id) => {
                  useUIStore.getState().dismissSelection();
                  resolve(id);
                },
              });
            });
            if (selectedId) {
              effectiveModel = selectedId;
              updateDefaultModel(selectedId);
              useConfigStore.getState().setConfig({ model: selectedId });
              useConversationStore.getState().addSystemMessage(`Model set to: ${selectedId}`);
            } else {
              const fallbackModel = chatModels[0];
              if (!fallbackModel) {
                throw new Error('No models available after model picker dismissal.');
              }
              effectiveModel = fallbackModel;
              useConversationStore
                .getState()
                .addSystemMessage(`No model selected, using: ${effectiveModel}`);
            }
          } else {
            useAgentStore
              .getState()
              .setError(
                new Error(
                  `Model "${config.modelNotFound}" not found and no models available. Configure models first.`,
                ),
              );
            return;
          }
        }

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
        const mcpTools = await createAllMCPTools(mcpManager);
        toolRegistry.registerMany(mcpTools);

        const memoryFilePath = path.join(config.workDir, '.neko', 'memory.md');
        const projectMemoryManager = createFileProjectMemoryManager(memoryFilePath);
        await projectMemoryManager.load();
        const contentPolicy = createNodeWorkspaceContentPolicy({ workDir: config.workDir });
        conversationStorageRef.current = createFileConversationStorage(config.workDir);
        workspaceRuntimeStateRef.current = createFileAgentWorkspaceRuntimeStateRuntime({
          workDir: config.workDir,
          source: 'tui',
        });
        conversationCreatedAtRef.current = Date.now();
        conversationTitleRef.current = '';

        const coreTools = createCoreTools({
          defaultCwd: config.workDir,
          authorizedReadRoots: contentPolicy.authorizedReadRoots,
          projectMemoryManager,
        });
        toolRegistry.registerMany(coreTools);
        const toolGroupRegistry = createCliToolGroupRegistry();
        const providerCardRegistry = new ProviderCardRegistry();

        // 3. Skills
        const detectedLocale = detectTuiLocale();
        const skillLoader = createNodeSkillLoader(fs, path);
        const skillService = createSkillService();
        skillServiceRef.current = skillService;
        const loadedSkills = await loadTuiSessionSkills({
          skillLoader,
          config,
          locale: detectedLocale,
        });
        for (const skill of loadedSkills) {
          skillService.registry.registerSkill(skill);
        }
        setSlashCommands(createTuiSlashCommandCatalog(loadedSkills, detectedLocale));
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
          locale: detectedLocale,
        });
        const capabilityLoadResult = capabilityLoader.registerProviders(
          withTuiDefaultCapabilityProviders({
            workDir: config.workDir,
            capabilityProviders,
          }),
        );
        capabilityLoadResultRef.current = capabilityLoadResult;
        setCapabilityRevision((revision) => revision + 1);

        // 4. LLM Service — use Platform for multi-provider routing
        let llmService: IService;
        const taskManager = providedTaskManager ?? createCLITaskManager();
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
          });
          platformRef.current = cliPlatform.platform;
          llmService = cliPlatform.service;
        }

        // 5. System Prompt
        const executionMode = useAgentStore.getState().executionMode;
        const promptBuilder = createSystemPromptBuilder({
          locale: detectedLocale,
          mode: executionMode === 'plan' ? 'plan' : 'default',
        });
        await promptBuilder.loadAgentsFile(config.workDir, getDefaultPersonalPath());
        promptBuilderRef.current = promptBuilder;
        const systemPrompt = buildSystemPromptWithContext(promptBuilder, {
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
          promptFragments: capabilityLoadResult.promptFragments,
          projectMemoryManager,
        });
        runtimeConfigRef.current = runtimeConfig;
        // 6. Create Session (with validated model)
        const session = createAgentSessionWithRuntime({
          service: llmService,
          toolRegistry,
          systemPrompt,
          locale: detectedLocale,
          executionMode,
          maxIterations: 50,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          providerId: config.chatModel?.providerId ?? config.provider,
          modelId: effectiveModel,
          modelCapabilities: config.chatModel?.capabilities,
          runtime: runtimeConfig,
          conversationId: conversationIdRef.current,
          onConfirmTool: async (request) => {
            // Show approval UI and wait for user decision
            return new Promise<boolean>((resolve) => {
              useUIStore.getState().showToolApproval({
                toolCallId: request.toolCall.id,
                toolName: request.toolCall.name,
                arguments: request.toolCall.arguments,
                resolve,
              });
            });
          },
        });

        sessionRef.current = session;
        messageQueueRef.current = createTuiMessageQueue({
          conversationId: conversationIdRef.current,
        });
        useAgentStore.getState().setMessageQueueSnapshot(messageQueueRef.current.snapshot());
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
            onProjection: (projection) => {
              useAgentStore.getState().setActiveSkillLifecycleRecords(projection.visibleIndicators);
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
          conversationStore: () => useConversationStore.getState(),
          agentStore: () => useAgentStore.getState(),
          uiStore: () => useUIStore.getState(),
        });

        isReadyRef.current = true;
        setIsReady(true);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        useAgentStore.getState().setError(err);
        useConversationStore.getState().addError(err);
      }
    };

    initPromiseRef.current = init();

    return () => {
      isReadyRef.current = false;
      setIsReady(false);
      sessionRef.current?.dispose();
      platformRef.current?.dispose();
      mcpManagerRef.current?.disconnectAll().catch(() => {});
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const executePrompt = useCallback(
    async (prompt: string, metadataOverrides?: Record<string, unknown>): Promise<void> => {
      const session = sessionRef.current;
      const adapter = adapterRef.current;
      const inputProcessor = inputProcessorRef.current;
      if (!session || !adapter) {
        throw new Error('Session not initialized');
      }

      let finalPrompt = prompt;
      if (inputProcessor) {
        const processed = await inputProcessor.process(prompt);
        const referenceDiagnostic = formatTuiReferenceDiagnostics(processed.errors);
        if (referenceDiagnostic) {
          throw new Error(referenceDiagnostic);
        }
        finalPrompt = processed.message;
        if (processed.hasFiles) {
          finalPrompt = `${processed.message}\n\n## Referenced Files\n\n${processed.fileContents}`;
        }
      }

      adapter.reset();
      useConversationStore.getState().addUserMessage(prompt);
      useAgentStore.getState().setRunning();
      if (!conversationTitleRef.current) {
        conversationTitleRef.current = deriveConversationTitle([{ role: 'user', content: prompt }]);
      }
      syncWorkspaceRuntimeState({ status: 'running', phase: 'thinking' });

      const creationMetadata = mergeCreationExecutionMetadata(
        session.getExecutionMode() === 'plan' ? createPlanModeCreationMetadata() : undefined,
        metadataOverrides,
      );
      const currentConfig = useConfigStore.getState().config;
      const metadata = mergeTuiMediaModelMetadata(
        creationMetadata,
        currentConfig.defaultMediaModels,
        currentConfig.chatModel?.providerId ?? currentConfig.provider,
      );

      for await (const event of session.execute(finalPrompt, {
        workspaceRoot: readConfigWorkDir(),
        ...(metadata ? { metadata } : {}),
      })) {
        adapter.handleEvent(event);
        syncWorkspaceRuntimeState(projectRuntimeStateFromEvent(event, session));
      }
      await persistCurrentConversation();
      syncWorkspaceRuntimeState({
        status: useAgentStore.getState().status,
        phase: 'idle',
        contextTokenCount: session.getTokenCount(),
      });
    },
    [persistCurrentConversation, syncWorkspaceRuntimeState],
  );

  const drainQueuedPrompts = useCallback(async (): Promise<void> => {
    if (drainingQueueRef.current) {
      return;
    }
    drainingQueueRef.current = true;
    try {
      const queue = messageQueueRef.current;
      const adapter = adapterRef.current;
      if (!queue || !adapter) {
        return;
      }

      for (;;) {
        const released = queue.dequeue();
        if (!released) {
          useAgentStore.getState().setMessageQueueSnapshot(queue.snapshot());
          syncWorkspaceRuntimeState();
          return;
        }
        const snapshot = queue.snapshot();
        useAgentStore.getState().setMessageQueueSnapshot(snapshot);
        syncWorkspaceRuntimeState({ status: 'running' });
        adapter.handleEvent({
          type: 'messageQueued',
          pendingCount: snapshot.pendingCount,
          releasedQueuedMessageItem: released,
          messageQueueSnapshot: snapshot,
        } satisfies AgentEvent);
        await executePrompt(released.content);
      }
    } finally {
      drainingQueueRef.current = false;
    }
  }, [executePrompt, syncWorkspaceRuntimeState]);

  const submit = useCallback(
    async (prompt: string, executionOverrides?: { metadata?: Record<string, unknown> }) => {
      if (initPromiseRef.current) {
        await initPromiseRef.current;
      }

      const session = sessionRef.current;
      const adapter = adapterRef.current;

      if (!session || !adapter) {
        useAgentStore.getState().setError(new Error('Session not initialized'));
        return;
      }

      if (session.isRunning() || useAgentStore.getState().status === 'running') {
        const queue = messageQueueRef.current;
        if (!queue) {
          useConversationStore.getState().addError(new Error('Message queue is not initialized'));
          return;
        }
        try {
          if (executionOverrides?.metadata && Object.keys(executionOverrides.metadata).length > 0) {
            throw new TuiMessageQueueError(
              'not-queueable',
              'Prompts with execution metadata cannot be queued while an Agent turn is running.',
            );
          }
          const item = queue.enqueue(prompt);
          const snapshot = queue.snapshot();
          useAgentStore.getState().setMessageQueueSnapshot(snapshot);
          syncWorkspaceRuntimeState({ status: 'running' });
          adapter.handleEvent({
            type: 'messageQueued',
            content: `Message queued (${snapshot.pendingCount} pending)`,
            pendingCount: snapshot.pendingCount,
            queuedMessageItem: item,
            messageQueueSnapshot: snapshot,
          });
        } catch (error) {
          const message = formatTuiQueueError(error);
          useAgentStore.getState().setMessageQueueDiagnostic(message);
          useConversationStore.getState().addError(new Error(message));
        }
        return;
      }

      try {
        await executePrompt(prompt, executionOverrides?.metadata);
        await drainQueuedPrompts();

        if (useAgentStore.getState().executionMode === 'plan') {
          useUIStore.getState().showPlanReview();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        useAgentStore.getState().setError(err);
        useConversationStore.getState().addError(err);
        syncWorkspaceRuntimeState({ status: 'error', phase: 'idle', errorMessage: err.message });
      }
    },
    [drainQueuedPrompts, executePrompt, syncWorkspaceRuntimeState],
  );

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    useAgentStore.getState().setIdle();
    syncWorkspaceRuntimeState({ status: 'idle', phase: 'idle' });
  }, [syncWorkspaceRuntimeState]);

  const getMessageQueueSnapshot = useCallback(() => {
    return messageQueueRef.current?.snapshot() ?? null;
  }, []);

  const promoteQueuedMessage = useCallback((queueItemId: string) => {
    const queue = messageQueueRef.current;
    if (!queue) {
      throw new Error('Message queue is not initialized');
    }
    const item = queue.promote(queueItemId);
    useAgentStore.getState().setMessageQueueSnapshot(queue.snapshot());
    syncWorkspaceRuntimeState();
    return item;
  }, [syncWorkspaceRuntimeState]);

  const cancelQueuedMessage = useCallback((queueItemId: string) => {
    const queue = messageQueueRef.current;
    if (!queue) {
      throw new Error('Message queue is not initialized');
    }
    const item = queue.cancel(queueItemId);
    useAgentStore.getState().setMessageQueueSnapshot(queue.snapshot());
    syncWorkspaceRuntimeState();
    return item;
  }, [syncWorkspaceRuntimeState]);

  const editQueuedMessage = useCallback((queueItemId: string, content: string) => {
    const queue = messageQueueRef.current;
    if (!queue) {
      throw new Error('Message queue is not initialized');
    }
    const item = queue.edit(queueItemId, content);
    useAgentStore.getState().setMessageQueueSnapshot(queue.snapshot());
    syncWorkspaceRuntimeState();
    return item;
  }, [syncWorkspaceRuntimeState]);

  const clearHistory = useCallback(() => {
    sessionRef.current?.clearHistory();
    useConversationStore.getState().clearMessages();
    void workspaceRuntimeStateRef.current
      ?.clearConversation(conversationIdRef.current)
      .catch(reportWorkspaceRuntimeStateError);
  }, [reportWorkspaceRuntimeStateError]);

  const confirmTool = useCallback((toolCallId: string, approved: boolean) => {
    sessionRef.current?.confirmTool(toolCallId, approved);
    useUIStore.getState().dismissToolApproval();
    if (approved) {
      useAgentStore.getState().setRunning();
      syncWorkspaceRuntimeState({ status: 'running' });
    } else {
      syncWorkspaceRuntimeState({ status: 'idle', phase: 'idle' });
    }
  }, [syncWorkspaceRuntimeState]);

  const updateModel = useCallback((model: string | TuiModelIdentity) => {
    const identity =
      typeof model === 'string'
        ? { providerId: useConfigStore.getState().config.provider, modelId: model }
        : model;
    useConfigStore.getState().setConfig({
      provider: identity.providerId,
      model: identity.modelId,
      chatModel: {
        providerId: identity.providerId,
        modelId: identity.modelId,
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
  }, [syncWorkspaceRuntimeState]);

  const validateLlmConfig = useCallback(
    (llmConfig: AgentLlmConfig): TuiParameterValidationResult => {
      const config = useConfigStore.getState().config;
      const result = projectCliLlmParameters(config, llmConfig);
      if (result.diagnostics.length > 0) {
        return {
          config: llmConfig,
          diagnostics: result.diagnostics.map((diagnostic) => diagnostic.message),
        };
      }

      return {
        config: llmConfig,
        chatOptions: result.chatOptions,
        providerOptions: result.providerOptions,
        summary: formatLlmProjectionSummary(result),
      };
    },
    [],
  );

  const applyLlmConfig = useCallback((result: TuiParameterValidationResult): void => {
    const config = useConfigStore.getState().config;
    useConfigStore.getState().setConfig({
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
  }, [syncWorkspaceRuntimeState]);

  const activateSkill = useCallback(async (name: string, args?: string): Promise<boolean> => {
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
      useConversationStore
        .getState()
        .addSystemMessage(result.message ?? `Skill "${name}" was not activated`);
      return false;
    }
    syncWorkspaceRuntimeState();
    return true;
  }, [syncWorkspaceRuntimeState]);

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
        useConversationStore
          .getState()
          .addSystemMessage(result.message ?? 'Skill lifecycle clear rejected');
        return false;
      }
      syncWorkspaceRuntimeState();
      return true;
    },
    [syncWorkspaceRuntimeState],
  );

  const updateMode = useCallback((mode: ExecutionMode) => {
    const session = sessionRef.current;
    if (!session) return;
    const config = useConfigStore.getState().config;
    const locale = detectTuiLocale();
    const builder = createSystemPromptBuilder({
      locale,
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
    session.configure({ systemPrompt, locale });
    session.setExecutionMode(mode);
    useAgentStore.getState().setExecutionMode(mode);
    syncWorkspaceRuntimeState();
  }, [syncWorkspaceRuntimeState]);

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

  const listCapabilityTools = useCallback((providerId?: string): readonly string[] => {
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
  }, [capabilityRevision]);

  const getReferenceContributors = useCallback(() => {
    return capabilityLoadResultRef.current?.referenceContributors ?? [];
  }, [capabilityRevision]);

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
    promoteQueuedMessage,
    cancelQueuedMessage,
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
    getConversationStorage: () => conversationStorageRef.current ?? undefined,
    getCurrentConversationId: () => conversationIdRef.current,
    resumeConversation,
    getHistory: () => sessionRef.current?.getHistory() ?? [],
    syncRuntimeState: () => syncWorkspaceRuntimeState(),
    slashCommands,
    isReady,
  };
}

/** Helper to get workDir from config store */
function readConfigWorkDir(): string {
  return useConfigStore.getState().config.workDir;
}

/** Build system prompt with runtime context appended */
function buildSystemPromptWithContext(builder: SystemPromptBuilder, config: CLIConfig): string {
  const base = builder.build();
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

function projectCliLlmParameters(config: CLIConfig, llmConfig: AgentLlmConfig) {
  const manager = new ConfigManager({
    userConfigManager: new FileUserConfigManager(),
    workspacePath: config.workDir,
  });
  try {
    const providerId = config.chatModel?.providerId ?? config.provider;
    const modelId = config.chatModel?.modelId ?? config.model;
    const provider = manager.getProvider(providerId);
    const model = manager.getModel(modelId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" is not configured.`);
    }
    if (!model) {
      throw new Error(`Model "${modelId}" is not configured.`);
    }
    return projectLlmParameters({ provider, model, llmConfig });
  } finally {
    manager.dispose();
  }
}

function formatLlmProjectionSummary(result: ReturnType<typeof projectLlmParameters>): string {
  const applied = [
    result.chatOptions.temperature !== undefined
      ? `temperature=${result.chatOptions.temperature}`
      : undefined,
    result.chatOptions.topP !== undefined ? `topP=${result.chatOptions.topP}` : undefined,
    result.chatOptions.maxTokens !== undefined
      ? `maxTokens=${result.chatOptions.maxTokens}`
      : undefined,
    result.chatOptions.thinkingBudget !== undefined
      ? `thinkingBudget=${result.chatOptions.thinkingBudget}`
      : undefined,
    Object.keys(result.providerOptions).length > 0
      ? `providerOptions=${Object.keys(result.providerOptions).join(',')}`
      : undefined,
  ].filter(Boolean);
  return applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Applied: provider defaults';
}

function formatLlmParameterSummary(llmConfig: AgentLlmConfig | undefined): string | undefined {
  if (!llmConfig) return undefined;
  const entries = [
    llmConfig.reasoningPreset ? `reasoning=${llmConfig.reasoningPreset}` : undefined,
    llmConfig.verbosityPreset ? `verbosity=${llmConfig.verbosityPreset}` : undefined,
    llmConfig.creativityPreset ? `creativity=${llmConfig.creativityPreset}` : undefined,
    ...(llmConfig.advanced
      ? Object.entries(llmConfig.advanced).map(([key, value]) =>
          value !== undefined ? `${key}=${value}` : undefined,
        )
      : []),
  ].filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join(', ') : undefined;
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
        errorMessage: event.error?.message ?? 'Agent execution failed',
      };
    default:
      return { contextTokenCount: session.getTokenCount() };
  }
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
      if (part.type === 'video') return `[video] ${part.videoUrl}`;
      return '[content]';
    })
    .join('\n');
}
