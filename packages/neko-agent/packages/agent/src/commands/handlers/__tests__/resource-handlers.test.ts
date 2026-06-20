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
  it('lists builtin and command artifact slash commands from the unified catalog', async () => {
    const result = await handleCommands([], createMockContext());

    expect(result.handled).toBe(true);
    expect(result.output).toContain('Available Slash Commands:');
    expect(result.output).toContain('/help');
    expect(result.output).toContain('Command Artifacts (1):');
    expect(result.output).toContain('/commit <message>');
    expect(result.output).toContain('Create a commit message');
  });

  it('does not list ordinary Skill legacy command fields as slash commands', async () => {
    const context = createMockContext();
    const legacySkill = {
      name: 'quality-review',
      command: 'review',
      description: 'Review changed files',
      enabled: true,
    };
    context.skillService!.registry.listAllSkills = vi.fn(() => [legacySkill]);

    const result = await handleCommands([], context);

    expect(result.output).not.toContain('Command Artifacts');
    expect(result.output).not.toContain('/review');
  });

  it('rejects unsupported subcommands', async () => {
    const result = await handleCommands(['info'], createMockContext());

    expect(result.handled).toBe(true);
    expect(result.error).toBe('Usage: /commands');
  });
});

describe('handleSkills', () => {
  it('lists dollar invocation for ordinary Skills and slash only for command artifacts', async () => {
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

    expect(result.output).toContain('quality-review [$quality-review]');
    expect(result.output).not.toContain('quality-review [$quality-review] [/review]');
    expect(result.output).toContain('commit [$commit] [/commit]');
  });
});
