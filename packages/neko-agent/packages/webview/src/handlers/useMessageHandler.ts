/**
 * useMessageHandler Hook
 *
 * Provides message handler registry and context creation.
 */

import { useMemo, useCallback, type MutableRefObject } from 'react';
import {
  createConfiguredRegistry,
  type MessageHandlerContext,
  type PendingForegroundConversationActivation,
  type StreamingState,
  type NonCurrentConversationUpdater,
} from '@/handlers';
import { getLogger } from '../utils/logger';
import type {
  Message,
  ConversationSummary,
  OpenTab,
  PromptMode,
  TabType,
  SettingsState,
  AgentState,
} from '@neko-agent/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { BoundActiveSkillIndicator } from './types';
import type { MediaModelSelection } from '@/hooks/useUIState';
import type { ExtensionToWebviewMessage } from './messages';

const logger = getLogger('MessageHandler');

/**
 * Props for useMessageHandler hook
 */
export interface UseMessageHandlerProps {
  // Current state values
  messages: Message[];
  isThinking: boolean;
  activeConversationId: string | null;
  streamingMessageId: string | null;
  queuedMessageCount: number;
  openTabs: OpenTab[];
  activeTabId: string | null;
  isTablessConversationViewRef: MutableRefObject<boolean>;
  pendingForegroundConversationActivationRef?: MutableRefObject<PendingForegroundConversationActivation | null>;
  completeForegroundConversationActivation?: (conversationId: string) => void;
  requestConfigSnapshot?: () => void;

  // Refs
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;

  // State setters - Chat
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setQueuedMessageCount: React.Dispatch<React.SetStateAction<number>>;

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
  setMediaModelSelection: React.Dispatch<React.SetStateAction<MediaModelSelection>>;

  // State setters - Work items
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;

  // State setters - Project
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  mentionSearchFilter: string;
  mentionSearchFilterRef?: MutableRefObject<string>;
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;

  // State setters - Agent state
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  // Force re-render when agent state changes (for useMemo recalculation)
  forceAgentStateUpdate: () => void;

  // State setters - Skills
  setSkills: React.Dispatch<React.SetStateAction<SkillSummary[]>>;
  setActiveSkill: React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>;

  // State setters - SSO/Onboarding
  updateSettings: (partial: Partial<SettingsState>) => void;
  setPromptModeForConversation: (conversationId: string, mode: PromptMode) => void;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  setGlobalError: React.Dispatch<React.SetStateAction<string | null>>;

  // Refs - Context management
  conversationTokenCountRef: MutableRefObject<Map<string, number>>;
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  forceContextUpdate: () => void;
}

/**
 * Hook return type
 */
export interface UseMessageHandlerReturn {
  handleMessage: (event: MessageEvent<ExtensionToWebviewMessage>) => void;
}

/**
 * Custom hook for message handling
 */
export function useMessageHandler(props: UseMessageHandlerProps): UseMessageHandlerReturn {
  const {
    messages,
    isThinking,
    activeConversationId,
    streamingMessageId,
    queuedMessageCount,
    openTabs,
    activeTabId,
    isTablessConversationViewRef,
    pendingForegroundConversationActivationRef,
    completeForegroundConversationActivation,
    requestConfigSnapshot,
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setQueuedMessageCount,
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    setActiveTab,
    setSettings,
    setSelectedModel,
    setMediaModelSelection,
    setWorkItemsByConversation,

    setProjectFiles,
    mentionSearchFilter,
    mentionSearchFilterRef,
    setMentionItems,
    setPluginCommands,
    setPluginsAvailable,
    setAgentState,
    conversationAgentStateRef,
    forceAgentStateUpdate,
    setSkills,
    setActiveSkill,
    updateSettings,
    setPromptModeForConversation,
    setShowOnboarding,
    setGlobalError,
    conversationTokenCountRef,
    conversationCompressingRef,
    forceContextUpdate,
  } = props;

  // Create registry once
  const registry = useMemo(() => createConfiguredRegistry(), []);

  // Helper: check if message is for current conversation
  const isCurrentConversation = useCallback(
    (conversationId?: string): boolean => {
      if (!conversationId) return false;
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
        queuedMessageCount: 0,
      };
      const updated = updater(currentMessages, currentStreaming);
      conversationMessagesRef.current.set(conversationId, updated.messages);
      conversationStreamingRef.current.set(conversationId, updated.streaming);
      if (
        currentStreaming.streamingMessageId !== updated.streaming.streamingMessageId ||
        currentStreaming.isThinking !== updated.streaming.isThinking ||
        (currentStreaming.queuedMessageCount ?? 0) !== (updated.streaming.queuedMessageCount ?? 0)
      ) {
        forceContextUpdate();
      }
    },
    [conversationMessagesRef, conversationStreamingRef, forceContextUpdate],
  );

  // Create context object
  const context = useMemo<MessageHandlerContext>(
    () => ({
      activeConversationId,
      activeConversationIdRef,
      conversationMessagesRef,
      conversationStreamingRef,
      messages,
      setMessages,
      isThinking,
      setIsThinking,
      setStreamingMessageId,
      setQueuedMessageCount,
      streamingMessageId,
      queuedMessageCount,
      streamingMessageIdRef,
      setConversations,
      setActiveConversationId,
      openTabs,
      activeTabId,
      isTablessConversationViewRef,
      requestConfigSnapshot,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      setSettings,
      setSelectedModel,
      setMediaModelSelection,
      setWorkItemsByConversation,

      setProjectFiles,
      mentionSearchFilter,
      mentionSearchFilterRef,
      setMentionItems,
      setPluginCommands,
      setPluginsAvailable,
      setAgentState,
      conversationAgentStateRef,
      forceAgentStateUpdate,
      setSkills,
      setActiveSkill,
      updateSettings,
      setPromptModeForConversation,
      setShowOnboarding,
      setGlobalError,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceUpdate: forceContextUpdate,
      isCurrentConversation,
      updateNonCurrentConversation,
      pendingForegroundConversationActivationRef,
      completeForegroundConversationActivation,
    }),
    [
      activeConversationId,
      activeConversationIdRef,
      conversationMessagesRef,
      conversationStreamingRef,
      messages,
      setMessages,
      isThinking,
      setIsThinking,
      setStreamingMessageId,
      streamingMessageId,
      queuedMessageCount,
      streamingMessageIdRef,
      setQueuedMessageCount,
      setConversations,
      setActiveConversationId,
      openTabs,
      activeTabId,
      isTablessConversationViewRef,
      requestConfigSnapshot,
      setOpenTabs,
      setActiveTabId,
      setActiveTab,
      setSettings,
      setSelectedModel,
      setMediaModelSelection,
      setWorkItemsByConversation,

      setProjectFiles,
      mentionSearchFilter,
      mentionSearchFilterRef,
      setMentionItems,
      setPluginCommands,
      setPluginsAvailable,
      setAgentState,
      conversationAgentStateRef,
      forceAgentStateUpdate,
      setSkills,
      setActiveSkill,
      updateSettings,
      setPromptModeForConversation,
      setShowOnboarding,
      setGlobalError,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceContextUpdate,
      isCurrentConversation,
      updateNonCurrentConversation,
      pendingForegroundConversationActivationRef,
      completeForegroundConversationActivation,
    ],
  );

  // Message handler function
  const handleMessage = useCallback(
    (event: MessageEvent<ExtensionToWebviewMessage>): void => {
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
