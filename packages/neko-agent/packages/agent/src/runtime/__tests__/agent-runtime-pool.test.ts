import { describe, expect, it, vi } from 'vitest';
import { AgentRuntimePool, type ManagedAgentRuntime } from '../agent-runtime-pool';

class TestAgent implements ManagedAgentRuntime {
  readonly cancel = vi.fn();
  readonly dispose = vi.fn();

  constructor(private _running = false) {}

  isRunning(): boolean {
    return this._running;
  }

  setRunning(value: boolean): void {
    this._running = value;
  }
}

describe('AgentRuntimePool', () => {
  it('reuses agents by conversationId', () => {
    const createAgent = vi.fn(() => new TestAgent());
    const pool = new AgentRuntimePool({ createAgent });

    const first = pool.getOrCreate('conv-1');
    const second = pool.getOrCreate('conv-1');

    expect(first).toBe(second);
    expect(createAgent).toHaveBeenCalledTimes(1);
  });

  it('evicts least-recently-used idle agent when capacity is reached', () => {
    const removed: string[] = [];
    const pool = new AgentRuntimePool({
      maxAgents: 2,
      createAgent: () => new TestAgent(),
      onRemove: (conversationId) => removed.push(conversationId),
    });

    const first = pool.getOrCreate('conv-1');
    pool.getOrCreate('conv-2');
    pool.getOrCreate('conv-3');

    expect(removed).toEqual(['conv-1']);
    expect(first.cancel).toHaveBeenCalled();
    expect(first.dispose).toHaveBeenCalled();
    expect(pool.getAllConversations()).toEqual(['conv-2', 'conv-3']);
  });

  it('expands capacity instead of evicting when all agents are running', () => {
    const pressure = vi.fn();
    const pool = new AgentRuntimePool({
      maxAgents: 1,
      absoluteMaxAgents: 2,
      createAgent: () => new TestAgent(true),
      onPressure: pressure,
    });

    pool.getOrCreate('conv-1');
    pool.getOrCreate('conv-2');

    expect(pool.getAllConversations()).toEqual(['conv-1', 'conv-2']);
    expect(pressure).toHaveBeenCalledWith({
      type: 'expanded',
      maxAgents: 2,
      absoluteMaxAgents: 2,
    });
  });
});
