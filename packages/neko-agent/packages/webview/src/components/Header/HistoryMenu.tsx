import { useRef, useEffect, useState, useMemo } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import {
  ClockIcon,
  CloseIcon,
  PackageIcon,
  RefreshIcon,
  SearchIcon,
  StopIcon,
  TrashIcon,
} from '@neko/shared/icons';
import type {
  HistoryConversationItem,
  HistoryConversationLifecycleActionItem,
} from '@/presenters/history-menu-presenter';
import type { ConversationLifecycleAction } from '@neko/shared/types/creative-ai-invocation';

interface HistoryMenuProps {
  conversations: HistoryConversationItem[];
  activeConversationId: string | null;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onConversationLifecycleAction?: (
    conversationId: string,
    action: ConversationLifecycleAction,
  ) => void;
  onClearClosedConversations?: () => void;
  clearableConversationCount?: number;
  protectedConversationCount?: number;
}

// Format relative time
function formatRelativeTime(
  timestamp: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
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
  onConversationLifecycleAction,
  onClearClosedConversations,
  clearableConversationCount,
  protectedConversationCount = 0,
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
    return conversations
      .filter((conv) => getSearchableConversationText(conv).includes(query))
      .slice(0, 20);
  }, [conversations, searchQuery]);
  const resolvedClearableConversationCount =
    clearableConversationCount ?? conversations.filter((conv) => conv.canDelete).length;

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
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        className={`agent-header-action agent-header-action-history ${showMenu ? 'is-active' : ''}`}
        title={t('history.title')}
        aria-label={t('history.title')}
        aria-haspopup="menu"
        aria-expanded={showMenu}
      >
        <ClockIcon className="w-4 h-4" />
      </button>

      {showMenu && (
        <div
          className="agent-header-menu agent-history-menu absolute right-0 top-full z-50 mt-1 flex flex-col"
          onKeyDown={handleKeyDown}
          role="menu"
        >
          <div className="agent-header-menu-search agent-history-menu-search">
            <div className="agent-search-shell agent-history-search-shell">
              <SearchIcon className="h-3.5 w-3.5 text-[var(--agent-fg-secondary)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('history.search')}
                className="agent-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="agent-menu-icon-button agent-history-search-clear"
                  aria-label={t('history.clearSearch')}
                  title={t('history.clearSearch')}
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="agent-menu-section agent-history-menu-section">
            {searchQuery
              ? t('history.results', { count: filteredConversations.length })
              : t('history.recentConversations')}
          </div>

          <div className="agent-history-menu-list">
            {filteredConversations.length === 0 ? (
              <div className="agent-history-menu-empty">
                {searchQuery ? t('history.noMatching') : t('history.noConversations')}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`agent-header-menu-item agent-history-menu-item group ${
                    conv.id === activeConversationId ? 'is-active' : ''
                  }`}
                  role="none"
                >
                  <button
                    type="button"
                    className="agent-header-menu-item-main"
                    onClick={() => {
                      onOpenConversation(conv.id, conv.title);
                      setShowMenu(false);
                      setSearchQuery('');
                    }}
                    role="menuitem"
                  >
                    <div className="agent-history-menu-title">{conv.title}</div>
                    <div className="agent-history-menu-meta">
                      <span>{t('history.messageCount', { count: conv.messageCount })}</span>
                      <span aria-hidden="true">•</span>
                      <span>{formatRelativeTime(conv.updatedAt, t)}</span>
                      {conv.isOpen && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>{t('history.status.open')}</span>
                        </>
                      )}
                      {conv.executionStatus && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span
                            className={`agent-history-menu-status agent-history-menu-status-${conv.executionStatus}`}
                          >
                            {t(`history.status.${conv.executionStatus}`)}
                          </span>
                        </>
                      )}
                    </div>
                    {conv.isBackground && (
                      <div className="agent-history-menu-context">
                        <span>{conv.sourcePackage}</span>
                        {conv.documentLabel && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span>{conv.documentLabel}</span>
                          </>
                        )}
                        {conv.lifecycleState && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span>{t(`history.lifecycleState.${conv.lifecycleState}`)}</span>
                          </>
                        )}
                      </div>
                    )}
                    {conv.activeRunSummary && (
                      <div className="agent-history-menu-run">
                        {formatRunSummary(conv.activeRunSummary, t)}
                      </div>
                    )}
                  </button>
                  {conv.isBackground ? (
                    <div className="agent-history-lifecycle-actions">
                      {conv.lifecycleActions.map((action) => (
                        <LifecycleActionButton
                          key={action.action}
                          action={action}
                          label={t(action.labelKey)}
                          title={t(action.titleKey)}
                          onClick={() => onConversationLifecycleAction?.(conv.id, action.action)}
                          disabled={!action.enabled || !onConversationLifecycleAction}
                        />
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!conv.canDelete) return;
                        onDeleteConversation(conv.id);
                      }}
                      className="agent-menu-icon-button agent-history-delete-button flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!conv.canDelete}
                      title={resolveDeleteTitle(conv, t)}
                      aria-label={resolveDeleteTitle(conv, t)}
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {conversations.length > 0 && (
            <div className="agent-header-menu-footer agent-history-menu-footer">
              <span className="agent-history-menu-footer-hint">
                {protectedConversationCount > 0
                  ? t('history.protectedCount', { count: protectedConversationCount })
                  : conversations.length > 10 && !searchQuery
                    ? t('history.searchHint', { count: conversations.length })
                    : ''}
              </span>
              {onClearClosedConversations && (
                <button
                  type="button"
                  onClick={() => {
                    onClearClosedConversations();
                    setShowMenu(false);
                    setSearchQuery('');
                  }}
                  disabled={resolvedClearableConversationCount === 0}
                  className="agent-danger-link agent-history-clear-button"
                  title={t('history.clearClosed')}
                >
                  {t('history.clearClosed')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LifecycleActionButton({
  action,
  label,
  title,
  disabled,
  onClick,
}: {
  readonly action: HistoryConversationLifecycleActionItem;
  readonly label: string;
  readonly title: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`agent-menu-icon-button agent-history-lifecycle-button agent-history-lifecycle-${action.tone}`}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      {renderLifecycleIcon(action.action)}
    </button>
  );
}

function renderLifecycleIcon(action: ConversationLifecycleAction) {
  if (action === 'restore') return <RefreshIcon className="w-3 h-3" />;
  if (action === 'delete' || action === 'stop-and-delete') {
    return <TrashIcon className="w-3 h-3" />;
  }
  if (action === 'stop-and-archive') return <StopIcon className="w-3 h-3" />;
  return <PackageIcon className="w-3 h-3" />;
}

function resolveDeleteTitle(
  conv: HistoryConversationItem,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (conv.canDelete) return t('history.deleteConversation');
  if (conv.protectedReason === 'running') return t('history.deleteDisabled.running');
  return t('history.deleteDisabled.open');
}

function getSearchableConversationText(conv: HistoryConversationItem): string {
  return [
    conv.title,
    conv.sourcePackage,
    conv.documentLabel,
    conv.associationKey,
    conv.activeRunSummary?.label,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function formatRunSummary(
  summary: NonNullable<HistoryConversationItem['activeRunSummary']>,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (summary.label) return summary.label;
  if (summary.activeWorkItemCount > 0) {
    return t('history.runSummary.workItems', { count: summary.activeWorkItemCount });
  }
  if (summary.activeRunCount > 0) {
    return t('history.runSummary.runs', { count: summary.activeRunCount });
  }
  return summary.latestRunStatus
    ? t(`history.runStatus.${summary.latestRunStatus}`)
    : t('history.runSummary.idle');
}
