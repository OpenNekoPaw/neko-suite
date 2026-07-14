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
  createConversationPersistenceRuntime,
  projectJournalHistoryWithToolContext,
  ConversationManager,
  type AgentHistoryEntry,
  type AgentWorkspaceRuntimeStateRuntime,
  type AgentWorkspaceRuntimeStatePatch,
  type ConversationPersistenceCoordinatorMetrics,
  type ConversationPersistenceDisposeResult,
  type ConversationPersistenceFlushResult,
  type ConversationPersistenceRuntime,
  type ConversationPersistenceRuntimeResult,
  type ConversationRecord,
  type ConversationReconcileResult,
  type ConversationResumeStorage,
  type DeleteConversationOptions,
} from '@neko/agent';
import { buildAgentSessionDiagnosticMessage, type Message } from '@neko-agent/types';
import type { AgentLocalResourceAccess } from '../services/localResourceAccess';
import { projectMessagesForWebviewResourceDisplay } from './message/webviewResourceProjection';

const logger = getLogger('ConversationBridge');

export type ConversationTerminalPersistenceResult =
  | ConversationPersistenceRuntimeResult
  | { readonly kind: 'unavailable'; readonly conversationId: string };

interface ConversationBridgeContext {
  readonly workspaceState: Pick<vscode.Memento, 'get' | 'update'>;
}

export interface ConversationBridgeResumeOptions {
  readonly resumeStorage: ConversationResumeStorage;
  readonly initialRecords: readonly ConversationRecord[];
  readonly getChatModelSelection?: (
    conversationId: string,
  ) => ConversationRecord['chatModelSelection'];
}

export interface ConversationResumeDiagnostic {
  readonly code: 'conversation-history-hydration-failed';
  readonly conversationId: string;
  readonly message: string;
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
  private readonly hydratedAgentHistory = new Map<string, AgentHistoryEntry[]>();
  private readonly resumeDiagnostics = new Map<string, ConversationResumeDiagnostic>();
  private readonly resumeStorage: ConversationResumeStorage | undefined;
  private persistenceDisposePromise:
    Promise<ConversationPersistenceDisposeResult | null> | undefined;

  constructor(
    _context: ConversationBridgeContext,
    workspaceRoot?: string | (() => string | undefined),
    private readonly localResourceAccess?: AgentLocalResourceAccess,
    private readonly getContentAccessRuntime?: () => AgentContentAccessRuntime | undefined,
    resumeOptions?: ConversationBridgeResumeOptions,
  ) {
    this.resumeStorage = resumeOptions?.resumeStorage;
    const initialWorkspaceRoot =
      typeof workspaceRoot === 'function' ? workspaceRoot() : workspaceRoot;
    this.initialWorkspaceRoot = initialWorkspaceRoot;
    this.getWorkspaceRoot = typeof workspaceRoot === 'function' ? workspaceRoot : undefined;
    this._conversationManager = new ConversationManager(undefined, undefined, {
      generateId: () => {
        const root = this.getWorkspaceRoot?.() ?? initialWorkspaceRoot;
        return root ? createConversationId(root) : undefined;
      },
    });
    if (resumeOptions) {
      const projected = this._projectResumeRecords(resumeOptions.initialRecords);
      this._conversationManager.hydrate(projected.managerRecords);
      for (const [conversationId, history] of projected.agentHistoryById) {
        this.hydratedAgentHistory.set(conversationId, history);
      }
    }

    // Clean up empty conversations from previous sessions
    const cleaned = this._conversationManager.cleanupEmpty();
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} empty conversation(s)`);
    }

    // Initialize shared resume-layer file storage if workspace root is known
    if (initialWorkspaceRoot) {
      this._persistenceRuntime = resumeOptions
        ? createConversationPersistenceRuntime({
            workDir: initialWorkspaceRoot,
            source: 'extension',
            storage: resumeOptions.resumeStorage,
            getChatModelSelection: resumeOptions.getChatModelSelection,
            getConversation: (conversationId) => this._conversationManager.get(conversationId),
            onWarning: (warning) => {
              logger.warn('Failed to sync conversation to SQLite catalog', {
                conversationId: warning.conversationId,
                err: warning.error,
              });
            },
          })
        : null;
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
    const hydrated = this.hydratedAgentHistory.get(conversationId);
    return hydrated
      ? hydrated.map((message) => ({ ...message }))
      : this._conversationManager.toAgentHistory(conversationId);
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
    this.hydratedAgentHistory.delete(conversationId);
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
    this.hydratedAgentHistory.clear();
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

  getResumeDiagnostics(): readonly ConversationResumeDiagnostic[] {
    return [...this.resumeDiagnostics.values()].map((diagnostic) => ({ ...diagnostic }));
  }

  async refreshFromResumeStorage(): Promise<ConversationReconcileResult> {
    if (!this.resumeStorage) return { upsertedIds: [], removedIds: [] };
    await this.flushConversationPersistence();
    const records = await this.resumeStorage.list();
    const durableIds = new Set(records.map((record) => record.id));
    for (const conversationId of this.resumeDiagnostics.keys()) {
      if (!durableIds.has(conversationId)) this.resumeDiagnostics.delete(conversationId);
    }
    const projected = this._projectResumeRecords(records);
    const result = this._conversationManager.reconcileHydrated(projected.managerRecords);
    for (const conversationId of result.upsertedIds) {
      const history = projected.agentHistoryById.get(conversationId);
      if (!history) {
        throw new Error(`Conversation refresh lost projected history ${conversationId}.`);
      }
      this.hydratedAgentHistory.set(conversationId, history);
      this.deletedConversationIds.delete(conversationId);
    }
    for (const conversationId of result.removedIds) {
      this.hydratedAgentHistory.delete(conversationId);
      if (!this.resumeDiagnostics.has(conversationId)) {
        this.deletedConversationIds.add(conversationId);
      }
    }
    return result;
  }

  private _projectResumeRecords(records: readonly ConversationRecord[]): {
    readonly managerRecords: ReturnType<typeof projectConversationRecordForManager>[];
    readonly agentHistoryById: ReadonlyMap<string, AgentHistoryEntry[]>;
  } {
    const managerRecords: ReturnType<typeof projectConversationRecordForManager>[] = [];
    const agentHistoryById = new Map<string, AgentHistoryEntry[]>();
    for (const record of records) {
      try {
        const managerRecord = projectConversationRecordForManager(record);
        const agentHistory = projectJournalHistoryWithToolContext(record.messages);
        managerRecords.push(managerRecord);
        agentHistoryById.set(record.id, agentHistory);
        this.resumeDiagnostics.delete(record.id);
      } catch (error) {
        const diagnostic: ConversationResumeDiagnostic = {
          code: 'conversation-history-hydration-failed',
          conversationId: record.id,
          message: getErrorMessage(error),
        };
        this.resumeDiagnostics.set(record.id, diagnostic);
        logger.warn('Persisted conversation history could not be hydrated', diagnostic);
      }
    }
    return { managerRecords, agentHistoryById };
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
    this.hydratedAgentHistory.delete(conversationId);
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
    this.hydratedAgentHistory.delete(conversationId);
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
   * Enqueue a coalescible partial record. The storage-scoped coordinator serializes the actual
   * mutation; asynchronous failures are reported by the runtime warning callback.
   */
  private _queueConversationPersistence(conversationId: string): void {
    const result = this._persistenceRuntime?.queueConversationSync(conversationId);
    if (result?.kind === 'rejected') {
      logger.warn('Conversation partial persistence was rejected', {
        conversationId,
        diagnostic: result.diagnostic,
      });
    }
  }

  private _queueConversationDelete(conversationId: string): void {
    const result = this._persistenceRuntime?.queueConversationDelete(conversationId);
    if (result?.kind === 'rejected') {
      logger.warn('Conversation delete persistence was rejected', {
        conversationId,
        diagnostic: result.diagnostic,
      });
    }
  }

  /** Persist the authoritative terminal record after the final message has entered the manager. */
  persistConversationTerminal(
    conversationId: string,
  ): Promise<ConversationTerminalPersistenceResult> {
    if (!this._persistenceRuntime) {
      return Promise.resolve({ kind: 'unavailable', conversationId });
    }
    return this._persistenceRuntime.persistConversation(conversationId);
  }

  flushConversationPersistence(): Promise<ConversationPersistenceFlushResult | null> {
    return this._persistenceRuntime?.flush() ?? Promise.resolve(null);
  }

  getConversationPersistenceMetrics(): ConversationPersistenceCoordinatorMetrics | null {
    return this._persistenceRuntime?.metrics() ?? null;
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
  async sendActiveConversation(
    webview: vscode.Webview,
    activation?: { readonly activationId: number; readonly tabStateRevision: number },
  ): Promise<void> {
    const conversation = this._conversationManager.getActive();
    if (!conversation) {
      await webview.postMessage({
        type: 'activeConversation',
        ...(activation ? { activation } : {}),
        conversation: null,
      });
      return;
    }

    await webview.postMessage({
      type: 'activeConversation',
      ...(activation ? { activation } : {}),
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
      type: 'conversationSnapshot',
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

  disposeAsync(): Promise<ConversationPersistenceDisposeResult | null> {
    if (this.persistenceDisposePromise) return this.persistenceDisposePromise;
    this._conversationManager.flush();
    this.persistenceDisposePromise = this._persistenceRuntime?.dispose() ?? Promise.resolve(null);
    return this.persistenceDisposePromise;
  }

  dispose(): void {
    void this.disposeAsync().then(
      (result) => {
        if (result && !result.durable) {
          logger.warn('Conversation persistence disposal completed without durability', {
            diagnostics: result.diagnostics,
          });
        }
      },
      (error: unknown) => {
        logger.warn('Failed to dispose conversation persistence runtime', error);
      },
    );
  }
}

function projectConversationRecordForManager(record: ConversationRecord) {
  const messages: Message[] = [];
  for (const [index, message] of record.messages.entries()) {
    if (message.role === 'tool') continue;
    messages.push({
      id: record.messageEventIds?.[index]?.[0] ?? `${record.id}-journal-${index}`,
      role: message.role,
      content: projectJournalMessageContent(message.content),
      timestamp: Math.min(record.updatedAt, record.createdAt + index),
    });
  }
  return {
    id: record.id,
    title: record.title,
    messages,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resumable: false,
  };
}

function projectJournalMessageContent(
  content: ConversationRecord['messages'][number]['content'],
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      return JSON.stringify(part);
    })
    .join('\n');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
