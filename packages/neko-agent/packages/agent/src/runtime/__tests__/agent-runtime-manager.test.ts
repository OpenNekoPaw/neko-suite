import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Skill, SkillInjection } from '@neko/shared';
import type { ISkillProvider } from '../../tools/core/meta-tools';
import {
  createAgentRuntimeManager,
  type AgentRuntimeManagerAgent,
  type AgentRuntimeManagerEvent,
} from '../agent-runtime-manager';

class MockAgent implements AgentRuntimeManagerAgent {
  readonly onDidStart: AgentRuntimeManagerEvent = (listener) => {
    this.startListeners.push(listener);
    return { dispose: () => this.removeListener(this.startListeners, listener) };
  };

  readonly onDidStop: AgentRuntimeManagerEvent = (listener) => {
    this.stopListeners.push(listener);
    return { dispose: () => this.removeListener(this.stopListeners, listener) };
  };

  readonly loadHistory = vi.fn();
  readonly confirmTool = vi.fn();
  readonly cancel = vi.fn();
  readonly clearHistory = vi.fn();
  readonly clearPendingMessages = vi.fn();
  readonly getContextTokenCount = vi.fn(() => 128);
  readonly compressContext = vi.fn(async () => ({
    originalTokens: 128,
    compressedTokens: 64,
    ratio: 0.5,
  }));
  readonly applySkillInjection = vi.fn();
  readonly getActiveSkill = vi.fn((): Skill | undefined => undefined);
  readonly clearActiveSkill = vi.fn();
  readonly isToolAllowed = vi.fn(() => true);
  readonly setSkillProvider = vi.fn();
  readonly refreshCapabilityRuntime = vi.fn();
  readonly dispose = vi.fn();

  running = false;
  private readonly startListeners: Array<() => void> = [];
  private readonly stopListeners: Array<() => void> = [];

  isRunning(): boolean {
    return this.running;
  }

  fireStart(): void {
    for (const listener of this.startListeners) listener();
  }

  fireStop(): void {
    for (const listener of this.stopListeners) listener();
  }

  private removeListener(listeners: Array<() => void>, listener: () => void): void {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  }
}

function makeMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

describe('AgentRuntimeManager', () => {
  it('owns pool lifecycle and bridges agent start/stop events by conversation', () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const manager = createAgentRuntimeManager({
      createAgent: () => new MockAgent(),
      onAgentStart: ({ conversationId }) => starts.push(conversationId),
      onAgentStop: ({ conversationId }) => stops.push(conversationId),
    });

    const agent = manager.getOrCreate('conversation-1');
    agent.fireStart();
    agent.fireStop();
    manager.remove('conversation-1');
    agent.fireStart();

    expect(starts).toEqual(['conversation-1']);
    expect(stops).toEqual(['conversation-1']);
    expect(agent.cancel).toHaveBeenCalledOnce();
    expect(agent.dispose).toHaveBeenCalledOnce();
  });

  it('hydrates tool result context before loading history', () => {
    const manager = createAgentRuntimeManager({ createAgent: () => new MockAgent() });
    const agent = manager.getOrCreate('conversation-1');

    manager.loadHistoryWithContext('conversation-1', [
      {
        role: 'assistant',
        content: 'created image',
        toolResults: [{ callId: 'tool-1', success: true, data: { url: 'file.png' } }],
      },
    ]);

    const [messages] = agent.loadHistory.mock.calls[0] ?? [];
    expect(messages).toEqual([
      { role: 'assistant', content: 'created image' },
      {
        role: 'user',
        content: '[Tool Result for tool-1]: Success\n{\n  "url": "file.png"\n}',
      },
    ]);
  });

  it('applies skill provider factories to existing and future agents', () => {
    const manager = createAgentRuntimeManager({ createAgent: () => new MockAgent() });
    const existing = manager.getOrCreate('existing');
    const provider: ISkillProvider = {
      listSkills: () => [],
      getActiveSkill: () => null,
      activateSkill: async () => ({ success: true, message: 'ok' }),
      deactivateSkill: async () => ({ success: true, message: 'ok' }),
    };

    manager.setSkillProviderFactory(() => provider);
    const createdAfterFactory = manager.getOrCreate('future');

    expect(existing.setSkillProvider).toHaveBeenCalledWith(provider);
    expect(createdAfterFactory.setSkillProvider).toHaveBeenCalledWith(provider);
  });

  it('delegates control, context, and skill operations to the target conversation agent', async () => {
    const manager = createAgentRuntimeManager({ createAgent: () => new MockAgent() });
    const agent = manager.getOrCreate('conversation-1');
    const skill: Skill = {
      name: 'storyboard',
      description: '',
      content: '',
      source: 'project',
      enabled: true,
    };
    const injection: SkillInjection = {
      systemPrompt: 'prompt',
      name: 'storyboard',
      type: 'skill',
    };

    manager.confirmTool('conversation-1', 'tool-1', true);
    manager.loadHistory('conversation-1', [makeMessage('hello')], [['event-1']]);
    manager.clearHistory('conversation-1');
    manager.clearPendingMessages('conversation-1');
    manager.applySkillInjection('conversation-1', injection, skill);
    manager.clearActiveSkill('conversation-1');
    manager.refreshCapabilityRuntime();

    expect(manager.getContextTokenCount('conversation-1')).toBe(128);
    await expect(manager.compressContext('conversation-1')).resolves.toEqual({
      originalTokens: 128,
      compressedTokens: 64,
      ratio: 0.5,
    });
    expect(agent.confirmTool).toHaveBeenCalledWith('tool-1', true);
    expect(agent.loadHistory).toHaveBeenCalledWith([makeMessage('hello')], [['event-1']]);
    expect(agent.clearHistory).toHaveBeenCalledOnce();
    expect(agent.clearPendingMessages).toHaveBeenCalledOnce();
    expect(agent.applySkillInjection).toHaveBeenCalledWith(injection, skill);
    expect(agent.clearActiveSkill).toHaveBeenCalledOnce();
    expect(agent.refreshCapabilityRuntime).toHaveBeenCalledOnce();
  });
});
