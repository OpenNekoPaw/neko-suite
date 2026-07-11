/**
 * useConversationSession - Session-bound state management
 *
 * Manages per-conversation input/attachment state isolation:
 * - Saves input value and attached files when switching away from a conversation
 * - Restores them when switching back
 * - Cleans up resources when conversations are deleted
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type {
  MessageAttachment,
  SelectedFileReference,
} from '@/components/ChatView/InputArea/types';
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
  conversationTokenCountRef: MutableRefObject<ClearableMap>;
  conversationCompressingRef: MutableRefObject<ClearableMap>;
  conversationAgentStateRef: MutableRefObject<ClearableMap>;
}

export interface UseConversationSessionReturn {
  attachedFiles: MessageAttachment[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<MessageAttachment[]>>;
  selectedFileReferences: SelectedFileReference[];
  setSelectedFileReferences: React.Dispatch<React.SetStateAction<SelectedFileReference[]>>;
  /** Clean up all session-bound state for a single conversation */
  cleanupConversation: (conversationId: string) => void;
  /** Clean up all session-bound state for every conversation */
  cleanupAllConversations: () => void;
}

export function useConversationSession({
  activeConversationId,
  inputValue,
  setInputValue,
  conversationTokenCountRef,
  conversationCompressingRef,
  conversationAgentStateRef,
}: UseConversationSessionProps): UseConversationSessionReturn {
  // Per-conversation caches for input and attachments
  const conversationInputRef = useRef<Map<string, string>>(new Map());
  const conversationAttachmentsRef = useRef<Map<string, MessageAttachment[]>>(new Map());
  const conversationFileReferencesRef = useRef<Map<string, SelectedFileReference[]>>(new Map());

  const [attachedFiles, setAttachedFiles] = useState<MessageAttachment[]>([]);
  const [selectedFileReferences, setSelectedFileReferences] = useState<SelectedFileReference[]>([]);

  // Save/restore on conversation switch
  const prevConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    const newId = activeConversationId;

    // Save previous conversation's state before switching
    if (prevId && prevId !== newId) {
      conversationInputRef.current.set(prevId, inputValue);
      conversationAttachmentsRef.current.set(prevId, attachedFiles);
      conversationFileReferencesRef.current.set(prevId, selectedFileReferences);
    }

    // Restore new conversation's state
    if (newId && newId !== prevId) {
      const savedInput = conversationInputRef.current.get(newId) || '';
      const savedAttachments = conversationAttachmentsRef.current.get(newId) || [];
      const savedFileReferences = conversationFileReferencesRef.current.get(newId) || [];
      setInputValue(savedInput);
      setAttachedFiles(savedAttachments);
      setSelectedFileReferences(savedFileReferences);
    }

    prevConversationIdRef.current = newId;
  }, [activeConversationId]); // Only depend on activeConversationId to avoid loops

  const cleanupConversation = useCallback(
    (conversationId: string) => {
      conversationInputRef.current.delete(conversationId);
      conversationAttachmentsRef.current.delete(conversationId);
      conversationFileReferencesRef.current.delete(conversationId);
      conversationTokenCountRef.current.delete(conversationId);
      conversationCompressingRef.current.delete(conversationId);
      conversationAgentStateRef.current.delete(conversationId);
    },
    [conversationTokenCountRef, conversationCompressingRef, conversationAgentStateRef],
  );

  const cleanupAllConversations = useCallback(() => {
    conversationInputRef.current.clear();
    conversationAttachmentsRef.current.clear();
    conversationFileReferencesRef.current.clear();
    conversationTokenCountRef.current.clear();
    conversationCompressingRef.current.clear();
    conversationAgentStateRef.current.clear();
  }, [conversationTokenCountRef, conversationCompressingRef, conversationAgentStateRef]);

  return {
    attachedFiles,
    setAttachedFiles,
    selectedFileReferences,
    setSelectedFileReferences,
    cleanupConversation,
    cleanupAllConversations,
  };
}
