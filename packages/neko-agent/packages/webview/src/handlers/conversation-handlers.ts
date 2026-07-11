/**
 * Conversation Message Handlers
 *
 * Handles: conversationList, activeConversation, historyCleared, error
 */

import { defineHandler } from './types';
import type {
  MessageHandler,
  HandlerRegistration,
  MessageHandlerContext,
  StreamingState,
} from './types';
import type {
  ErrorMessage,
  GlobalErrorMessage,
  AgentSessionDiagnosticMessage,
  HistoryClearedMessage,
  ConversationListMessage,
  ConversationLifecycleResultMessage,
  ActiveConversationMessage,
} from './messages';
import type { Message } from '@neko-agent/types';
import {
  projectActiveConversation,
  projectConversationError,
  projectHistoryClearedConversation,
} from '../presenters/conversation-ui-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import { findActiveTab, isCharacterRoleTab } from '@/presenters/character-role-session-presenter';
import { shouldActivateForegroundConversation } from './foreground-activation';
import { commitActiveTurnTimelineMarkdownSnapshot } from './conversation-tab-session-state';
import { projectQueuedMessagesCleared } from '@/presenters/message-queue-presenter';
import { getActiveTimelineForMessage } from './timeline-handlers';
import { updateConversation } from './message-updater';
import {
  commitConversationRenderActivation,
  commitConversationSnapshotProjection,
  createConversationMarkdownTimelineResourceOwner,
  createConversationVisibleStatePort,
  discardConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

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

  context.timelineRenderScheduler?.discardConversation(conversationId);
  context.markdownSessionRegistry?.disposeConversation(conversationId);
  const projection = projectHistoryClearedConversation();
  updateConversation(context, conversationId, () => ({
    messages: projection.messages,
    streamingMessageId: projection.streaming.streamingMessageId,
    isThinking: projection.streaming.isThinking,
    queuedMessageCount: projection.streaming.queuedMessageCount,
    queuedMessages: projection.streaming.queuedMessages,
    activeTurnTimeline: null,
  }));
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

const handleConversationLifecycleResult: MessageHandler<'conversationLifecycleResult'> = (
  message: ConversationLifecycleResultMessage,
  context,
) => {
  if (!message.success) {
    context.setGlobalError(
      message.diagnostics?.map((diagnostic) => diagnostic.message).join('\n') ||
        'Conversation lifecycle command failed.',
    );
    return;
  }

  const state = message.state;
  if (!state) return;
  if (state === 'deleted') {
    if (context.disposeConversationRendering) {
      context.disposeConversationRendering(message.conversationId, 'conversation-delete');
    } else {
      context.timelineRenderScheduler?.discardConversation(message.conversationId);
      context.markdownSessionRegistry?.disposeConversation(message.conversationId);
    }
    discardConversationSnapshotProjection({
      conversationId: message.conversationId,
      conversationMessagesRef: context.conversationMessagesRef,
      conversationStreamingRef: context.conversationStreamingRef,
    });
  }
  context.setConversations((previous) => {
    if (state === 'deleted') {
      return previous.filter((conversation) => conversation.id !== message.conversationId);
    }
    return previous.map((conversation) =>
      conversation.id === message.conversationId && conversation.creativeAi
        ? {
            ...conversation,
            creativeAi: {
              ...conversation.creativeAi,
              lifecycleState: state,
            },
          }
        : conversation,
    );
  });
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
      cacheConversationProjection(
        context,
        conversationId,
        projection.messages,
        projection.streaming,
      );

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
      cacheConversationProjection(
        context,
        conversationId,
        projection.messages,
        projection.streaming,
      );
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

  if (context.activeConversationIdRef.current !== projection.activeConversationId) {
    // A pending frame belongs to the previous visible conversation and must commit before the view swaps.
    context.timelineRenderScheduler?.flushAll();
  }

  const nextStreaming = conversationId
    ? projectForegroundConversationStreaming(
        projection.streaming,
        context.conversationStreamingRef.current.get(conversationId),
      )
    : undefined;
  if (conversationId && nextStreaming) {
    releaseReplacedActiveTurn(context, conversationId, nextStreaming.activeTurnTimeline?.messageId);
  }
  if (conversationId && nextStreaming) {
    const coordinator = context.conversationRenderCoordinator;
    if (!coordinator) {
      throw new Error('Active conversation activation requires the canonical render coordinator.');
    }
    commitConversationRenderActivation({
      coordinator,
      source: 'extension-active-conversation',
      conversation: {
        conversationId,
        messages: projection.messages,
        streaming: nextStreaming,
      },
      visibleState: createConversationVisibleStatePort({
        activeConversationIdRef: context.activeConversationIdRef,
        streamingMessageIdRef: context.streamingMessageIdRef,
        conversationMessagesRef: context.conversationMessagesRef,
        conversationStreamingRef: context.conversationStreamingRef,
        setMessages: context.setMessages,
        setStreamingMessageId: context.setStreamingMessageId,
        setIsThinking: context.setIsThinking,
        setQueuedMessageCount: context.setQueuedMessageCount,
        setQueuedMessages: context.setQueuedMessages,
        setActiveConversationId: context.setActiveConversationId,
      }),
      markdown: createConversationMarkdownTimelineResourceOwner((timeline) =>
        commitActiveTurnTimelineMarkdownSnapshot(context, timeline),
      ),
    });
  } else {
    context.setMessages(projection.messages);
    context.setStreamingMessageId(projection.streaming.streamingMessageId);
    context.streamingMessageIdRef.current = projection.streaming.streamingMessageId;
    context.setIsThinking(projection.streaming.isThinking);
    context.setQueuedMessageCount?.(projection.streaming.queuedMessageCount ?? 0);
    context.setQueuedMessages?.(projection.streaming.queuedMessages ?? []);
    context.setActiveConversationId(projection.activeConversationId);
    context.activeConversationIdRef.current = projection.activeConversationId;
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

function cacheConversationProjection(
  context: MessageHandlerContext,
  conversationId: string,
  messages: readonly Message[],
  streaming: StreamingState,
): void {
  const coordinator = context.conversationRenderCoordinator;
  if (!coordinator) {
    throw new Error('Conversation caching requires the canonical render coordinator.');
  }
  const snapshot = ingestConversationRenderSnapshot({
    coordinator,
    conversationId,
    messages,
    streaming,
  });
  commitConversationSnapshotProjection({
    snapshot,
    conversationMessagesRef: context.conversationMessagesRef,
    conversationStreamingRef: context.conversationStreamingRef,
  });
}

function projectForegroundConversationStreaming(
  streaming: StreamingState,
  cachedStreaming: StreamingState | undefined,
): StreamingState {
  const projectedActiveTurnTimeline = getProjectedActiveTurnTimeline(streaming);
  const activeTurnTimeline =
    projectedActiveTurnTimeline !== undefined
      ? releaseUnavailableTimelineOwnership(projectedActiveTurnTimeline)
      : getRecoverableCachedActiveTurnTimeline(cachedStreaming);
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount ?? 0,
    queuedMessages: streaming.queuedMessages ?? [],
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
    ...(activeTurnTimeline !== undefined ? { activeTurnTimeline } : {}),
  };
}

function getRecoverableCachedActiveTurnTimeline(
  streaming: StreamingState | undefined,
): StreamingState['activeTurnTimeline'] {
  if (!streaming?.isThinking || !streaming.streamingMessageId) {
    return undefined;
  }
  return releaseUnavailableTimelineOwnership(getProjectedActiveTurnTimeline(streaming));
}

function releaseUnavailableTimelineOwnership(
  timeline: StreamingState['activeTurnTimeline'],
): StreamingState['activeTurnTimeline'] {
  return timeline?.synchronization === 'unavailable' ? null : timeline;
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
function releaseReplacedActiveTurn(
  context: MessageHandlerContext,
  conversationId: string,
  nextMessageId: string | undefined,
): void {
  const previousMessageId =
    context.conversationStreamingRef.current.get(conversationId)?.activeTurnTimeline?.messageId;
  if (!previousMessageId || previousMessageId === nextMessageId) return;
  if (context.releaseTurnRendering) {
    context.releaseTurnRendering(conversationId, previousMessageId);
    return;
  }
  context.timelineRenderScheduler?.discardTurn(conversationId, previousMessageId);
  context.markdownSessionRegistry?.releaseTurn(conversationId, previousMessageId);
}

export const conversationHandlers: HandlerRegistration[] = [
  defineHandler('error', handleError),
  defineHandler('globalError', handleGlobalError),
  defineHandler('sessionDiagnostic', handleSessionDiagnostic),
  defineHandler('historyCleared', handleHistoryCleared),
  defineHandler('conversationList', handleConversationList),
  defineHandler('conversationLifecycleResult', handleConversationLifecycleResult),
  defineHandler('activeConversation', handleActiveConversation),
];
