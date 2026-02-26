import { useRef, useEffect, useState, useMemo } from 'react';
import { ConversationSummary } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';

interface HistoryMenuProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearAllConversations?: () => void;
}

// Format relative time
function formatRelativeTime(timestamp: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('history.timeAgo.justNow');
  if (minutes < 60) return t('history.timeAgo.minutes', { count: minutes });
  if (hours < 24) return t('history.timeAgo.hours', { count: hours });
  if (days < 7) return t('history.timeAgo.days', { count: days });
  return new Date(timestamp).toLocaleDateString();
}

export function HistoryMenu({
  conversations,
  activeConversationId,
  onOpenConversation,
  onDeleteConversation,
  onClearAllConversations,
}: HistoryMenuProps) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when menu opens
  useEffect(() => {
    if (showMenu) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [showMenu]);

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations.slice(0, 10);
    }
    const query = searchQuery.toLowerCase();
    return conversations.filter(conv =>
      conv.title.toLowerCase().includes(query)
    ).slice(0, 20);
  }, [conversations, searchQuery]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowMenu(false);
      setSearchQuery('');
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors ${
          showMenu ? 'bg-[var(--vscode-button-background)]/20' : ''
        }`}
        title={t('history.title')}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {showMenu && (
        <div
          className="absolute top-full right-0 mt-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[250px] max-h-[400px] overflow-hidden py-1 z-50 flex flex-col"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input */}
          <div className="px-2 py-1.5 border-b border-[var(--vscode-dropdown-border)]">
            <div className="flex items-center gap-2 px-2 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded">
              <svg className="w-3.5 h-3.5 text-[var(--vscode-descriptionForeground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('history.search')}
                className="flex-1 bg-transparent text-[11px] outline-none text-[var(--vscode-foreground)] placeholder:text-[var(--vscode-descriptionForeground)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Header */}
          <div className="px-3 py-1.5 text-[10px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wider border-b border-[var(--vscode-dropdown-border)]">
            {searchQuery ? t('history.results', { count: filteredConversations.length }) : t('history.recentConversations')}
          </div>

          {/* Conversation List */}
          <div className="overflow-y-auto flex-1">
            {filteredConversations.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-[var(--vscode-descriptionForeground)] text-center">
                {searchQuery ? t('history.noMatching') : t('history.noConversations')}
              </div>
            ) : (
              filteredConversations.map(conv => (
                <div
                  key={conv.id}
                  className={`group px-3 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-colors ${
                    conv.id === activeConversationId ? 'bg-[var(--vscode-button-background)]/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => {
                        onOpenConversation(conv.id, conv.title);
                        setShowMenu(false);
                        setSearchQuery('');
                      }}
                    >
                      <div className="text-[11px] truncate">{conv.title}</div>
                      <div className="text-[9px] text-[var(--vscode-descriptionForeground)] flex items-center gap-2">
                        <span>{t('history.messageCount', { count: conv.messageCount })}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(conv.updatedAt, t)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-opacity flex-shrink-0"
                      title={t('common.delete')}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer with clear all button */}
          {conversations.length > 0 && (
            <div className="px-2 py-1.5 border-t border-[var(--vscode-dropdown-border)] flex items-center justify-between">
              {conversations.length > 10 && !searchQuery && (
                <span className="text-[9px] text-[var(--vscode-descriptionForeground)]">
                  {t('history.searchHint', { count: conversations.length })}
                </span>
              )}
              {conversations.length <= 10 || searchQuery ? <span /> : null}
              {onClearAllConversations && (
                <button
                  onClick={() => {
                    onClearAllConversations();
                    setShowMenu(false);
                    setSearchQuery('');
                  }}
                  className="text-[9px] text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] px-1.5 py-0.5 rounded transition-colors"
                  title={t('history.clearAll')}
                >
                  {t('history.clearAll')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
