import { describe, expect, it, vi } from 'vitest';
import { handleCommands } from '../resource-handlers';
import type { CommandContext } from '../../types';

function createMockContext(): CommandContext {
  const skill = {
    name: 'commit',
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
  it('lists builtin and skill-backed slash commands from the unified catalog', async () => {
    const result = await handleCommands([], createMockContext());

    expect(result.handled).toBe(true);
    expect(result.output).toContain('Available Slash Commands:');
    expect(result.output).toContain('/help');
    expect(result.output).toContain('Skill Commands (1):');
    expect(result.output).toContain('/commit <message>');
    expect(result.output).toContain('Create a commit message');
  });

  it('rejects unsupported subcommands', async () => {
    const result = await handleCommands(['info'], createMockContext());

    expect(result.handled).toBe(true);
    expect(result.error).toBe('Usage: /commands');
  });
});
