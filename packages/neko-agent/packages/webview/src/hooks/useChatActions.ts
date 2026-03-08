/**
 * useChatActions - Chat message sending, cancellation, and queue processing
 *
 * Extracts message send/cancel/copy/queue logic from AIAssistant.
 */

import { useEffect, useCallback, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { Message, type TabType } from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type { AttachedFile } from '@/components/ChatView/InputArea';
import type { UseMessageQueueReturn } from './useMessageQueue';
import type { StreamingState } from './useConversationState';
import { setExternalMessageContext } from '@/handlers';

export interface UseChatActionsProps {
  inputValue: string;
  isThinking: boolean;
  selectedModel: string;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;
  messages: Message[];
  messageQueue: UseMessageQueueReturn;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveTab: Dispatch<SetStateAction<TabType>>;
  setInputValue: Dispatch<SetStateAction<string>>;
  clearInput: () => void;
  setAttachedFiles: (files: AttachedFile[]) => void;
}

export interface UseChatActionsReturn {
  handleSend: (attachments?: AttachedFile[]) => void;
  triggerSend: (messageText: string) => void;
  handleCancelMessage: () => void;
  copyLastResponse: () => void;
}

/**
 * Parse selectedModel into providerId and modelId
 */
function parseModelSelection(selectedModel: string): { providerId?: string; modelId?: string } {
  if (selectedModel !== 'auto' && selectedModel.includes(':')) {
    const parts = selectedModel.split(':');
    return { providerId: parts[0], modelId: parts.slice(1).join(':') };
  }
  return {};
}

export function useChatActions({
  inputValue,
  isThinking,
  selectedModel,
  activeConversationId,
  activeConversationIdRef,
  streamingMessageIdRef,
  conversationStreamingRef,
  messages,
  messageQueue,
  setMessages,
  setIsThinking,
  setStreamingMessageId,
  setActiveTab,
  setInputValue,
  clearInput,
  setAttachedFiles,
}: UseChatActionsProps): UseChatActionsReturn {

  // Send a user message (or queue it if agent is thinking)
  const handleSend = useCallback((attachments?: AttachedFile[]) => {
    const trimmed = inputValue.trim();
    if (!trimmed && (!attachments || attachments.length === 0)) return;

    // Check if THIS conversation is thinking (not global isThinking)
    const currentConvStreaming = activeConversationId
      ? conversationStreamingRef.current.get(activeConversationId)
      : null;
    const isCurrentConvThinking = currentConvStreaming?.isThinking || isThinking;

    // If current conversation's agent is thinking, queue the message
    if (isCurrentConvThinking) {
      if (activeConversationId) {
        messageQueue.enqueue(trimmed, activeConversationId, attachments);
      }
      clearInput();
      setAttachedFiles([]);
      return;
    }

    // Clear streaming state from previous turn
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      attachments: attachments,
    };

    setMessages(prev => [...prev, userMessage]);
    clearInput();
    setAttachedFiles([]);
    setIsThinking(true);

    const { providerId, modelId } = parseModelSelection(selectedModel);
    VSCodeMessages.sendMessage(trimmed, providerId, modelId, attachments, undefined, activeConversationId || undefined);
  }, [inputValue, isThinking, selectedModel, activeConversationId, conversationStreamingRef, messageQueue, setMessages, setIsThinking, setStreamingMessageId, streamingMessageIdRef, clearInput, setAttachedFiles]);

  // Trigger send from external message (with custom message text)
  const triggerSend = useCallback((messageText: string) => {
    if (isThinking) return;

    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsThinking(true);
    setActiveTab('chat');

    const { providerId, modelId } = parseModelSelection(selectedModel);
    VSCodeMessages.sendMessage(messageText, providerId, modelId, undefined, undefined, activeConversationIdRef.current || undefined);
  }, [isThinking, selectedModel, setMessages, setIsThinking, setActiveTab, setStreamingMessageId, streamingMessageIdRef, activeConversationIdRef]);

  // Set external message context for handlers
  useEffect(() => {
    setExternalMessageContext({ setInputValue, triggerSend });
  }, [setInputValue, triggerSend]);

  // Auto-send queued messages when agent finishes thinking
  useEffect(() => {
    if (!isThinking && activeConversationId && messageQueue.hasMessagesForConversation(activeConversationId)) {
      const nextMessage = messageQueue.peekForConversation(activeConversationId);
      if (nextMessage) {
        messageQueue.shiftForConversation(activeConversationId);

        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;

        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: nextMessage.content,
          timestamp: Date.now(),
          attachments: nextMessage.attachments,
        };

        setMessages(prev => [...prev, userMessage]);
        setIsThinking(true);

        const { providerId, modelId } = parseModelSelection(selectedModel);
        VSCodeMessages.sendMessage(
          nextMessage.content, providerId, modelId,
          nextMessage.attachments, undefined,
          nextMessage.conversationId,
          nextMessage.messageTrackingId,
        );
      }
    }
  }, [isThinking, activeConversationId, messageQueue.queue]);

  // Copy last assistant response to clipboard
  const copyLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content);
    }
  }, [messages]);

  // Cancel current AI message generation
  const handleCancelMessage = useCallback(() => {
    if (isThinking) {
      VSCodeMessages.cancelMessage();
      setIsThinking(false);
    }
  }, [isThinking, setIsThinking]);

  return { handleSend, triggerSend, handleCancelMessage, copyLastResponse };
}
