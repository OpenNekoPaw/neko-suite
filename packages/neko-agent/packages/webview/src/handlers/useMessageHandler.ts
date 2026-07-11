/**
 * useMessageHandler Hook
 *
 * Provides message handler registry and context creation.
 */

import { useMemo, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  createConfiguredRegistry,
  type MessageHandlerContext,
  type PendingForegroundConversationActivation,
  type QueuedMessageEditRequest,
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
  AgentQueuedMessageItem,
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
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';
import type { MediaModelSelection } from '@/hooks/useUIState';
import type { ConversationRenderCoordinator } from '@/render-lifecycle/conversation-render-coordinator';
import {
  commitConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';
import type { ExtensionToWebviewMessage } from './messages';
import { AgentHostMessages, getAgentHostRuntimeAdapter } from '@/messages';
import { readAgentTurnTimelineRecoveryRequests } from './timeline-recovery-state';
import {
  createConversationRenderRuntimeLifecycle,
  type ConversationRenderRuntimeLifecycle,
} from '@/render-lifecycle/conversation-render-runtime-lifecycle';
import {
  getAgentMarkdownSessionRegistry,
  type AgentMarkdownSessionPublication,
} from '@/markdown/agent-markdown-session-registry';

const logger = getLogger('MessageHandler');
const FOREIGN_FEATURE_HOST_MESSAGE_TYPES = new Set([
  'canvas.hostAppliedDocument',
  'document:load',
  'documentContext',
  'enginePort',
  'featureFlags:update',
  'project:init',
]);

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
  queuedMessages: readonly AgentQueuedMessageItem[];
  openTabs: OpenTab[];
  activeTabId: string | null;
  isTablessConversationViewRef: MutableRefObject<boolean>;
  pendingForegroundConversationActivationRef?: MutableRefObject<PendingForegroundConversationActivation | null>;
  completeForegroundConversationActivation?: (conversationId: string) => void;
  requestQueuedMessageEdit?: (request: QueuedMessageEditRequest) => void;
  requestConfigSnapshot?: () => void;

  // Refs
  activeConversationIdRef: MutableRefObject<string | null>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;
  conversationRenderCoordinator: ConversationRenderCoordinator;

  // State setters - Chat
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setQueuedMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setQueuedMessages: React.Dispatch<React.SetStateAction<readonly AgentQueuedMessageItem[]>>;

  // State setters - Conversation
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;

  // State setters - Tabs
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;

  // State setters - Settings
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot?: React.Dispatch<React.SetStateAction<boolean>>;
  selectedModelRef?: MutableRefObject<string>;
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
  setActivationProgressByConversation: React.Dispatch<
    React.SetStateAction<Map<string, readonly ActivationProgressTimeline[]>>
  >;

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
  flushTimelineRendering: () => void;
  commitTimelineMarkdownSnapshot: (
    timeline: ActiveTurnTimelineState,
  ) => AgentMarkdownSessionPublication;
  releaseTurnRendering: (conversationId: string, messageId: string) => void;
  disposeConversationRendering: (
    conversationId: string,
    reason: 'conversation-delete' | 'confirmed-empty-conversation',
  ) => void;
}

/**
 * Custom hook for message handling
 */
export function useMessageHandler(props: UseMessageHandlerProps): UseMessageHandlerReturn {
  const markdownSessionRegistry = getAgentMarkdownSessionRegistry();
  const renderRuntimeRef = useRef<ConversationRenderRuntimeLifecycle | null>(null);
  renderRuntimeRef.current ??= createConversationRenderRuntimeLifecycle({
    coordinator: props.conversationRenderCoordinator,
    markdown: markdownSessionRegistry,
  });
  const renderRuntime = renderRuntimeRef.current;
  const timelineRenderScheduler = renderRuntime.scheduler;
  useEffect(() => {
    renderRuntime.attachComponent();
    const handleVisibilityChange = (): void => {
      renderRuntime.setVisibility(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
    };
    const handlePageHide = (): void => renderRuntime.disposeRealm();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    for (const request of readAgentTurnTimelineRecoveryRequests(getAgentHostRuntimeAdapter())) {
      AgentHostMessages.requestAgentTurnTimelineSnapshot(request);
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      renderRuntime.detachComponent();
    };
  }, [renderRuntime]);

  const {
    messages,
    isThinking,
    activeConversationId,
    streamingMessageId,
    queuedMessageCount,
    queuedMessages,
    openTabs,
    activeTabId,
    isTablessConversationViewRef,
    pendingForegroundConversationActivationRef,
    completeForegroundConversationActivation,
    requestQueuedMessageEdit,
    requestConfigSnapshot,
    activeConversationIdRef,
    streamingMessageIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setQueuedMessageCount,
    setQueuedMessages,
    setConversations,
    setActiveConversationId,
    setOpenTabs,
    setActiveTabId,
    setActiveTab,
    setSettings,
    setHasConfigSnapshot,
    selectedModelRef,
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
    setActivationProgressByConversation,
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
        queuedMessages: [],
        activeTurnTimeline: null,
      };
      const updated = updater(currentMessages, currentStreaming);
      const snapshot = ingestConversationRenderSnapshot({
        coordinator: conversationRenderCoordinator,
        conversationId,
        messages: updated.messages,
        streaming: updated.streaming,
        kind: 'timeline-commit',
      });
      commitConversationSnapshotProjection({
        snapshot,
        conversationMessagesRef,
        conversationStreamingRef,
      });
      if (
        currentStreaming.streamingMessageId !== updated.streaming.streamingMessageId ||
        currentStreaming.isThinking !== updated.streaming.isThinking ||
        (currentStreaming.queuedMessageCount ?? 0) !== (updated.streaming.queuedMessageCount ?? 0)
      ) {
        forceContextUpdate();
      }
    },
    [
      conversationMessagesRef,
      conversationRenderCoordinator,
      conversationStreamingRef,
      forceContextUpdate,
    ],
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
      setQueuedMessages,
      streamingMessageId,
      queuedMessageCount,
      queuedMessages,
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
      setHasConfigSnapshot,
      selectedModelRef,
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
      setActivationProgressByConversation,
      updateSettings,
      setPromptModeForConversation,
      setShowOnboarding,
      setGlobalError,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceUpdate: forceContextUpdate,
      isCurrentConversation,
      updateNonCurrentConversation,
      timelineRenderScheduler,
      markdownSessionRegistry,
      conversationRenderCoordinator,
      releaseTurnRendering: renderRuntime.releaseTurn,
      disposeConversationRendering: renderRuntime.disposeConversation,
      pendingForegroundConversationActivationRef,
      completeForegroundConversationActivation,
      requestQueuedMessageEdit,
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
      queuedMessages,
      streamingMessageIdRef,
      setQueuedMessageCount,
      setQueuedMessages,
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
      setHasConfigSnapshot,
      selectedModelRef,
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
      setActivationProgressByConversation,
      updateSettings,
      setPromptModeForConversation,
      setShowOnboarding,
      setGlobalError,
      conversationTokenCountRef,
      conversationCompressingRef,
      forceContextUpdate,
      isCurrentConversation,
      updateNonCurrentConversation,
      timelineRenderScheduler,
      markdownSessionRegistry,
      conversationRenderCoordinator,
      renderRuntime,
      pendingForegroundConversationActivationRef,
      completeForegroundConversationActivation,
      requestQueuedMessageEdit,
    ],
  );

  // Message handler function
  const handleMessage = useCallback(
    (event: MessageEvent<ExtensionToWebviewMessage>): void => {
      const message = event.data;
      if (!message || !message.type) return;
      if (isForeignFeatureHostMessage(message)) return;

      const handled = registry.handle(message, context);
      if (!handled) {
        logger.warn(`Unknown message type: ${message.type}`);
      }
    },
    [registry, context],
  );

  const flushTimelineRendering = useCallback(() => {
    timelineRenderScheduler.flushAll();
  }, [timelineRenderScheduler]);

  const commitTimelineMarkdownSnapshot = useCallback(
    (timeline: ActiveTurnTimelineState): AgentMarkdownSessionPublication =>
      markdownSessionRegistry.commitTimelineSnapshot({
        conversationId: timeline.conversationId,
        messageId: timeline.messageId,
        items: timeline.items,
      }),
    [markdownSessionRegistry],
  );

  return {
    handleMessage,
    flushTimelineRendering,
    commitTimelineMarkdownSnapshot,
    releaseTurnRendering: renderRuntime.releaseTurn,
    disposeConversationRendering: renderRuntime.disposeConversation,
  };
}

function isForeignFeatureHostMessage(message: unknown): boolean {
  if (!isRecord(message)) {
    return false;
  }
  const type = message['type'];
  return (
    typeof type === 'string' &&
    (FOREIGN_FEATURE_HOST_MESSAGE_TYPES.has(type) || type.startsWith('media:response:'))
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
