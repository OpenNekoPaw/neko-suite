/**
 * Context Handler - Handles context management webview messages
 *
 * Responsible for:
 * - Getting context token counts
 * - Triggering context compression
 */

import * as vscode from 'vscode';
import type { IAgentManager } from '../../ai/agentManager';
import type { ConversationHandler } from '../conversationHandler';

/**
 * Dependencies for ContextHandler
 */
export interface ContextHandlerDeps {
  conversations: ConversationHandler;
  agentManager?: IAgentManager;
}

/**
 * Handler for context management webview messages
 */
export class ContextHandler {
  constructor(private deps: ContextHandlerDeps) {}

  /**
   * Get context token count for a conversation
   */
  getTokenCount(webview: vscode.Webview, conversationId?: string): void {
    const activeId = conversationId || this.deps.conversations.getActiveId();
    if (!activeId || !this.deps.agentManager) {
      webview.postMessage({
        type: 'contextTokenCount',
        conversationId: activeId,
        tokenCount: 0,
      });
      return;
    }

    const tokenCount = this.deps.agentManager.getContextTokenCount(activeId);
    webview.postMessage({
      type: 'contextTokenCount',
      conversationId: activeId,
      tokenCount,
    });
  }

  /**
   * Trigger context compression for a conversation
   */
  async compressContext(webview: vscode.Webview, conversationId?: string): Promise<void> {
    const activeId = conversationId || this.deps.conversations.getActiveId();
    if (!activeId || !this.deps.agentManager) {
      webview.postMessage({
        type: 'compressionError',
        conversationId: activeId,
        error: 'No active conversation or agent manager',
      });
      return;
    }

    try {
      const result = await this.deps.agentManager.compressContext(activeId);
      webview.postMessage({
        type: 'compressionResult',
        conversationId: activeId,
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        ratio: result.ratio,
      });
    } catch (error) {
      webview.postMessage({
        type: 'compressionError',
        conversationId: activeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
