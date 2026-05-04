/**
 * Conversation Message Handler - Handles conversation management and agent control messages
 *
 * Responsible for:
 * - Conversation CRUD (new, switch, delete, clear, list)
 * - Agent control (confirmTool, cancelMessage)
 * - Agent state snapshots
 */

import * as vscode from 'vscode';
import { buildAgentRuntimeStateSnapshotMessage } from '@neko/agent/runtime';
import {
  runCancelMessageRuntime,
  runClearAllConversationsRuntime,
  runClearHistoryRuntime,
  runConfirmToolRuntime,
  runDeleteConversationRuntime,
  runNewConversationRuntime,
  runSwitchConversationRuntime,
  type ConversationControlRuntimeEffects,
  type ConversationControlRuntimeMessage,
} from '@neko/agent';
import { getLogger } from '../../base';
import type { ConversationBridge } from '../conversationBridge';
import type { AgentMessageTurnHandler } from '../agentMessageTurnHandler';
import type { IAgentManager } from '../../ai/agentManager';

const logger = getLogger('ConversationMessageHandler');

export interface ConversationPromptModeCleanup {
  clearPromptMode(conversationId: string): void;
  clearAllPromptModes?(): void;
}

/**
 * Dependencies for ConversationMessageHandler
 */
export interface ConversationMessageHandlerDeps {
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
  messages?: AgentMessageTurnHandler;
  promptModeCleanup?: ConversationPromptModeCleanup;
  getWebview: () => vscode.Webview | undefined;
}

/**
 * Handler for conversation management and agent control webview messages
 */
export class ConversationMessageHandler {
  constructor(private deps: ConversationMessageHandlerDeps) {}

  updateDeps(partial: Partial<ConversationMessageHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  // ---- Conversation CRUD ----

  handleNewConversation(): Promise<void> {
    return this._runConversationRuntime(() =>
      runNewConversationRuntime(this._createConversationRuntimeEffects()),
    );
  }

  handleSwitchConversation(conversationId: string): Promise<void> {
    return this._runConversationRuntime(() =>
      runSwitchConversationRuntime({ conversationId }, this._createConversationRuntimeEffects()),
    );
  }

  handleDeleteConversation(conversationId: string): Promise<void> {
    return this._runConversationRuntime(() =>
      runDeleteConversationRuntime({ conversationId }, this._createConversationRuntimeEffects()),
    );
  }

  handleClearHistory(webview: vscode.Webview, conversationId: string): Promise<void> {
    return this._runConversationRuntime(() =>
      runClearHistoryRuntime({ conversationId }, this._createConversationRuntimeEffects(webview)),
    );
  }

  handleClearAllConversations(webview: vscode.Webview): Promise<void> {
    return this._runConversationRuntime(() =>
      runClearAllConversationsRuntime(this._createConversationRuntimeEffects(webview)),
    );
  }

  // ---- Agent Control ----

  handleConfirmTool(toolCallId: string, approved: boolean, conversationId: string): Promise<void> {
    return this._runConversationRuntime(() =>
      runConfirmToolRuntime(
        { conversationId, toolCallId, approved },
        this._createConversationRuntimeEffects(),
      ),
    );
  }

  handleCancelMessage(webview: vscode.Webview, conversationId: string): Promise<void> {
    return this._runConversationRuntime(() =>
      runCancelMessageRuntime({ conversationId }, this._createConversationRuntimeEffects(webview)),
    );
  }

  // ---- Queries ----

  sendConversationList(): void {
    const webview = this.deps.getWebview();
    if (webview) {
      this.deps.conversations.sendConversationList(webview);
    }
  }

  sendActiveConversation(): void {
    const webview = this.deps.getWebview();
    if (webview) {
      this.deps.conversations.sendActiveConversation(webview);
    }
  }

  sendAgentStateSnapshot(webview: vscode.Webview): void {
    if (!this.deps.messages) return;
    webview.postMessage(
      buildAgentRuntimeStateSnapshotMessage(this.deps.messages.getAgentStateSnapshot()),
    );
  }

  private async _runConversationRuntime(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.error('Conversation runtime bridge failed:', error);
    }
  }

  private _createConversationRuntimeEffects(
    webview?: vscode.Webview,
  ): ConversationControlRuntimeEffects {
    const promptModeCleanup = this.deps.promptModeCleanup;
    const effects: ConversationControlRuntimeEffects = {
      createConversation: () => this.deps.conversations.create(),
      switchConversation: (conversationId) => this.deps.conversations.switchTo(conversationId),
      deleteConversation: (conversationId) => this.deps.conversations.delete(conversationId),
      listConversationIds: () =>
        this.deps.conversations.list().map((conversation) => conversation.id),
      clearConversations: () => this.deps.conversations.clearAll(),
      refreshConversationList: () => this.sendConversationList(),
      refreshActiveConversation: () => this.sendActiveConversation(),
      removeAgent: (conversationId) => this.deps.agentManager?.remove(conversationId),
      clearAgentState: (conversationId) => this.deps.messages?.clearAgentState(conversationId),
      clearAgentHistory: (conversationId) => this.deps.agentManager?.clearHistory(conversationId),
      updateConversationMessages: (conversationId, messages) =>
        this.deps.conversations.updateMessagesForConversation(conversationId, messages),
      confirmTool: (conversationId, toolCallId, approved) =>
        this.deps.agentManager?.confirmTool(conversationId, toolCallId, approved),
      cancelAgent: this.deps.agentManager
        ? (conversationId) => this.deps.agentManager?.cancel(conversationId)
        : undefined,
      isAgentRunning: (conversationId) =>
        this.deps.agentManager?.get(conversationId)?.isRunning() ?? false,
      onAgentStopped: (conversationId, listener) =>
        this.deps.agentManager?.get(conversationId)?.onDidRunnerEvent((event) => {
          if (event.type === 'stop') {
            listener();
          }
        }),
      postMessage: async (message: ConversationControlRuntimeMessage): Promise<void> => {
        await webview?.postMessage(message);
      },
      now: () => Date.now(),
      onWarning: ({ code, action, conversationId }) => {
        logger.warn('Conversation control runtime warning:', { code, action, conversationId });
      },
    };
    if (promptModeCleanup) {
      effects.clearPromptMode = (conversationId) =>
        promptModeCleanup.clearPromptMode(conversationId);
      if (promptModeCleanup.clearAllPromptModes) {
        effects.clearAllPromptModes = () => promptModeCleanup.clearAllPromptModes?.();
      }
    }
    return effects;
  }
}
