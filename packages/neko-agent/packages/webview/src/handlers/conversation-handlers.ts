/**
 * Conversation Message Handlers
 *
 * Handles: conversationList, activeConversation, historyCleared, error
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  ErrorMessage,
  GlobalErrorMessage,
  HistoryClearedMessage,
  ConversationListMessage,
  ActiveConversationMessage,
} from './messages';
import {
  projectActiveConversation,
  projectConversationError,
  projectHistoryClearedConversation,
} from '../presenters/conversation-ui-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import { findActiveTab, isCharacterRoleTab } from '@/presenters/character-role-session-presenter';
import { shouldActivateForegroundConversation } from './foreground-activation';

/**
 * Handle 'error' message - Error occurred
 */
const handleError: MessageHandler<'error'> = (message: ErrorMessage, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    context.setMessages((prev) => [
      ...projectConversationError({
        messages: prev,
        errorMessage: message.message,
      }).messages,
    ]);
    const streaming = projectHistoryClearedConversation().streaming;
    context.setStreamingMessageId(streaming.streamingMessageId);
    context.setIsThinking(streaming.isThinking);
    context.setQueuedMessageCount?.(streaming.queuedMessageCount ?? 0);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, _streaming) => ({
      ...projectConversationError({
        messages: msgs,
        errorMessage: message.message,
      }),
    }));
  }
};

/**
 * Handle 'globalError' message - non-conversation-scoped error occurred
 */
const handleGlobalError: MessageHandler<'globalError'> = (message: GlobalErrorMessage, context) => {
  context.setGlobalError(message.message || 'An error occurred');
};

/**
 * Handle 'historyCleared' message - Conversation cleared
 */
const handleHistoryCleared: MessageHandler<'historyCleared'> = (
  message: HistoryClearedMessage,
  context,
) => {
  const conversationId = message.conversationId;
  if (!conversationId) return;

  const projection = projectHistoryClearedConversation();
  if (context.isCurrentConversation(conversationId)) {
    context.setMessages(projection.messages);
    context.setStreamingMessageId(projection.streaming.streamingMessageId);
    context.setIsThinking(projection.streaming.isThinking);
    context.setQueuedMessageCount?.(projection.streaming.queuedMessageCount ?? 0);
    context.conversationMessagesRef.current.delete(conversationId);
    context.conversationStreamingRef.current.delete(conversationId);
    return;
  }

  context.updateNonCurrentConversation(conversationId, () => projection);
};

/**
 * Handle 'conversationList' message - List of conversations
 */
const handleConversationList: MessageHandler<'conversationList'> = (
  message: ConversationListMessage,
  context,
) => {
  context.setConversations(message.conversations || []);
};

/**
 * Handle 'activeConversation' message - Active conversation changed
 */
const handleActiveConversation: MessageHandler<'activeConversation'> = (
  message: ActiveConversationMessage,
  context,
) => {
  const conversationId = message.conversation?.id;
  const projection = projectActiveConversation({
    conversation: message.conversation,
    cachedMessages: conversationId
      ? context.conversationMessagesRef.current.get(conversationId)
      : undefined,
    cachedStreaming: conversationId
      ? context.conversationStreamingRef.current.get(conversationId)
      : undefined,
    openTabs: context.openTabs,
  });
  const pendingForegroundActivation =
    context.pendingForegroundConversationActivationRef?.current ?? null;
  const shouldActivateForeground = shouldActivateForegroundConversation(
    pendingForegroundActivation,
    conversationId,
  );
  const shouldCacheOnly = pendingForegroundActivation !== null && !shouldActivateForeground;
  const activeTab = findActiveTab(context.openTabs, context.activeTabId);
  const isActiveCharacterRoleTab = isCharacterRoleTab(activeTab);
  const isStaleOrdinaryTabConversation =
    conversationId !== undefined &&
    activeTab !== undefined &&
    !isActiveCharacterRoleTab &&
    activeTab.conversationId !== conversationId &&
    !shouldActivateForeground;

  if (
    shouldCacheOnly ||
    isStaleOrdinaryTabConversation ||
    (context.isTablessConversationViewRef.current &&
      !isActiveCharacterRoleTab &&
      !shouldActivateForeground)
  ) {
    if (conversationId) {
      context.conversationMessagesRef.current.set(conversationId, projection.messages);
      context.conversationStreamingRef.current.set(conversationId, projection.streaming);

      const activeConversationId = projection.activeConversationId;
      if (activeConversationId && projection.workItems.length > 0) {
        context.setWorkItemsByConversation((prev) =>
          upsertWorkItemsForConversation(prev, activeConversationId, projection.workItems),
        );
      }
    }
    return;
  }

  if (isActiveCharacterRoleTab && !shouldActivateForeground) {
    if (conversationId) {
      context.conversationMessagesRef.current.set(conversationId, projection.messages);
      context.conversationStreamingRef.current.set(conversationId, projection.streaming);
    }
    context.setOpenTabs(projection.openTabs);

    const activeConversationId = projection.activeConversationId;
    if (activeConversationId && projection.workItems.length > 0) {
      context.setWorkItemsByConversation((prev) =>
        upsertWorkItemsForConversation(prev, activeConversationId, projection.workItems),
      );
    }
    return;
  }

  context.setMessages(projection.messages);
  context.setStreamingMessageId(projection.streaming.streamingMessageId);
  context.streamingMessageIdRef.current = projection.streaming.streamingMessageId;
  context.setIsThinking(projection.streaming.isThinking);
  context.setQueuedMessageCount?.(projection.streaming.queuedMessageCount ?? 0);
  context.setActiveConversationId(projection.activeConversationId);
  context.activeConversationIdRef.current = projection.activeConversationId;
  context.isTablessConversationViewRef.current = false;
  context.setOpenTabs(projection.openTabs);
  context.setActiveTabId(projection.activeTabId);
  context.setActiveTab(projection.activeTab);
  if (conversationId && shouldActivateForeground) {
    context.completeForegroundConversationActivation?.(conversationId);
  }

  const activeConversationId = projection.activeConversationId;
  if (activeConversationId && projection.workItems.length > 0) {
    context.setWorkItemsByConversation((prev) =>
      upsertWorkItemsForConversation(prev, activeConversationId, projection.workItems),
    );
  }
};

/**
 * All conversation handler registrations
 */
export const conversationHandlers: HandlerRegistration[] = [
  defineHandler('error', handleError),
  defineHandler('globalError', handleGlobalError),
  defineHandler('historyCleared', handleHistoryCleared),
  defineHandler('conversationList', handleConversationList),
  defineHandler('activeConversation', handleActiveConversation),
];
