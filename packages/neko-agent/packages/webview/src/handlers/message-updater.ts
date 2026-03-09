/**
 * Message Updater
 *
 * Unified conversation update functions that auto-route between
 * current and non-current conversations, eliminating if/else branching
 * in every handler.
 */

import type { MessageHandlerContext } from './types';
import type { Message } from '@/components/types';

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
  if (context.isCurrentConversation(conversationId)) {
    let result: ConversationUpdateResult | undefined;
    context.setMessages((prev) => {
      result = updater(prev, context.streamingMessageIdRef.current);
      return result.messages;
    });
    // Apply streaming state changes (result is populated synchronously by setMessages callback)
    if (result) {
      if (result.streamingMessageId !== undefined) {
        context.streamingMessageIdRef.current = result.streamingMessageId;
        context.setStreamingMessageId(result.streamingMessageId);
      }
      if (result.isThinking !== undefined) {
        context.setIsThinking(result.isThinking);
      }
    }
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
        },
      };
    });
  }
}
