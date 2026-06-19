/**
 * Webview bridge for agent turns.
 *
 * @neko/agent owns turn planning, context patching, history hydration, and
 * stream projection. This bridge wires those runtime contracts to VSCode host
 * services and webview messages.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import type {
  AgentMediaModelSelections,
  AgentPhase,
  MediaModelCategory,
  ModelRef,
} from '@neko-agent/types';
import {
  buildAgentTurnForWebviewRuntimeInput,
  createTimelineContextRuntime,
  runAgentTurnForWebviewRuntime,
  type AgentMessageExecutionOverrides,
  type AgentTurnAgentManager,
  type TimelineContextRuntime,
} from '@neko/agent/runtime';
import type {
  ActiveSkillState,
  AgentHistoryWithToolContextMessage,
  IRuntimeTaskManager,
} from '@neko/agent';
import type { IAgentManager } from '../../ai/agentManager';
import type { IAgentRunner } from '../../ai/agentRunner';
import type { IAgentContext } from '../../ai/agentContext';
import type { IEditorRegistry } from '../../editor/common/editorRegistry';
import { getCanvasSelection } from '../../services/canvasAmbientContext';
import type { IEngineClientProvider } from '../../services/engineClientProvider';
import type { ConversationBridge } from '../conversationBridge';
import type { ProviderManager } from '../providerManager';
import type { SettingsManager } from '../settingsManager';
import type { AgentStreamProcessor } from './agentStreamProcessor';
import type { AccountAiCatalogCache } from '../../services/accountAiCatalogCache';

export interface AgentTurnBridgeDeps {
  settings: SettingsManager;
  providers: ProviderManager;
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
  editorRegistry?: IEditorRegistry;
  getSystemPrompt: (conversationId: string) => string;
  isPlanMode: (conversationId: string) => boolean;
  platform?: Platform;
  taskManager?: IRuntimeTaskManager;
  getActiveSkillState?: (conversationId: string) => ActiveSkillState | undefined;
  engineClientProvider: IEngineClientProvider;
  accountAiCatalog?: AccountAiCatalogCache;
  streamProcessor: AgentStreamProcessor;
  onPhaseChange: (event: {
    conversationId: string;
    phase: AgentPhase;
    toolName?: string;
    timestamp: number;
  }) => void;
  ensureSubAgentEventSubscription: (
    webview: vscode.Webview,
    conversationId: string,
    agentRunner: IAgentRunner,
  ) => void;
  generateMessageId: () => string;
}

export interface ExecuteAgentTurnForWebviewInput {
  webview: vscode.Webview;
  conversationId: string;
  message: string;
  chatModel?: ModelRef<'llm'>;
  imageAttachments?: readonly { type: 'base64'; media_type: string; data: string }[];
  mediaModel?: ModelRef<MediaModelCategory>;
  mediaModels?: AgentMediaModelSelections;
  executionOverrides?: AgentMessageExecutionOverrides;
}

export class AgentTurnBridge {
  private readonly timelineContextRuntime: TimelineContextRuntime;

  constructor(private readonly deps: AgentTurnBridgeDeps) {
    this.timelineContextRuntime = createTimelineContextRuntime({
      getPerceptionClient: () => this.deps.engineClientProvider.getOptionalClient(),
    });
  }

  async execute(input: ExecuteAgentTurnForWebviewInput): Promise<void> {
    await this.refreshAccountCatalogForTurn(input.chatModel?.providerId);
    const agentManagerBridge:
      | AgentTurnAgentManager<
          Platform,
          IAgentContext,
          AgentHistoryWithToolContextMessage,
          IAgentRunner
        >
      | undefined = this.deps.agentManager
      ? {
          getOrCreate: (id) => this.deps.agentManager!.getOrCreate(id),
          loadHistoryWithContext: (id, history) =>
            this.deps.agentManager!.loadHistoryWithContext(id, history),
        }
      : undefined;

    await runAgentTurnForWebviewRuntime(
      buildAgentTurnForWebviewRuntimeInput({
        conversationId: input.conversationId,
        message: input.message,
        platform: this.deps.platform,
        chatModel: input.chatModel,
        mediaModel: input.mediaModel,
        mediaModels: input.mediaModels,
        imageAttachments: input.imageAttachments,
        executionOverrides: input.executionOverrides,
        settings: {
          selectedProviderId: this.deps.settings.selectedProviderId,
          selectedModelId: this.deps.settings.selectedModelId,
          customSystemPrompt: this.deps.settings.customSystemPrompt,
          executionMode: this.deps.settings.executionMode,
          autoExecuteTools: this.deps.settings.autoExecuteTools,
          temperature: this.deps.settings.temperature,
          maxTokens: this.deps.settings.maxTokens,
          thinkingBudget: this.deps.settings.thinkingBudget,
        },
        providers: {
          getProvider: (providerId) => this.deps.providers.getProvider(providerId),
        },
        runtime: {
          conversations: {
            getMessageCount: (id) => this.deps.conversations.get(id)?.messages.length ?? 0,
            getFullHistory: (id) => this.deps.conversations.toAgentHistory(id),
            addAssistantMessage: (id, assistantMessage) =>
              this.deps.conversations.upsertMessageToConversation(id, assistantMessage),
          },
          getBaseSystemPrompt: this.deps.getSystemPrompt,
          isPlanMode: this.deps.isPlanMode,
          getActiveSkillState: this.deps.getActiveSkillState,
          ...(this.deps.taskManager ? { taskManager: this.deps.taskManager } : {}),
        },
        host: {
          agentManager: agentManagerBridge,
          getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          getActiveEditor: () => this.deps.editorRegistry?.getActiveEditor(),
          getAmbientCanvas: (id) => getCanvasSelection(id),
          timelineContextRuntime: this.timelineContextRuntime,
          processStream: ({ conversationId, messageId, events, onPhaseChange }) =>
            this.deps.streamProcessor.processStream(input.webview, conversationId, events, {
              messageId,
              onPhaseChange,
            }),
          ensureSubAgentEventSubscription: ({ conversationId, agentRunner }) =>
            this.deps.ensureSubAgentEventSubscription(input.webview, conversationId, agentRunner),
          postMessage: (message) => {
            void input.webview.postMessage(message);
          },
          onPhaseChange: this.deps.onPhaseChange,
          onErrorMessage: (conversationId, message) => {
            this.deps.conversations.addMessageToConversation(conversationId, message);
          },
          generateMessageId: this.deps.generateMessageId,
          now: () => Date.now(),
        },
      }),
    );
  }

  private async refreshAccountCatalogForTurn(providerId?: string): Promise<void> {
    if (!this.deps.accountAiCatalog) return;
    const cached = this.deps.accountAiCatalog.getCachedSnapshot();
    if (cached && (!providerId || cached.provider.id === providerId)) return;
    try {
      await this.deps.accountAiCatalog.getSnapshot();
    } catch (error) {
      this.deps.accountAiCatalog.invalidateForAuthFailure(error);
    }
  }
}
