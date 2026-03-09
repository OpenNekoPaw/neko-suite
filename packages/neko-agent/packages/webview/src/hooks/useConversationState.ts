/**
 * useConversationState Hook
 *
 * Manages conversation-related state for the AIAssistant component.
 */

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from 'react';
import type { Message, ConversationSummary, OpenTab } from '@/components/types';

/**
 * Streaming state for a conversation
 */
export interface StreamingState {
  streamingMessageId: string | null;
  isThinking: boolean;
}

/**
 * Conversation state shape
 */
export interface ConversationState {
  // Current conversation messages
  messages: Message[];
  // Streaming state
  isThinking: boolean;
  streamingMessageId: string | null;
  // Conversation management
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  // Tab state
  openTabs: OpenTab[];
  activeTabId: string | null;
}

/**
 * Conversation state refs
 */
export interface ConversationStateRefs {
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;
}

/**
 * Conversation state actions
 */
export interface ConversationStateActions {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
}

/**
 * useConversationState return type
 */
export interface UseConversationStateReturn
  extends ConversationState, ConversationStateRefs, ConversationStateActions {}

/**
 * Hook for managing conversation state
 */
export function useConversationState(): UseConversationStateReturn {
  // Per-conversation state maps (preserve state when switching conversations)
  const conversationMessagesRef = useRef<Map<string, Message[]>>(new Map());
  const conversationStreamingRef = useRef<Map<string, StreamingState>>(new Map());

  // Current conversation's chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  // Ref for immediate access (fixes race condition with async state updates)
  const streamingMessageIdRef = useRef<string | null>(null);

  // Conversation management
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Keep ref in sync with state for use in message handler
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Keep streamingMessageIdRef in sync
  useEffect(() => {
    streamingMessageIdRef.current = streamingMessageId;
  }, [streamingMessageId]);

  // Save current conversation state to maps when it changes
  useEffect(() => {
    if (activeConversationId) {
      conversationMessagesRef.current.set(activeConversationId, messages);
      conversationStreamingRef.current.set(activeConversationId, {
        streamingMessageId,
        isThinking,
      });
    }
  }, [activeConversationId, messages, streamingMessageId, isThinking]);

  // Helper: add a single message
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Helper: clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessageId(null);
    setIsThinking(false);
    if (activeConversationIdRef.current) {
      conversationMessagesRef.current.delete(activeConversationIdRef.current);
      conversationStreamingRef.current.delete(activeConversationIdRef.current);
    }
  }, []);

  return {
    // State
    messages,
    isThinking,
    streamingMessageId,
    conversations,
    activeConversationId,
    openTabs,
    activeTabId,
    // Refs
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    // Actions
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    addMessage,
    clearMessages,
  };
}
