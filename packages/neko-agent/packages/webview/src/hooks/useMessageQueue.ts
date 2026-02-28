/**
 * useMessageQueue - Message queue hook for AI chat
 *
 * Allows users to queue messages while the agent is processing,
 * automatically sending the next message when the current one completes.
 * Messages are bound to conversations to prevent cross-conversation mixing.
 */

import { useState, useCallback, useRef } from 'react';
import type { AttachedFile } from '@/components/ChatView/InputArea/types';
import { getLogger } from '../utils/logger';

const logger = getLogger('MessageQueue');

/**
 * Queued message structure
 */
export interface QueuedMessage {
  id: string;
  /** Unique message ID for end-to-end tracking (prevents duplicate processing) */
  messageTrackingId: string;
  content: string;
  attachments?: AttachedFile[];
  /** Conversation this message belongs to */
  conversationId: string;
  queuedAt: number;
}

/**
 * Hook return type
 */
export interface UseMessageQueueReturn {
  /** Current queue of all pending messages (across all conversations) */
  queue: QueuedMessage[];
  /** Add a message to the queue for a specific conversation */
  enqueue: (content: string, conversationId: string, attachments?: AttachedFile[]) => void;
  /** Remove the first message from the queue (call after processing) - deprecated, use shiftForConversation */
  shift: () => void;
  /** Get the first message without removing it - deprecated, use peekForConversation */
  peek: () => QueuedMessage | undefined;
  /** Remove a specific message by ID */
  remove: (id: string) => void;
  /** Clear all queued messages */
  clear: () => void;
  /** Check if queue has messages */
  hasMessages: boolean;
  /** Get queue length */
  length: number;
  /** Get messages for a specific conversation */
  getQueueForConversation: (conversationId: string) => QueuedMessage[];
  /** Check if a conversation has queued messages */
  hasMessagesForConversation: (conversationId: string) => boolean;
  /** Get first message for a conversation without removing */
  peekForConversation: (conversationId: string) => QueuedMessage | undefined;
  /** Remove first message for a specific conversation */
  shiftForConversation: (conversationId: string) => void;
  /** Clear all messages for a specific conversation */
  clearForConversation: (conversationId: string) => void;
}

/**
 * Message queue hook
 *
 * Usage:
 * ```tsx
 * const { queue, enqueue, shiftForConversation, hasMessagesForConversation } = useMessageQueue();
 *
 * // When user sends while agent is thinking
 * if (isThinking) {
 *   enqueue(inputValue, activeConversationId, attachments);
 * }
 *
 * // When agent finishes, auto-send next for THIS conversation
 * useEffect(() => {
 *   if (!isThinking && activeConversationId && hasMessagesForConversation(activeConversationId)) {
 *     const next = peekForConversation(activeConversationId);
 *     if (next) {
 *       sendMessage(next);
 *       shiftForConversation(activeConversationId);
 *     }
 *   }
 * }, [isThinking, activeConversationId]);
 * ```
 */
export function useMessageQueue(): UseMessageQueueReturn {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const idCounter = useRef(0);
  // Track recently processed message content hashes to prevent duplicates
  const recentContentHashes = useRef<Set<string>>(new Set());

  // Generate a simple hash for content deduplication
  const getContentHash = useCallback((content: string, conversationId: string) => {
    return `${conversationId}:${content.trim().toLowerCase().slice(0, 100)}`;
  }, []);

  const enqueue = useCallback((content: string, conversationId: string, attachments?: AttachedFile[]) => {
    const contentHash = getContentHash(content, conversationId);

    // Prevent duplicate messages within the same conversation
    if (recentContentHashes.current.has(contentHash)) {
      logger.warn(`Duplicate message detected, skipping: ${content.slice(0, 50)}`);
      return;
    }

    // Add to recent hashes (auto-expire after 5 seconds)
    recentContentHashes.current.add(contentHash);
    setTimeout(() => {
      recentContentHashes.current.delete(contentHash);
    }, 5000);

    const trackingId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const message: QueuedMessage = {
      id: `queued-${Date.now()}-${++idCounter.current}`,
      messageTrackingId: trackingId,
      content,
      conversationId,
      attachments,
      queuedAt: Date.now(),
    };
    setQueue((prev) => [...prev, message]);
  }, [getContentHash]);

  // Get first message without removing (synchronous read from state) - deprecated
  const peek = useCallback((): QueuedMessage | undefined => {
    return queue[0];
  }, [queue]);

  // Remove first message from queue - deprecated
  const shift = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
  }, []);

  // Conversation-specific methods
  const getQueueForConversation = useCallback((conversationId: string): QueuedMessage[] => {
    return queue.filter((m) => m.conversationId === conversationId);
  }, [queue]);

  const hasMessagesForConversation = useCallback((conversationId: string): boolean => {
    return queue.some((m) => m.conversationId === conversationId);
  }, [queue]);

  const peekForConversation = useCallback((conversationId: string): QueuedMessage | undefined => {
    return queue.find((m) => m.conversationId === conversationId);
  }, [queue]);

  const shiftForConversation = useCallback((conversationId: string) => {
    setQueue((prev) => {
      const index = prev.findIndex((m) => m.conversationId === conversationId);
      if (index === -1) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  }, []);

  const clearForConversation = useCallback((conversationId: string) => {
    setQueue((prev) => prev.filter((m) => m.conversationId !== conversationId));
  }, []);

  return {
    queue,
    enqueue,
    shift,
    peek,
    remove,
    clear,
    hasMessages: queue.length > 0,
    length: queue.length,
    getQueueForConversation,
    hasMessagesForConversation,
    peekForConversation,
    shiftForConversation,
    clearForConversation,
  };
}

export default useMessageQueue;
