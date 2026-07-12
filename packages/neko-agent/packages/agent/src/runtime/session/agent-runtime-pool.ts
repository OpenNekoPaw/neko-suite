import {
  createConversationRuntimeContext,
  type ConversationRuntimeContext,
  type ManagedConversationRuntimeSession,
} from './conversation-runtime-context';

export interface ManagedAgentRuntime extends ManagedConversationRuntimeSession {
  isRunning(): boolean;
}

export type AgentRuntimePoolPressureEvent =
  | {
      readonly type: 'expanded';
      readonly maxAgents: number;
      readonly absoluteMaxAgents: number;
    }
  | {
      readonly type: 'saturated';
      readonly maxAgents: number;
      readonly absoluteMaxAgents: number;
    };

export interface AgentRuntimePoolOptions<TAgent extends ManagedAgentRuntime> {
  readonly createAgent: (conversationId: string) => TAgent;
  readonly maxAgents?: number;
  readonly absoluteMaxAgents?: number;
  readonly onRemove?: (conversationId: string, agent: TAgent) => void;
  readonly onPressure?: (event: AgentRuntimePoolPressureEvent) => void;
}

export class AgentRuntimePool<TAgent extends ManagedAgentRuntime> {
  private readonly _contexts = new Map<string, ConversationRuntimeContext<TAgent>>();
  private readonly _accessOrder: string[] = [];
  private readonly _defaultMaxAgents: number;
  private readonly _absoluteMaxAgents: number;
  private _maxAgents: number;

  constructor(private readonly _options: AgentRuntimePoolOptions<TAgent>) {
    this._defaultMaxAgents = _options.maxAgents ?? 10;
    this._absoluteMaxAgents = _options.absoluteMaxAgents ?? 20;
    this._maxAgents = this._defaultMaxAgents;
  }

  get size(): number {
    return this._contexts.size;
  }

  getOrCreate(conversationId: string): TAgent {
    return this.getOrCreateContext(conversationId).session;
  }

  getOrCreateContext(conversationId: string): ConversationRuntimeContext<TAgent> {
    assertConversationId(conversationId);
    const existing = this._contexts.get(conversationId);
    if (existing) {
      this._updateAccessOrder(conversationId);
      return existing;
    }

    this._evictIfNeeded();
    const context = createConversationRuntimeContext({
      conversationId,
      session: this._options.createAgent(conversationId),
    });
    context.markReady();
    this._contexts.set(conversationId, context);
    this._updateAccessOrder(conversationId);
    return context;
  }

  get(conversationId: string): TAgent | undefined {
    return this.getContext(conversationId)?.session;
  }

  getContext(conversationId: string): ConversationRuntimeContext<TAgent> | undefined {
    const context = this._contexts.get(conversationId);
    if (context) {
      this._updateAccessOrder(conversationId);
    }
    return context;
  }

  isRunning(conversationId: string): boolean {
    return this._contexts.get(conversationId)?.session.isRunning() ?? false;
  }

  getRunningConversations(): string[] {
    const running: string[] = [];
    for (const [conversationId, context] of this._contexts) {
      if (context.session.isRunning()) {
        running.push(conversationId);
      }
    }
    return running;
  }

  getAllConversations(): string[] {
    return Array.from(this._contexts.keys());
  }

  *values(): IterableIterator<TAgent> {
    for (const context of this._contexts.values()) {
      yield context.session;
    }
  }

  remove(conversationId: string): void {
    const context = this._contexts.get(conversationId);
    if (!context) return;

    let removalError: unknown;
    try {
      this._options.onRemove?.(conversationId, context.session);
    } catch (error) {
      removalError = error;
    }

    let disposalError: unknown;
    try {
      context.dispose();
    } catch (error) {
      disposalError = error;
    } finally {
      this._contexts.delete(conversationId);
      this._removeAccessOrder(conversationId);
      this._shrinkIfIdle();
    }

    if (removalError !== undefined && disposalError !== undefined) {
      throw new AggregateError(
        [removalError, disposalError],
        `Conversation runtime ${conversationId} failed during removal.`,
      );
    }
    if (removalError !== undefined) throw removalError;
    if (disposalError !== undefined) throw disposalError;
  }

  cancel(conversationId: string): void {
    this._contexts.get(conversationId)?.cancel();
  }

  cancelAll(): void {
    for (const context of this._contexts.values()) {
      context.cancel();
    }
  }

  dispose(): void {
    const errors: unknown[] = [];
    for (const conversationId of Array.from(this._contexts.keys())) {
      try {
        this.remove(conversationId);
      } catch (error) {
        errors.push(error);
      }
    }
    this._accessOrder.length = 0;
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Multiple conversation runtimes failed to dispose.');
    }
  }

  private _evictIfNeeded(): void {
    while (this._contexts.size >= this._maxAgents) {
      const evictId = this._findLeastRecentlyUsedIdleAgent();
      if (evictId) {
        this.remove(evictId);
        continue;
      }

      if (this._maxAgents < this._absoluteMaxAgents) {
        this._maxAgents++;
        this._options.onPressure?.({
          type: 'expanded',
          maxAgents: this._maxAgents,
          absoluteMaxAgents: this._absoluteMaxAgents,
        });
      } else {
        this._options.onPressure?.({
          type: 'saturated',
          maxAgents: this._maxAgents,
          absoluteMaxAgents: this._absoluteMaxAgents,
        });
      }
      break;
    }
  }

  private _findLeastRecentlyUsedIdleAgent(): string | undefined {
    for (const conversationId of this._accessOrder) {
      const context = this._contexts.get(conversationId);
      if (context && !context.session.isRunning()) {
        return conversationId;
      }
    }
    return undefined;
  }

  private _updateAccessOrder(conversationId: string): void {
    this._removeAccessOrder(conversationId);
    this._accessOrder.push(conversationId);
  }

  private _removeAccessOrder(conversationId: string): void {
    const index = this._accessOrder.indexOf(conversationId);
    if (index !== -1) {
      this._accessOrder.splice(index, 1);
    }
  }

  private _shrinkIfIdle(): void {
    if (this._maxAgents > this._defaultMaxAgents && this._contexts.size <= this._defaultMaxAgents) {
      this._maxAgents = this._defaultMaxAgents;
    }
  }
}

function assertConversationId(conversationId: string): void {
  if (conversationId.trim().length === 0) {
    throw new Error('conversationId is required for an Agent runtime pool.');
  }
}
