/**
 * Agent Message Turn Handler
 *
 * Bridges user-message runtime contracts to VSCode host services.
 * Runtime owns dispatch sequencing; this layer injects webview, workspace,
 * media, and agent-turn adapters.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
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
import {
  executeAgentProjectFileSearch,
  createAgentMessageId,
  createAgentStateRuntime,
  createSubAgentEventRuntime,
  createWorkspaceInputProcessorRuntime,
  runAgentMessageTurnRuntime,
  type AgentStateRuntime,
  type AgentStateRuntimeEntry,
  type AgentMessageRuntimeRequest,
  type SubAgentEventRuntime,
  type WorkspaceInputProcessorRuntime,
} from '@neko/agent/runtime';
import {
  createInputProcessor,
  type ActiveSkillState,
  type InputProcessor,
  type IRuntimeTaskManager,
} from '@neko/agent';
import { getLogger } from '../base';
import {
  getEngineClientProvider,
  type IEngineClientProvider,
} from '../services/engineClientProvider';
import { MediaTaskDeliveryHost } from '../services/mediaTaskDeliveryHost';
import { MediaTurnBridge } from '../services/mediaTurnBridge';
import { createVSCodeWorkspaceFileReader } from '../services/workspaceFileReader';
import { searchVSCodeProjectFiles } from '../services/workspaceProjectSearch';
import { AgentTurnBridge } from './message/agentTurnBridge';

const logger = getLogger('AgentMessageTurnHandler');

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
    private readonly _engineClientProvider: IEngineClientProvider = getEngineClientProvider(),
  ) {
    this._attachmentProcessor = new AttachmentProcessor();

    this._mediaDeliveryHost = new MediaTaskDeliveryHost({
      platform: this._platform,
      transcodeFile: (inputPath, outputPath, mediaType) =>
        this._engineClientProvider.transcodeFile(inputPath, outputPath, mediaType),
    });
    this._mediaTurnBridge = new MediaTurnBridge({
      platform: this._platform,
      mediaDeliveryHost: this._mediaDeliveryHost,
    });

    this._streamProcessor = new AgentStreamProcessor({
      platform: this._platform,
      conversations: this._conversations,
      transcodeFile: (inputPath, outputPath, mediaType) =>
        this._engineClientProvider.transcodeFile(inputPath, outputPath, mediaType),
      mediaDeliveryHost: this._mediaDeliveryHost,
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
      engineClientProvider: this._engineClientProvider,
      streamProcessor: this._streamProcessor,
      onPhaseChange: ({ conversationId, phase, toolName, timestamp }) =>
        this._updateAgentState(conversationId, phase, toolName, timestamp),
      ensureSubAgentEventSubscription: (webview, conversationId, agentRunner) =>
        this._ensureSubAgentEventSubscription(webview, conversationId, agentRunner),
      generateMessageId: () => createAgentMessageId(),
    });
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

  clearAgentState(conversationId: string): void {
    this._agentStateRuntime.clear(conversationId);
    this._clearSubAgentEventSubscription(conversationId);
    this._streamProcessor.clearConversation(conversationId);
  }

  /**
   * Handle incoming user message
   */
  async handleUserMessage(
    webview: vscode.Webview,
    request: AgentMessageRuntimeRequest,
  ): Promise<void> {
    await runAgentMessageTurnRuntime({
      request,
      inputProcessor: this._getInputProcessor(),
      processAttachments: (attachments) =>
        this._attachmentProcessor.processAttachments(attachments ? [...attachments] : undefined),
      createReferencedMediaProcessor: async () =>
        new MediaPreprocessor(await this._engineClientProvider.getOptionalClient()),
      onReferenceError: (error) => {
        logger.warn(`Could not read file: ${error.reference}`, error.error);
      },
      onFileReferenceProcessingError: (error) => {
        logger.error('InputProcessor error:', error);
      },
      onReferencedMediaProcessed: ({ filePath, mediaType, metadata }) => {
        if (metadata) {
          logger.info(`Preprocessed ${filePath}: ${mediaType}`, metadata);
        }
      },
      onReferencedMediaError: ({ filePath, error }) => {
        logger.warn(`Failed to preprocess media: ${filePath}`, error);
      },
      persistUserMessage: (conversationId, message) => {
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
              chatModel,
              imageAttachments,
              mediaModel,
              mediaModels,
              executionOverrides,
            }) =>
              this._agentTurnBridge.execute({
                webview,
                conversationId,
                message,
                chatModel,
                imageAttachments,
                mediaModel,
                mediaModels,
                executionOverrides,
              })
          : undefined,
      onMissingConversationId: () => {
        logger.warn('Rejected user message without conversationId');
      },
      generateMessageId: () => createAgentMessageId(),
      now: () => Date.now(),
    });
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
  }

  private _ensureSubAgentEventSubscription(
    webview: vscode.Webview,
    conversationId: string,
    agentRunner: IAgentRunner,
  ): void {
    if (this._subAgentEventSubscriptions.has(conversationId)) {
      return;
    }

    const disposable = agentRunner.onDidSubAgentEvent((event) => {
      const message = this._subAgentEventRuntime.projectForConversation({
        conversationId,
        event,
      });
      if (!message) {
        return;
      }
      webview.postMessage(message);
    });

    this._subAgentEventSubscriptions.set(conversationId, disposable);
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
    conversationId: string,
  ): Promise<void> {
    const message = await executeAgentProjectFileSearch({
      conversationId,
      filter,
      searchProjectFiles: searchVSCodeProjectFiles,
      getCanvasNodes: (id) => getCanvasSelection(id),
      onSearchError: (error) => {
        logger.error('Error searching project files:', error);
      },
    });

    webview.postMessage(message);
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
  }
}
