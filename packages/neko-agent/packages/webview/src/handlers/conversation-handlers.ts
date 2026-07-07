/**
 * Conversation Message Handlers
 *
 * Handles: conversationList, activeConversation, historyCleared, error
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration, StreamingState } from './types';
import type {
  ErrorMessage,
  GlobalErrorMessage,
  AgentSessionDiagnosticMessage,
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
import { projectQueuedMessagesCleared } from '@/presenters/message-queue-presenter';
import { getActiveTimelineForMessage } from './timeline-handlers';

/**
 * Handle 'error' message - Error occurred
 */
const handleError: MessageHandler<'error'> = (message: ErrorMessage, context) => {
  const activeTimeline = getActiveTimelineForMessage(context, message.conversationId, undefined);
  if (activeTimeline) {
    const hasMatchingError = activeTimeline.items.some(
      (item) =>
        item.kind === 'error' && (!message.message || item.payload.message === message.message),
    );
    if (hasMatchingError) {
      return;
    }
    context.setGlobalError(message.message || 'An error occurred');
    return;
  }

  if (context.isCurrentConversation(message.conversationId)) {
    context.setMessages((prev) => [
      ...projectConversationError({
        messages: projectQueuedMessagesCleared(prev),
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
        messages: projectQueuedMessagesCleared(msgs),
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

const handleSessionDiagnostic: MessageHandler<'sessionDiagnostic'> = (
  message: AgentSessionDiagnosticMessage,
  context,
) => {
  context.setGlobalError(`${message.code}: ${message.message}`);
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
  context.setQueuedMessages?.(projection.streaming.queuedMessages ?? []);
  context.setActiveConversationId(projection.activeConversationId);
  context.activeConversationIdRef.current = projection.activeConversationId;
  if (conversationId) {
    const cachedStreaming = context.conversationStreamingRef.current.get(conversationId);
    const projectedActiveTurnTimeline = getProjectedActiveTurnTimeline(projection.streaming);
    const activeTurnTimeline =
      projectedActiveTurnTimeline !== undefined
        ? projectedActiveTurnTimeline
        : getRecoverableCachedActiveTurnTimeline(cachedStreaming);
    const nextStreaming = {
      streamingMessageId: projection.streaming.streamingMessageId,
      isThinking: projection.streaming.isThinking,
      queuedMessageCount: projection.streaming.queuedMessageCount ?? 0,
      queuedMessages: projection.streaming.queuedMessages ?? [],
      ...(projection.streaming.messageQueueVersion !== undefined
        ? { messageQueueVersion: projection.streaming.messageQueueVersion }
        : {}),
      ...(activeTurnTimeline !== undefined ? { activeTurnTimeline } : {}),
    };
    context.conversationMessagesRef.current.set(conversationId, projection.messages);
    context.conversationStreamingRef.current.set(conversationId, nextStreaming);
  }
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

function getRecoverableCachedActiveTurnTimeline(
  streaming: StreamingState | undefined,
): StreamingState['activeTurnTimeline'] {
  if (!streaming?.isThinking || !streaming.streamingMessageId) {
    return undefined;
  }
  return getProjectedActiveTurnTimeline(streaming);
}

function getProjectedActiveTurnTimeline(streaming: object): StreamingState['activeTurnTimeline'] {
  const value: unknown = Reflect.get(streaming, 'activeTurnTimeline');
  if (value === undefined || value === null) {
    return value;
  }
  return isActiveTurnTimelineState(value) ? value : undefined;
}

function isActiveTurnTimelineState(
  value: unknown,
): value is NonNullable<StreamingState['activeTurnTimeline']> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    typeof Reflect.get(value, 'conversationId') === 'string' &&
    typeof Reflect.get(value, 'turnId') === 'string' &&
    typeof Reflect.get(value, 'messageId') === 'string' &&
    Array.isArray(Reflect.get(value, 'items')) &&
    typeof Reflect.get(value, 'completed') === 'boolean'
  );
}

/**
 * All conversation handler registrations
 */
export const conversationHandlers: HandlerRegistration[] = [
  defineHandler('error', handleError),
  defineHandler('globalError', handleGlobalError),
  defineHandler('sessionDiagnostic', handleSessionDiagnostic),
  defineHandler('historyCleared', handleHistoryCleared),
  defineHandler('conversationList', handleConversationList),
  defineHandler('activeConversation', handleActiveConversation),
];
