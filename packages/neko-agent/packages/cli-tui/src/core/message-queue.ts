import type { AgentMessageQueueSnapshot, AgentQueuedMessageItem } from '@neko-agent/types';

export type TuiQueueOperationErrorCode = 'stale-item' | 'invalid-queue-operation' | 'not-queueable';

export class TuiMessageQueueError extends Error {
  constructor(
    readonly code: TuiQueueOperationErrorCode,
    message: string,
    readonly queueItemId?: string,
  ) {
    super(message);
    this.name = 'TuiMessageQueueError';
  }
}

export interface TuiMessageQueue {
  enqueue(content: string, now?: number): AgentQueuedMessageItem;
  snapshot(): AgentMessageQueueSnapshot;
  promote(queueItemId: string): AgentQueuedMessageItem;
  cancel(queueItemId: string): AgentQueuedMessageItem;
  edit(queueItemId: string, content: string, now?: number): AgentQueuedMessageItem;
  dequeue(): AgentQueuedMessageItem | null;
  clear(): void;
}

export interface TuiMessageQueueOptions {
  readonly conversationId: string;
  readonly createId?: () => string;
  readonly now?: () => number;
}

export function createTuiMessageQueue(options: TuiMessageQueueOptions): TuiMessageQueue {
  return new DefaultTuiMessageQueue(options);
}

class DefaultTuiMessageQueue implements TuiMessageQueue {
  private readonly items: AgentQueuedMessageItem[] = [];
  private version = 0;
  private sequence = 0;

  constructor(private readonly options: TuiMessageQueueOptions) {}

  enqueue(content: string, now = this.readNow()): AgentQueuedMessageItem {
    const normalized = content.trim();
    if (!normalized) {
      throw new TuiMessageQueueError('not-queueable', 'Queued message cannot be empty.');
    }
    if (normalized.startsWith('/')) {
      throw new TuiMessageQueueError(
        'not-queueable',
        'Commands cannot be queued while an Agent turn is running.',
      );
    }
    if (normalized.startsWith('$')) {
      throw new TuiMessageQueueError(
        'not-queueable',
        'Skill invocations cannot be queued while an Agent turn is running.',
      );
    }

    const item: AgentQueuedMessageItem = {
      id: this.nextId(),
      conversationId: this.options.conversationId,
      content: normalized,
      createdAt: now,
      source: 'composer',
    };
    this.items.push(item);
    this.bumpVersion();
    return item;
  }

  snapshot(): AgentMessageQueueSnapshot {
    return {
      conversationId: this.options.conversationId,
      items: this.items.map((item) => ({ ...item })),
      pendingCount: this.items.length,
      version: this.version,
    };
  }

  promote(queueItemId: string): AgentQueuedMessageItem {
    const { item } = this.take(queueItemId);
    this.items.unshift(item);
    this.bumpVersion();
    return { ...item };
  }

  cancel(queueItemId: string): AgentQueuedMessageItem {
    const { item } = this.take(queueItemId);
    this.bumpVersion();
    return { ...item };
  }

  edit(queueItemId: string, content: string, now = this.readNow()): AgentQueuedMessageItem {
    const normalized = content.trim();
    if (!normalized) {
      throw new TuiMessageQueueError(
        'not-queueable',
        'Queued message cannot be empty.',
        queueItemId,
      );
    }
    const index = this.findIndex(queueItemId);
    const current = this.items[index];
    if (!current) {
      throw new TuiMessageQueueError(
        'stale-item',
        `Unknown queue item: ${queueItemId}`,
        queueItemId,
      );
    }
    const next: AgentQueuedMessageItem = {
      ...current,
      content: normalized,
      updatedAt: now,
    };
    this.items[index] = next;
    this.bumpVersion();
    return { ...next };
  }

  dequeue(): AgentQueuedMessageItem | null {
    const item = this.items.shift();
    if (!item) {
      return null;
    }
    this.bumpVersion();
    return { ...item };
  }

  clear(): void {
    if (this.items.length === 0) {
      return;
    }
    this.items.length = 0;
    this.bumpVersion();
  }

  private take(queueItemId: string): {
    readonly item: AgentQueuedMessageItem;
    readonly index: number;
  } {
    const index = this.findIndex(queueItemId);
    const [item] = this.items.splice(index, 1);
    if (!item) {
      throw new TuiMessageQueueError(
        'stale-item',
        `Unknown queue item: ${queueItemId}`,
        queueItemId,
      );
    }
    return { item, index };
  }

  private findIndex(queueItemId: string): number {
    const index = this.items.findIndex((item) => item.id === queueItemId);
    if (index < 0) {
      throw new TuiMessageQueueError(
        'stale-item',
        `Unknown queue item: ${queueItemId}`,
        queueItemId,
      );
    }
    return index;
  }

  private nextId(): string {
    if (this.options.createId) {
      return this.options.createId();
    }
    this.sequence += 1;
    return `queue-${this.sequence}`;
  }

  private readNow(): number {
    return this.options.now?.() ?? Date.now();
  }

  private bumpVersion(): void {
    this.version += 1;
  }
}

export function formatTuiQueueSnapshot(snapshot: AgentMessageQueueSnapshot): string {
  if (snapshot.items.length === 0) {
    return `Queue: empty (version ${snapshot.version})`;
  }
  return [
    `Queue: ${snapshot.pendingCount} pending (version ${snapshot.version})`,
    ...snapshot.items.map((item, index) => `${index + 1}. ${item.id} ${item.content}`),
  ].join('\n');
}

export function formatTuiQueueError(error: unknown): string {
  if (error instanceof TuiMessageQueueError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
