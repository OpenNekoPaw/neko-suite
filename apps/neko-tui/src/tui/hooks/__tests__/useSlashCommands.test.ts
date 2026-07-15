import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';
import { useSlashCommands } from '../useSlashCommands';
import { testAgentStore as useAgentStore } from '../../__tests__/test-runtime';
import { testConversationStore as useConversationStore } from '../../__tests__/test-runtime';
import { testConfigStore as useConfigStore } from '../../__tests__/test-runtime';
import { SharedTuiTestRuntimeProvider } from '../../__tests__/test-runtime';
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
    expect(submit).toHaveBeenCalledWith('fix bug');
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
    expect(submit).toHaveBeenCalledWith('changed files');
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
      'Queue operation failed (not-queueable): Skill invocations cannot be queued while an Agent turn is running.',
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

  it('allows task status commands while running', async () => {
    const listTasks = vi.fn(async () => []);
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
      listTasks,
    });
    useAgentStore.getState().setRunning();

    await handleCommand('/tasks');

    expect(listTasks).toHaveBeenCalledTimes(1);
    expect(lastSystemMessage()).toBe('No tasks.');
  });

  it('refreshes shared metadata before querying a command boundary', async () => {
    const order: string[] = [];
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
      refreshSharedMetadataAtBoundary: vi.fn(async () => {
        order.push('refresh');
      }),
      listTasks: vi.fn(async () => {
        order.push('list');
        return [];
      }),
    });

    await handleCommand('/tasks');

    expect(order).toEqual(['refresh', 'list']);
  });

  it('captures each owning status store once per snapshot and shows the captured user config path', async () => {
    const originalAgentGetState = useAgentStore.getState;
    const originalConfigGetState = useConfigStore.getState;
    let agentReads = 0;
    let configReads = 0;
    const agentSpy = vi.spyOn(useAgentStore, 'getState').mockImplementation(() => {
      agentReads += 1;
      if (agentReads > 1) {
        throw new Error('Agent store was read more than once by the status snapshot.');
      }
      return originalAgentGetState();
    });
    const configSpy = vi.spyOn(useConfigStore, 'getState').mockImplementation(() => {
      configReads += 1;
      if (configReads > 1) {
        throw new Error('Config store was read more than once by the status snapshot.');
      }
      return originalConfigGetState();
    });

    try {
      const handleCommand = renderHarness({
        activateSkill: vi.fn(() => true),
        deactivateSkill: vi.fn(),
      });

      await handleCommand('/status');

      expect(agentReads).toBe(1);
      expect(configReads).toBe(1);
      expect(lastSystemMessage()).toContain('User config: /Users/neko/.neko/config.toml');
    } finally {
      agentSpy.mockRestore();
      configSpy.mockRestore();
    }
  });

  it('captures fresh best-effort store state for each new /status composition', async () => {
    const handleCommand = renderHarness({
      activateSkill: vi.fn(() => true),
      deactivateSkill: vi.fn(),
    });

    await handleCommand('/status');
    const first = lastSystemMessage();

    useConfigStore.getState().setConfig({
      chatModel: { providerId: 'openai', modelId: 'gpt-5.3-codex' },
    });
    useAgentStore.getState().setRunning();
    await handleCommand('/status');
    const second = lastSystemMessage();

    expect(first).toContain('Model: anthropic:claude-sonnet-4-20250514');
    expect(first).toContain('Status: idle');
    expect(second).toContain('Model: openai:gpt-5.3-codex');
    expect(second).toContain('Status: running');
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
  readonly submit?: (prompt: string) => Promise<void> | void;
  readonly getMessageQueueSnapshot?: NonNullable<
    import('../useAgentSession').AgentSessionHandle['getMessageQueueSnapshot']
  >;
  readonly listTasks?: import('../useAgentSession').AgentSessionHandle['listTasks'];
  readonly refreshSharedMetadataAtBoundary?: import('../useAgentSession').AgentSessionHandle['refreshSharedMetadataAtBoundary'];
}): (input: string) => Promise<void> {
  let handleCommand: ((input: string) => Promise<void>) | undefined;

  function Harness(): React.JSX.Element {
    ({ handleCommand } = useSlashCommands({
      clearHistory: vi.fn(),
      submit: actions.submit
        ? async (prompt) => {
            await actions.submit?.(prompt);
          }
        : undefined,
      activateSkill: actions.activateSkill,
      deactivateSkill: actions.deactivateSkill,
      getMessageQueueSnapshot: actions.getMessageQueueSnapshot,
      listTasks: actions.listTasks,
      refreshSharedMetadataAtBoundary: actions.refreshSharedMetadataAtBoundary,
      getSkillService: () => createSkillServiceMock(),
      presentation: createAgentTerminalPresentationContext({
        translator: createStrictTranslator('en', [
          AGENT_COMMAND_MESSAGE_SOURCE,
          CLI_TERMINAL_MESSAGE_SOURCE,
        ] as const),
        formatters: { count: String, dateTime: String, duration: String, bytes: String },
      }),
      userConfigPath: '/Users/neko/.neko/config.toml',
    }));
    return React.createElement(React.Fragment);
  }

  render(
    React.createElement(SharedTuiTestRuntimeProvider, {
      children: React.createElement(Harness),
    }),
  );
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
