import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Skill, SkillInjection } from '@neko/shared';
import type { ISkillProvider } from '../../tools/core/meta-tools';
import {
  createAgentRuntimeManager,
  type AgentRuntimeManagerAgent,
  type AgentRuntimeManagerEvent,
} from '../session/agent-runtime-manager';
import type { AgentRunnerEventSource, AgentRunnerPortEvent } from '../runner/agent-runner-port';

class MockAgent implements AgentRuntimeManagerAgent {
  constructor(private readonly conversationId = 'conversation-1') {}

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
  readonly getPendingMessageQueue = vi.fn(() => []);
  readonly removePendingMessage = vi.fn((queueItemId: string) => ({
    id: queueItemId,
    conversationId: this.conversationId,
    content: 'queued',
    createdAt: 1000,
    source: 'composer' as const,
  }));
  readonly updatePendingMessage = vi.fn((queueItemId: string, content: string) => ({
    id: queueItemId,
    conversationId: this.conversationId,
    content,
    createdAt: 1000,
    updatedAt: 1001,
    source: 'composer' as const,
  }));
  readonly promotePendingMessage = vi.fn((queueItemId: string) => ({
    id: queueItemId,
    conversationId: this.conversationId,
    content: 'queued',
    createdAt: 1000,
    source: 'composer' as const,
  }));
  readonly dequeuePendingMessage = vi.fn(() => ({
    id: 'queue-1',
    conversationId: this.conversationId,
    content: 'queued',
    createdAt: 1000,
    source: 'composer' as const,
  }));
  readonly clearPendingMessages = vi.fn();
  readonly getContextTokenCount = vi.fn(() => 128);
  readonly compressContext = vi.fn(async () => ({
    originalTokens: 128,
    compressedTokens: 64,
    ratio: 0.5,
  }));
  readonly applySkillLifecycleProjection = vi.fn();
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

class MockPortEventAgent extends MockAgent {
  readonly onDidRunnerEvent: AgentRunnerEventSource<AgentRunnerPortEvent> = (listener) => {
    this.runnerEventListeners.push(listener);
    return { dispose: () => this.removeRunnerEventListener(listener) };
  };

  private readonly runnerEventListeners: Array<(event: AgentRunnerPortEvent) => void> = [];

  fireRunnerEvent(event: AgentRunnerPortEvent): void {
    for (const listener of this.runnerEventListeners) listener(event);
  }

  private removeRunnerEventListener(listener: (event: AgentRunnerPortEvent) => void): void {
    const index = this.runnerEventListeners.indexOf(listener);
    if (index >= 0) this.runnerEventListeners.splice(index, 1);
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

  it('prefers host-agnostic runner port events over compatibility start/stop events', () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const manager = createAgentRuntimeManager({
      createAgent: () => new MockPortEventAgent(),
      onAgentStart: ({ conversationId }) => starts.push(conversationId),
      onAgentStop: ({ conversationId }) => stops.push(conversationId),
    });

    const agent = manager.getOrCreate('conversation-1') as MockPortEventAgent;
    agent.fireRunnerEvent({ type: 'start' });
    agent.fireRunnerEvent({ type: 'stop' });
    agent.fireStart();
    agent.fireStop();

    expect(starts).toEqual(['conversation-1']);
    expect(stops).toEqual(['conversation-1']);
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
      activateSkill: async () => ({ success: true }),
      deactivateSkill: async () => ({ success: true }),
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
    manager.getPendingMessageQueue('conversation-1');
    manager.removePendingMessage('conversation-1', 'queue-1');
    manager.updatePendingMessage('conversation-1', 'queue-1', 'queued revised', 1001);
    manager.promotePendingMessage('conversation-1', 'queue-1');
    manager.dequeuePendingMessage('conversation-1');
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
    expect(agent.getPendingMessageQueue).toHaveBeenCalledOnce();
    expect(agent.removePendingMessage).toHaveBeenCalledWith('queue-1');
    expect(agent.updatePendingMessage).toHaveBeenCalledWith('queue-1', 'queued revised', 1001);
    expect(agent.promotePendingMessage).toHaveBeenCalledWith('queue-1');
    expect(agent.dequeuePendingMessage).toHaveBeenCalledOnce();
    expect(agent.clearPendingMessages).toHaveBeenCalledOnce();
    expect(agent.applySkillInjection).toHaveBeenCalledWith(injection, skill);
    expect(agent.clearActiveSkill).toHaveBeenCalledOnce();
    expect(agent.refreshCapabilityRuntime).toHaveBeenCalledOnce();
  });

  it('issues monotonic message queue snapshot versions per conversation', () => {
    const manager = createAgentRuntimeManager({ createAgent: () => new MockAgent() });

    expect(manager.nextMessageQueueSnapshotVersion('conversation-1')).toBe(1);
    expect(manager.nextMessageQueueSnapshotVersion('conversation-1')).toBe(2);
    expect(manager.nextMessageQueueSnapshotVersion('conversation-2')).toBe(1);
    expect(manager.nextMessageQueueSnapshotVersion('conversation-1')).toBe(3);
  });

  it('keeps concurrent conversation runner events, queues, Skills, and cancellation isolated', () => {
    const starts: string[] = [];
    const stops: string[] = [];
    const manager = createAgentRuntimeManager({
      createAgent: ({ conversationId }) => new MockPortEventAgent(conversationId),
      onAgentStart: ({ conversationId }) => starts.push(conversationId),
      onAgentStop: ({ conversationId }) => stops.push(conversationId),
    });
    const agentA = manager.getOrCreate('conv-a') as MockPortEventAgent;
    const agentB = manager.getOrCreate('conv-b') as MockPortEventAgent;
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
    const projection: SkillLifecycleProjection = {
      promptSections: [],
      toolPolicy: {
        mode: 'unrestricted',
        contributingRecordIds: [],
        diagnostics: [],
      },
      diagnostics: [],
      visibleIndicators: [],
    };

    agentA.fireRunnerEvent({ type: 'start' });
    agentB.fireRunnerEvent({ type: 'start' });
    agentA.fireRunnerEvent({ type: 'stop' });
    agentB.fireRunnerEvent({ type: 'stop' });

    manager.promotePendingMessage('conv-a', 'queue-a');
    manager.updatePendingMessage('conv-b', 'queue-b', 'queued B', 2000);
    manager.applySkillLifecycleProjection('conv-a', projection);
    manager.applySkillInjection('conv-b', injection, skill);
    manager.clearActiveSkill('conv-b');
    manager.cancel('conv-a');

    expect(starts).toEqual(['conv-a', 'conv-b']);
    expect(stops).toEqual(['conv-a', 'conv-b']);
    expect(agentA.promotePendingMessage).toHaveBeenCalledWith('queue-a');
    expect(agentB.promotePendingMessage).not.toHaveBeenCalled();
    expect(agentB.updatePendingMessage).toHaveBeenCalledWith('queue-b', 'queued B', 2000);
    expect(agentA.updatePendingMessage).not.toHaveBeenCalled();
    expect(agentA.applySkillLifecycleProjection).toHaveBeenCalledWith(projection);
    expect(agentB.applySkillLifecycleProjection).not.toHaveBeenCalled();
    expect(agentB.applySkillInjection).toHaveBeenCalledWith(injection, skill);
    expect(agentA.applySkillInjection).not.toHaveBeenCalled();
    expect(agentB.clearActiveSkill).toHaveBeenCalledOnce();
    expect(agentA.clearActiveSkill).not.toHaveBeenCalled();
    expect(agentA.cancel).toHaveBeenCalledOnce();
    expect(agentB.cancel).not.toHaveBeenCalled();
  });
});
