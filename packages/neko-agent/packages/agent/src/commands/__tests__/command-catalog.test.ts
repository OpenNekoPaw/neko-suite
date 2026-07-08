import { describe, expect, it } from 'vitest';
import { listSlashCommandCatalog, resolveSlashCommandCatalogEntry } from '../command-catalog';

describe('command catalog localization', () => {
  it('keeps command keywords stable while localizing command-artifact default descriptions', () => {
    const skills = [
      {
        name: 'Commit Helper',
        command: 'commit',
        entryPointKind: 'command-artifact' as const,
        enabled: true,
      },
    ];
    const commands = listSlashCommandCatalog({
      surface: 'tui',
      skills,
      locale: 'zh',
    });

    expect(commands).toContainEqual(
      expect.objectContaining({
        source: 'command-artifact',
        name: 'commit',
        description: '激活命令 /commit',
      }),
    );
    expect(commands.map((command) => command.name)).toContain('commit');
    expect(commands.map((command) => command.name)).not.toContain('提交');
  });

  it('uses the same localized default description when resolving a command directly', () => {
    const command = resolveSlashCommandCatalogEntry('commit', {
      surface: 'tui',
      skills: [
        {
          name: 'Commit Helper',
          command: 'commit',
          entryPointKind: 'command-artifact',
          enabled: true,
        },
      ],
      locale: 'zh',
    });

    expect(command).toEqual(
      expect.objectContaining({
        source: 'command-artifact',
        name: 'commit',
        description: '激活命令 /commit',
      }),
    );
  });
});
