/**
 * useChatActions - Chat message sending, cancellation, and copy
 *
 * Sends messages directly to Extension — AgentRunner handles queueing
 * when the agent is already running (via _pendingMessages).
 */

import {
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react';
import { Message, type TabType } from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type { MessageAttachment } from '@/components/ChatView/InputArea';
import { setExternalMessageContext } from '@/handlers';

export interface UseChatActionsProps {
  inputValue: string;
  isThinking: boolean;
  selectedModel: string;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveTab: Dispatch<SetStateAction<TabType>>;
  setInputValue: Dispatch<SetStateAction<string>>;
  clearInput: () => void;
  setAttachedFiles: (files: MessageAttachment[]) => void;
}

export interface UseChatActionsReturn {
  handleSend: (attachments?: MessageAttachment[]) => void;
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
  messages,
  setMessages,
  setIsThinking,
  setStreamingMessageId,
  setActiveTab,
  setInputValue,
  clearInput,
  setAttachedFiles,
}: UseChatActionsProps): UseChatActionsReturn {
  // Lightweight dedup guard: prevent double-click within 1s
  const lastSentRef = useRef<{ hash: string; time: number }>();

  const isDuplicate = useCallback((content: string): boolean => {
    const hash = content.trim().slice(0, 100);
    const now = Date.now();
    if (lastSentRef.current?.hash === hash && now - lastSentRef.current.time < 1000) return true;
    lastSentRef.current = { hash, time: now };
    return false;
  }, []);

  // Send a user message — always send directly to Extension.
  // AgentRunner handles queueing if the agent is already running.
  const handleSend = useCallback(
    (attachments?: MessageAttachment[]) => {
      const trimmed = inputValue.trim();
      if (!trimmed && (!attachments || attachments.length === 0)) return;

      // Dedup guard: prevent accidental double-click
      if (isDuplicate(trimmed)) return;

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

      setMessages((prev) => [...prev, userMessage]);
      clearInput();
      setAttachedFiles([]);
      setIsThinking(true);

      const { providerId, modelId } = parseModelSelection(selectedModel);
      VSCodeMessages.sendMessage(
        trimmed,
        providerId,
        modelId,
        attachments,
        undefined,
        activeConversationId || undefined,
      );
    },
    [
      inputValue,
      selectedModel,
      activeConversationId,
      isDuplicate,
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      streamingMessageIdRef,
      clearInput,
      setAttachedFiles,
    ],
  );

  // Trigger send from external message (with custom message text)
  const triggerSend = useCallback(
    (messageText: string) => {
      if (isThinking) return;

      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsThinking(true);
      setActiveTab('chat');

      const { providerId, modelId } = parseModelSelection(selectedModel);
      VSCodeMessages.sendMessage(
        messageText,
        providerId,
        modelId,
        undefined,
        undefined,
        activeConversationIdRef.current || undefined,
      );
    },
    [
      isThinking,
      selectedModel,
      setMessages,
      setIsThinking,
      setActiveTab,
      setStreamingMessageId,
      streamingMessageIdRef,
      activeConversationIdRef,
    ],
  );

  // Set external message context for handlers
  useEffect(() => {
    setExternalMessageContext({ setInputValue, triggerSend });
  }, [setInputValue, triggerSend]);

  // Copy last assistant response to clipboard
  const copyLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
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
