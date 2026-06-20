import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'Neko Suite Creative Assistant',
  'chat.emptyState.description':
    'Shape stories, characters, storyboards, shots, visuals, video, and sound. Start from project materials to develop plot, dialogue, narration, settings, and shot language together, then create character images, scene references, shot clips, voice, sound effects, and ambience.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.suggestion1': 'Design the protagonist and relationships',
  'chat.emptyState.suggestion2': 'Shape this scene into storyboard rhythm',
  'chat.emptyState.suggestion3': 'Draft dialogue and narration beats',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('EmptyState', () => {
  it('renders the compact assistant entry points', () => {
    render(<EmptyState />);

    expect(screen.getByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeTruthy();
    expect(
      screen.getByText(
        'Shape stories, characters, storyboards, shots, visuals, video, and sound. Start from project materials to develop plot, dialogue, narration, settings, and shot language together, then create character images, scene references, shot clips, voice, sound effects, and ambience.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Design the protagonist and relationships/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Shape this scene into storyboard rhythm/ }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Draft dialogue and narration beats/ })).toBeTruthy();
    expect(document.querySelector('.agent-empty-state')).toBeTruthy();
    expect(document.querySelector('.agent-empty-panel')?.className).toContain(
      'max-w-[min(840px,100%)]',
    );
    expect(document.querySelector('.agent-empty-panel')?.className).toContain('min-w-0');
    expect(document.querySelectorAll('.agent-empty-action')).toHaveLength(3);
    expect(document.querySelectorAll('.agent-empty-action-icon')).toHaveLength(3);
    expect(document.querySelector('.agent-empty-action')?.className).toContain('min-w-0');
  });

  it('passes the selected suggestion text to the input handler', () => {
    const onSuggestionClick = vi.fn();
    render(<EmptyState onSuggestionClick={onSuggestionClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Draft dialogue and narration beats/ }));

    expect(onSuggestionClick).toHaveBeenCalledWith('Draft dialogue and narration beats');
  });
});
