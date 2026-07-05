/**
 * Conversation Message Handler - Handles conversation management and agent control messages
 *
 * Responsible for:
 * - Conversation CRUD (new, switch, delete, clear, list)
 * - Agent control (confirmTool, cancelMessage)
 * - Agent state snapshots
 */

import * as vscode from 'vscode';
import {
  AgentPendingMessageQueueError,
  buildAgentRuntimeStateSnapshotMessage,
  type AgentPendingMessageItem,
} from '@neko/agent/runtime';
import {
  buildMessageQueueErrorMessage,
  buildMessageQueueSnapshotMessage,
  buildQueuedMessageEditRequestedMessage,
  type AgentMessageQueueErrorCode,
  type AgentMessageQueueSnapshot,
  type AgentQueuedMessageItem,
} from '@neko-agent/types';
import {
  runCancelMessageRuntime,
  runClearAllConversationsRuntime,
  runClearHistoryRuntime,
  runConfirmToolRuntime,
  runDeleteConversationRuntime,
  type DeleteConversationRuntimeOptions,
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
  private readonly localQueueSnapshotVersions = new Map<string, number>();

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

  handleDeleteConversation(
    conversationId: string,
    options?: DeleteConversationRuntimeOptions,
  ): Promise<void> {
    return this._runConversationRuntime(() =>
      runDeleteConversationRuntime(
        { conversationId, activateNext: options?.activateNext },
        this._createConversationRuntimeEffects(),
      ),
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

  sendConversationSnapshot(conversationId: string): boolean {
    const webview = this.deps.getWebview();
    if (!webview) {
      return false;
    }
    return this.deps.conversations.sendConversationSnapshot(webview, conversationId);
  }

  sendAgentStateSnapshot(webview: vscode.Webview): void {
    if (!this.deps.messages) return;
    webview.postMessage(
      buildAgentRuntimeStateSnapshotMessage(this.deps.messages.getAgentStateSnapshot()),
    );
  }

  sendMessageQueueSnapshot(webview: vscode.Webview, conversationId: string): void {
    webview.postMessage(
      buildMessageQueueSnapshotMessage(this._createQueueSnapshot(conversationId)),
    );
  }

  handlePromoteQueuedMessage(
    webview: vscode.Webview,
    conversationId: string,
    queueItemId: string,
  ): void {
    this._runQueueAction(webview, conversationId, queueItemId, () => {
      this._requireAgentManager().promotePendingMessage(conversationId, queueItemId);
      webview.postMessage(
        buildMessageQueueSnapshotMessage(this._createQueueSnapshot(conversationId)),
      );
    });
  }

  handleCancelQueuedMessage(
    webview: vscode.Webview,
    conversationId: string,
    queueItemId: string,
  ): void {
    this._runQueueAction(webview, conversationId, queueItemId, () => {
      this._requireAgentManager().removePendingMessage(conversationId, queueItemId);
      webview.postMessage(
        buildMessageQueueSnapshotMessage(this._createQueueSnapshot(conversationId)),
      );
    });
  }

  handleEditQueuedMessage(
    webview: vscode.Webview,
    conversationId: string,
    queueItemId: string,
  ): void {
    this._runQueueAction(webview, conversationId, queueItemId, () => {
      const item = this._requireAgentManager().removePendingMessage(conversationId, queueItemId);
      const snapshot = this._createQueueSnapshot(conversationId);
      webview.postMessage(
        buildQueuedMessageEditRequestedMessage({
          conversationId,
          item: projectAgentPendingMessageItem(item),
          snapshot,
        }),
      );
    });
  }

  private async _runConversationRuntime(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      logger.error('Conversation runtime bridge failed:', error);
    }
  }

  private _runQueueAction(
    webview: vscode.Webview,
    conversationId: string,
    queueItemId: string | undefined,
    action: () => void,
  ): void {
    try {
      action();
    } catch (error) {
      webview.postMessage(
        buildMessageQueueErrorMessage({
          conversationId,
          code: projectQueueErrorCode(error),
          message: error instanceof Error ? error.message : 'Message queue operation failed.',
          ...(queueItemId ? { queueItemId } : {}),
          snapshot: this._createQueueSnapshot(conversationId),
        }),
      );
    }
  }

  private _requireAgentManager(): IAgentManager {
    if (!this.deps.agentManager) {
      throw new Error('Agent manager is not available for message queue operation.');
    }
    return this.deps.agentManager;
  }

  private _createQueueSnapshot(conversationId: string): AgentMessageQueueSnapshot {
    const items =
      this.deps.agentManager
        ?.getPendingMessageQueue(conversationId)
        .map(projectAgentPendingMessageItem) ?? [];
    return {
      conversationId,
      items,
      pendingCount: items.length,
      version:
        this.deps.agentManager?.nextMessageQueueSnapshotVersion(conversationId) ??
        this._nextLocalQueueSnapshotVersion(conversationId),
    };
  }

  private _nextLocalQueueSnapshotVersion(conversationId: string): number {
    const nextVersion = (this.localQueueSnapshotVersions.get(conversationId) ?? 0) + 1;
    this.localQueueSnapshotVersions.set(conversationId, nextVersion);
    return nextVersion;
  }

  private _createConversationRuntimeEffects(
    webview?: vscode.Webview,
  ): ConversationControlRuntimeEffects {
    const promptModeCleanup = this.deps.promptModeCleanup;
    const effects: ConversationControlRuntimeEffects = {
      createConversation: () => this.deps.conversations.create(),
      switchConversation: (conversationId) => this.deps.conversations.switchTo(conversationId),
      deleteConversation: (conversationId, options) =>
        this.deps.conversations.delete(conversationId, options),
      listConversationIds: () =>
        this.deps.conversations.list().map((conversation) => conversation.id),
      clearConversations: () => this.deps.conversations.clearAll(),
      refreshConversationList: () => this.sendConversationList(),
      refreshActiveConversation: () => this.sendActiveConversation(),
      removeAgent: (conversationId) => this.deps.agentManager?.remove(conversationId),
      clearAgentState: (conversationId) => this.deps.messages?.clearAgentState(conversationId),
      clearAgentHistory: (conversationId) => this.deps.agentManager?.clearHistory(conversationId),
      clearPendingMessages: (conversationId) => {
        this.deps.agentManager?.clearPendingMessages(conversationId);
        webview?.postMessage(
          buildMessageQueueSnapshotMessage(this._createQueueSnapshot(conversationId)),
        );
      },
      updateConversationMessages: (conversationId, messages) =>
        this.deps.conversations.updateMessagesForConversation(conversationId, messages),
      confirmTool: (conversationId, toolCallId, approved) =>
        this.deps.agentManager?.confirmTool(conversationId, toolCallId, approved),
      cancelAgent: this.deps.agentManager
        ? (conversationId) => this.deps.agentManager?.cancel(conversationId)
        : undefined,
      isAgentRunning: (conversationId) =>
        this.deps.agentManager?.get(conversationId)?.isRunning() ?? false,
      onAgentStopped: (conversationId, listener) => {
        const runner = this.deps.agentManager?.get(conversationId);
        if (!runner) return undefined;
        return runner.onDidRunnerEvent((event) => {
          if (event.type === 'stop') {
            listener();
          }
        });
      },
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

function projectAgentPendingMessageItem(item: AgentPendingMessageItem): AgentQueuedMessageItem {
  return {
    id: item.id,
    conversationId: item.conversationId,
    content: item.content,
    createdAt: item.createdAt,
    ...(item.updatedAt !== undefined ? { updatedAt: item.updatedAt } : {}),
    source: item.source,
  };
}

function projectQueueErrorCode(error: unknown): AgentMessageQueueErrorCode {
  if (error instanceof AgentPendingMessageQueueError) {
    if (error.code === 'stale-item') return 'stale-item';
    if (error.code === 'not-queueable') return 'not-queueable';
  }
  return 'invalid-queue-operation';
}
