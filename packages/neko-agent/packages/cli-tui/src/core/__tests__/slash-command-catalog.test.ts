import { describe, expect, it } from 'vitest';
import { createTuiSlashCommandCatalog } from '../slash-command-catalog';

describe('createTuiSlashCommandCatalog', () => {
  it('includes builtin slash commands by default', () => {
    const commands = createTuiSlashCommandCatalog();
    const names = commands.map((command) => command.name);

    expect(names).toContain('help');
    expect(names).toContain('plan');
  });

  it('adds enabled skill-backed slash commands and deduplicates builtin names', () => {
    const commands = createTuiSlashCommandCatalog([
      {
        command: 'commit',
        description: 'Create a commit message',
        enabled: true,
      },
      {
        command: 'plan',
        description: 'Override builtin description',
        enabled: true,
      },
      {
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
});
