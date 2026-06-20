import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSlashCommands } from '../useSlashCommands';

const vscodeMocks = vi.hoisted(() => ({
  invokeSlashCommand: vi.fn(),
  invokePluginSlashCommand: vi.fn(),
  invokeSkill: vi.fn(),
}));

vi.mock('@/messages', () => ({
  VSCodeMessages: {
    invokeSlashCommand: vscodeMocks.invokeSlashCommand,
    invokePluginSlashCommand: vscodeMocks.invokePluginSlashCommand,
    invokeSkill: vscodeMocks.invokeSkill,
  },
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'chat.commands.help': 'Show help',
      };
      return translations[key] ?? key;
    },
  }),
}));

describe('useSlashCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches explicit skill invocation through invokeSkill', () => {
    const clearInput = vi.fn();
    const { result } = renderHook(() =>
      useSlashCommands({
        skills: [],
        pluginCommands: [],
        inputValue: '$quality-review changed files',
        activeConversationId: 'conv-1',
        setMessages: vi.fn(),
        clearInput,
      }),
    );

    act(() => {
      result.current.handleSkillInvocation({
        id: 'quality-review',
        skillName: 'quality-review',
        name: '$quality-review',
      });
    });

    expect(clearInput).toHaveBeenCalledTimes(1);
    expect(vscodeMocks.invokeSkill).toHaveBeenCalledWith(
      'quality-review',
      'changed files',
      'conv-1',
    );
    expect(vscodeMocks.invokeSlashCommand).not.toHaveBeenCalled();
  });

  it('renders help with separate slash command and dollar skill sections', () => {
    const setMessages = vi.fn();
    const clearInput = vi.fn();
    const { result } = renderHook(() =>
      useSlashCommands({
        skills: [
          {
            id: 'quality-review',
            name: 'quality-review',
            description: 'Review changed files',
            tags: [],
            source: 'project',
            enabled: true,
          },
        ],
        pluginCommands: [],
        inputValue: '/help',
        activeConversationId: 'conv-1',
        setMessages,
        clearInput,
      }),
    );

    act(() => {
      result.current.handleSlashCommand({
        id: 'help',
        commandId: 'help',
        name: '/help',
        descriptionKey: 'chat.commands.help',
        icon: '',
        source: 'builtin',
      });
    });

    expect(clearInput).toHaveBeenCalledTimes(1);
    const updater = setMessages.mock.calls[0]?.[0];
    expect(typeof updater).toBe('function');
    const nextMessages = updater([]);
    expect(nextMessages[0].content).toContain('**Available Commands:**');
    expect(nextMessages[0].content).toContain('**Available Skills:**');
    expect(nextMessages[0].content).toContain('$quality-review');
    expect(nextMessages[0].content).toContain('Use `$` to invoke Skills');
  });
});
