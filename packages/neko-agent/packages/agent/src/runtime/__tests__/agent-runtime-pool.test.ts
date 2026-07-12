import { describe, expect, it, vi } from 'vitest';
import { AgentRuntimePool, type ManagedAgentRuntime } from '../session/agent-runtime-pool';

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
  it('rejects missing ownership before creating or evicting runtime state', () => {
    const createAgent = vi.fn(() => new TestAgent());
    const pool = new AgentRuntimePool({ maxAgents: 1, createAgent });
    const existing = pool.getOrCreateContext('conv-a');

    expect(() => pool.getOrCreateContext(' ')).toThrow(/conversationId is required/);
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(pool.getContext('conv-a')).toBe(existing);
  });

  it('owns one ready runtime context per conversation', () => {
    const pool = new AgentRuntimePool({ createAgent: () => new TestAgent() });

    const contextA = pool.getOrCreateContext('conv-a');
    const contextB = pool.getOrCreateContext('conv-b');

    expect(contextA).toBe(pool.getOrCreateContext('conv-a'));
    expect(contextA).not.toBe(contextB);
    expect(contextA.conversationId).toBe('conv-a');
    expect(contextA.lifecycle).toBe('ready');
    expect(contextB.lifecycle).toBe('ready');
  });

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

  it('disposes only the removed conversation context', () => {
    const pool = new AgentRuntimePool({ createAgent: () => new TestAgent() });
    const contextA = pool.getOrCreateContext('conv-a');
    const contextB = pool.getOrCreateContext('conv-b');

    pool.remove('conv-a');

    expect(contextA.lifecycle).toBe('disposed');
    expect(contextA.session.cancel).toHaveBeenCalledOnce();
    expect(contextA.session.dispose).toHaveBeenCalledOnce();
    expect(contextB.lifecycle).toBe('ready');
    expect(contextB.session.cancel).not.toHaveBeenCalled();
    expect(contextB.session.dispose).not.toHaveBeenCalled();
    expect(pool.getContext('conv-b')).toBe(contextB);
  });

  it('removes a failed runtime context without corrupting another conversation', () => {
    const pool = new AgentRuntimePool({
      createAgent: (conversationId) => {
        const agent = new TestAgent();
        if (conversationId === 'conv-a') {
          agent.cancel.mockImplementation(() => {
            throw new Error('cancel failed');
          });
        }
        return agent;
      },
    });
    const contextA = pool.getOrCreateContext('conv-a');
    const contextB = pool.getOrCreateContext('conv-b');

    expect(() => pool.remove('conv-a')).toThrow('cancel failed');

    expect(contextA.lifecycle).toBe('disposed');
    expect(pool.getContext('conv-a')).toBeUndefined();
    expect(pool.getContext('conv-b')).toBe(contextB);
    expect(contextB.lifecycle).toBe('ready');
  });

  it('continues disposing independent conversations when one runtime fails', () => {
    const pool = new AgentRuntimePool({
      createAgent: (conversationId) => {
        const agent = new TestAgent();
        if (conversationId === 'conv-a') {
          agent.dispose.mockImplementation(() => {
            throw new Error('dispose failed');
          });
        }
        return agent;
      },
    });
    const contextA = pool.getOrCreateContext('conv-a');
    const contextB = pool.getOrCreateContext('conv-b');

    expect(() => pool.dispose()).toThrow('dispose failed');

    expect(contextA.lifecycle).toBe('disposed');
    expect(contextB.lifecycle).toBe('disposed');
    expect(contextB.session.dispose).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
  });

  it('cancels one running conversation without touching another running conversation', () => {
    const agents = new Map<string, TestAgent>();
    const pool = new AgentRuntimePool({
      createAgent: (conversationId) => {
        const agent = new TestAgent(true);
        agents.set(conversationId, agent);
        return agent;
      },
    });

    const agentA = pool.getOrCreate('conv-a');
    const agentB = pool.getOrCreate('conv-b');

    expect(pool.getRunningConversations()).toEqual(['conv-a', 'conv-b']);

    pool.cancel('conv-a');
    agentA.setRunning(false);

    expect(agentA.cancel).toHaveBeenCalledOnce();
    expect(agentB.cancel).not.toHaveBeenCalled();
    expect(pool.isRunning('conv-a')).toBe(false);
    expect(pool.isRunning('conv-b')).toBe(true);
    expect(pool.getRunningConversations()).toEqual(['conv-b']);
    expect(agents.get('conv-b')).toBe(agentB);
  });
});
