/**
 * Conversation Message Handlers
 *
 * Handles: conversationList, activeConversation, historyCleared, error
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { OpenTab } from '@/components/types';

/**
 * Handle 'error' message - Error occurred
 */
const handleError: MessageHandler = (message, context) => {
  if (context.isCurrentConversation(message.conversationId)) {
    context.setIsThinking(false);
    context.setStreamingMessageId(null);
    context.setMessages(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${message.message || 'An error occurred'}`,
        timestamp: Date.now(),
      },
    ]);
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, _streaming) => ({
      messages: [
        ...msgs,
        {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: `Error: ${message.message || 'An error occurred'}`,
          timestamp: Date.now(),
        },
      ],
      streaming: { streamingMessageId: null, isThinking: false },
    }));
  }
};

/**
 * Handle 'historyCleared' message - Conversation cleared
 */
const handleHistoryCleared: MessageHandler = (_message, context) => {
  context.setMessages([]);
  context.setStreamingMessageId(null);
  context.setIsThinking(false);
  // Also clear the Map for current conversation
  if (context.activeConversationIdRef.current) {
    context.conversationMessagesRef.current.delete(context.activeConversationIdRef.current);
    context.conversationStreamingRef.current.delete(context.activeConversationIdRef.current);
  }
};

/**
 * Handle 'conversationList' message - List of conversations
 */
const handleConversationList: MessageHandler = (message, context) => {
  context.setConversations(message.conversations || []);
};

/**
 * Handle 'activeConversation' message - Active conversation changed
 */
const handleActiveConversation: MessageHandler = (message, context) => {
  if (message.conversation) {
    const convId = message.conversation.id;

    // Check if we have cached state for this conversation (preserves streaming state)
    const cachedMessages = context.conversationMessagesRef.current.get(convId);
    const cachedStreaming = context.conversationStreamingRef.current.get(convId);

    if (cachedMessages && cachedMessages.length > 0) {
      // Restore from cache - preserves streaming state
      context.setMessages(cachedMessages);
      context.setStreamingMessageId(cachedStreaming?.streamingMessageId || null);
      context.setIsThinking(cachedStreaming?.isThinking || false);
    } else {
      // New conversation or no cache - load from server
      const messagesToUse = message.conversation.messages || [];
      context.setMessages(messagesToUse);
      context.setStreamingMessageId(null);
      context.setIsThinking(false);

      // Note: Background tasks are now managed by TaskManager via 'tasksUpdated' messages
      // No need to extract from conversation messages here
    }

    context.setActiveConversationId(convId);

    const existingTab = context.openTabs.find(t => t.conversationId === message.conversation.id);
    if (!existingTab) {
      const newTab: OpenTab = {
        id: `tab-${Date.now()}`,
        title: message.conversation.title || 'New Chat',
        conversationId: message.conversation.id,
      };
      context.setOpenTabs(prev => [...prev, newTab]);
      context.setActiveTabId(newTab.id);
    } else {
      context.setActiveTabId(existingTab.id);
    }
    context.setActiveTab('chat');
  } else {
    // Reset streaming state
    context.setStreamingMessageId(null);
    context.setIsThinking(false);

    context.setMessages([]);
    context.setActiveConversationId(null);
  }
};

/**
 * All conversation handler registrations
 */
export const conversationHandlers: HandlerRegistration[] = [
  { type: 'error', handler: handleError },
  { type: 'historyCleared', handler: handleHistoryCleared },
  { type: 'conversationList', handler: handleConversationList },
  { type: 'activeConversation', handler: handleActiveConversation },
];
