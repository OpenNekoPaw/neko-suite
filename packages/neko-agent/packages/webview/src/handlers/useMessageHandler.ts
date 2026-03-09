/**
 * useMessageHandler Hook
 *
 * Provides message handler registry and context creation.
 */

import { useMemo, useCallback, type MutableRefObject } from 'react';
import {
  createConfiguredRegistry,
  type MessageHandlerContext,
  type StreamingState,
  type NonCurrentConversationUpdater,
} from '@/handlers';
import { getLogger } from '../utils/logger';

const logger = getLogger('MessageHandler');
import type {
  Message,
  ConversationSummary,
  OpenTab,
  TabType,
  SettingsState,
  AgentState,
} from '@/components/types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type { SkillSummary } from '@/components/ChatView/InputArea/types';
import type { BoundSkillConfirmRequest, BoundActiveSkillIndicator } from './types';

/**
 * Props for useMessageHandler hook
 */
export interface UseMessageHandlerProps {
  // Current state values
  activeConversationId: string | null;
  streamingMessageId: string | null;
  openTabs: OpenTab[];

  // Refs
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;

  // State setters - Chat
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;

  // State setters - Conversation
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;

  // State setters - Tabs
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;

  // State setters - Settings
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;

  // State setters - Tasks
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>;

  // State setters - Model Presets (kept for backward compatibility; no-op in current UI)
  setModelPresets: React.Dispatch<React.SetStateAction<unknown[]>>;

  // State setters - Project
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;

  // State setters - Agent state
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  // Force re-render when agent state changes (for useMemo recalculation)
  forceAgentStateUpdate: () => void;

  // State setters - Skills
  setSkills: React.Dispatch<React.SetStateAction<SkillSummary[]>>;
  setPendingSkillConfirm: React.Dispatch<React.SetStateAction<BoundSkillConfirmRequest | null>>;
  setActiveSkill: React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>;

  // State setters - SSO/Onboarding
  updateSettings: (partial: Partial<SettingsState>) => void;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;

  // Refs - Context management
  conversationTokenCountRef: MutableRefObject<Map<string, number>>;
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  forceContextUpdate: () => void;
}

/**
 * Hook return type
 */
export interface UseMessageHandlerReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleMessage: (event: MessageEvent<any>) => void;
}

/**
 * Custom hook for message handling
 */
export function useMessageHandler(props: UseMessageHandlerProps): UseMessageHandlerReturn {
  const {
    activeConversationId,
    streamingMessageId,
    openTabs,
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    setActiveTab,
    setSettings,
    setSelectedModel,
    setBackgroundTasks,
    setModelPresets,
    setProjectFiles,
    setAgentState,
    conversationAgentStateRef,
    forceAgentStateUpdate,
    setSkills,
    setPendingSkillConfirm,
    setActiveSkill,
    updateSettings,
    setShowOnboarding,
    conversationTokenCountRef,
    conversationCompressingRef,
    forceContextUpdate,
  } = props;

  // Create registry once
  const registry = useMemo(() => createConfiguredRegistry(), []);

  // Helper: check if message is for current conversation
  const isCurrentConversation = useCallback(
    (conversationId?: string): boolean => {
      if (!conversationId) return true;
      return conversationId === activeConversationIdRef.current;
    },
    [activeConversationIdRef],
  );

  // Helper: update non-current conversation state
  const updateNonCurrentConversation = useCallback(
    (conversationId: string, updater: NonCurrentConversationUpdater): void => {
      const currentMessages = conversationMessagesRef.current.get(conversationId) || [];
      const currentStreaming = conversationStreamingRef.current.get(conversationId) || {
        streamingMessageId: null,
        isThinking: false,
      };
      const updated = updater(currentMessages, currentStreaming);
      conversationMessagesRef.current.set(conversationId, updated.messages);
      conversationStreamingRef.current.set(conversationId, updated.streaming);
    },
    [conversationMessagesRef, conversationStreamingRef],
  );

  // Create context object
  const context = useMemo<MessageHandlerContext>(
    () => ({
      activeConversationId,
      activeConversationIdRef,
      conversationMessagesRef,
      conversationStreamingRef,
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      streamingMessageId,
      streamingMessageIdRef,
      setConversations,
      setActiveConversationId,
      openTabs,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      setSettings,
      setSelectedModel,
      setBackgroundTasks,
      setModelPresets,
      setProjectFiles,
      setAgentState,
      conversationAgentStateRef,
      forceAgentStateUpdate,
      setSkills,
      setPendingSkillConfirm,
      setActiveSkill,
      updateSettings,
      setShowOnboarding,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceUpdate: forceContextUpdate,
      isCurrentConversation,
      updateNonCurrentConversation,
    }),
    [
      activeConversationId,
      activeConversationIdRef,
      conversationMessagesRef,
      conversationStreamingRef,
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      streamingMessageId,
      streamingMessageIdRef,
      setConversations,
      setActiveConversationId,
      openTabs,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      setSettings,
      setSelectedModel,
      setBackgroundTasks,
      setModelPresets,
      setProjectFiles,
      setAgentState,
      conversationAgentStateRef,
      forceAgentStateUpdate,
      setSkills,
      setPendingSkillConfirm,
      setActiveSkill,
      updateSettings,
      setShowOnboarding,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceContextUpdate,
      isCurrentConversation,
      updateNonCurrentConversation,
    ],
  );

  // Message handler function
  const handleMessage = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: MessageEvent<any>): void => {
      const message = event.data;
      if (!message || !message.type) return;

      const handled = registry.handle(message, context);
      if (!handled) {
        logger.warn(`Unknown message type: ${message.type}`);
      }
    },
    [registry, context],
  );

  return { handleMessage };
}
