import { OpenTab, ConversationSummary, TabType } from '@/components/types';
import { TabBar } from '@/components/Header/TabBar';
import { HistoryMenu } from '@/components/Header/HistoryMenu';
import { useTranslation } from '@/i18n/I18nContext';
import { AccountBar } from '@/components/AccountBar';
import type { SsoSession, ConfiguredProvider } from '@/components/types';

interface HeaderProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  activeView: TabType;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearAllConversations?: () => void;
  // AccountBar props (replaces settings gear)
  ssoSession: SsoSession | null;
  configuredProviders: ConfiguredProvider[];
  selectedModelId: string | null;
  onOpenOnboarding: () => void;
}

export function Header({
  tabs,
  activeTabId,
  activeView,
  conversations,
  activeConversationId,
  onSwitchTab,
  onCloseTab,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
  onClearAllConversations,
  ssoSession,
  configuredProviders,
  selectedModelId,
  onOpenOnboarding,
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

        {/* AccountBar — replaces settings gear */}
        <AccountBar
          ssoSession={ssoSession}
          configuredProviders={configuredProviders}
          selectedModelId={selectedModelId}
          onOpenOnboarding={onOpenOnboarding}
        />
      </div>
    </div>
  );
}
