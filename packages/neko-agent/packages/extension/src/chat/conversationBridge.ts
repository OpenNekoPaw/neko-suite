/**
 * Conversation Bridge
 * Thin VSCode host bridge for conversation persistence and WebView delivery.
 */

import * as vscode from 'vscode';
import { getLogger } from '../base';
import { buildConversationListMessage } from '@neko/agent/runtime';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { CreativeAiConversationProjection } from '@neko-agent/types';
import {
  createConversationId,
  createFileAgentWorkspaceRuntimeStateRuntime,
  createFileConversationPersistenceRuntime,
  ConversationManager,
  type AgentHistoryEntry,
  type AgentWorkspaceRuntimeStateRuntime,
  type AgentWorkspaceRuntimeStatePatch,
  type ConversationPersistenceRuntime,
  type ConversationStorage,
  type DeleteConversationOptions,
} from '@neko/agent';
import { buildAgentSessionDiagnosticMessage, type Message } from '@neko-agent/types';
import type { AgentLocalResourceAccess } from '../services/localResourceAccess';
import { projectMessagesForWebviewResourceDisplay } from './message/webviewResourceProjection';

const logger = getLogger('ConversationBridge');

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
  private _workspaceRuntimeState: AgentWorkspaceRuntimeStateRuntime | null = null;
  private _workspaceRuntimeStateRoot: string | null = null;
  private readonly creativeAiProjections = new Map<string, CreativeAiConversationProjection>();
  private readonly getWorkspaceRoot: (() => string | undefined) | undefined;
  private readonly initialWorkspaceRoot: string | undefined;
  private readonly deletedConversationIds = new Set<string>();

  constructor(
    context: vscode.ExtensionContext,
    workspaceRoot?: string | (() => string | undefined),
    private readonly localResourceAccess?: AgentLocalResourceAccess,
    private readonly getContentAccessRuntime?: () => AgentContentAccessRuntime | undefined,
  ) {
    const initialWorkspaceRoot =
      typeof workspaceRoot === 'function' ? workspaceRoot() : workspaceRoot;
    this.initialWorkspaceRoot = initialWorkspaceRoot;
    this.getWorkspaceRoot = typeof workspaceRoot === 'function' ? workspaceRoot : undefined;
    const storage = new VscodeConversationStorage(context.workspaceState);
    this._conversationManager = new ConversationManager(storage, undefined, {
      generateId: () => {
        const root = this.getWorkspaceRoot?.() ?? initialWorkspaceRoot;
        return root ? createConversationId(root) : undefined;
      },
    });

    // Clean up empty conversations from previous sessions
    const cleaned = this._conversationManager.cleanupEmpty();
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} empty conversation(s)`);
    }

    // Initialize shared resume-layer file storage if workspace root is known
    if (initialWorkspaceRoot) {
      this._persistenceRuntime = createFileConversationPersistenceRuntime({
        workspaceRoot: initialWorkspaceRoot,
        source: 'extension',
        getConversation: (conversationId) => this._conversationManager.get(conversationId),
        onWarning: (warning) => {
          logger.warn('Failed to sync conversation to file', {
            conversationId: warning.conversationId,
            err: warning.error,
          });
        },
      });
      this._workspaceRuntimeState = createFileAgentWorkspaceRuntimeStateRuntime({
        workDir: initialWorkspaceRoot,
        source: 'extension',
      });
      this._workspaceRuntimeStateRoot = initialWorkspaceRoot;
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
    const conversationId = this._conversationManager.create();
    this._queueWorkspaceRuntimeState(conversationId, true);
    return conversationId;
  }

  /**
   * Create a background conversation without stealing the currently selected
   * Agent conversation. The background thread remains visible in history and
   * can be opened explicitly from the Agent surface.
   */
  createBackground(options: { readonly title?: string } = {}): string {
    const previousActiveId = this._conversationManager.getActiveId();
    const conversationId = this._conversationManager.create();
    if (options.title) {
      this._conversationManager.setTitle(conversationId, options.title);
    }
    if (previousActiveId && this._conversationManager.get(previousActiveId)) {
      this._conversationManager.setActive(previousActiveId);
    } else {
      this._conversationManager.clearActive();
    }
    this._conversationManager.flush();
    this._queueConversationPersistence(conversationId);
    this._queueWorkspaceRuntimeState(conversationId, false);
    return conversationId;
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
    const switched = this._conversationManager.setActive(conversationId);
    if (switched) {
      this._queueWorkspaceRuntimeState(conversationId, true);
    }
    return switched;
  }

  /**
   * Clear active conversation without deleting persisted conversation history.
   */
  clearActive(): void {
    this._conversationManager.clearActive();
    void this._getWorkspaceRuntimeState()
      ?.patch({ activeConversationId: null })
      .catch((error: unknown) => {
        logger.warn('Failed to clear active workspace runtime conversation', error);
      });
  }

  /**
   * Delete a conversation
   */
  delete(conversationId: string, options?: DeleteConversationOptions): void {
    this._conversationManager.delete(conversationId, options);
    this.deletedConversationIds.add(conversationId);
    this._queueConversationDelete(conversationId);
    this._queueWorkspaceRuntimeStateDelete(conversationId);
  }

  /**
   * Clear all conversations and remove matching shared resume-layer records.
   */
  clearAll(): void {
    const conversationIds = this._conversationManager.list().map((conversation) => conversation.id);
    this._conversationManager.clear();
    for (const conversationId of conversationIds) {
      this.deletedConversationIds.add(conversationId);
      this._queueConversationDelete(conversationId);
      this._queueWorkspaceRuntimeStateDelete(conversationId);
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
    this._queueWorkspaceRuntimeState(
      conversationId,
      this._conversationManager.getActiveId() === conversationId,
    );
  }

  /**
   * Remove a specific message from a conversation.
   */
  removeMessageFromConversation(conversationId: string, messageId: string): void {
    const conversation = this._conversationManager.get(conversationId);
    if (!conversation) return;
    const messages = conversation.messages.filter((message) => message.id !== messageId);
    if (messages.length === conversation.messages.length) return;
    this.updateMessagesForConversation(conversationId, messages);
  }

  /**
   * Add a message or replace the existing message with the same id.
   */
  upsertMessageToConversation(conversationId: string, message: Message): void {
    const conversation = this._conversationManager.get(conversationId);
    if (!conversation) return;

    const existingIndex = conversation.messages.findIndex((item) => item.id === message.id);
    if (existingIndex === -1) {
      this.addMessageToConversation(conversationId, message);
      return;
    }

    const messages = conversation.messages.map((item, index) =>
      index === existingIndex ? message : item,
    );
    this.updateMessagesForConversation(conversationId, messages);
  }

  upsertCreativeAiProjection(
    conversationId: string,
    projection: CreativeAiConversationProjection,
  ): void {
    if (!this._conversationManager.get(conversationId)) return;
    this.creativeAiProjections.set(conversationId, projection);
  }

  /**
   * Replace messages for a specific conversation and keep the shared resume layer in sync.
   */
  updateMessagesForConversation(conversationId: string, messages: Message[]): void {
    this._conversationManager.updateMessages(conversationId, messages);
    this._conversationManager.flush();
    this._queueConversationPersistence(conversationId);
    this._queueWorkspaceRuntimeState(
      conversationId,
      this._conversationManager.getActiveId() === conversationId,
    );
  }

  /**
   * Project host runtime state for the shared TUI/Webview workspace surface.
   * Conversation history remains owned by ConversationManager + journal storage.
   */
  updateWorkspaceRuntimeState(
    conversationId: string,
    patch: Omit<NonNullable<AgentWorkspaceRuntimeStatePatch['conversation']>, 'conversationId'>,
  ): void {
    void this._getWorkspaceRuntimeState()
      ?.patch({
        conversation: {
          conversationId,
          ...patch,
        },
      })
      .catch((error: unknown) => {
        logger.warn('Failed to update workspace runtime conversation state', {
          conversationId,
          error,
        });
      });
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

  private _queueWorkspaceRuntimeState(conversationId: string, setActive: boolean): void {
    const runtime = this._getWorkspaceRuntimeState();
    const conversation = this._conversationManager.get(conversationId);
    if (!runtime || !conversation) return;
    void runtime
      .patch({
        ...(setActive ? { activeConversationId: conversationId } : {}),
        conversation: {
          conversationId,
          status: 'idle',
          tokenUsage: {
            input: conversation.tokenCount ?? 0,
            output: 0,
            total: conversation.tokenCount ?? 0,
          },
        },
      })
      .catch((error: unknown) => {
        logger.warn('Failed to sync workspace runtime conversation state', {
          conversationId,
          error,
        });
      });
  }

  private _queueWorkspaceRuntimeStateDelete(conversationId: string): void {
    void this._getWorkspaceRuntimeState()
      ?.clearConversation(conversationId)
      .catch((error: unknown) => {
        logger.warn('Failed to delete workspace runtime conversation state', {
          conversationId,
          error,
        });
      });
  }

  private _getWorkspaceRuntimeState(): AgentWorkspaceRuntimeStateRuntime | null {
    const workspaceRoot = this.getWorkspaceRoot?.() ?? this.initialWorkspaceRoot;
    if (!workspaceRoot) return null;
    if (this._workspaceRuntimeState && this._workspaceRuntimeStateRoot === workspaceRoot) {
      return this._workspaceRuntimeState;
    }
    this._workspaceRuntimeState = createFileAgentWorkspaceRuntimeStateRuntime({
      workDir: workspaceRoot,
      source: 'extension',
    });
    this._workspaceRuntimeStateRoot = workspaceRoot;
    return this._workspaceRuntimeState;
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
    const conversations = this._conversationManager.list().map((conversation) => {
      const creativeAi = this.creativeAiProjections.get(conversation.id);
      return {
        ...conversation,
        ...(creativeAi ? { creativeAi } : {}),
      };
    });
    webview.postMessage(buildConversationListMessage(conversations));
  }

  /**
   * Send active conversation to webview
   */
  async sendActiveConversation(webview: vscode.Webview): Promise<void> {
    const conversation = this._conversationManager.getActive();
    if (!conversation) {
      await webview.postMessage({
        type: 'activeConversation',
        conversation: null,
      });
      return;
    }

    await webview.postMessage({
      type: 'activeConversation',
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: await this._projectMessagesForWebview(webview, conversation.messages),
      },
    });
  }

  /**
   * Send a specific conversation snapshot to webview without changing host active state.
   */
  async sendConversationSnapshot(
    webview: vscode.Webview,
    conversationId: string,
  ): Promise<boolean> {
    const conversation = this._conversationManager.get(conversationId);
    if (!conversation) {
      const deleted = this.deletedConversationIds.has(conversationId);
      await webview.postMessage(
        buildAgentSessionDiagnosticMessage({
          code: deleted ? 'deleted-conversation' : 'unknown-conversation',
          action: 'sendConversationSnapshot',
          conversationId,
          message: deleted
            ? `Conversation "${conversationId}" has already been deleted.`
            : `Conversation "${conversationId}" does not exist.`,
        }),
      );
      return false;
    }

    await webview.postMessage({
      type: 'activeConversation',
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: await this._projectMessagesForWebview(webview, conversation.messages),
      },
    });
    return true;
  }

  private async _projectMessagesForWebview(
    webview: vscode.Webview,
    messages: readonly Message[],
  ): Promise<Message[]> {
    return projectMessagesForWebviewResourceDisplay(messages, {
      webview,
      localResourceAccess: this.localResourceAccess,
      contentAccessRuntime: this.getContentAccessRuntime?.(),
      localMediaCaller: 'neko-agent.conversation',
      documentResourceCaller: 'neko-agent.document-resource',
    });
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
