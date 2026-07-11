/**
 * Message Updater
 *
 * Unified conversation update functions that auto-route between
 * current and non-current conversations, eliminating if/else branching
 * in every handler.
 */

import type { MessageHandlerContext, StreamingState } from './types';
import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import {
  commitConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

/**
 * Result of a conversation update that may change streaming state.
 * Only include streamingMessageId/isThinking if you want to change them.
 */
export interface ConversationUpdateResult {
  messages: Message[];
  /** If provided, update streamingMessageId */
  streamingMessageId?: string | null;
  /** If provided, update isThinking */
  isThinking?: boolean;
  /** If provided, update queued user messages behind the active run */
  queuedMessageCount?: number;
  /** If provided, update authoritative queued user message items */
  queuedMessages?: readonly AgentQueuedMessageItem[];
  /** If provided, update queue snapshot version */
  messageQueueVersion?: number;
  /** If provided, update active Agent turn timeline state */
  activeTurnTimeline?: ActiveTurnTimelineState | null;
}

/**
 * Updater function that receives current messages and streaming state,
 * returns updated messages with optional streaming state changes.
 */
export type ConversationUpdater = (
  messages: Message[],
  streamingMessageId: string | null,
  streaming: StreamingState,
) => ConversationUpdateResult;

/**
 * Update a conversation's messages (and optionally streaming state),
 * auto-routing between current and non-current conversations.
 *
 * For current conversation: uses setMessages + setStreamingMessageId + setIsThinking
 * For non-current: uses updateNonCurrentConversation
 */
export function updateConversation(
  context: MessageHandlerContext,
  conversationId: string | undefined,
  updater: ConversationUpdater,
): void {
  if (!conversationId) {
    return;
  }

  if (context.isCurrentConversation(conversationId)) {
    const currentMessages =
      context.conversationMessagesRef.current.get(conversationId) ?? context.messages;
    const currentStreaming = context.conversationStreamingRef.current.get(conversationId) ?? {
      streamingMessageId: context.streamingMessageIdRef.current,
      isThinking: context.isThinking,
      queuedMessageCount: context.queuedMessageCount ?? 0,
      queuedMessages: context.queuedMessages ?? [],
      messageQueueVersion: undefined,
      activeTurnTimeline: null,
    };
    const result = updater(currentMessages, currentStreaming.streamingMessageId, currentStreaming);
    const nextStreaming = {
      streamingMessageId:
        result.streamingMessageId !== undefined
          ? result.streamingMessageId
          : currentStreaming.streamingMessageId,
      isThinking: result.isThinking !== undefined ? result.isThinking : currentStreaming.isThinking,
      queuedMessageCount:
        result.queuedMessageCount !== undefined
          ? result.queuedMessageCount
          : currentStreaming.queuedMessageCount,
      queuedMessages:
        result.queuedMessages !== undefined
          ? result.queuedMessages
          : (currentStreaming.queuedMessages ?? []),
      messageQueueVersion:
        result.messageQueueVersion !== undefined
          ? result.messageQueueVersion
          : currentStreaming.messageQueueVersion,
      activeTurnTimeline:
        result.activeTurnTimeline !== undefined
          ? result.activeTurnTimeline
          : (currentStreaming.activeTurnTimeline ?? null),
    };

    const coordinator = context.conversationRenderCoordinator;
    if (!coordinator) {
      throw new Error('Conversation updates require the canonical render coordinator.');
    }
    const snapshot = ingestConversationRenderSnapshot({
      coordinator,
      conversationId,
      messages: result.messages,
      streaming: nextStreaming,
      kind: 'timeline-commit',
    });
    commitConversationSnapshotProjection({
      snapshot,
      conversationMessagesRef: context.conversationMessagesRef,
      conversationStreamingRef: context.conversationStreamingRef,
    });
    context.setMessages([...snapshot.messages]);
    context.streamingMessageIdRef.current = nextStreaming.streamingMessageId;
    context.setStreamingMessageId(nextStreaming.streamingMessageId);
    context.setIsThinking(nextStreaming.isThinking);
    context.setQueuedMessageCount?.(nextStreaming.queuedMessageCount ?? 0);
    context.setQueuedMessages?.(nextStreaming.queuedMessages ?? []);
  } else if (conversationId) {
    context.updateNonCurrentConversation(conversationId, (msgs, streaming) => {
      const result = updater(msgs, streaming.streamingMessageId, streaming);
      return {
        messages: result.messages,
        streaming: {
          streamingMessageId:
            result.streamingMessageId !== undefined
              ? result.streamingMessageId
              : streaming.streamingMessageId,
          isThinking: result.isThinking !== undefined ? result.isThinking : streaming.isThinking,
          queuedMessageCount:
            result.queuedMessageCount !== undefined
              ? result.queuedMessageCount
              : streaming.queuedMessageCount,
          queuedMessages:
            result.queuedMessages !== undefined
              ? result.queuedMessages
              : (streaming.queuedMessages ?? []),
          messageQueueVersion:
            result.messageQueueVersion !== undefined
              ? result.messageQueueVersion
              : streaming.messageQueueVersion,
          activeTurnTimeline:
            result.activeTurnTimeline !== undefined
              ? result.activeTurnTimeline
              : (streaming.activeTurnTimeline ?? null),
        },
      };
    });
  }
}
