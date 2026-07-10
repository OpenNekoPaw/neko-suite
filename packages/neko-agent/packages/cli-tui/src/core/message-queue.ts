import type {
  AgentContinuationMetadata,
  AgentMessageQueueSnapshot,
  AgentQueuedMessageDisplayKind,
  AgentQueuedMessageItem,
  AgentQueuedMessageSource,
} from '@neko-agent/types';

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

export interface EnqueueTuiMessageQueueInput {
  readonly content: string;
  readonly source?: AgentQueuedMessageSource;
  readonly displayKind?: AgentQueuedMessageDisplayKind;
  readonly metadata?: AgentContinuationMetadata;
  readonly now?: number;
}

type EnqueueTuiMessageQueueArgument = string | EnqueueTuiMessageQueueInput;

export interface TuiMessageQueue {
  enqueue(input: EnqueueTuiMessageQueueArgument, now?: number): AgentQueuedMessageItem;
  snapshot(): AgentMessageQueueSnapshot;
  promote(queueItemId: string): AgentQueuedMessageItem;
  cancel(queueItemId: string): AgentQueuedMessageItem;
  discardContinuation(queueItemId: string, now?: number): AgentQueuedMessageItem;
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

  enqueue(input: EnqueueTuiMessageQueueArgument, now = this.readNow()): AgentQueuedMessageItem {
    const normalizedInput = normalizeEnqueueInput(input, now);
    const normalized = normalizedInput.content.trim();
    if (!normalized) {
      throw new TuiMessageQueueError('not-queueable', 'Queued message cannot be empty.');
    }
    if (isUserQueueSource(normalizedInput.source) && normalized.startsWith('/')) {
      throw new TuiMessageQueueError(
        'not-queueable',
        'Commands cannot be queued while an Agent turn is running.',
      );
    }
    if (isUserQueueSource(normalizedInput.source) && normalized.startsWith('$')) {
      throw new TuiMessageQueueError(
        'not-queueable',
        'Skill invocations cannot be queued while an Agent turn is running.',
      );
    }

    const item: AgentQueuedMessageItem = {
      id: this.nextId(),
      conversationId: this.options.conversationId,
      content: normalized,
      createdAt: normalizedInput.now,
      source: normalizedInput.source,
      displayKind: normalizedInput.displayKind,
      ...(normalizedInput.metadata ? { metadata: normalizedInput.metadata } : {}),
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

  discardContinuation(queueItemId: string, now = this.readNow()): AgentQueuedMessageItem {
    const index = this.findIndex(queueItemId);
    const item = this.items[index];
    if (!item) {
      throw new TuiMessageQueueError(
        'stale-item',
        `Unknown queue item: ${queueItemId}`,
        queueItemId,
      );
    }
    if (isUserQueueSource(item.source)) {
      throw new TuiMessageQueueError(
        'invalid-queue-operation',
        `Queued user message cannot be discarded as a continuation: ${queueItemId}`,
        queueItemId,
      );
    }
    this.items.splice(index, 1);
    const discarded: AgentQueuedMessageItem = {
      ...item,
      updatedAt: now,
      metadata: { ...item.metadata, status: 'discarded' },
    };
    this.bumpVersion();
    return discarded;
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
    if (!isUserQueueSource(current.source)) {
      throw new TuiMessageQueueError(
        'invalid-queue-operation',
        `Queued continuation cannot be edited as a user message: ${queueItemId}`,
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
    const continuationIndex = this.items.findIndex((item) => !isUserQueueSource(item.source));
    const index = continuationIndex >= 0 ? continuationIndex : 0;
    const item = this.items.splice(index, 1)[0];
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
    ...snapshot.items.map(
      (item, index) => `${index + 1}. ${item.id} [${item.source}] ${item.content}`,
    ),
  ].join('\n');
}

export function formatTuiQueueError(error: unknown): string {
  if (error instanceof TuiMessageQueueError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeEnqueueInput(
  input: EnqueueTuiMessageQueueArgument,
  defaultNow: number,
): Required<Pick<EnqueueTuiMessageQueueInput, 'content' | 'source' | 'displayKind' | 'now'>> &
  Pick<EnqueueTuiMessageQueueInput, 'metadata'> {
  if (typeof input === 'string') {
    return {
      content: input,
      source: 'user',
      displayKind: 'user-message',
      now: defaultNow,
    };
  }
  const source = input.source ?? 'user';
  return {
    content: input.content,
    source,
    displayKind: input.displayKind ?? defaultDisplayKindForSource(source),
    now: input.now ?? defaultNow,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function defaultDisplayKindForSource(
  source: AgentQueuedMessageSource,
): AgentQueuedMessageDisplayKind {
  if (source === 'task-result-continuation' || source === 'task-result-observation') {
    return 'task-continuation';
  }
  if (source === 'subagent-result-continuation') {
    return 'subagent-continuation';
  }
  if (source === 'system-continuation') {
    return 'system-continuation';
  }
  return 'user-message';
}

function isUserQueueSource(source: AgentQueuedMessageSource): boolean {
  return source === 'user' || source === 'composer';
}
