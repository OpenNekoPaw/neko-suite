/**
 * useConversationSession - Session-bound state management
 *
 * Manages per-conversation input/attachment state isolation:
 * - Saves input value and attached files when switching away from a conversation
 * - Restores them when switching back
 * - Cleans up resources when conversations are deleted
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { MessageAttachment } from '@/components/ChatView/InputArea';
import type { MutableRefObject } from 'react';

/** Minimal Map interface for cleanup operations */
interface ClearableMap {
  delete(key: string): boolean;
  clear(): void;
}

export interface UseConversationSessionProps {
  activeConversationId: string | null;
  inputValue: string;
  setInputValue: (value: string) => void;
  // Refs shared with other hooks (conversation-level caches)
  conversationMessagesRef: MutableRefObject<ClearableMap>;
  conversationStreamingRef: MutableRefObject<ClearableMap>;
  conversationTokenCountRef: MutableRefObject<ClearableMap>;
  conversationCompressingRef: MutableRefObject<ClearableMap>;
  conversationAgentStateRef: MutableRefObject<ClearableMap>;
}

export interface UseConversationSessionReturn {
  attachedFiles: MessageAttachment[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<MessageAttachment[]>>;
  /** Clean up all session-bound state for a single conversation */
  cleanupConversation: (conversationId: string) => void;
  /** Clean up all session-bound state for every conversation */
  cleanupAllConversations: () => void;
}

export function useConversationSession({
  activeConversationId,
  inputValue,
  setInputValue,
  conversationMessagesRef,
  conversationStreamingRef,
  conversationTokenCountRef,
  conversationCompressingRef,
  conversationAgentStateRef,
}: UseConversationSessionProps): UseConversationSessionReturn {
  // Per-conversation caches for input and attachments
  const conversationInputRef = useRef<Map<string, string>>(new Map());
  const conversationAttachmentsRef = useRef<Map<string, MessageAttachment[]>>(new Map());

  const [attachedFiles, setAttachedFiles] = useState<MessageAttachment[]>([]);

  // Save/restore on conversation switch
  const prevConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    const newId = activeConversationId;

    // Save previous conversation's state before switching
    if (prevId && prevId !== newId) {
      conversationInputRef.current.set(prevId, inputValue);
      conversationAttachmentsRef.current.set(prevId, attachedFiles);
    }

    // Restore new conversation's state
    if (newId && newId !== prevId) {
      const savedInput = conversationInputRef.current.get(newId) || '';
      const savedAttachments = conversationAttachmentsRef.current.get(newId) || [];
      setInputValue(savedInput);
      setAttachedFiles(savedAttachments);
    }

    prevConversationIdRef.current = newId;
  }, [activeConversationId]); // Only depend on activeConversationId to avoid loops

  const cleanupConversation = useCallback(
    (conversationId: string) => {
      conversationMessagesRef.current.delete(conversationId);
      conversationStreamingRef.current.delete(conversationId);
      conversationInputRef.current.delete(conversationId);
      conversationAttachmentsRef.current.delete(conversationId);
      conversationTokenCountRef.current.delete(conversationId);
      conversationCompressingRef.current.delete(conversationId);
      conversationAgentStateRef.current.delete(conversationId);
    },
    [
      conversationMessagesRef,
      conversationStreamingRef,
      conversationTokenCountRef,
      conversationCompressingRef,
      conversationAgentStateRef,
    ],
  );

  const cleanupAllConversations = useCallback(() => {
    conversationMessagesRef.current.clear();
    conversationStreamingRef.current.clear();
    conversationInputRef.current.clear();
    conversationAttachmentsRef.current.clear();
    conversationTokenCountRef.current.clear();
    conversationCompressingRef.current.clear();
    conversationAgentStateRef.current.clear();
  }, [
    conversationMessagesRef,
    conversationStreamingRef,
    conversationTokenCountRef,
    conversationCompressingRef,
    conversationAgentStateRef,
  ]);

  return {
    attachedFiles,
    setAttachedFiles,
    cleanupConversation,
    cleanupAllConversations,
  };
}
