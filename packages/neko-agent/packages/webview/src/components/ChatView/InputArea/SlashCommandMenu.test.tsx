import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SlashCommandMenu,
  projectSlashCommandGroup,
  sortSlashCommandsForDisplay,
} from './SlashCommandMenu';
import type { SlashCommandCatalogItem } from './slash-command-catalog';

const translations: Record<string, string> = {
  'chat.commands.help': 'Show help message',
  'chat.commands.sections.agent': 'Agent',
  'chat.commands.sections.creation': 'Creation',
  'chat.commands.sections.skill': 'Skills',
  'chat.commands.source.skill': 'Personal',
  'chat.commands.source.plugin': 'Plugin',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

function command(overrides: Partial<SlashCommandCatalogItem>): SlashCommandCatalogItem {
  return {
    id: 'help',
    commandId: 'help',
    name: '/help',
    descriptionKey: 'chat.commands.help',
    descriptionKind: 'i18n',
    icon: 'ICON_SHOULD_NOT_RENDER',
    source: 'builtin',
    ...overrides,
  };
}

describe('SlashCommandMenu', () => {
  it('renders codex-style command rows without command icons', () => {
    render(
      <SlashCommandMenu
        isOpen
        commands={[
          command({ id: 'help', name: '/help' }),
          command({
            id: 'plugin:neko.canvas:storyboard',
            commandId: 'storyboard',
            name: '/storyboard',
            descriptionKey: 'Create a storyboard',
            descriptionKind: 'literal',
            icon: 'PLUGIN_ICON_SHOULD_NOT_RENDER',
            source: 'plugin',
          }),
          command({
            id: 'skill:commit',
            commandId: 'commit',
            name: '/commit',
            descriptionKey: 'Create a commit message',
            descriptionKind: 'literal',
            icon: 'SKILL_ICON_SHOULD_NOT_RENDER',
            source: 'skill',
          }),
        ]}
        selectedIndex={1}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.queryByText('PLUGIN_ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.queryByText('SKILL_ICON_SHOULD_NOT_RENDER')).toBeNull();
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByText('Creation')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('/help')).toBeTruthy();
    expect(screen.getByText('/storyboard')).toBeTruthy();
    expect(screen.getByText('Show help message')).toBeTruthy();
    expect(screen.getByText('Plugin')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();

    const selectedButton = screen.getByRole('button', { name: /\/commit/i });
    expect(selectedButton.className).toContain('h-10');
    expect(selectedButton.className).toContain('rounded-[14px]');
    expect(selectedButton.className).toContain('grid-cols-[96px_minmax(0,1fr)_auto]');
  });

  it('keeps display ordering aligned with keyboard selection groups', () => {
    const commands = [
      command({
        id: 'skill:commit',
        commandId: 'commit',
        name: '/commit',
        descriptionKey: 'Create a commit message',
        descriptionKind: 'literal',
        source: 'skill',
      }),
      command({
        id: 'plugin:neko.canvas:storyboard',
        commandId: 'storyboard',
        name: '/storyboard',
        descriptionKey: 'Create a storyboard',
        descriptionKind: 'literal',
        source: 'plugin',
      }),
      command({ id: 'help', commandId: 'help', name: '/help' }),
    ];

    expect(sortSlashCommandsForDisplay(commands).map((item) => item.name)).toEqual([
      '/help',
      '/storyboard',
      '/commit',
    ]);
    expect(projectSlashCommandGroup(commands[0]!)).toBe('skill');
    expect(projectSlashCommandGroup(commands[1]!)).toBe('creation');
    expect(projectSlashCommandGroup(commands[2]!)).toBe('agent');
  });
});
