/**
 * Agent Message Turn Handler
 *
 * Bridges user-message runtime contracts to VSCode host services.
 * Runtime owns dispatch sequencing; this layer injects webview, workspace,
 * media, and agent-turn adapters.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { Platform } from '@neko/platform';
import type {
  AgentTaskResultFollowUpRequest,
  Task,
  TaskLifecycleMetadata,
  TaskStatus,
} from '@neko/shared';
import {
  buildAgentCapabilityActivationProgressMessage,
  buildGlobalErrorMessage,
  buildThinkingMessage,
  type AgentTurnTimelineSnapshotRequest,
} from '@neko-agent/types';
import type { IAgentManager } from '../ai/agentManager';
import type { IAgentRunner } from '../ai/agentRunner';
import { getCanvasSelection } from '../services/canvasAmbientContext';
import type { IEditorRegistry } from '../editor/common/editorRegistry';
import { SettingsManager } from './settingsManager';
import { ProviderManager } from './providerManager';
import { ConversationBridge } from './conversationBridge';
import { AttachmentProcessor } from './message/attachmentProcessor';
import { AgentStreamProcessor } from './message/agentStreamProcessor';
import { MediaPreprocessor } from './message/mediaPreprocessor';
import type {
  EntityMemoryContributionAutomationPort,
  EntityMemoryContributionAutomationResult,
} from './message/entityMemoryContributionAutomation';
import {
  executeAgentProjectFileSearch,
  createAgentMessageId,
  createAgentStateRuntime,
  createSubAgentEventRuntime,
  createWorkspaceInputProcessorRuntime,
  runAgentMessageTurnRuntime,
  type AgentProjectFileSearchPurpose,
  type AgentStateRuntime,
  type AgentStateRuntimeEntry,
  type AgentMessageRuntimeRequest,
  type SubAgentEventRuntime,
  type WorkspaceInputProcessorRuntime,
} from '@neko/agent/runtime';
import {
  createInputProcessor,
  getConversationWorkDirHash,
  type ActiveSkillState,
  type InputProcessor,
  type IRuntimeTaskManager,
  type SubAgentEvent,
} from '@neko/agent';
import { getLogger } from '../base';
import {
  getEngineClientProvider,
  type IEngineClientProvider,
} from '../services/engineClientProvider';
import { MediaTaskDeliveryHost } from '../services/mediaTaskDeliveryHost';
import { MediaTurnBridge } from '../services/mediaTurnBridge';
import type { TaskResultObservationCoordinator } from '../services/taskResultObservationCoordinator';
import type { AgentDashboardWorkItemSource } from '../services/dashboardWorkItemSource';
import type { AgentLocalResourceAccess } from '../services/localResourceAccess';
import type { GeneratedAssetIndex } from '@neko/platform/media/generated-asset-index';
import { createVSCodeWorkspaceFileReader } from '../services/workspaceFileReader';
import { searchVSCodeProjectFiles } from '../services/workspaceProjectSearch';
import { searchProjectMentionCandidates } from '../services/projectMentionSearch';
import { AgentTurnBridge } from './message/agentTurnBridge';
import type { SkillHandler } from './handlers/skillHandler';
import type { AccountAiCatalogCache } from '../services/accountAiCatalogCache';
import {
  formatAgentLlmConfigDiagnostics,
  resolveAgentLlmConfigForTurn,
} from './agentLlmConfigResolver';
import { getCapabilityRuntimeBindings } from '../bootstrap/capabilityBootstrap';

const logger = getLogger('AgentMessageTurnHandler');

export interface AgentMessageTurnHandlerOptions {
  readonly accountAiCatalog?: AccountAiCatalogCache;
  readonly generatedAssetIndex?: GeneratedAssetIndex;
  readonly taskResultObservationCoordinator?: TaskResultObservationCoordinator;
}

export class AgentMessageTurnHandler {
  private readonly _agentStateRuntime: AgentStateRuntime = createAgentStateRuntime();
  private readonly _subAgentEventRuntime: SubAgentEventRuntime = createSubAgentEventRuntime();
  private readonly _inputProcessorRuntime: WorkspaceInputProcessorRuntime =
    createWorkspaceInputProcessorRuntime({
      createProcessor: (workspaceRoot) =>
        createInputProcessor({
          workspaceRoot,
          fileReader: createVSCodeWorkspaceFileReader(workspaceRoot),
        }),
    });
  private readonly _attachmentProcessor: AttachmentProcessor;
  private readonly _streamProcessor: AgentStreamProcessor;
  private readonly _mediaDeliveryHost: MediaTaskDeliveryHost;
  private readonly _mediaTurnBridge: MediaTurnBridge;
  private readonly _agentTurnBridge: AgentTurnBridge;
  private readonly _subAgentEventSubscriptions = new Map<string, vscode.Disposable>();
  private readonly _disposables: vscode.Disposable[] = [];
  private _lastTextEditorUri: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri;

  constructor(
    private readonly _settings: SettingsManager,
    private readonly _providers: ProviderManager,
    private readonly _conversations: ConversationBridge,
    private readonly _agentManager: IAgentManager | undefined,
    private readonly _editorRegistry: IEditorRegistry | undefined,
    private readonly _getSystemPrompt: (conversationId: string) => string,
    private readonly _isPlanMode: (conversationId: string) => boolean = () => false,
    private readonly _platform?: Platform,
    private readonly _taskManager?: IRuntimeTaskManager,
    private readonly _getActiveSkillState?: (
      conversationId: string,
    ) => ActiveSkillState | undefined,
    private readonly _skillHandler?: SkillHandler,
    private readonly _engineClientProvider: IEngineClientProvider = getEngineClientProvider(),
    private readonly _dashboardWorkItems?: AgentDashboardWorkItemSource,
    private readonly _localResourceAccess?: AgentLocalResourceAccess,
    private readonly _options: AgentMessageTurnHandlerOptions = {},
  ) {
    this._attachmentProcessor = new AttachmentProcessor({
      contentAccessRuntime: getCapabilityRuntimeBindings().contentAccessRuntime,
    });

    this._mediaDeliveryHost = new MediaTaskDeliveryHost({
      platform: this._platform,
      assetIndex: this._options.generatedAssetIndex,
      transcodeFile: (inputPath, outputPath, mediaType) =>
        this._engineClientProvider.transcodeFile(inputPath, outputPath, mediaType),
      localResourceAccess: this._localResourceAccess,
    });
    this._mediaTurnBridge = new MediaTurnBridge({
      platform: this._platform,
      mediaDeliveryHost: this._mediaDeliveryHost,
      dashboardWorkItems: this._dashboardWorkItems,
      localResourceAccess: this._localResourceAccess,
      conversations: this._conversations,
      ...(this._options.taskResultObservationCoordinator
        ? { taskResultObservations: this._options.taskResultObservationCoordinator }
        : {}),
      generateMessageId: () => createAgentMessageId(),
      now: () => Date.now(),
    });

    const agentManager = this._agentManager;
    this._streamProcessor = new AgentStreamProcessor({
      platform: this._platform,
      conversations: this._conversations,
      transcodeFile: (inputPath, outputPath, mediaType) =>
        this._engineClientProvider.transcodeFile(inputPath, outputPath, mediaType),
      mediaDeliveryHost: this._mediaDeliveryHost,
      dashboardWorkItems: this._dashboardWorkItems,
      localResourceAccess: this._localResourceAccess,
      contentAccessRuntime: getCapabilityRuntimeBindings().contentAccessRuntime,
      ...(this._options.taskResultObservationCoordinator
        ? { taskResultObservations: this._options.taskResultObservationCoordinator }
        : {}),
      ...(agentManager
        ? {
            getContextTokenCount: (conversationId) =>
              agentManager.getContextTokenCount(conversationId),
          }
        : {}),
      entityMemoryContributionAutomation: createVSCodeEntityMemoryContributionAutomation(),
    });
    this._agentTurnBridge = new AgentTurnBridge({
      settings: this._settings,
      providers: this._providers,
      conversations: this._conversations,
      agentManager: this._agentManager,
      editorRegistry: this._editorRegistry,
      getSystemPrompt: this._getSystemPrompt,
      isPlanMode: this._isPlanMode,
      platform: this._platform,
      taskManager: this._taskManager,
      getActiveSkillState: this._getActiveSkillState,
      getSkillLifecycleProjection: (conversationId) =>
        this._skillHandler?.projectSkillLifecycle(conversationId),
      accountAiCatalog: this._options.accountAiCatalog,
      streamProcessor: this._streamProcessor,
      onPhaseChange: ({ conversationId, phase, toolName, timestamp }) =>
        this._updateAgentState(conversationId, phase, toolName, timestamp),
      ensureSubAgentEventSubscription: (webview, conversationId, agentRunner) =>
        this._ensureSubAgentEventSubscription(webview, conversationId, agentRunner),
      generateMessageId: () => createAgentMessageId(),
    });
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.uri) {
          this._lastTextEditorUri = editor.document.uri;
        }
      }),
    );
  }

  /**
   * Get or create InputProcessor for the current workspace
   */
  private _getInputProcessor(): InputProcessor | null {
    return this._inputProcessorRuntime.resolve(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
  }

  getAgentStateSnapshot(): AgentStateRuntimeEntry[] {
    return this._agentStateRuntime.snapshot();
  }

  async requestAgentTurnTimelineSnapshot(
    webview: vscode.Webview,
    request: AgentTurnTimelineSnapshotRequest,
  ): Promise<void> {
    const response = await this._streamProcessor.requestTimelineSnapshot(webview, request);
    await webview.postMessage(response);
  }

  clearAgentState(conversationId: string): void {
    this._agentStateRuntime.clear(conversationId);
    this._clearSubAgentEventSubscription(conversationId);
    this._streamProcessor.clearConversation(conversationId);
    this._updateWorkspaceRuntimeState(conversationId, {
      status: 'idle',
      phase: 'idle',
      ...this._projectContextTokenCount(conversationId),
    });
  }

  /**
   * Handle incoming user message
   */
  async handleUserMessage(
    webview: vscode.Webview,
    request: AgentMessageRuntimeRequest,
  ): Promise<void> {
    const localizedRequest: AgentMessageRuntimeRequest = {
      ...request,
      locale: request.locale ?? vscode.env.language,
    };
    const resolvedRequest = this._resolveAgentTurnRequest(webview, localizedRequest);
    if (!resolvedRequest) {
      return;
    }
    this._skillHandler?.bindConversationWebview(webview, resolvedRequest.conversationId);

    await runAgentMessageTurnRuntime({
      request: resolvedRequest,
      inputProcessor: this._getInputProcessor(),
      processAttachments: (attachments, options) =>
        this._attachmentProcessor.processAttachments(
          attachments ? [...attachments] : undefined,
          options,
        ),
      createReferencedMediaProcessor: async () =>
        new MediaPreprocessor(
          await this._engineClientProvider.getOptionalClient(),
          getCapabilityRuntimeBindings().contentAccessRuntime,
        ),
      onReferenceError: (error) => {
        logger.warn(`Could not read file: ${error.reference}`, error.error);
      },
      onFileReferenceProcessingError: (error) => {
        logger.error('InputProcessor error:', error);
      },
      onReferencedMediaProcessed: ({ filePath, mediaType, metadata }) => {
        if (metadata) {
          logger.debug(`Preprocessed ${filePath}: ${mediaType}`, metadata);
        }
      },
      onReferencedMediaError: ({ filePath, error }) => {
        logger.warn(`Failed to preprocess media: ${filePath}`, error);
      },
      persistUserMessage: (conversationId, message) => {
        this._conversations.addMessageToConversation(conversationId, message);
      },
      removeUserMessage: (conversationId, messageId) => {
        this._conversations.removeMessageFromConversation(conversationId, messageId);
      },
      persistErrorMessage: (conversationId, message) => {
        this._conversations.addMessageToConversation(conversationId, message);
      },
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      executeMediaTurn: this._platform?.media
        ? ({ conversationId, prompt, mediaModel }) =>
            this._mediaTurnBridge.execute({
              webview,
              conversationId,
              prompt,
              mediaModel,
            })
        : undefined,
      executeAgentTurn:
        this._agentManager && this._platform
          ? ({
              conversationId,
              message,
              pendingMessageSource,
              chatModel,
              agentModels,
              llmConfig,
              llmRuntimeOptions,
              imageAttachments,
              mediaModel,
              mediaModels,
              understandingModels,
              executionOverrides,
              locale,
            }) =>
              this._agentTurnBridge.execute({
                webview,
                conversationId,
                message,
                ...(pendingMessageSource ? { pendingMessageSource } : {}),
                chatModel,
                agentModels,
                llmConfig,
                llmRuntimeOptions,
                imageAttachments,
                mediaModel,
                mediaModels,
                understandingModels,
                executionOverrides,
                locale,
              })
          : undefined,
      onMissingConversationId: () => {
        logger.warn('Rejected user message without conversationId');
      },
      generateMessageId: () => createAgentMessageId(),
      now: () => Date.now(),
    });
  }

  async handleTaskResultContinuation(
    webview: vscode.Webview,
    request: AgentTaskResultFollowUpRequest,
  ): Promise<void> {
    if (!this._agentManager || !this._platform) {
      throw new Error('Cannot dispatch task-result continuation without Agent runtime services');
    }

    const localizedRequest: AgentMessageRuntimeRequest = {
      conversationId: request.conversationId,
      messageText: request.prompt,
      pendingMessageSource: 'task-result-continuation',
      sessionMode: 'agent',
      locale: vscode.env.language,
    };
    const resolvedRequest = this._resolveAgentTurnRequest(webview, localizedRequest);
    if (!resolvedRequest) {
      return;
    }

    this._skillHandler?.bindConversationWebview(webview, resolvedRequest.conversationId);
    void webview.postMessage(buildThinkingMessage(resolvedRequest.conversationId));
    await this._agentTurnBridge.execute({
      webview,
      conversationId: resolvedRequest.conversationId,
      message: resolvedRequest.messageText,
      pendingMessageSource: 'task-result-continuation',
      chatModel: resolvedRequest.chatModel,
      agentModels: resolvedRequest.agentModels,
      llmConfig: resolvedRequest.llmConfig,
      llmRuntimeOptions: resolvedRequest.llmRuntimeOptions,
      mediaModels: resolvedRequest.mediaModels,
      executionOverrides: resolvedRequest.executionOverrides,
      locale: resolvedRequest.locale,
    });
  }

  private _resolveAgentTurnRequest(
    webview: vscode.Webview,
    request: AgentMessageRuntimeRequest,
  ): AgentMessageRuntimeRequest | null {
    const resolved = resolveAgentLlmConfigForTurn({
      sessionMode: request.sessionMode,
      chatModel: request.chatModel,
      agentModels: request.agentModels,
      llmConfig: request.llmConfig,
      attachments: request.attachments,
      understandingModels: request.understandingModels,
      settings: this._settings,
      providers: this._providers,
      platform: this._platform,
    });

    if (!resolved.ok) {
      const message = formatAgentLlmConfigDiagnostics(resolved.diagnostics);
      logger.warn('Rejected Agent turn LLM configuration', {
        conversationId: request.conversationId,
        diagnostics: resolved.diagnostics,
      });
      void webview.postMessage(buildGlobalErrorMessage(message));
      return null;
    }

    if (request.sessionMode !== 'agent') {
      return request;
    }

    return {
      ...request,
      chatModel: resolved.chatModel,
      agentModels: resolved.agentModels,
      understandingModels: resolved.understandingModels ?? request.understandingModels,
      llmConfig: resolved.llmConfig,
      llmRuntimeOptions: resolved.llmRuntimeOptions,
    };
  }

  private _updateAgentState(
    conversationId: string,
    phase: AgentStateRuntimeEntry['phase'],
    toolName: string | undefined,
    startedAt: number,
  ): void {
    this._agentStateRuntime.update({
      conversationId,
      phase,
      toolName,
      startedAt,
    });
    this._updateWorkspaceRuntimeState(conversationId, {
      status: phase === 'idle' ? 'idle' : 'running',
      phase,
      ...(toolName ? { toolName } : {}),
      startedAt,
      ...this._projectContextTokenCount(conversationId),
    });
  }

  private _updateWorkspaceRuntimeState(
    conversationId: string,
    patch: Parameters<ConversationBridge['updateWorkspaceRuntimeState']>[1],
  ): void {
    if (typeof this._conversations.updateWorkspaceRuntimeState !== 'function') {
      return;
    }
    this._conversations.updateWorkspaceRuntimeState(conversationId, patch);
  }

  private _projectContextTokenCount(
    conversationId: string,
  ): { readonly contextTokenCount: number } | Record<string, never> {
    if (typeof this._agentManager?.getContextTokenCount !== 'function') {
      return {};
    }
    return { contextTokenCount: this._agentManager.getContextTokenCount(conversationId) };
  }

  private _ensureSubAgentEventSubscription(
    webview: vscode.Webview,
    conversationId: string,
    agentRunner: IAgentRunner,
  ): void {
    if (this._subAgentEventSubscriptions.has(conversationId)) {
      return;
    }

    const disposable = agentRunner.onDidRunnerEvent((runnerEvent) => {
      if (
        runnerEvent.type === 'activationProgress' &&
        runnerEvent.conversationId === conversationId
      ) {
        void webview.postMessage(
          buildAgentCapabilityActivationProgressMessage({
            conversationId,
            events: runnerEvent.events,
          }),
        );
        return;
      }

      if (runnerEvent.type !== 'subagent') {
        return;
      }
      if (runnerEvent.event.conversationId !== conversationId) {
        logger.warn('Ignored SubAgent event for another conversation', {
          subscribedConversationId: conversationId,
          eventConversationId: runnerEvent.event.conversationId,
          subAgentId: runnerEvent.event.subAgentId,
        });
        return;
      }
      this._recordTerminalSubAgentObservation(runnerEvent.event);
      const message = this._subAgentEventRuntime.projectForConversation({
        conversationId,
        event: runnerEvent.event,
      });
      if (!message) {
        return;
      }
      this._dashboardWorkItems?.acceptWebviewMessage(message);
      webview.postMessage(message);
    });

    this._subAgentEventSubscriptions.set(conversationId, disposable);
  }

  private _recordTerminalSubAgentObservation(event: SubAgentEvent): void {
    const coordinator = this._options.taskResultObservationCoordinator;
    if (!coordinator || !isTerminalSubAgentEvent(event)) {
      return;
    }

    void coordinator
      .handleTerminalTask(toSubAgentTaskResultObservationTask(event), {
        source: 'subagent',
        ...(event.data?.parentMessageId ? { parentMessageId: event.data.parentMessageId } : {}),
        ...(event.data?.parentToolCallId ? { parentToolCallId: event.data.parentToolCallId } : {}),
      })
      .catch((error) => {
        logger.warn('Failed to record SubAgent task-result observation', {
          subAgentId: event.subAgentId,
          conversationId: event.conversationId,
          error,
        });
      });
  }

  private _clearSubAgentEventSubscription(conversationId: string): void {
    const disposable = this._subAgentEventSubscriptions.get(conversationId);
    if (!disposable) {
      return;
    }
    disposable.dispose();
    this._subAgentEventSubscriptions.delete(conversationId);
  }

  /**
   * Search project files for @ reference.
   * Also appends canvas ambient nodes as mention extras so the webview can
   * show them as context-chip candidates alongside file results.
   */
  async searchProjectFiles(
    webview: vscode.Webview,
    filter: string,
    conversationId: string | undefined,
    options: { readonly purpose?: AgentProjectFileSearchPurpose } = {},
  ): Promise<void> {
    const searchContextUri = this._resolveSearchContextUri();
    const projectRoot = this._resolveSearchProjectRoot(conversationId, searchContextUri);
    const message = await executeAgentProjectFileSearch({
      conversationId,
      filter,
      purpose: options.purpose,
      searchProjectFiles: searchVSCodeProjectFiles,
      getMentionCandidates: (plan) =>
        searchProjectMentionCandidates(plan, {
          contextFilePath: searchContextUri?.fsPath,
          contextUri: searchContextUri?.toString(),
          projectRoot,
        }),
      getCanvasNodes: (id) => getCanvasSelection(id),
      getCharacters: async () => {
        try {
          const ext = vscode.extensions.getExtension<{
            getCharacterRegistry?():
              | {
                  characters: readonly {
                    id: string;
                    canonicalName: string;
                    metadata?: { role?: string };
                  }[];
                }
              | undefined;
          }>('neko.neko-story');
          const registry = ext?.isActive ? ext.exports.getCharacterRegistry?.() : undefined;
          if (!registry) return [];
          return registry.characters.map((c) => ({
            id: c.id,
            name: c.canonicalName,
            role: c.metadata?.role,
          }));
        } catch {
          return [];
        }
      },
      getScenes: async () => {
        try {
          const ext = vscode.extensions.getExtension<{
            getScriptIndex?(
              uri: string,
            ):
              | { scenes: readonly { sceneId: string; sceneTitle: string; heading: string }[] }
              | undefined;
          }>('neko.neko-story');
          if (!ext?.isActive) return [];
          const editor = vscode.window.activeTextEditor;
          if (!editor) return [];
          const index = ext.exports.getScriptIndex?.(editor.document.uri.toString());
          if (!index) return [];
          return index.scenes.map((s) => ({
            id: s.sceneId,
            title: s.sceneTitle || s.heading,
            heading: s.heading,
          }));
        } catch {
          return [];
        }
      },
      onSearchError: (error) => {
        logger.error('Error searching project files:', error);
      },
    });

    webview.postMessage(this._projectProjectFilesMessageForWebview(webview, message));
  }

  private _resolveSearchContextUri(): vscode.Uri | undefined {
    const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
    if (activeEditorUri) {
      this._lastTextEditorUri = activeEditorUri;
      return activeEditorUri;
    }
    return this._lastTextEditorUri;
  }

  private _resolveSearchProjectRoot(
    conversationId: string | undefined,
    contextUri: vscode.Uri | undefined,
  ): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (contextUri?.fsPath) {
      const fromContext = workspaceFolders.find((folder) =>
        isPathInsideWorkspace(contextUri.fsPath, folder.uri.fsPath),
      )?.uri.fsPath;
      if (fromContext) return fromContext;
    }

    if (conversationId) {
      const fromConversation = workspaceFolders.find(
        (folder) => getConversationWorkDirHash(folder.uri.fsPath) === conversationId.slice(0, 8),
      )?.uri.fsPath;
      if (fromConversation) return fromConversation;
    }

    return workspaceFolders[0]?.uri.fsPath;
  }

  private _projectProjectFilesMessageForWebview(
    webview: vscode.Webview,
    message: Awaited<ReturnType<typeof executeAgentProjectFileSearch>>,
  ): Awaited<ReturnType<typeof executeAgentProjectFileSearch>> {
    if (!this._localResourceAccess || !message.mentionExtras) {
      return message;
    }

    return {
      ...message,
      mentionExtras: message.mentionExtras.map((extra) => {
        if (!extra.thumbnailUri) return extra;
        const thumbnailUri =
          this._localResourceAccess?.toWebviewUri(
            webview,
            extra.thumbnailUri,
            'neko-agent.project-search-thumbnail',
          ) ?? extra.thumbnailUri;
        return { ...extra, thumbnailUri };
      }),
    };
  }

  /**
   * Dispose resources. Flushes asset index to disk.
   */
  dispose(): void {
    for (const disposable of this._subAgentEventSubscriptions.values()) {
      disposable.dispose();
    }
    this._subAgentEventSubscriptions.clear();
    this._streamProcessor.dispose();
    this._mediaDeliveryHost.dispose();
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._disposables.length = 0;
  }
}

function isTerminalSubAgentEvent(event: SubAgentEvent): boolean {
  return event.type === 'completed' || event.type === 'failed' || event.type === 'cancelled';
}

function toSubAgentTaskResultObservationTask(event: SubAgentEvent): Task {
  const status = toTaskStatusFromSubAgentEvent(event);
  const lifecycle: TaskLifecycleMetadata = {
    ownerConversationId: event.conversationId,
    ...(event.data?.runId ? { ownerRunId: event.data.runId } : {}),
    ...(event.data?.runStartedAt !== undefined
      ? { ownerRunStartedAt: event.data.runStartedAt }
      : {}),
    runMode: event.data?.runMode ?? 'background',
    costPhase: 'idle',
    interruptPolicy: 'detach-and-continue',
    recoverPolicy: 'snapshot-only',
  };
  const result = event.data?.result;
  const error = event.data?.error ?? result?.error;

  return {
    id: event.subAgentId,
    type: 'custom',
    status,
    input: {
      type: 'custom',
      payload: {
        subAgentId: event.subAgentId,
        parentAgentId: event.parentAgentId,
        ...(event.data?.description ? { description: event.data.description } : {}),
        ...(event.data?.subagentType ? { subagentType: event.data.subagentType } : {}),
        ...(event.data?.modelTier ? { modelTier: event.data.modelTier } : {}),
      },
      lifecycle,
    },
    output: {
      data: {
        subAgentId: event.subAgentId,
        ...(result?.response ? { response: result.response } : {}),
        ...(result?.iterations !== undefined ? { iterations: result.iterations } : {}),
        ...(result?.usage ? { usage: result.usage } : {}),
      },
      ...(error ? { error } : {}),
    },
    progress: status === 'completed' ? 100 : 0,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
    ...(error ? { error } : {}),
    lifecycle,
  };
}

function toTaskStatusFromSubAgentEvent(event: SubAgentEvent): TaskStatus {
  switch (event.type) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'spawned':
      return 'pending';
    case 'started':
    case 'progress':
      return 'running';
  }
}

function createVSCodeEntityMemoryContributionAutomation(): EntityMemoryContributionAutomationPort {
  return {
    async processContribution({ contribution }) {
      const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return vscode.commands.executeCommand<EntityMemoryContributionAutomationResult | undefined>(
        'neko.entity.processMemoryContribution',
        {
          ...(projectRoot ? { projectRoot } : {}),
          contribution,
          options: {
            mode: 'candidate',
            defaultKind: 'character',
          },
        },
      );
    },
  };
}

function isPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  const relative = path.relative(workspaceRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
