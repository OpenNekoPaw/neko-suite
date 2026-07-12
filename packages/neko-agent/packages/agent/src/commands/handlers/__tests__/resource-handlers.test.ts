import { describe, expect, it, vi } from 'vitest';
import { handleCommands, handleSkills } from '../resource-handlers';
import type { CommandContext } from '../../types';

function createMockContext(): CommandContext {
  const skill = {
    name: 'commit',
    entryPointKind: 'command-artifact',
    command: 'commit',
    description: 'Create a commit message',
    enabled: true,
    supportsArguments: true,
    argumentHint: '<message>',
  };

  return {
    skillService: {
      skillCount: 1,
      registry: {
        skillCount: 1,
        listSkills: vi.fn(() => [skill]),
        listAllSkills: vi.fn(() => [skill]),
        getSkill: vi.fn((name: string) => (name === skill.name ? skill : undefined)),
        getSkillByCommand: vi.fn((name: string) => (name === skill.command ? skill : undefined)),
        searchSkills: vi.fn(() => [skill]),
      },
      getActiveSkill: vi.fn(() => null),
      clearActiveSkill: vi.fn(),
    },
  } as unknown as CommandContext;
}

describe('handleCommands', () => {
  it('returns builtin and command artifact entries from the unified catalog', async () => {
    const result = await handleCommands([], createMockContext());

    expect(result).toMatchObject({
      handled: true,
      semantic: {
        family: 'commands',
        result: { kind: 'commands' },
      },
    });
    if (result.semantic?.family !== 'commands' || result.semantic.result.kind !== 'commands') {
      throw new Error('Expected command catalog semantics.');
    }
    expect(result.semantic.result.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'help', source: 'builtin' }),
        expect.objectContaining({
          name: 'commit',
          source: 'command-artifact',
          description: 'Create a commit message',
        }),
      ]),
    );
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });

  it('does not expose ordinary Skill legacy command fields as slash commands', async () => {
    const context = createMockContext();
    const legacySkill = {
      name: 'quality-review',
      command: 'review',
      description: 'Review changed files',
      enabled: true,
    };
    context.skillService!.registry.listAllSkills = vi.fn(() => [legacySkill]);

    const result = await handleCommands([], context);
    if (result.semantic?.family !== 'commands' || result.semantic.result.kind !== 'commands') {
      throw new Error('Expected command catalog semantics.');
    }

    expect(result.semantic.result.commands).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'review' })]),
    );
  });

  it('returns a typed usage diagnostic for unsupported subcommands', async () => {
    const result = await handleCommands(['info'], createMockContext());

    expect(result.semantic).toEqual({
      family: 'commands',
      result: { kind: 'diagnostic', code: 'usage' },
    });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });
});

describe('handleSkills', () => {
  it('keeps ordinary Skills and command artifacts distinct in semantic rows', async () => {
    const context = createMockContext();
    context.skillService!.registry.listSkills = vi.fn(() => [
      {
        name: 'quality-review',
        description: 'Review changed files',
        enabled: true,
      },
      {
        name: 'commit',
        entryPointKind: 'command-artifact',
        command: 'commit',
        description: 'Create a commit message',
        enabled: true,
      },
    ]);

    const result = await handleSkills([], context);
    expect(result.semantic).toEqual({
      family: 'skills',
      result: {
        kind: 'list',
        skills: [
          {
            name: 'quality-review',
            description: 'Review changed files',
            enabled: true,
          },
          {
            name: 'commit',
            command: 'commit',
            description: 'Create a commit message',
            enabled: true,
          },
        ],
      },
    });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('error');
  });
});
