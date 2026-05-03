export interface ManagedAgentRuntime {
  isRunning(): boolean;
  cancel(): void;
  dispose(): void;
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
  private readonly _agents = new Map<string, TAgent>();
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
    return this._agents.size;
  }

  getOrCreate(conversationId: string): TAgent {
    const existing = this._agents.get(conversationId);
    if (existing) {
      this._updateAccessOrder(conversationId);
      return existing;
    }

    this._evictIfNeeded();
    const agent = this._options.createAgent(conversationId);
    this._agents.set(conversationId, agent);
    this._updateAccessOrder(conversationId);
    return agent;
  }

  get(conversationId: string): TAgent | undefined {
    const agent = this._agents.get(conversationId);
    if (agent) {
      this._updateAccessOrder(conversationId);
    }
    return agent;
  }

  isRunning(conversationId: string): boolean {
    return this._agents.get(conversationId)?.isRunning() ?? false;
  }

  hasRunningAgents(): boolean {
    for (const agent of this._agents.values()) {
      if (agent.isRunning()) return true;
    }
    return false;
  }

  getRunningConversations(): string[] {
    const running: string[] = [];
    for (const [conversationId, agent] of this._agents) {
      if (agent.isRunning()) {
        running.push(conversationId);
      }
    }
    return running;
  }

  getAllConversations(): string[] {
    return Array.from(this._agents.keys());
  }

  values(): IterableIterator<TAgent> {
    return this._agents.values();
  }

  remove(conversationId: string): void {
    const agent = this._agents.get(conversationId);
    if (!agent) return;

    agent.cancel();
    this._options.onRemove?.(conversationId, agent);
    agent.dispose();
    this._agents.delete(conversationId);
    this._removeAccessOrder(conversationId);
    this._shrinkIfIdle();
  }

  cancel(conversationId: string): void {
    this._agents.get(conversationId)?.cancel();
  }

  cancelAll(): void {
    for (const agent of this._agents.values()) {
      agent.cancel();
    }
  }

  dispose(): void {
    for (const conversationId of Array.from(this._agents.keys())) {
      this.remove(conversationId);
    }
    this._accessOrder.length = 0;
  }

  private _evictIfNeeded(): void {
    while (this._agents.size >= this._maxAgents) {
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
      const agent = this._agents.get(conversationId);
      if (agent && !agent.isRunning()) {
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
    if (this._maxAgents > this._defaultMaxAgents && this._agents.size <= this._defaultMaxAgents) {
      this._maxAgents = this._defaultMaxAgents;
    }
  }
}
