/**
 * Conversation Message Handler - Handles conversation management and agent control messages
 *
 * Responsible for:
 * - Conversation CRUD (new, switch, delete, clear, list)
 * - Agent control (confirmTool, cancelMessage, stopAgent)
 * - Agent state snapshots
 */

import * as vscode from 'vscode';
import { getLogger } from '../../base';
import type { ConversationHandler as ConversationManager } from '../conversationHandler';
import type { MessageHandler } from '../messageHandler';
import type { IAgentManager } from '../../ai/agentManager';

const logger = getLogger('ConversationMessageHandler');

/**
 * Dependencies for ConversationMessageHandler
 */
export interface ConversationMessageHandlerDeps {
  conversations: ConversationManager;
  agentManager?: IAgentManager;
  messages?: MessageHandler;
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

  handleNewConversation(): void {
    this.deps.conversations.create();
    this.sendConversationList();
    this.sendActiveConversation();
  }

  handleSwitchConversation(conversationId: string): void {
    if (this.deps.conversations.switchTo(conversationId)) {
      this.sendActiveConversation();
    }
  }

  handleDeleteConversation(conversationId: string): void {
    this.deps.agentManager?.remove(conversationId);
    this.deps.messages?.clearAgentState(conversationId);
    this.deps.conversations.delete(conversationId);
    this.sendConversationList();
    this.sendActiveConversation();
  }

  handleClearHistory(webview: vscode.Webview): void {
    const currentConversationId = this.deps.conversations.getActiveId();
    if (currentConversationId) {
      this.deps.agentManager?.clearHistory(currentConversationId);
    }
    this.deps.conversations.clearCurrent();
    webview.postMessage({ type: 'historyCleared' });
  }

  handleClearAllConversations(webview: vscode.Webview): void {
    for (const conv of this.deps.conversations.list()) {
      this.deps.agentManager?.remove(conv.id);
      this.deps.messages?.clearAgentState(conv.id);
    }
    this.deps.conversations.manager.clear();
    this.sendConversationList();
    webview.postMessage({ type: 'historyCleared' });
  }

  // ---- Agent Control ----

  handleConfirmTool(toolCallId: string, approved: boolean, conversationId: string): void {
    if (!conversationId) {
      logger.warn('No conversationId for confirmTool');
      return;
    }

    this.deps.agentManager?.confirmTool(conversationId, toolCallId, approved);
  }

  handleCancelMessage(webview: vscode.Webview, conversationId: string): void {
    if (conversationId && this.deps.agentManager) {
      const agent = this.deps.agentManager.get(conversationId);
      if (agent?.isRunning()) {
        const disposable = agent.onDidStop(() => {
          disposable.dispose();
          webview.postMessage({ type: 'messageCancelled', conversationId });
        });
        this.deps.agentManager.cancel(conversationId);
      } else {
        this.deps.agentManager.cancel(conversationId);
        webview.postMessage({ type: 'messageCancelled', conversationId });
      }
    } else {
      logger.warn('No conversationId for cancelMessage');
    }
  }

  handleStopAgent(webview: vscode.Webview, conversationId: string): void {
    if (conversationId && this.deps.agentManager) {
      this.deps.agentManager.cancel(conversationId);
      this.deps.messages?.clearAgentState(conversationId);
      webview.postMessage({ type: 'agentStopped', conversationId });
      webview.postMessage({
        type: 'agentPhase',
        conversationId,
        phase: 'idle',
        timestamp: Date.now(),
      });
    }
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
    webview.postMessage({
      type: 'agentStateSnapshot',
      agentStates: this.deps.messages.getAgentStateSnapshot(),
    });
  }
}
