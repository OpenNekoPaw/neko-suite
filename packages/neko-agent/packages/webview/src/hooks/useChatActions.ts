/**
 * useChatActions - Chat message sending, cancellation, and copy
 *
 * Sends messages directly to Extension — AgentRunner handles queueing
 * when the agent is already running (via _pendingMessages).
 */

import {
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react';
import {
  Message,
  type MessageContextReference,
  type SessionMode,
  type TabType,
} from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type { MessageAttachment } from '@/components/ChatView/InputArea';
import type { AgentMediaModelSelections } from '@neko-agent/types';
import { projectMessageModelSelection } from '../presenters/config-message-presenter';
import type { AgentContextPayload } from '@neko/shared';

/** Per-category resolved media model for agent mode */
export type AgentMediaModels = AgentMediaModelSelections;

function projectContextReferencesFromPayloads(
  payloads: AgentContextPayload[] | undefined,
): MessageContextReference[] | undefined {
  if (!payloads || payloads.length === 0) return undefined;
  return payloads.map((p) => {
    const data = p.data as Record<string, unknown> | null | undefined;
    const nav: Record<string, string> = {};
    if (data && typeof data === 'object') {
      if (typeof data['filePath'] === 'string') nav['filePath'] = data['filePath'];
      if (typeof data['path'] === 'string') nav['path'] = data['path'];
    }
    if (p.type === 'canvas-node') nav['nodeId'] = p.id;
    return {
      type: p.type,
      id: p.id,
      label: p.label,
      ...(Object.keys(nav).length > 0 ? { navigationData: nav } : {}),
    };
  });
}

export interface UseChatActionsProps {
  inputValue: string;
  isThinking: boolean;
  selectedModel: string;
  sessionMode?: SessionMode;
  mediaProviderId?: string;
  mediaModelId?: string;
  /** Per-category media models for agent mode (overrides mediaModelId when set) */
  agentMediaModels?: AgentMediaModels;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  isConversationSwitching?: boolean;
  streamingMessageIdRef: MutableRefObject<string | null>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveTab: Dispatch<SetStateAction<TabType>>;

  clearInput: () => void;
  setAttachedFiles: (files: MessageAttachment[]) => void;
}

export interface UseChatActionsReturn {
  handleSend: (input?: {
    messageText?: string;
    attachments?: MessageAttachment[];
    contextPayloads?: AgentContextPayload[];
  }) => void;
  triggerSend: (messageText: string) => void;
  handleCancelMessage: () => void;
  copyLastResponse: () => void;
}

export function useChatActions({
  inputValue,
  isThinking,
  selectedModel,
  sessionMode,
  mediaProviderId,
  mediaModelId,
  agentMediaModels,
  activeConversationId,
  activeConversationIdRef,
  isConversationSwitching = false,
  streamingMessageIdRef,
  messages,
  setMessages,
  setIsThinking,
  setStreamingMessageId,
  setActiveTab,
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
    (input?: {
      messageText?: string;
      attachments?: MessageAttachment[];
      contextPayloads?: AgentContextPayload[];
    }) => {
      if (isConversationSwitching) return;

      const messageText = input?.messageText ?? inputValue;
      const attachments = input?.attachments;
      const contextPayloads = input?.contextPayloads;
      const trimmed = messageText.trim();
      const hasAttachments = (attachments?.length ?? 0) > 0;
      const hasContextPayloads = (contextPayloads?.length ?? 0) > 0;
      if (!trimmed && !hasAttachments && !hasContextPayloads) return;

      const conversationId = activeConversationId;
      if (!conversationId) return;

      // Dedup guard: prevent accidental double-click
      if (isDuplicate(`${trimmed}:${attachments?.length ?? 0}:${contextPayloads?.length ?? 0}`)) {
        return;
      }

      // Clear streaming state from previous turn
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;

      const contextReferences = projectContextReferencesFromPayloads(contextPayloads);
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
        ...(attachments ? { attachments } : {}),
        ...(contextReferences ? { contextReferences } : {}),
      };

      setMessages((prev) => [...prev, userMessage]);
      clearInput();
      setAttachedFiles([]);
      setIsThinking(true);

      const effectiveSessionMode = sessionMode ?? 'agent';
      const modelProjection = projectMessageModelSelection({
        selectedModel,
        sessionMode: effectiveSessionMode,
        mediaProviderId,
        mediaModelId,
        agentMediaModels,
      });
      VSCodeMessages.sendMessage({
        conversationId,
        message: trimmed,
        sessionMode: effectiveSessionMode,
        ...modelProjection,
        ...(attachments ? { attachments } : {}),
        ...(contextPayloads ? { contextPayloads } : {}),
      });
    },
    [
      inputValue,
      selectedModel,
      sessionMode,
      mediaProviderId,
      mediaModelId,
      agentMediaModels,
      activeConversationId,
      isConversationSwitching,
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
      if (isConversationSwitching) return;
      if (isThinking) return;

      const conversationId = activeConversationIdRef.current;
      if (!conversationId) return;

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

      const modelProjection = projectMessageModelSelection({
        selectedModel,
        sessionMode: 'agent',
      });
      VSCodeMessages.sendMessage({
        conversationId,
        message: messageText,
        sessionMode: 'agent',
        ...modelProjection,
      });
    },
    [
      isThinking,
      isConversationSwitching,
      selectedModel,
      setMessages,
      setIsThinking,
      setActiveTab,
      setStreamingMessageId,
      streamingMessageIdRef,
      activeConversationIdRef,
    ],
  );

  // Copy last assistant response to clipboard
  const copyLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content);
    }
  }, [messages]);

  // Cancel current AI message generation
  const handleCancelMessage = useCallback(() => {
    if (isConversationSwitching) return;

    const conversationId = activeConversationIdRef.current;
    if (isThinking && conversationId) {
      VSCodeMessages.cancelMessage(conversationId);
      setIsThinking(false);
    }
  }, [isThinking, isConversationSwitching, activeConversationIdRef, setIsThinking]);

  return { handleSend, triggerSend, handleCancelMessage, copyLastResponse };
}
