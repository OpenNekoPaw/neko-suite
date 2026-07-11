/**
 * Tab State Handlers
 *
 * Handles tab state restoration from extension host.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { TabStateMessage } from './messages';
import {
  activateConversationTabView,
  persistCurrentVisibleConversation,
} from './conversation-tab-session-state';

/**
 * Handle 'tabState' message - Restore tab state from extension
 */
const handleTabState: MessageHandler<'tabState'> = (message: TabStateMessage, context) => {
  if (message.tabState) {
    // Save local UI state, then commit pending canonical Timeline frames before the view swap.
    persistCurrentVisibleConversation(context);
    context.timelineRenderScheduler?.flushAll();
    const openTabs = message.tabState.openTabs ?? [];
    const { activeTabId } = message.tabState;
    const isEmptyTabState =
      Array.isArray(message.tabState.openTabs) &&
      openTabs.length === 0 &&
      (activeTabId ?? null) === null;

    if (Array.isArray(openTabs)) {
      context.setOpenTabs(openTabs);
    }

    if (activeTabId !== undefined) {
      context.setActiveTabId(activeTabId);
    }

    if (isEmptyTabState) {
      context.isTablessConversationViewRef.current = true;
      context.setMessages([]);
      context.setStreamingMessageId(null);
      context.streamingMessageIdRef.current = null;
      context.setIsThinking(false);
      context.setQueuedMessageCount?.(0);
      context.setActiveConversationId(null);
      context.activeConversationIdRef.current = null;
      context.setActiveTab('chat');
      return;
    }

    const activeTab = activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
    if (activeTab) {
      context.requestConfigSnapshot?.();
    }
    if (activeTab) {
      activateConversationTabView(context, activeTab.conversationId);
      context.setActiveTab('chat');
    }
  }
};

/**
 * All tab handler registrations
 */
export const tabHandlers: HandlerRegistration[] = [defineHandler('tabState', handleTabState)];
