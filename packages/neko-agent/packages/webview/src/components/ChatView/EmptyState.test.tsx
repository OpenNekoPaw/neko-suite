import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'Neko Suite AI Assistant',
  'chat.emptyState.description': 'Organize projects, characters, assets, and generation tasks.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.suggestion1': 'Analyze current project structure',
  'chat.emptyState.suggestion2': 'Help me optimize the timeline',
  'chat.emptyState.suggestion3': 'Write a narration script',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('EmptyState', () => {
  it('renders the compact assistant entry points', () => {
    render(<EmptyState />);

    expect(screen.getByRole('heading', { name: 'Neko Suite AI Assistant' })).toBeTruthy();
    expect(
      screen.getByText('Organize projects, characters, assets, and generation tasks.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Analyze current project structure/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Help me optimize the timeline/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Write a narration script/ })).toBeTruthy();
    expect(document.querySelector('.agent-empty-state')).toBeTruthy();
    expect(document.querySelector('.agent-empty-panel')?.className).toContain('max-w-[420px]');
    expect(document.querySelectorAll('.agent-empty-action')).toHaveLength(3);
    expect(document.querySelectorAll('.agent-empty-action-icon')).toHaveLength(3);
  });

  it('passes the selected suggestion text to the input handler', () => {
    const onSuggestionClick = vi.fn();
    render(<EmptyState onSuggestionClick={onSuggestionClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Write a narration script/ }));

    expect(onSuggestionClick).toHaveBeenCalledWith('Write a narration script');
  });
});
