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
import type { MessageHandlerContext, StreamingState } from './types';

/**
 * Handle 'tabState' message - Restore tab state from extension
 */
const handleTabState: MessageHandler<'tabState'> = (message: TabStateMessage, context) => {
  if (message.tabState) {
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
    if (isCharacterRoleTab(activeTab)) {
      persistCurrentVisibleConversation(context);
      activateCharacterRoleSessionView(context, {
        sessionId: activeTab.conversationId,
        cachedMessages: context.conversationMessagesRef.current.get(activeTab.conversationId),
        cachedStreaming: context.conversationStreamingRef.current.get(activeTab.conversationId),
      });
      context.setActiveTab('chat');
      return;
    }

    if (activeTab) {
      activateOrdinaryTabView(context, activeTab.conversationId);
    }
  }
};

/**
 * All tab handler registrations
 */
export const tabHandlers: HandlerRegistration[] = [defineHandler('tabState', handleTabState)];

function activateOrdinaryTabView(context: MessageHandlerContext, conversationId: string): void {
  const cachedMessages = context.conversationMessagesRef.current.get(conversationId);
  const cachedStreaming = context.conversationStreamingRef.current.get(conversationId);

  context.isTablessConversationViewRef.current = false;
  if (cachedMessages) {
    const streaming = cachedStreaming ?? idleStreamingState();
    context.setMessages(cachedMessages);
    context.setStreamingMessageId(streaming.streamingMessageId);
    context.streamingMessageIdRef.current = streaming.streamingMessageId;
    context.setIsThinking(streaming.isThinking);
    context.setQueuedMessageCount?.(streaming.queuedMessageCount ?? 0);
    context.setQueuedMessages?.(streaming.queuedMessages ?? []);
  }
  context.setActiveConversationId(conversationId);
  context.activeConversationIdRef.current = conversationId;
  context.setActiveTab('chat');
}

function idleStreamingState(): StreamingState {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}
