/**
 * Context Handler - Handles context management webview messages
 *
 * Responsible for:
 * - Getting context token counts
 * - Triggering context compression
 */

import * as vscode from 'vscode';
import { compressAgentContext, sendAgentContextTokenCount } from '@neko/agent/runtime';
import type { IAgentManager } from '../../ai/agentManager';
import type { ConversationBridge } from '../conversationBridge';
import { getLogger } from '../../base';

const logger = getLogger('ContextHandler');

/**
 * Dependencies for ContextHandler
 */
export interface ContextHandlerDeps {
  conversations: ConversationBridge;
  agentManager?: IAgentManager;
}

/**
 * Handler for context management webview messages
 */
export class ContextHandler {
  constructor(private deps: ContextHandlerDeps) {}

  updateDeps(partial: Partial<ContextHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * Get context token count for a conversation
   */
  getTokenCount(webview: vscode.Webview, conversationId: string): void {
    sendAgentContextTokenCount({
      conversationId,
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      ...(this.deps.agentManager
        ? { getTokenCount: (id: string) => this.getContextTokenCount(id) }
        : { getTokenCount: (id: string) => this.getPersistedConversationTokenCount(id) }),
      onMissingConversationId: () => {
        logger.warn('Rejected getTokenCount without conversationId');
      },
    });
  }

  /**
   * Trigger context compression for a conversation
   */
  async compressContext(webview: vscode.Webview, conversationId: string): Promise<void> {
    await compressAgentContext({
      conversationId,
      postMessage: (message) => {
        void webview.postMessage(message);
      },
      ...(this.deps.agentManager
        ? { compressContext: (id: string) => this.deps.agentManager!.compressContext(id) }
        : {}),
      onMissingConversationId: () => {
        logger.warn('Rejected compressContext without conversationId');
      },
    });
  }

  private getContextTokenCount(conversationId: string): number {
    const runtimeTokenCount = this.deps.agentManager?.getContextTokenCount(conversationId) ?? 0;
    if (Number.isFinite(runtimeTokenCount) && runtimeTokenCount > 0) {
      return runtimeTokenCount;
    }
    return this.getPersistedConversationTokenCount(conversationId);
  }

  private getPersistedConversationTokenCount(conversationId: string): number {
    const conversation = this.deps.conversations.get(conversationId);
    const storedTokenCount = conversation?.tokenCount;
    if (
      storedTokenCount !== undefined &&
      Number.isFinite(storedTokenCount) &&
      storedTokenCount > 0
    ) {
      return storedTokenCount;
    }

    return (
      conversation?.messages.reduce(
        (sum, message) => sum + estimateMessageTokenCount(message.content),
        0,
      ) ?? 0
    );
  }
}

function estimateMessageTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}
