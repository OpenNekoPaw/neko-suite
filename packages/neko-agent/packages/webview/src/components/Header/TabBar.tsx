import { OpenTab, TabType } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { CloseIcon } from '@neko/shared/icons';

interface TabBarProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  activeView: TabType;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
}

export function TabBar({ tabs, activeTabId, activeView, onSwitchTab, onCloseTab }: TabBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0 scrollbar-tab">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onSwitchTab(tab.id)}
          className={`agent-tab group text-[11px] ${activeTabId === tab.id && activeView === 'chat' ? 'agent-tab-active' : ''}`}
        >
          <span className="truncate">{tab.title}</span>
          <button
            onClick={(e) => onCloseTab(tab.id, e)}
            className="agent-header-action opacity-0 group-hover:opacity-100 min-h-0 min-w-0 p-0.5 transition-opacity flex-shrink-0"
          >
            <CloseIcon className="w-3 h-3" />
          </button>
        </div>
      ))}
      {tabs.length === 0 && (
        <div className="px-2 py-1 text-[11px] text-[var(--agent-fg-secondary)]">
          {t('header.newChat')}
        </div>
      )}
    </div>
  );
}
