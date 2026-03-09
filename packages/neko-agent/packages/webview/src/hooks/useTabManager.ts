/**
 * useTabManager - Tab lifecycle management
 *
 * Handles opening, closing, and switching tabs,
 * plus persistence of tab state to extension host.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { OpenTab, ConversationSummary, TabType } from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

export interface UseTabManagerProps {
  openTabs: OpenTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  activeTabId: string | null;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  conversations: ConversationSummary[];
  setActiveTab: (tab: TabType) => void;
  onNewChat: () => void;
}

export interface UseTabManagerReturn {
  handleOpenTab: (conversationId: string, title: string) => void;
  handleCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  handleSwitchTab: (tabId: string) => void;
}

export function useTabManager({
  openTabs,
  setOpenTabs,
  activeTabId,
  setActiveTabId,
  conversations,
  setActiveTab,
  onNewChat,
}: UseTabManagerProps): UseTabManagerReturn {
  // Sync tab state to extension for persistence across panel close/reopen
  const isInitialTabStateRef = useRef(true);
  useEffect(() => {
    // Skip initial render to avoid overwriting restored state
    if (isInitialTabStateRef.current) {
      isInitialTabStateRef.current = false;
      return;
    }
    VSCodeMessages.updateTabState(openTabs, activeTabId);
  }, [openTabs, activeTabId]);

  const handleOpenTab = useCallback(
    (conversationId: string, title: string) => {
      const existingTab = openTabs.find((t) => t.conversationId === conversationId);
      if (existingTab) {
        setActiveTabId(existingTab.id);
      } else {
        const newTab: OpenTab = {
          id: `tab-${Date.now()}`,
          title: title || 'New Chat',
          conversationId,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
      VSCodeMessages.switchConversation(conversationId);
      setActiveTab('chat');
    },
    [openTabs, setOpenTabs, setActiveTabId, setActiveTab],
  );

  const handleCloseTab = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      const tab = openTabs.find((t) => t.id === tabId);
      if (!tab) return;

      const conversation = conversations.find((c) => c.id === tab.conversationId);
      const hasMessages = conversation && conversation.messageCount > 0;

      if (!hasMessages) {
        VSCodeMessages.deleteConversation(tab.conversationId);
      }

      const tabIndex = openTabs.findIndex((t) => t.id === tabId);
      const newTabs = openTabs.filter((t) => t.id !== tabId);
      setOpenTabs(newTabs);

      if (activeTabId === tabId && newTabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        const newActiveTab = newTabs[newActiveIndex];
        setActiveTabId(newActiveTab.id);
        VSCodeMessages.switchConversation(newActiveTab.conversationId);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
        onNewChat();
      }
    },
    [openTabs, activeTabId, conversations, setOpenTabs, setActiveTabId, onNewChat],
  );

  const handleSwitchTab = useCallback(
    (tabId: string) => {
      const tab = openTabs.find((t) => t.id === tabId);
      if (tab) {
        setActiveTabId(tabId);
        VSCodeMessages.switchConversation(tab.conversationId);
        setActiveTab('chat');
      }
    },
    [openTabs, setActiveTabId, setActiveTab],
  );

  return {
    handleOpenTab,
    handleCloseTab,
    handleSwitchTab,
  };
}
