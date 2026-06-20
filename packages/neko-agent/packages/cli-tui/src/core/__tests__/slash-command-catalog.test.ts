import { describe, expect, it } from 'vitest';
import {
  createTuiSkillInvocationCatalog,
  createTuiSlashCommandCatalog,
} from '../slash-command-catalog';

describe('createTuiSlashCommandCatalog', () => {
  it('includes builtin slash commands by default', () => {
    const commands = createTuiSlashCommandCatalog();
    const names = commands.map((command) => command.name);

    expect(names).toContain('help');
    expect(names).toContain('plan');
  });

  it('adds enabled command artifacts and deduplicates builtin names', () => {
    const commands = createTuiSlashCommandCatalog([
      {
        entryPointKind: 'command-artifact',
        command: 'commit',
        description: 'Create a commit message',
        enabled: true,
      },
      {
        entryPointKind: 'command-artifact',
        command: 'plan',
        description: 'Override builtin description',
        enabled: true,
      },
      {
        entryPointKind: 'command-artifact',
        command: 'draft-only',
        description: 'Disabled command should stay hidden',
        enabled: false,
      },
    ]);

    expect(commands).toContainEqual({
      name: 'commit',
      description: 'Create a commit message',
    });
    expect(commands.filter((command) => command.name === 'plan')).toHaveLength(1);
    expect(commands.some((command) => command.name === 'draft-only')).toBe(false);
  });

  it('projects ordinary skills and legacy aliases into the dollar catalog without slash entries', () => {
    const slashCommands = createTuiSlashCommandCatalog([
      {
        name: 'quality-review',
        command: 'quality-review',
        description: 'Ordinary skill with legacy slash alias',
        enabled: true,
      },
    ]);
    const skillCommands = createTuiSkillInvocationCatalog([
      {
        name: 'quality-review',
        description: 'Review changed files',
        enabled: true,
      },
      {
        name: 'disabled-skill',
        description: 'Hidden',
        enabled: false,
      },
    ]);

    expect(slashCommands.some((command) => command.name === 'quality-review')).toBe(false);
    expect(skillCommands).toEqual([
      {
        name: '$quality-review',
        description: 'Review changed files',
      },
    ]);
  });
});
