/**
 * Conversation Bridge
 * Thin VSCode host bridge for conversation persistence and WebView delivery.
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';
import { buildActiveConversationMessage, buildConversationListMessage } from '@neko/agent/runtime';
import {
  createConversationId,
  createFileConversationPersistenceRuntime,
  ConversationManager,
  type AgentHistoryEntry,
  type ConversationPersistenceRuntime,
  type ConversationStorage,
} from '@neko/agent';
import type { Message } from '@neko-agent/types';
import type { AgentLocalResourceAccess } from '../services/localResourceAccess';

const logger = getLogger('ConversationBridge');

/**
 * Convert local file path to webview URI
 */
function toWebviewUri(
  webview: vscode.Webview,
  filePath: string,
  localResourceAccess?: AgentLocalResourceAccess,
): string | undefined {
  try {
    if (localResourceAccess) {
      return localResourceAccess.toWebviewUri(webview, filePath, 'neko-agent.conversation');
    }
    logger.warn('Local resource access service unavailable for conversation media projection', {
      filePath,
    });
    return undefined;
  } catch {
    logger.warn(`Failed to convert path to webview URI: ${filePath}`);
    return undefined;
  }
}

/**
 * VSCode Memento storage adapter for ConversationManager
 */
class VscodeConversationStorage implements ConversationStorage {
  constructor(private readonly state: vscode.Memento) {}

  get<T>(key: string): T | undefined {
    return this.state.get(key);
  }

  update(key: string, value: unknown): Promise<void> {
    return Promise.resolve(this.state.update(key, value));
  }
}

export class ConversationBridge {
  private _conversationManager: ConversationManager;
  private _persistenceRuntime: ConversationPersistenceRuntime | null = null;

  constructor(
    context: vscode.ExtensionContext,
    workspaceRoot?: string,
    private readonly localResourceAccess?: AgentLocalResourceAccess,
  ) {
    const storage = new VscodeConversationStorage(context.workspaceState);
    this._conversationManager = new ConversationManager(storage, undefined, {
      ...(workspaceRoot && {
        generateId: () => createConversationId(workspaceRoot),
      }),
    });

    // Clean up empty conversations from previous sessions
    const cleaned = this._conversationManager.cleanupEmpty();
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} empty conversation(s)`);
    }

    // Initialize shared resume-layer file storage if workspace root is known
    if (workspaceRoot) {
      this._persistenceRuntime = createFileConversationPersistenceRuntime({
        workspaceRoot,
        source: 'extension',
        getConversation: (conversationId) => this._conversationManager.get(conversationId),
        onWarning: (warning) => {
          logger.warn('Failed to sync conversation to file', {
            conversationId: warning.conversationId,
            err: warning.error,
          });
        },
      });
    }
  }

  /**
   * Get underlying conversation manager
   */
  get manager(): ConversationManager {
    return this._conversationManager;
  }

  /**
   * Create new conversation
   */
  create(): string {
    return this._conversationManager.create();
  }

  /**
   * Get active conversation
   */
  getActive() {
    return this._conversationManager.getActive();
  }

  /**
   * Get active conversation ID
   */
  getActiveId(): string | null {
    return this._conversationManager.getActiveId();
  }

  /**
   * Get conversation by ID
   */
  get(conversationId: string) {
    return this._conversationManager.get(conversationId);
  }

  /**
   * Get message count for a conversation without exposing the storage manager.
   */
  getMessageCount(conversationId: string): number | undefined {
    return this._conversationManager.get(conversationId)?.messages.length;
  }

  /**
   * Project a conversation into agent history for runtime hydration.
   */
  toAgentHistory(conversationId: string): AgentHistoryEntry[] {
    return this._conversationManager.toAgentHistory(conversationId);
  }

  /**
   * Switch to a different conversation
   */
  switchTo(conversationId: string): boolean {
    return this._conversationManager.setActive(conversationId);
  }

  /**
   * Delete a conversation
   */
  delete(conversationId: string): void {
    this._conversationManager.delete(conversationId);
    this._queueConversationDelete(conversationId);
  }

  /**
   * Clear all conversations and remove matching shared resume-layer records.
   */
  clearAll(): void {
    const conversationIds = this._conversationManager.list().map((conversation) => conversation.id);
    this._conversationManager.clear();
    for (const conversationId of conversationIds) {
      this._queueConversationDelete(conversationId);
    }
  }

  /**
   * Clear current conversation messages
   */
  clearCurrent(): void {
    const conversationId = this._conversationManager.getActiveId();
    if (conversationId) {
      this.updateMessagesForConversation(conversationId, []);
    }
  }

  /**
   * List all conversations
   */
  list() {
    return this._conversationManager.list();
  }

  /**
   * Add message to active conversation
   */
  addMessage(message: Message): void {
    const conversationId = this._conversationManager.getActiveId();
    if (!conversationId) return;
    this.addMessageToConversation(conversationId, message);
  }

  /**
   * Add message to a specific conversation (for background execution)
   */
  addMessageToConversation(conversationId: string, message: Message): void {
    // Use incremental addMessage instead of full array copy via updateMessages
    this._conversationManager.addMessage(conversationId, message);
    this._conversationManager.flush();
    // Queue shared resume-layer persistence (best-effort, non-blocking).
    this._queueConversationPersistence(conversationId);
  }

  /**
   * Replace messages for a specific conversation and keep the shared resume layer in sync.
   */
  updateMessagesForConversation(conversationId: string, messages: Message[]): void {
    this._conversationManager.updateMessages(conversationId, messages);
    this._conversationManager.flush();
    this._queueConversationPersistence(conversationId);
  }

  /**
   * Write conversation metadata to the shared resume layer
   * (~/.neko/conversations-index.json + journal-backed history).
   * Best-effort: errors are logged but not rethrown.
   */
  private _queueConversationPersistence(conversationId: string): void {
    this._persistenceRuntime?.queueConversationSync(conversationId);
  }

  private _queueConversationDelete(conversationId: string): void {
    this._persistenceRuntime?.queueConversationDelete(conversationId);
  }

  /**
   * Ensure there's an active conversation (create if needed)
   */
  ensureActive(): string {
    const conversation = this._conversationManager.getActive();
    if (!conversation) {
      return this._conversationManager.create();
    }
    return conversation.id;
  }

  /**
   * Send conversation list to webview
   */
  sendConversationList(webview: vscode.Webview): void {
    webview.postMessage(buildConversationListMessage(this._conversationManager.list()));
  }

  /**
   * Send active conversation to webview
   */
  sendActiveConversation(webview: vscode.Webview): void {
    webview.postMessage(
      buildActiveConversationMessage(this._conversationManager.getActive(), {
        resolveLocalMediaPath: (filePath) =>
          toWebviewUri(webview, filePath, this.localResourceAccess),
      }),
    );
  }

  dispose(): void {
    this._conversationManager.flush();
    try {
      const result = this._persistenceRuntime?.dispose();
      if (result && typeof result.then === 'function') {
        result.catch((error: unknown) => {
          logger.warn('Failed to dispose conversation persistence runtime', error);
        });
      }
    } catch (error) {
      logger.warn('Failed to dispose conversation persistence runtime', error);
    }
  }
}
