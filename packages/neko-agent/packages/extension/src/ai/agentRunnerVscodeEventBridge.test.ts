import { describe, expect, it, vi } from 'vitest';
import { createAgentRunnerEventEmitter, type AgentRunnerPortEvent } from '@neko/agent/runtime';
import { AgentRunnerVscodeEventBridge } from './agentRunnerVscodeEventBridge';

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(event: T) => void> = [];

    readonly event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };

    fire(event: T): void {
      for (const listener of this.listeners) listener(event);
    }

    dispose(): void {
      this.listeners = [];
    }
  }

  return { EventEmitter };
});

describe('AgentRunnerVscodeEventBridge', () => {
  it('forwards lifecycle, confirmation, and subagent events from the unified runner stream', () => {
    const emitter = createAgentRunnerEventEmitter<AgentRunnerPortEvent>();
    const bridge = new AgentRunnerVscodeEventBridge(emitter.event);
    const start = vi.fn();
    const stop = vi.fn();
    const confirmation = vi.fn();
    const subagent = vi.fn();

    bridge.onDidStart(start);
    bridge.onDidStop(stop);
    bridge.onDidRequestConfirmation(confirmation);
    bridge.onDidSubAgentEvent(subagent);

    emitter.fire({ type: 'start' });
    emitter.fire({
      type: 'confirmation',
      request: {
        toolCallId: 'tool-1',
        toolName: 'write_file',
        action: 'write',
        description: 'Write file',
        details: { path: 'README.md' },
      },
    });
    emitter.fire({
      type: 'subagent',
      event: {
        type: 'spawned',
        agentId: 'agent-1',
        parentAgentId: 'agent-root',
        conversationId: 'conv-1',
        taskId: 'task-1',
        timestamp: 1,
      },
    });
    emitter.fire({ type: 'stop' });

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(confirmation).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'tool-1', toolName: 'write_file' }),
    );
    expect(subagent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'spawned', conversationId: 'conv-1' }),
    );

    bridge.dispose();
    emitter.dispose();
  });
});
