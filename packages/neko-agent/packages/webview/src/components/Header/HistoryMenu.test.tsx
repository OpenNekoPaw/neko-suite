import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '@neko-agent/types';
import { HistoryMenu } from './HistoryMenu';

const translations: Record<string, string> = {
  'history.title': 'History',
  'history.search': 'Search conversations',
  'history.results': '{count} results',
  'history.recentConversations': 'Recent conversations',
  'history.noMatching': 'No matching conversations',
  'history.noConversations': 'No conversations',
  'history.messageCount': '{count} messages',
  'history.timeAgo.justNow': 'just now',
  'history.timeAgo.minutes': '{count} minutes ago',
  'history.timeAgo.hours': '{count} hours ago',
  'history.timeAgo.days': '{count} days ago',
  'history.searchHint': 'Search {count} conversations',
  'history.clearSearch': 'Clear search',
  'history.clearAll': 'Clear all',
  'history.deleteConversation': 'Delete conversation',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const template = translations[key] ?? key;
      if (!params) {
        return template;
      }
      return Object.entries(params).reduce(
        (text, [paramKey, value]) => text.replace(`{${paramKey}}`, String(value)),
        template,
      );
    },
  }),
}));

describe('HistoryMenu', () => {
  it('opens a unified header menu and marks the active conversation', () => {
    const onOpenConversation = vi.fn();

    render(
      <HistoryMenu
        conversations={createConversations()}
        activeConversationId="conv-2"
        onOpenConversation={onOpenConversation}
        onDeleteConversation={vi.fn()}
        onClearAllConversations={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'History' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('.agent-header-action-caret')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.querySelector('.agent-header-action-caret')).toBeNull();
    expect(screen.getByRole('menu').getAttribute('class')).toContain('agent-header-menu');
    expect(screen.getByRole('menu').getAttribute('class')).toContain('agent-history-menu');
    expect(document.querySelector('.agent-history-menu-search')).toBeTruthy();
    expect(document.querySelector('.agent-history-menu-section')?.textContent).toBe(
      'Recent conversations',
    );

    const activeItem = screen.getByRole('menuitem', { name: /Storyboard/ });
    expect(activeItem.closest('.agent-history-menu-item')?.getAttribute('class')).toContain(
      'is-active',
    );
    expect(activeItem.querySelector('.agent-history-menu-title')?.textContent).toBe('Storyboard');
    expect(activeItem.querySelector('.agent-history-menu-meta')?.textContent).toContain(
      '8 messages',
    );

    fireEvent.click(activeItem);
    expect(onOpenConversation).toHaveBeenCalledWith('conv-2', 'Storyboard');
  });

  it('clears all conversations from the compact footer action', () => {
    const onClearAllConversations = vi.fn();

    render(
      <HistoryMenu
        conversations={createManyConversations()}
        activeConversationId={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onClearAllConversations={onClearAllConversations}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(document.querySelector('.agent-history-menu-footer')).toBeTruthy();
    expect(document.querySelector('.agent-history-menu-footer-hint')?.textContent).toBe(
      'Search 12 conversations',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onClearAllConversations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('filters conversations and clears the search query', () => {
    render(
      <HistoryMenu
        conversations={createConversations()}
        activeConversationId={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft' } });

    expect(screen.getByRole('menuitem', { name: /Draft outline/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Storyboard/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('menuitem', { name: /Storyboard/ })).toBeTruthy();
  });

  it('deletes a single conversation from the row action', () => {
    const onDeleteConversation = vi.fn();

    render(
      <HistoryMenu
        conversations={createConversations()}
        activeConversationId={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={onDeleteConversation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete conversation' })[0]!);

    expect(onDeleteConversation).toHaveBeenCalledWith('conv-1');
    expect(document.querySelector('.agent-history-delete-button svg polyline')).toBeTruthy();
  });
});

function createConversations(): ConversationSummary[] {
  const now = Date.now();
  return [
    {
      id: 'conv-1',
      title: 'Draft outline',
      messageCount: 4,
      updatedAt: now - 120_000,
    },
    {
      id: 'conv-2',
      title: 'Storyboard',
      messageCount: 8,
      updatedAt: now - 3_600_000,
    },
  ];
}

function createManyConversations(): ConversationSummary[] {
  const now = Date.now();
  return Array.from({ length: 12 }, (_, index) => ({
    id: `conv-${index + 1}`,
    title: `Conversation ${index + 1}`,
    messageCount: index + 1,
    updatedAt: now - index * 60_000,
  }));
}
