/**
 * useTabManager - Tab lifecycle management
 *
 * Handles opening, closing, and switching tabs,
 * plus persistence of tab state to extension host.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { OpenTab, ConversationSummary, TabType } from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import { isCharacterRoleTab } from '@/presenters/character-role-session-presenter';

export interface UseTabManagerProps {
  openTabs: OpenTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  activeTabId: string | null;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  onBeforeTabOpen?: () => void;
  conversations: ConversationSummary[];
  setActiveTab: (tab: TabType) => void;
  onAllTabsClosed?: () => void;
  onBeforeTabActivation?: () => void;
  onBeforeConversationActivation?: (conversationId: string) => void;
  onConversationActivated?: (conversationId: string) => void;
  onActivateCharacterRoleTab?: (tab: OpenTab) => void;
  hasLocalConversationActivity?: (conversationId: string) => boolean;
  onConfigSnapshotRequested?: () => void;
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
  onBeforeTabOpen,
  conversations,
  setActiveTab,
  onAllTabsClosed,
  onBeforeTabActivation,
  onBeforeConversationActivation,
  onConversationActivated,
  onActivateCharacterRoleTab,
  hasLocalConversationActivity,
  onConfigSnapshotRequested,
}: UseTabManagerProps): UseTabManagerReturn {
  // Sync tab state to extension for persistence across panel close/reopen
  const isInitialTabStateRef = useRef(true);
  useEffect(() => {
    // Skip initial render to avoid overwriting restored state
    if (isInitialTabStateRef.current) {
      isInitialTabStateRef.current = false;
      return;
    }
    AgentHostMessages.updateTabState(openTabs, activeTabId);
  }, [openTabs, activeTabId]);

  const handleOpenTab = useCallback(
    (conversationId: string, title: string) => {
      const existingTab = openTabs.find((t) => t.conversationId === conversationId);
      onBeforeTabOpen?.();
      onBeforeTabActivation?.();
      if (existingTab) {
        setActiveTabId(existingTab.id);
        if (isCharacterRoleTab(existingTab)) {
          onActivateCharacterRoleTab?.(existingTab);
        } else {
          onBeforeConversationActivation?.(conversationId);
          AgentHostMessages.switchConversation(conversationId);
          onConversationActivated?.(conversationId);
        }
      } else {
        const newTab: OpenTab = {
          id: `tab-${Date.now()}`,
          title: title || 'New Chat',
          conversationId,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        onConfigSnapshotRequested?.();
        onBeforeConversationActivation?.(conversationId);
        AgentHostMessages.switchConversation(conversationId);
        onConversationActivated?.(conversationId);
      }
      setActiveTab('chat');
    },
    [
      openTabs,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      onBeforeTabActivation,
      onBeforeTabOpen,
      onBeforeConversationActivation,
      onConversationActivated,
      onActivateCharacterRoleTab,
      onConfigSnapshotRequested,
    ],
  );

  const handleCloseTab = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      const tab = openTabs.find((t) => t.id === tabId);
      if (!tab) return;

      const isClosingActiveTab = activeTabId === tabId;
      if (isClosingActiveTab) {
        onBeforeTabActivation?.();
      }

      const conversation = conversations.find((c) => c.id === tab.conversationId);
      const hasPersistedMessages = (conversation?.messageCount ?? 0) > 0;
      const hasLocalActivity = hasLocalConversationActivity?.(tab.conversationId) ?? false;
      const shouldDeleteEmptyConversation = Boolean(
        conversation && !hasPersistedMessages && !hasLocalActivity,
      );

      const tabIndex = openTabs.findIndex((t) => t.id === tabId);
      const newTabs = openTabs.filter((t) => t.id !== tabId);
      const isClosingLastTab = newTabs.length === 0;

      if (tab.kind === 'character-dialogue') {
        AgentHostMessages.exitCharacterDialogueSession(tab.conversationId);
      } else if (tab.kind === 'embody-character') {
        AgentHostMessages.exitEmbodyCharacterSession(tab.conversationId);
      } else if (shouldDeleteEmptyConversation) {
        AgentHostMessages.deleteConversation(tab.conversationId, {
          activateNext: !isClosingLastTab,
        });
      }

      setOpenTabs(newTabs);

      if (isClosingActiveTab && newTabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        const newActiveTab = newTabs[newActiveIndex];
        setActiveTabId(newActiveTab.id);
        if (isCharacterRoleTab(newActiveTab)) {
          onActivateCharacterRoleTab?.(newActiveTab);
        } else {
          onBeforeConversationActivation?.(newActiveTab.conversationId);
          AgentHostMessages.switchConversation(newActiveTab.conversationId);
          onConversationActivated?.(newActiveTab.conversationId);
        }
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
        onAllTabsClosed?.();
      }
    },
    [
      openTabs,
      activeTabId,
      conversations,
      setOpenTabs,
      setActiveTabId,
      onAllTabsClosed,
      onBeforeTabActivation,
      onBeforeConversationActivation,
      onConversationActivated,
      onActivateCharacterRoleTab,
      hasLocalConversationActivity,
    ],
  );

  const handleSwitchTab = useCallback(
    (tabId: string) => {
      const tab = openTabs.find((t) => t.id === tabId);
      if (tab) {
        onBeforeTabOpen?.();
        onBeforeTabActivation?.();
        setActiveTabId(tabId);
        if (isCharacterRoleTab(tab)) {
          onActivateCharacterRoleTab?.(tab);
        } else {
          onBeforeConversationActivation?.(tab.conversationId);
          AgentHostMessages.switchConversation(tab.conversationId);
          onConversationActivated?.(tab.conversationId);
        }
        setActiveTab('chat');
      }
    },
    [
      openTabs,
      setActiveTabId,
      setActiveTab,
      onBeforeTabActivation,
      onBeforeTabOpen,
      onBeforeConversationActivation,
      onConversationActivated,
      onActivateCharacterRoleTab,
    ],
  );

  return {
    handleOpenTab,
    handleCloseTab,
    handleSwitchTab,
  };
}
