import { OpenTab, ConversationSummary, TabType } from '@/components/types';
import { TabBar } from '@/components/Header/TabBar';
import { HistoryMenu } from '@/components/Header/HistoryMenu';
import { useTranslation } from '@/i18n/I18nContext';

interface HeaderProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  activeView: TabType;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeTasksCount?: number;
  activeAgentsCount?: number;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearAllConversations?: () => void;
  onToggleSettings: () => void;
  onToggleTasks?: () => void;
  onToggleAgents?: () => void;
}

export function Header({
  tabs,
  activeTabId,
  activeView,
  conversations,
  activeConversationId,
  activeTasksCount = 0,
  activeAgentsCount = 0,
  onSwitchTab,
  onCloseTab,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
  onClearAllConversations,
  onToggleSettings,
  onToggleTasks,
  onToggleAgents,
}: HeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between px-1 py-1 border-b border-[var(--vscode-panel-border)] flex-shrink-0 gap-2">
      {/* Left: Tabs */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        activeView={activeView}
        onSwitchTab={onSwitchTab}
        onCloseTab={onCloseTab}
      />

      {/* Right: Action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* + New button */}
        <button
          onClick={onNewChat}
          className="p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
          title={t('header.newChat')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* History dropdown */}
        <HistoryMenu
          conversations={conversations}
          activeConversationId={activeConversationId}
          onOpenConversation={onOpenConversation}
          onDeleteConversation={onDeleteConversation}
          onClearAllConversations={onClearAllConversations}
        />

        {/* Agents button */}
        {onToggleAgents && (
          <button
            onClick={onToggleAgents}
            className={`p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors relative ${
              activeView === 'agents' ? 'bg-[var(--vscode-button-background)]/20' : ''
            }`}
            title={`${t('header.agents')}${activeAgentsCount > 0 ? ` (${activeAgentsCount})` : ''}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {activeAgentsCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-medium bg-[var(--vscode-charts-purple)] text-white rounded-full px-0.5">
                {activeAgentsCount > 99 ? '99+' : activeAgentsCount}
              </span>
            )}
          </button>
        )}

        {/* Tasks button */}
        {onToggleTasks && (
          <button
            onClick={onToggleTasks}
            className={`p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors relative ${
              activeView === 'tasks' ? 'bg-[var(--vscode-button-background)]/20' : ''
            }`}
            title={`${t('header.tasks')}${activeTasksCount > 0 ? ` (${activeTasksCount})` : ''}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            {activeTasksCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] font-medium bg-[var(--vscode-charts-blue)] text-white rounded-full px-0.5">
                {activeTasksCount > 99 ? '99+' : activeTasksCount}
              </span>
            )}
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={onToggleSettings}
          className={`p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors ${
            activeView === 'settings' ? 'bg-[var(--vscode-button-background)]/20' : ''
          }`}
          title={t('header.settings')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
