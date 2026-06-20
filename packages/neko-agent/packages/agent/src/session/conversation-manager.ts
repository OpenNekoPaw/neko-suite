import type { Message } from '@neko-agent/types';
import { getLogger } from '../utils/logger';
import type { AgentHistoryWithToolContextMessage } from './history-hydration';
import { projectConversationMessagesToAgentHistory } from './conversation-record-projector';

const logger = getLogger('ConversationManager');

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  resumable?: boolean;
  tokenCount?: number;
}

export interface ConversationStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): void | Promise<void>;
}

export interface CleanupPolicy {
  maxConversations: number;
  maxMessagesPerConversation: number;
  retentionDays: number;
  archiveOld: boolean;
}

export interface ConversationManagerOptions {
  generateId?: () => string;
}

export interface DeleteConversationOptions {
  activateNext?: boolean;
}

export type AgentHistoryEntry = AgentHistoryWithToolContextMessage;

const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  maxConversations: 50,
  maxMessagesPerConversation: 200,
  retentionDays: 30,
  archiveOld: false,
};

export class ConversationManager {
  private conversations = new Map<string, Conversation>();
  private activeId: string | null = null;
  private readonly storage?: ConversationStorage;
  private readonly cleanupPolicy: CleanupPolicy;
  private readonly idGenerator?: () => string;
  private readonly dirtyConversations = new Set<string>();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private static readonly SAVE_DEBOUNCE_MS = 500;

  constructor(
    storage?: ConversationStorage,
    cleanupPolicy?: Partial<CleanupPolicy>,
    options?: ConversationManagerOptions,
  ) {
    this.storage = storage;
    this.cleanupPolicy = { ...DEFAULT_CLEANUP_POLICY, ...cleanupPolicy };
    this.idGenerator = options?.generateId;
    this.load();
    this.applyCleanupPolicy();
  }

  create(): string {
    const id = this.generateId();
    const now = Date.now();
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
      resumable: false,
      tokenCount: 0,
    };

    this.conversations.set(id, conversation);
    this.activeId = id;
    this.markDirty(id);
    this.scheduleSave();
    return id;
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  getActive(): Conversation | undefined {
    return this.activeId ? this.conversations.get(this.activeId) : undefined;
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  list(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  addMessage(id: string, message: Message): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.messages.push(message);
    conversation.updatedAt = Date.now();

    if (conversation.title === 'New Chat' && message.role === 'user') {
      conversation.title = this.generateTitle(message.content);
    }

    if (message.role === 'assistant' && hasPendingToolCall(message)) {
      conversation.resumable = true;
    }

    conversation.tokenCount =
      (conversation.tokenCount ?? 0) + estimateMessageTokenCount(message.content);

    this.markDirty(id);
    this.scheduleSave();
  }

  updateMessages(id: string, messages: Message[]): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.messages = messages;
    conversation.updatedAt = Date.now();

    if (conversation.title === 'New Chat') {
      const firstUserMessage = messages.find((message) => message.role === 'user');
      if (firstUserMessage) {
        conversation.title = this.generateTitle(firstUserMessage.content);
      }
    }

    conversation.tokenCount = messages.reduce(
      (sum, message) => sum + estimateMessageTokenCount(message.content),
      0,
    );

    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
    conversation.resumable = lastAssistant ? hasPendingToolCall(lastAssistant) : false;

    this.markDirty(id);
    this.scheduleSave();
  }

  updateLastMessage(id: string, updater: (message: Message) => Message): void {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.messages.length === 0) return;

    const lastIndex = conversation.messages.length - 1;
    const current = conversation.messages[lastIndex];
    if (!current) return;

    conversation.messages[lastIndex] = updater(current);
    conversation.updatedAt = Date.now();
    this.markDirty(id);
    this.scheduleSave();
  }

  setActive(id: string): boolean {
    if (!this.conversations.has(id)) return false;
    this.activeId = id;
    this.markDirty('__meta__');
    this.scheduleSave();
    return true;
  }

  clearActive(): void {
    if (this.activeId === null) return;
    this.activeId = null;
    this.markDirty('__meta__');
    this.scheduleSave();
  }

  delete(id: string, options: DeleteConversationOptions = {}): boolean {
    if (!this.conversations.has(id)) return false;

    this.conversations.delete(id);
    this.dirtyConversations.delete(id);

    if (this.activeId === id) {
      this.activeId = (options.activateNext ?? true) ? (this.list()[0]?.id ?? null) : null;
    }

    this.persist();
    return true;
  }

  clear(): void {
    this.conversations.clear();
    this.activeId = null;
    this.dirtyConversations.clear();
    this.persist();
  }

  markResumable(id: string, resumable: boolean): void {
    const conversation = this.conversations.get(id);
    if (!conversation) return;

    conversation.resumable = resumable;
    this.markDirty(id);
    this.scheduleSave();
  }

  getResumable(): Conversation[] {
    return this.list().filter((conversation) => conversation.resumable);
  }

  cleanupEmpty(): number {
    let removedCount = 0;

    for (const [id, conversation] of this.conversations.entries()) {
      if (conversation.messages.length === 0) {
        this.conversations.delete(id);
        removedCount++;
      }
    }

    if (this.activeId && !this.conversations.has(this.activeId)) {
      this.activeId = this.list()[0]?.id ?? null;
    }

    if (removedCount > 0) {
      this.persist();
    }

    return removedCount;
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    this.persist();
  }

  toAgentHistory(id: string): AgentHistoryEntry[] {
    const conversation = this.conversations.get(id);
    if (!conversation) return [];

    return projectConversationMessagesToAgentHistory(conversation.messages);
  }

  private generateTitle(content: string): string {
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

  private generateId(): string {
    return this.idGenerator?.() ?? `conv-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private markDirty(id: string): void {
    this.dirtyConversations.add(id);
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.persist();
      this.saveTimer = undefined;
    }, ConversationManager.SAVE_DEBOUNCE_MS);
  }

  private load(): void {
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

  private persist(): void {
    if (!this.storage) return;

    const nonEmptyConversations = Array.from(this.conversations.entries()).filter(
      ([, conversation]) => conversation.messages.length > 0,
    );

    this.storage.update('conversations', {
      conversations: nonEmptyConversations,
      activeId: this.activeId,
    });
    this.dirtyConversations.clear();
  }

  private applyCleanupPolicy(): void {
    const conversations = this.list();
    let removed = 0;

    if (
      this.cleanupPolicy.maxConversations > 0 &&
      conversations.length > this.cleanupPolicy.maxConversations
    ) {
      const toRemove = conversations.slice(this.cleanupPolicy.maxConversations);
      for (const conversation of toRemove) {
        if (conversation.resumable || conversation.id === this.activeId) continue;
        this.conversations.delete(conversation.id);
        removed++;
      }
    }

    if (this.cleanupPolicy.retentionDays > 0) {
      const cutoff = Date.now() - this.cleanupPolicy.retentionDays * 24 * 60 * 60 * 1000;
      for (const conversation of conversations) {
        if (
          conversation.updatedAt < cutoff &&
          conversation.id !== this.activeId &&
          !conversation.resumable
        ) {
          this.conversations.delete(conversation.id);
          removed++;
        }
      }
    }

    if (this.cleanupPolicy.maxMessagesPerConversation > 0) {
      for (const conversation of this.conversations.values()) {
        if (conversation.messages.length <= this.cleanupPolicy.maxMessagesPerConversation) {
          continue;
        }

        const systemMessages = conversation.messages.filter((message) => message.role === 'system');
        const otherMessages = conversation.messages.filter((message) => message.role !== 'system');
        const keepCount = Math.max(
          0,
          this.cleanupPolicy.maxMessagesPerConversation - systemMessages.length,
        );
        conversation.messages = [...systemMessages, ...otherMessages.slice(-keepCount)];
        this.markDirty(conversation.id);
      }
    }

    if (removed > 0) {
      logger.info(`Cleanup: removed ${removed} conversations`);
      this.persist();
    }
  }
}

function estimateMessageTokenCount(content: string): number {
  return Math.ceil(content.length / 4);
}

function hasPendingToolCall(message: Message): boolean {
  return (
    message.contentBlocks?.some(
      (block) => block.type === 'tool_call' && block.toolCall && !block.toolCall.result,
    ) ?? false
  );
}
