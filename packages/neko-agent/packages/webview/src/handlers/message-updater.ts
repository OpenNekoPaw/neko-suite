/**
 * Message Updater
 *
 * Unified conversation update functions that auto-route between
 * current and non-current conversations, eliminating if/else branching
 * in every handler.
 */

import type { MessageHandlerContext } from './types';
import type { Message } from '@neko-agent/types';

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
}

/**
 * Updater function that receives current messages and streaming state,
 * returns updated messages with optional streaming state changes.
 */
export type ConversationUpdater = (
  messages: Message[],
  streamingMessageId: string | null,
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
    };
    const result = updater(currentMessages, currentStreaming.streamingMessageId);
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
    };

    context.conversationMessagesRef.current.set(conversationId, result.messages);
    context.conversationStreamingRef.current.set(conversationId, nextStreaming);
    context.setMessages(result.messages);
    context.streamingMessageIdRef.current = nextStreaming.streamingMessageId;
    context.setStreamingMessageId(nextStreaming.streamingMessageId);
    context.setIsThinking(nextStreaming.isThinking);
    context.setQueuedMessageCount?.(nextStreaming.queuedMessageCount ?? 0);
  } else if (conversationId) {
    context.updateNonCurrentConversation(conversationId, (msgs, streaming) => {
      const result = updater(msgs, streaming.streamingMessageId);
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
        },
      };
    });
  }
}
