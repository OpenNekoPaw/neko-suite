/**
 * Tab State Handlers
 *
 * Handles tab state restoration from extension host.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { TabStateMessage } from './messages';
import { isCharacterRoleTab } from '@/presenters/character-role-session-presenter';
import {
  activateCharacterRoleSessionView,
  persistCurrentVisibleConversation,
} from './character-role-session-state';

/**
 * Handle 'tabState' message - Restore tab state from extension
 */
const handleTabState: MessageHandler<'tabState'> = (message: TabStateMessage, context) => {
  if (message.tabState) {
    const openTabs = message.tabState.openTabs ?? [];
    const { activeTabId } = message.tabState;

    if (Array.isArray(openTabs)) {
      context.setOpenTabs(openTabs);
    }

    if (activeTabId !== undefined) {
      context.setActiveTabId(activeTabId);
    }

    const activeTab = activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
    if (isCharacterRoleTab(activeTab)) {
      persistCurrentVisibleConversation(context);
      activateCharacterRoleSessionView(context, {
        sessionId: activeTab.conversationId,
        cachedMessages: context.conversationMessagesRef.current.get(activeTab.conversationId),
        cachedStreaming: context.conversationStreamingRef.current.get(activeTab.conversationId),
      });
      context.setActiveTab('chat');
    }
  }
};

/**
 * All tab handler registrations
 */
export const tabHandlers: HandlerRegistration[] = [defineHandler('tabState', handleTabState)];
