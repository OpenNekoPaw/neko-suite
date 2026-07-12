/**
 * useConversationState Hook
 *
 * Manages conversation-related state for the AIAssistant component.
 */

import { useState, useRef, useEffect, useCallback, type MutableRefObject } from 'react';
import type {
  AgentQueuedMessageItem,
  Message,
  ConversationSummary,
  OpenTab,
} from '@neko-agent/types';
import { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import {
  commitConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

/**
 * Streaming state for a conversation
 */
export interface StreamingState {
  streamingMessageId: string | null;
  isThinking: boolean;
  queuedMessageCount?: number;
  queuedMessages?: readonly AgentQueuedMessageItem[];
  messageQueueVersion?: number;
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
  queuedMessageCount: number;
  queuedMessages: readonly AgentQueuedMessageItem[];
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
  conversationRenderCoordinator: ConversationRenderCoordinator;
}

/**
 * Conversation state actions
 */
export interface ConversationStateActions {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setQueuedMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setQueuedMessages: React.Dispatch<React.SetStateAction<readonly AgentQueuedMessageItem[]>>;
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
  const conversationRenderCoordinatorRef = useRef<ConversationRenderCoordinator | null>(null);
  conversationRenderCoordinatorRef.current ??= new ConversationRenderCoordinator();
  const conversationRenderCoordinator = conversationRenderCoordinatorRef.current;

  // Current conversation's chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const [queuedMessages, setQueuedMessages] = useState<readonly AgentQueuedMessageItem[]>([]);
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
      const snapshot = ingestConversationRenderSnapshot({
        coordinator: conversationRenderCoordinator,
        conversationId: activeConversationId,
        messages,
        streaming: {
          ...(conversationStreamingRef.current.get(activeConversationId) ?? {}),
          streamingMessageId,
          isThinking,
          queuedMessageCount,
          queuedMessages,
        },
      });
      commitConversationSnapshotProjection({
        snapshot,
        conversationMessagesRef,
        conversationStreamingRef,
      });
    }
  }, [
    activeConversationId,
    messages,
    streamingMessageId,
    isThinking,
    queuedMessageCount,
    queuedMessages,
    conversationMessagesRef,
    conversationRenderCoordinator,
    conversationStreamingRef,
  ]);

  // Helper: add a single message
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Helper: clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessageId(null);
    setIsThinking(false);
    setQueuedMessageCount(0);
    setQueuedMessages([]);
  }, []);

  return {
    // State
    messages,
    isThinking,
    streamingMessageId,
    queuedMessageCount,
    queuedMessages,
    conversations,
    activeConversationId,
    openTabs,
    activeTabId,
    // Refs
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator,
    // Actions
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setQueuedMessageCount,
    setQueuedMessages,
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    addMessage,
    clearMessages,
  };
}
