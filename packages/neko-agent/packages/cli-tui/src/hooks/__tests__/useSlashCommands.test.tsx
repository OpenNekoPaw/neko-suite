import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { useSlashCommands } from '../useSlashCommands';
import { useAgentStore } from '../../stores/agent-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useConfigStore } from '../../stores/config-store';
import { DEFAULT_CLI_CONFIG } from '../../core/types';

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
      getSkillService: () => createSkillServiceMock(),
    }));
    return <></>;
  }

  render(<Harness />);
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
