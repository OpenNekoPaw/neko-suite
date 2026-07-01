import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { useSlashCommands } from '../useSlashCommands';
import { useAgentStore } from '../../stores/agent-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useConfigStore } from '../../stores/config-store';
import { DEFAULT_CLI_CONFIG } from '../../core/types';

vi.mock('../../core/config', () => ({
  getProviderModels: vi.fn(() => ['gpt-5.3-codex']),
  listChatModelOptions: vi.fn(() => [
    {
      id: 'anthropic:gpt-5.3-codex',
      label: 'Anthropic / GPT 5.3 Codex',
      providerId: 'anthropic',
      modelId: 'gpt-5.3-codex',
      category: 'llm',
    },
    {
      id: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      providerId: 'openai',
      modelId: 'gpt-image-1',
      category: 'image',
    },
  ]),
}));

describe('useSlashCommands Skill lifecycle commands', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
    useConversationStore.getState().clearMessages();
    useConfigStore.getState().replaceConfig({
      ...DEFAULT_CLI_CONFIG,
      skillsDir: '/workspace/.neko/skills',
    });
  });

  it('reports ambiguity when clearing without a target and multiple lifecycle records are active', async () => {
    const deactivateSkill = vi.fn();
    const activateSkill = vi.fn();
    const handleCommand = renderHarness({
      activateSkill,
      deactivateSkill,
    });
    useAgentStore.getState().setActiveSkillLifecycleRecords([
      {
        id: 'domain-1',
        skillName: 'review',
        slot: 'domainSkill',
        owner: 'user',
        clearable: true,
        status: 'active',
      },
      {
        id: 'reference-1',
        skillName: 'review',
        slot: 'referenceSkill',
        owner: 'agent',
        clearable: true,
        status: 'active',
      },
    ]);

    await handleCommand('/skill off');

    expect(deactivateSkill).not.toHaveBeenCalled();
    expect(activateSkill).not.toHaveBeenCalled();
    expect(lastSystemMessage()).toContain('Multiple active Skill lifecycle records');
    expect(lastSystemMessage()).toContain('domain-1 review[domainSkill]');
  });

  it('clears a scoped lifecycle target instead of activating an "off" Skill name', async () => {
    const deactivateSkill = vi.fn(() => true);
    const activateSkill = vi.fn();
    const handleCommand = renderHarness({
      activateSkill,
      deactivateSkill,
    });
    useAgentStore.getState().setActiveSkillLifecycleRecords([
      {
        id: 'domain-1',
        skillName: 'review',
        slot: 'domainSkill',
        owner: 'user',
        clearable: true,
        status: 'active',
      },
      {
        id: 'reference-1',
        skillName: 'review',
        slot: 'referenceSkill',
        owner: 'agent',
        clearable: true,
        status: 'active',
      },
    ]);

    await handleCommand('/skill off domainSkill');

    expect(activateSkill).not.toHaveBeenCalled();
    expect(deactivateSkill).toHaveBeenCalledWith({ slot: 'domainSkill' });
    expect(lastSystemMessage()).toBe('Skill lifecycle record deactivated.');
  });

  it('activates lifecycle records for command-backed slash Skill commands before submit', async () => {
    const activateSkill = vi.fn(() => true);
    const deactivateSkill = vi.fn();
    const submit = vi.fn();
    const handleCommand = renderHarness({
      activateSkill,
      deactivateSkill,
      submit,
    });

    await handleCommand('/commit fix bug');

    expect(activateSkill).toHaveBeenCalledWith('commit-skill', 'fix bug');
    expect(submit).toHaveBeenCalledWith(
      'fix bug',
      expect.objectContaining({
        metadata: expect.objectContaining({
          idc: expect.objectContaining({ entrySignal: 'prompt-chain-skill' }),
        }),
      }),
    );
  });

  it('activates lifecycle records for dollar Skill invocations before submit', async () => {
    const activateSkill = vi.fn(() => true);
    const deactivateSkill = vi.fn();
    const submit = vi.fn();
    const handleCommand = renderHarness({
      activateSkill,
      deactivateSkill,
      submit,
    });

    await handleCommand('$review changed files');

    expect(activateSkill).toHaveBeenCalledWith('review', 'changed files');
    expect(submit).toHaveBeenCalledWith(
      'changed files',
      expect.objectContaining({
        metadata: expect.objectContaining({
          idc: expect.objectContaining({ entrySignal: 'prompt-chain-skill' }),
        }),
      }),
    );
  });

  it('rejects non-queueable commands while running before side effects', async () => {
    const activateSkill = vi.fn(() => true);
    const deactivateSkill = vi.fn();
    const submit = vi.fn();
    const handleCommand = renderHarness({
      activateSkill,
      deactivateSkill,
      submit,
    });
    useAgentStore.getState().setRunning();

    await handleCommand('$review changed files');

    expect(activateSkill).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(lastSystemMessage()).toContain(
      'not-queueable: Skill invocations cannot be queued while an Agent turn is running.',
    );
  });

  it('allows queue commands while running', async () => {
    const queueSnapshot = {
      conversationId: 'conv-1',
      items: [],
      pendingCount: 0,
      version: 0,
    };
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
      getMessageQueueSnapshot: () => queueSnapshot,
    });
    useAgentStore.getState().setRunning();

    await handleCommand('/queue list');

    expect(lastSystemMessage()).toBe('Queue: empty (version 0)');
  });

  it('routes IDC workflow commands through the explicit workflow control port', async () => {
    const controlIdcWorkflow = vi.fn(() => 'IDC workflow started: run-1');
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
      controlIdcWorkflow,
    });

    await handleCommand('/idc start storyboard');

    expect(controlIdcWorkflow).toHaveBeenCalledWith({
      action: 'start',
      runKind: 'storyboard',
      reason: 'TUI /idc start',
    });
    expect(lastSystemMessage()).toBe('IDC workflow started: run-1');
  });

  it('allows IDC stop while running but rejects IDC start before side effects', async () => {
    const controlIdcWorkflow = vi.fn(() => 'IDC workflow stopped');
    const submit = vi.fn();
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
      submit,
      controlIdcWorkflow,
    });
    useAgentStore.getState().setRunning();

    await handleCommand('/idc start storyboard');

    expect(controlIdcWorkflow).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(lastSystemMessage()).toContain(
      'not-queueable: Commands cannot be queued while an Agent turn is running.',
    );

    await handleCommand('/idc stop');

    expect(controlIdcWorkflow).toHaveBeenCalledWith({
      action: 'stop',
      reason: 'TUI /idc stop',
    });
    expect(lastSystemMessage()).toBe('IDC workflow stopped');
  });

  it('updates default media models through /model media commands', async () => {
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
    });

    await handleCommand('/model image openai:gpt-image-1');

    expect(useConfigStore.getState().config.defaultMediaModels?.image).toBe('openai:gpt-image-1');
    expect(lastSystemMessage()).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
  });
});

function renderHarness(actions: {
  readonly activateSkill: (name: string, args?: string) => boolean;
  readonly deactivateSkill: (input?: {
    readonly recordId?: string;
    readonly slot?: import('@neko/shared').SkillLifecycleSlot;
    readonly skillName?: string;
  }) => boolean;
  readonly submit?: (
    prompt: string,
    executionOverrides?: { metadata?: Record<string, unknown> },
  ) => Promise<void> | void;
  readonly getMessageQueueSnapshot?: NonNullable<
    import('../useAgentSession').AgentSessionHandle['getMessageQueueSnapshot']
  >;
  readonly controlIdcWorkflow?: NonNullable<
    import('../../core/tui-command-router').TuiWorkflowPorts['controlIdcWorkflow']
  >;
}): (input: string) => Promise<void> {
  let handleCommand: ((input: string) => Promise<void>) | undefined;

  function Harness(): React.JSX.Element {
    ({ handleCommand } = useSlashCommands({
      clearHistory: vi.fn(),
      submit: actions.submit
        ? async (prompt, executionOverrides) => {
            await actions.submit?.(prompt, executionOverrides);
          }
        : undefined,
      activateSkill: actions.activateSkill,
      deactivateSkill: actions.deactivateSkill,
      getMessageQueueSnapshot: actions.getMessageQueueSnapshot,
      ...(actions.controlIdcWorkflow ? { controlIdcWorkflow: actions.controlIdcWorkflow } : {}),
      getSkillService: () => createSkillServiceMock(),
    }));
    return React.createElement(React.Fragment);
  }

  render(React.createElement(Harness));
  if (!handleCommand) {
    throw new Error('Slash command harness did not initialize');
  }
  return handleCommand;
}

function createSkillServiceMock() {
  const skills = [
    {
      name: 'review',
      description: 'Review changes',
      content: 'Review instructions',
      enabled: true,
    },
    {
      name: 'storyboard',
      description: 'Storyboard help',
      content: 'Storyboard instructions',
      enabled: true,
    },
    {
      name: 'commit-skill',
      description: 'Commit helper',
      content: 'Commit instructions',
      enabled: true,
      entryPointKind: 'command-artifact',
      command: 'commit',
    },
  ];
  return {
    registry: {
      listSkills: vi.fn(() => skills),
      listAllSkills: vi.fn(() => skills),
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
    },
    apply: vi.fn(),
  } as never;
}

function lastSystemMessage(): string {
  const messages = useConversationStore.getState().messages;
  const systemMessages = messages.filter((message) => message.role === 'system');
  return systemMessages.at(-1)?.content ?? '';
}
