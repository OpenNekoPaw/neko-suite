/**
 * Conversation Management - Multi-session conversation management
 *
 * Unified message management with:
 * - Full context preservation (thinking, toolCalls, contentBlocks)
 * - Incremental saving
 * - Auto cleanup policy
 * - Resume support
 */

import { getLogger } from '../base';
import type { Message } from '@neko-agent/types';

const logger = getLogger('ConversationManager');

// Re-export shared types for backward compatibility
export type { ToolCall, ContentBlock, ContentBlockType } from '@neko-agent/types';

/**
 * Conversation message — alias for Message from @neko-agent/types.
 * Kept for backward compatibility with extension-internal code.
 */
export type ConversationMessage = Message;

/**
 * Conversation session
 */
export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
  /** Whether this conversation can be resumed (has unfinished context) */
  resumable?: boolean;
  /** Token count estimate for context management */
  tokenCount?: number;
}

/**
 * Storage backend interface for persistence
 */
export interface ConversationStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): void | Promise<void>;
}

/**
 * Cleanup policy configuration
 */
export interface CleanupPolicy {
  /** Maximum number of conversations to keep */
  maxConversations: number;
  /** Maximum messages per conversation (0 = unlimited) */
  maxMessagesPerConversation: number;
  /** Days to retain conversations (0 = unlimited) */
  retentionDays: number;
  /** Whether to archive instead of delete */
  archiveOld: boolean;
}

/**
 * Default cleanup policy
 */
const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  maxConversations: 50,
  maxMessagesPerConversation: 200,
  retentionDays: 30,
  archiveOld: false,
};

/**
 * Conversation manager - manages multiple AI conversation sessions
 *
 * Features:
 * - Incremental message saving
 * - Auto cleanup based on policy
 * - Full context preservation for resume
 */
export class ConversationManager {
  private conversations = new Map<string, Conversation>();
  private activeId: string | null = null;
  private storage?: ConversationStorage;
  private cleanupPolicy: CleanupPolicy;

  /** Dirty tracking for incremental saves */
  private dirtyConversations = new Set<string>();

  /** Debounce timer for batch saves */
  private saveTimer?: ReturnType<typeof setTimeout>;
  private static readonly SAVE_DEBOUNCE_MS = 500;

  constructor(storage?: ConversationStorage, cleanupPolicy?: Partial<CleanupPolicy>) {
    this.storage = storage;
    this.cleanupPolicy = { ...DEFAULT_CLEANUP_POLICY, ...cleanupPolicy };
    this._load();
    // Run cleanup on startup
    this._applyCleanupPolicy();
  }

  /**
   * Create a new conversation
   */
  create(): string {
    const id = this._generateId();
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resumable: false,
      tokenCount: 0,
    };

    this.conversations.set(id, conversation);
    this.activeId = id;
    this._markDirty(id);
    this._scheduleSave();

    return id;
  }

  /**
   * Get a conversation by ID
   */
  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /**
   * Get the active conversation
   */
  getActive(): Conversation | undefined {
    return this.activeId ? this.conversations.get(this.activeId) : undefined;
  }

  /**
   * Get the active conversation ID
   */
  getActiveId(): string | null {
    return this.activeId;
  }

  /**
   * List all conversations, sorted by update time
   */
  list(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Add a single message to a conversation (incremental)
   */
  addMessage(id: string, message: ConversationMessage): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    // Auto-generate title from first user message
    if (conversation.title === 'New Chat' && message.role === 'user') {
      conversation.title = this._generateTitle(message.content);
    }

    // Mark as resumable if it has tool calls in progress
    if (message.role === 'assistant' && message.toolCalls?.some((tc) => !tc.result)) {
      conversation.resumable = true;
    }

    // Update token count estimate (rough: ~4 chars per token)
    conversation.tokenCount =
      (conversation.tokenCount || 0) + Math.ceil(message.content.length / 4);

    this._markDirty(id);
    this._scheduleSave();
  }

  /**
   * Update conversation messages (full replacement)
   */
  updateMessages(id: string, messages: ConversationMessage[]): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.messages = messages;
    conversation.updatedAt = Date.now();

    // Auto-generate title from first user message
    if (conversation.title === 'New Chat' && messages.length > 0) {
      const firstUserMessage = messages.find((m) => m.role === 'user');
      if (firstUserMessage) {
        conversation.title = this._generateTitle(firstUserMessage.content);
      }
    }

    // Update token count
    conversation.tokenCount = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

    // Check resumability
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    conversation.resumable = lastAssistant?.toolCalls?.some((tc) => !tc.result) ?? false;

    this._markDirty(id);
    this._scheduleSave();
  }

  /**
   * Update the last message in a conversation (for streaming updates)
   */
  updateLastMessage(
    id: string,
    updater: (message: ConversationMessage) => ConversationMessage,
  ): void {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.messages.length === 0) return;

    const lastIndex = conversation.messages.length - 1;
    conversation.messages[lastIndex] = updater(conversation.messages[lastIndex]);
    conversation.updatedAt = Date.now();

    this._markDirty(id);
    this._scheduleSave();
  }

  /**
   * Set the active conversation
   */
  setActive(id: string): boolean {
    if (!this.conversations.has(id)) return false;
    this.activeId = id;
    this._markDirty('__meta__'); // Mark metadata as dirty
    this._scheduleSave();
    return true;
  }

  /**
   * Delete a conversation
   */
  delete(id: string): boolean {
    if (!this.conversations.has(id)) return false;

    this.conversations.delete(id);
    this.dirtyConversations.delete(id);

    // If deleting active conversation, switch to most recent
    if (this.activeId === id) {
      const remaining = this.list();
      this.activeId = remaining.length > 0 ? remaining[0].id : null;
    }

    this._persist();
    return true;
  }

  /**
   * Clear all conversations
   */
  clear(): void {
    this.conversations.clear();
    this.activeId = null;
    this.dirtyConversations.clear();
    this._persist();
  }

  /**
   * Mark a conversation as resumable
   */
  markResumable(id: string, resumable: boolean): void {
    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.resumable = resumable;
      this._markDirty(id);
      this._scheduleSave();
    }
  }

  /**
   * Get all resumable conversations
   */
  getResumable(): Conversation[] {
    return this.list().filter((c) => c.resumable);
  }

  /**
   * Clean up empty conversations
   */
  cleanupEmpty(): number {
    let removedCount = 0;

    for (const [id, conv] of this.conversations.entries()) {
      if (conv.messages.length === 0) {
        this.conversations.delete(id);
        removedCount++;
      }
    }

    if (this.activeId && !this.conversations.has(this.activeId)) {
      const remaining = this.list();
      this.activeId = remaining.length > 0 ? remaining[0].id : null;
    }

    if (removedCount > 0) {
      this._persist();
    }

    return removedCount;
  }

  /**
   * Force save all pending changes
   */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    this._persist();
  }

  /**
   * Convert conversation messages to ChatMessage format for Agent
   * Preserves tool context for proper resume
   */
  toAgentHistory(id: string): Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    toolResults?: Array<{ callId: string; success: boolean; data: unknown }>;
  }> {
    const conversation = this.conversations.get(id);
    if (!conversation) return [];

    const result: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      toolResults?: Array<{ callId: string; success: boolean; data: unknown }>;
    }> = [];

    for (const msg of conversation.messages) {
      const entry: (typeof result)[0] = {
        role: msg.role,
        content: msg.content,
      };

      // Preserve tool calls for assistant messages
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        entry.toolCalls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        }));

        // Add tool results as separate entries
        const toolResults = msg.toolCalls
          .filter((tc) => tc.result)
          .map((tc) => ({
            callId: tc.id,
            success: tc.result!.success,
            data: tc.result!.data,
          }));

        if (toolResults.length > 0) {
          entry.toolResults = toolResults;
        }
      }

      result.push(entry);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _generateTitle(content: string): string {
    let title = content.slice(0, 50).trim();
    if (content.length > 50) {
      const lastSpace = title.lastIndexOf(' ');
      if (lastSpace > 20) {
        title = title.slice(0, lastSpace);
      }
      title += '...';
    }
    return title;
  }

  private _generateId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private _markDirty(id: string): void {
    this.dirtyConversations.add(id);
  }

  private _scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this._persist();
      this.saveTimer = undefined;
    }, ConversationManager.SAVE_DEBOUNCE_MS);
  }

  private _load(): void {
    if (!this.storage) return;

    const data = this.storage.get<{
      conversations: Array<[string, Conversation]>;
      activeId: string | null;
    }>('conversations');

    if (data) {
      this.conversations = new Map(data.conversations);
      this.activeId = data.activeId;
    }
  }

  private _persist(): void {
    if (!this.storage) return;

    // Only save non-empty conversations
    const nonEmptyConversations = Array.from(this.conversations.entries()).filter(
      ([, conv]) => conv.messages.length > 0,
    );

    this.storage.update('conversations', {
      conversations: nonEmptyConversations,
      activeId: this.activeId,
    });

    // Clear dirty tracking
    this.dirtyConversations.clear();
  }

  /**
   * Apply cleanup policy to remove old/excess conversations
   */
  private _applyCleanupPolicy(): void {
    const conversations = this.list();
    let removed = 0;

    // 1. Remove conversations exceeding max count
    if (
      this.cleanupPolicy.maxConversations > 0 &&
      conversations.length > this.cleanupPolicy.maxConversations
    ) {
      const toRemove = conversations.slice(this.cleanupPolicy.maxConversations);
      for (const conv of toRemove) {
        // Don't remove resumable or active conversations
        if (conv.resumable || conv.id === this.activeId) continue;
        this.conversations.delete(conv.id);
        removed++;
      }
    }

    // 2. Remove old conversations based on retention days
    if (this.cleanupPolicy.retentionDays > 0) {
      const cutoff = Date.now() - this.cleanupPolicy.retentionDays * 24 * 60 * 60 * 1000;
      for (const conv of conversations) {
        if (conv.updatedAt < cutoff && conv.id !== this.activeId && !conv.resumable) {
          this.conversations.delete(conv.id);
          removed++;
        }
      }
    }

    // 3. Trim messages in conversations exceeding max messages
    if (this.cleanupPolicy.maxMessagesPerConversation > 0) {
      for (const conv of this.conversations.values()) {
        if (conv.messages.length > this.cleanupPolicy.maxMessagesPerConversation) {
          // Keep system messages and recent messages
          const systemMsgs = conv.messages.filter((m) => m.role === 'system');
          const otherMsgs = conv.messages.filter((m) => m.role !== 'system');
          const keepCount = this.cleanupPolicy.maxMessagesPerConversation - systemMsgs.length;
          conv.messages = [...systemMsgs, ...otherMsgs.slice(-keepCount)];
          this._markDirty(conv.id);
        }
      }
    }

    if (removed > 0) {
      logger.info(`Cleanup: removed ${removed} conversations`);
      this._persist();
    }
  }
}
