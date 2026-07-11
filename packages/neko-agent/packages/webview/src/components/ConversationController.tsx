/**
 * ConversationController — Session orchestration layer.
 *
 * Responsibilities:
 *   - Conversation state (messages, tabs, active conversation)
 *   - Per-conversation ref Maps (tokenCount, compressing, agentState, mediaCallCount)
 *   - Message handler registration and event listener
 *   - Tab and conversation CRUD callbacks
 *   - Context chips and ambient nodes
 *   - Skills state
 *   - Delegates view composition to ChatWorkspace
 *
 * Extracted from the former 589-line AIAssistant component (ADR P0.1).
 */

import { type ReactNode, useEffect, useCallback, useMemo, useState, useRef } from 'react';
import type { AgentContextPayload } from '@neko/shared';
import type { ConversationLifecycleAction } from '@neko/shared/types/creative-ai-invocation';
import {
  NEKO_AGENT_HOST_MESSAGE_EVENT,
  type ExtensionToWebviewMessage,
  SettingsState,
  AgentState,
  AgentQueuedMessageItem,
  Message,
  OpenTab,
  PromptMode,
  SessionMode,
  TabType,
} from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import type {
  SkillSummary,
  EntryPromptMenu,
  MentionItem,
  PluginSlashCommandDef,
  GenCategory,
  GenerationParams,
} from '@/components/ChatView/InputArea/types';
import { EmptyState, type EmptyStateEntryAction } from '@/components/ChatView/EmptyState';
import { InputArea } from '@/components/ChatView/InputArea';
import { InputAreaProvider, type MediaCategory } from '@/components/ChatView/InputAreaContext';
import { useTranslation } from '@/i18n/I18nContext';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import { removeConversationWorkItems } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type { MediaModelSelection } from '@/hooks/useUIState';
import { useConversationState, useTabManager, type PendingSendInput } from '@/hooks';
import {
  useMessageHandler,
  type BoundActiveSkillIndicator,
  type PendingForegroundConversationActivation,
} from '@/handlers';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import { shouldActivateForegroundConversation } from '@/handlers/foreground-activation';
import { ChatWorkspace } from './ChatWorkspace';
import { isCharacterRoleConversationKind } from '@/presenters/character-role-session-presenter';
import { projectConversationTabActivation } from '@/presenters/conversation-tab-activation-presenter';
import {
  commitConversationRenderActivation,
  commitLegacyConversationCache,
  createConversationMarkdownTimelineResourceOwner,
  createConversationVisibleStatePort,
  ingestLegacyConversationRenderSnapshot,
} from '@/render-lifecycle/legacy-conversation-render-adapter';
import type { ConversationActivationSource } from '@/render-lifecycle/conversation-render-contract';
import {
  applyUserMessageToConversationSummaries,
  applyUserMessageToOpenTabs,
  projectDisplayTabs,
  type DisplayTab,
} from '@/presenters/tab-display-presenter';
import {
  projectHistoryCleanup,
  projectHistoryConversationItems,
  type HistoryConversationItem,
} from '@/presenters/history-menu-presenter';
import { projectOptimisticQueuedMessageItem } from '@/presenters/message-queue-presenter';
import {
  projectChatWorkspaceModelState,
  projectMediaModelSelectionForSessionModeChange,
} from '@/presenters/config-message-presenter';
import {
  type ConversationAmbientNode,
  projectConversationSessionActiveSkillMap,
  projectConversationSessionState,
} from '@/presenters/conversation-session-state-presenter';
import { DEFAULT_GENERATION_PARAMS } from '@/components/ChatView/InputArea/types';

// =============================================================================
// Props
// =============================================================================

interface HeaderRenderProps {
  tabs: DisplayTab[];
  activeTabId: string | null;
  activeView: TabType;
  historyConversations: HistoryConversationItem[];
  activeConversationId: string | null;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onConversationLifecycleAction: (
    conversationId: string,
    action: ConversationLifecycleAction,
  ) => void;
  onClearClosedConversations: () => void;
  clearableConversationCount: number;
  protectedConversationCount: number;
}

export interface ConversationControllerProps {
  // From AppShell (config + resource state)
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setHasConfigSnapshot: React.Dispatch<React.SetStateAction<boolean>>;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  mentionItems: MentionItem[];
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  mentionSearchFilter: string;
  setMentionSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  pluginCommands: PluginSlashCommandDef[];
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  updateSettings: (partial: Partial<SettingsState>) => void;
  workItemsByConversation: AgentWorkItemStore;
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;
  pluginsAvailable: PluginsAvailable;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  renderHeader: (props: HeaderRenderProps) => ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function ConversationController({
  settings,
  setSettings,
  setHasConfigSnapshot,
  setProjectFiles,
  mentionItems,
  setMentionItems,
  mentionSearchFilter,
  setMentionSearchFilter,
  pluginCommands,
  setPluginCommands,
  updateSettings,
  workItemsByConversation,
  setWorkItemsByConversation,
  pluginsAvailable,
  setPluginsAvailable,
  setShowOnboarding,
  renderHeader,
}: ConversationControllerProps) {
  const { t } = useTranslation();
  // ---- Conversation state ----
  const conversation = useConversationState();
  const {
    messages,
    setMessages,
    isThinking,
    setIsThinking,
    streamingMessageId,
    setStreamingMessageId,
    queuedMessageCount,
    setQueuedMessageCount,
    queuedMessages,
    setQueuedMessages,
    streamingMessageIdRef,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationRenderCoordinator,
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    clearMessages,
  } = conversation;

  // ---- UI state for active tab ----
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const activeTabConversationId = activeTabId
    ? (openTabs.find((tab) => tab.id === activeTabId)?.conversationId ?? null)
    : null;
  const activeOpenTab = activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
  const visibleConversationId = activeTabId ? activeTabConversationId : activeConversationId;

  // Model selection state — owned here so the settingsData handler can hydrate
  // it on reload. Passed down to ChatWorkspace which reads it for send().
  const [selectedModel, setSelectedModel] = useState('');
  const selectedModelRef = useRef('');
  const [mediaModelSelection, setMediaModelSelection] = useState<MediaModelSelection>({
    image: 'none',
    video: 'none',
    audio: 'none',
  });
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [entryAction, setEntryAction] = useState<EmptyStateEntryAction>('start-chat');
  const [entryInputValue, setEntryInputValue] = useState('');
  const entryInputValueRef = useRef('');
  const [entrySessionMode, setEntrySessionMode] = useState<SessionMode>('agent');
  const [entryGenCategory, setEntryGenCategory] = useState<GenCategory>('image');
  const [entryGenParams, setEntryGenParams] = useState<GenerationParams>(DEFAULT_GENERATION_PARAMS);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  // ---- Per-conversation ref Maps ----
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  const conversationMediaCallCountRef = useRef<Map<string, number>>(new Map());
  const [projectionVersion, forceUpdate] = useState(0);

  // Prompt mode is session state, not global settings: each tab/conversation can plan independently.
  const [promptModeByConversation, setPromptModeByConversation] = useState<Map<string, PromptMode>>(
    () => new Map(),
  );
  const mentionSearchFilterRef = useRef(mentionSearchFilter);
  useEffect(() => {
    mentionSearchFilterRef.current = mentionSearchFilter;
  }, [mentionSearchFilter]);
  const updateMentionSearchFilter = useCallback(
    (filter: string) => {
      mentionSearchFilterRef.current = filter;
      setMentionSearchFilter(filter);
    },
    [setMentionSearchFilter],
  );
  const updateEntryInputValue = useCallback((value: string) => {
    entryInputValueRef.current = value;
    setEntryInputValue(value);
  }, []);
  const setPromptModeForConversation = useCallback((conversationId: string, mode: PromptMode) => {
    setPromptModeByConversation((prev) => {
      const next = new Map(prev);
      next.set(conversationId, mode);
      return next;
    });
  }, []);

  // ---- Skills state ----
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [activeSkillByConversation, setActiveSkillByConversation] = useState<
    Map<string, BoundActiveSkillIndicator>
  >(() => new Map());
  const [activationProgressByConversation, setActivationProgressByConversation] = useState<
    Map<string, readonly ActivationProgressTimeline[]>
  >(() => new Map());
  const setActiveSkill = useCallback<
    React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>
  >(
    (value) => {
      setActiveSkillByConversation((prev) => {
        return projectConversationSessionActiveSkillMap({
          activeSkillByConversation: prev,
          visibleConversationId,
          value,
        });
      });
    },
    [visibleConversationId],
  );

  // ---- Agent state ----
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  const forceAgentStateUpdate = useCallback(() => forceUpdate((n) => n + 1), []);
  const isTablessConversationViewRef = useRef(false);
  const pendingForegroundConversationActivationRef =
    useRef<PendingForegroundConversationActivation | null>(null);
  const [isForegroundConversationActivationPending, setIsForegroundConversationActivationPending] =
    useState(false);
  const nextPendingSendRequestIdRef = useRef(0);
  const [pendingSendRequest, setPendingSendRequest] = useState<{
    id: number;
    input: PendingSendInput;
  } | null>(null);
  const nextEntryPromptMenuRequestIdRef = useRef(0);
  const [initialEntryPromptMenuRequest, setInitialEntryPromptMenuRequest] = useState<{
    id: number;
    menu: EntryPromptMenu;
  } | null>(null);
  const nextInitialInputRequestIdRef = useRef(0);
  const [initialInputRequest, setInitialInputRequest] = useState<{
    id: number;
    messageText: string;
  } | null>(null);
  const [entryPromptMenu, setEntryPromptMenu] = useState<EntryPromptMenu | null>(null);
  const nextQueuedEditRequestIdRef = useRef(0);
  const [queuedEditRequest, setQueuedEditRequest] = useState<{
    id: number;
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null>(null);

  // ---- Context chips & ambient nodes ----
  const [contextChipsByConversation, setContextChipsByConversation] = useState<
    Map<string, AgentContextPayload[]>
  >(() => new Map());
  const [ambientNodesByConversation, setAmbientNodesByConversation] = useState<
    Map<string, ConversationAmbientNode[]>
  >(() => new Map());

  const setContextChipsForConversation = useCallback(
    (
      conversationId: string,
      value: AgentContextPayload[] | ((current: AgentContextPayload[]) => AgentContextPayload[]),
    ) => {
      setContextChipsByConversation((prev) => {
        const current = prev.get(conversationId) ?? [];
        const nextValue = typeof value === 'function' ? value(current) : value;
        const next = new Map(prev);
        if (nextValue.length === 0) {
          next.delete(conversationId);
        } else {
          next.set(conversationId, nextValue);
        }
        return next;
      });
    },
    [],
  );
  const handleRemoveContextChip = useCallback(
    (id: string) => {
      if (!visibleConversationId) return;
      setContextChipsForConversation(visibleConversationId, (prev) =>
        prev.filter((c) => c.id !== id),
      );
    },
    [setContextChipsForConversation, visibleConversationId],
  );
  const handleAddContextChip = useCallback(
    (payload: AgentContextPayload) => {
      if (!visibleConversationId) return;
      setContextChipsForConversation(visibleConversationId, (prev) => {
        if (prev.some((c) => c.id === payload.id)) return prev;
        return [...prev, payload];
      });
    },
    [setContextChipsForConversation, visibleConversationId],
  );
  const handleInjectContextChip = useCallback(
    (payload: AgentContextPayload, conversationId?: string | null) => {
      const targetConversationId = conversationId ?? visibleConversationId;
      if (!targetConversationId) return;
      setContextChipsForConversation(targetConversationId, (prev) => {
        if (prev.some((c) => c.id === payload.id)) return prev;
        return [...prev, payload];
      });
    },
    [setContextChipsForConversation, visibleConversationId],
  );
  const setAmbientNodesForVisibleConversation = useCallback<
    React.Dispatch<React.SetStateAction<ConversationAmbientNode[]>>
  >(
    (value) => {
      if (!visibleConversationId) return;
      setAmbientNodesByConversation((prev) => {
        const current = prev.get(visibleConversationId) ?? [];
        const nextValue = typeof value === 'function' ? value(current) : value;
        const next = new Map(prev);
        if (nextValue.length === 0) {
          next.delete(visibleConversationId);
        } else {
          next.set(visibleConversationId, [...nextValue]);
        }
        return next;
      });
    },
    [visibleConversationId],
  );

  // Session-bound cleanup ref — ChatWorkspace registers its useConversationSession cleanup
  // callbacks here so ConversationController can invoke them when deleting conversations.
  const sessionCleanupRef = useRef<{
    cleanupConversation: (id: string) => void;
    cleanupAllConversations: () => void;
  } | null>(null);

  const cleanupConversation = useCallback(
    (conversationId: string) => {
      // Delegate to ChatWorkspace's useConversationSession (cleans input/attachment caches)
      sessionCleanupRef.current?.cleanupConversation(conversationId);
      // Also clean shared refs not covered by useConversationSession
      conversationTokenCountRef.current.delete(conversationId);
      conversationCompressingRef.current.delete(conversationId);
      conversationMediaCallCountRef.current.delete(conversationId);
      setWorkItemsByConversation((prev) => removeConversationWorkItems(prev, conversationId));
      setContextChipsByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
      setActiveSkillByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
      setActivationProgressByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
      setAmbientNodesByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
      setPromptModeByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
    },
    [setWorkItemsByConversation],
  );

  // ---- Derived state for visible conversation ----
  const visibleSessionState = useMemo(() => {
    const conversationId = visibleConversationId ?? '';
    const messagesByConversation = new Map(conversationMessagesRef.current);
    const streamingByConversation = new Map(conversationStreamingRef.current);

    if (activeConversationId) {
      messagesByConversation.set(activeConversationId, messages);
      streamingByConversation.set(activeConversationId, {
        ...(streamingByConversation.get(activeConversationId) ?? {}),
        streamingMessageId,
        isThinking,
        queuedMessageCount,
        queuedMessages,
      });
    }

    return projectConversationSessionState({
      conversationId,
      messagesByConversation,
      streamingByConversation,
      promptModeByConversation,
      activeSkillByConversation,
      activationProgressByConversation,
      contextChipsByConversation,
      ambientNodesByConversation,
      tokenCountByConversation: conversationTokenCountRef.current,
      compressingByConversation: conversationCompressingRef.current,
      agentStateByConversation: conversationAgentStateRef.current,
      workItemsByConversation,
      defaultPromptMode: settings.promptMode,
    });
  }, [
    activeConversationId,
    activeSkillByConversation,
    activationProgressByConversation,
    ambientNodesByConversation,
    contextChipsByConversation,
    conversationMessagesRef,
    conversationStreamingRef,
    isThinking,
    messages,
    promptModeByConversation,
    projectionVersion,
    queuedMessageCount,
    queuedMessages,
    settings.promptMode,
    streamingMessageId,
    visibleConversationId,
    workItemsByConversation,
  ]);
  const contextTokenCount = visibleSessionState.context.tokenCount;
  const isCompressing = visibleSessionState.context.isCompressing;
  const mediaModelCallCount = visibleConversationId
    ? (conversationMediaCallCountRef.current.get(visibleConversationId) ?? 0)
    : 0;
  const workItems = [...visibleSessionState.workItems];
  const activeSkill = visibleSessionState.skill.activeSkill;
  const activationProgress = visibleSessionState.skill.activationProgress;
  const contextChips = [...visibleSessionState.context.chips];
  const ambientNodes = [...visibleSessionState.context.ambientNodes];
  const visibleAgentState =
    visibleSessionState.agentState ??
    (visibleConversationId === activeConversationId ? agentState : null);
  const activePromptMode = visibleSessionState.promptMode;
  const activeSettings = useMemo<SettingsState>(
    () => ({ ...settings, promptMode: activePromptMode }),
    [settings, activePromptMode],
  );
  const entryModelState = useMemo(
    () =>
      projectChatWorkspaceModelState({
        chatModelOptions: activeSettings.chatModelOptions,
        selectedModel,
        defaultMaxOutputTokens: activeSettings.maxTokens,
        sessionMode: entrySessionMode,
        mediaModelSelection,
      }),
    [
      activeSettings.chatModelOptions,
      activeSettings.maxTokens,
      entrySessionMode,
      mediaModelSelection,
      selectedModel,
    ],
  );
  const updateActiveSettings = useCallback(
    (partial: Partial<SettingsState>) => {
      const { promptMode, ...globalSettings } = partial;
      if (promptMode && visibleConversationId) {
        setPromptModeForConversation(visibleConversationId, promptMode);
      }
      if (Object.keys(globalSettings).length > 0) {
        updateSettings(globalSettings);
      }
    },
    [setPromptModeForConversation, updateSettings, visibleConversationId],
  );
  const handleModelSelect = useCallback(
    (modelId: string) => {
      const selectedOption = activeSettings.chatModelOptions.find(
        (option) => option.id === modelId,
      );
      if (!selectedOption?.providerId || !selectedOption.modelId) return;

      selectedModelRef.current = modelId;
      setSelectedModel(modelId);
      const selectedProviderId = selectedOption.providerId;
      const selectedModelId = selectedOption.modelId;

      updateSettings({
        selectedProviderId,
        selectedModelId,
      });
      AgentHostMessages.updateSettings({
        providerId: selectedProviderId,
        modelId: selectedModelId,
      });
    },
    [activeSettings.chatModelOptions, updateSettings],
  );
  const conversationKind = activeOpenTab?.kind ?? 'chat';
  const embodyCharacterSession = activeOpenTab?.embodyCharacterSession;

  const triggerForceUpdate = useCallback(() => forceUpdate((n) => n + 1), []);
  const requestConfigSnapshot = useCallback(() => {
    AgentHostMessages.refreshConfigSnapshot();
  }, []);
  const requestConversationResourceSnapshot = useCallback((conversationId: string) => {
    AgentHostMessages.getContextTokenCount(conversationId);
    AgentHostMessages.getTasks(conversationId);
    AgentHostMessages.getPromptMode(conversationId);
    AgentHostMessages.getMessageQueue(conversationId);
  }, []);

  const handleUserMessageSent = useCallback(
    (event: { conversationId: string; message: Message }) => {
      const optimisticQueuedItem = projectOptimisticQueuedMessageItem(event);
      const cachedMessages =
        conversationMessagesRef.current.get(event.conversationId) ??
        (event.conversationId === activeConversationIdRef.current ? messages : []);
      const nextMessages = cachedMessages.some((message) => message.id === event.message.id)
        ? cachedMessages
        : optimisticQueuedItem
          ? cachedMessages
          : [...cachedMessages, event.message];

      const currentStreaming = conversationStreamingRef.current.get(event.conversationId);
      const nextQueuedMessages =
        currentStreaming?.queuedMessages && currentStreaming.queuedMessages.length > 0
          ? currentStreaming.queuedMessages
          : optimisticQueuedItem
            ? [optimisticQueuedItem]
            : queuedMessages;
      const snapshot = ingestLegacyConversationRenderSnapshot({
        coordinator: conversationRenderCoordinator,
        conversationId: event.conversationId,
        messages: nextMessages,
        streaming: {
          ...(currentStreaming ?? {}),
          streamingMessageId: event.message.isQueued
            ? (currentStreaming?.streamingMessageId ?? streamingMessageIdRef.current)
            : null,
          isThinking: true,
          queuedMessageCount:
            currentStreaming?.queuedMessageCount ?? (optimisticQueuedItem ? 1 : 0),
          queuedMessages: nextQueuedMessages,
          messageQueueVersion: currentStreaming?.messageQueueVersion,
        },
      });
      commitLegacyConversationCache({
        snapshot,
        conversationMessagesRef,
        conversationStreamingRef,
      });
      if (event.conversationId === activeConversationIdRef.current && optimisticQueuedItem) {
        setQueuedMessageCount((currentCount) => Math.max(currentCount, nextQueuedMessages.length));
        setQueuedMessages(nextQueuedMessages);
      }

      if (!optimisticQueuedItem) {
        setOpenTabs((prev) =>
          applyUserMessageToOpenTabs({
            openTabs: prev,
            conversationId: event.conversationId,
            messageContent: event.message.content,
          }),
        );
        setConversations((prev) =>
          applyUserMessageToConversationSummaries({
            conversations: prev,
            conversationId: event.conversationId,
            messageContent: event.message.content,
            timestamp: event.message.timestamp,
          }),
        );
      }
      triggerForceUpdate();
    },
    [
      activeConversationIdRef,
      conversationMessagesRef,
      conversationRenderCoordinator,
      conversationStreamingRef,
      messages,
      queuedMessages,
      setConversations,
      setQueuedMessageCount,
      setQueuedMessages,
      setOpenTabs,
      triggerForceUpdate,
    ],
  );

  const persistCurrentVisibleConversation = useCallback(() => {
    const conversationId = visibleConversationId;
    if (!conversationId) return;
    conversationMessagesRef.current.set(conversationId, messages);
    const currentStreaming = conversationStreamingRef.current.get(conversationId);
    conversationStreamingRef.current.set(conversationId, {
      ...(currentStreaming ?? {}),
      streamingMessageId: streamingMessageIdRef.current,
      isThinking,
      queuedMessageCount,
      queuedMessages,
    });
  }, [
    conversationMessagesRef,
    conversationStreamingRef,
    isThinking,
    queuedMessageCount,
    queuedMessages,
    messages,
    streamingMessageIdRef,
    visibleConversationId,
  ]);

  const clearVisibleConversationMessages = useCallback(() => {
    const conversationId = visibleConversationId;
    if (!conversationId) {
      clearMessages();
      return;
    }

    conversationMessagesRef.current.delete(conversationId);
    conversationStreamingRef.current.delete(conversationId);
    if (conversationId === activeConversationIdRef.current) {
      setMessages([]);
      setStreamingMessageId(null);
      streamingMessageIdRef.current = null;
      setIsThinking(false);
      setQueuedMessageCount(0);
      setQueuedMessages([]);
    }
  }, [
    activeConversationIdRef,
    clearMessages,
    conversationMessagesRef,
    conversationStreamingRef,
    setIsThinking,
    setMessages,
    setQueuedMessageCount,
    setQueuedMessages,
    setStreamingMessageId,
    streamingMessageIdRef,
    visibleConversationId,
  ]);

  const beginForegroundConversationActivation = useCallback(() => {
    const previousConversationIds = new Set<string>();
    for (const conversation of conversations) {
      previousConversationIds.add(conversation.id);
    }
    for (const tab of openTabs) {
      previousConversationIds.add(tab.conversationId);
    }
    if (activeConversationId) {
      previousConversationIds.add(activeConversationId);
    }
    if (activeTabConversationId) {
      previousConversationIds.add(activeTabConversationId);
    }
    if (activeConversationIdRef.current) {
      previousConversationIds.add(activeConversationIdRef.current);
    }

    pendingForegroundConversationActivationRef.current = {
      reason: 'new-conversation',
      previousConversationIds: [...previousConversationIds],
    };
    setIsForegroundConversationActivationPending(true);
  }, [
    activeConversationId,
    activeConversationIdRef,
    activeTabConversationId,
    conversations,
    openTabs,
  ]);

  const completeForegroundConversationActivation = useCallback((conversationId: string) => {
    const pending = pendingForegroundConversationActivationRef.current;
    if (!shouldActivateForegroundConversation(pending, conversationId)) {
      return;
    }
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
  }, []);

  // ---- Message handler ----
  const { handleMessage, flushTimelineRendering, commitTimelineMarkdownSnapshot } =
    useMessageHandler({
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
      requestQueuedMessageEdit: (request) => {
        nextQueuedEditRequestIdRef.current += 1;
        setQueuedEditRequest({
          id: nextQueuedEditRequestIdRef.current,
          conversationId: request.conversationId,
          item: request.item,
        });
      },
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
      setPluginsAvailable,
      setProjectFiles,
      setMentionItems,
      mentionSearchFilter,
      mentionSearchFilterRef,
      setPluginCommands,
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
      forceContextUpdate: triggerForceUpdate,
    });

  const commitConversationTabActivation = useCallback(
    (conversationId: string, source: ConversationActivationSource) => {
      const projection = projectConversationTabActivation({
        conversationId,
        cachedMessages: conversationMessagesRef.current.get(conversationId),
        cachedStreaming: conversationStreamingRef.current.get(conversationId),
      });
      commitConversationRenderActivation({
        coordinator: conversationRenderCoordinator,
        source,
        projection,
        visibleState: createConversationVisibleStatePort({
          activeConversationIdRef,
          streamingMessageIdRef,
          conversationMessagesRef,
          conversationStreamingRef,
          setMessages,
          setStreamingMessageId,
          setIsThinking,
          setQueuedMessageCount,
          setQueuedMessages,
          setActiveConversationId,
        }),
        markdown: createConversationMarkdownTimelineResourceOwner(commitTimelineMarkdownSnapshot),
      });
    },
    [
      activeConversationIdRef,
      commitTimelineMarkdownSnapshot,
      conversationMessagesRef,
      conversationRenderCoordinator,
      conversationStreamingRef,
      setActiveConversationId,
      setIsThinking,
      setMessages,
      setQueuedMessageCount,
      setQueuedMessages,
      setStreamingMessageId,
      streamingMessageIdRef,
    ],
  );

  const activateCharacterRoleTab = useCallback(
    (tab: OpenTab) => {
      commitConversationTabActivation(tab.conversationId, 'character-role-tab');
      setActiveTab('chat');
    },
    [commitConversationTabActivation],
  );

  useEffect(() => {
    if (!globalError) return;
    const timer = window.setTimeout(() => setGlobalError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [globalError]);

  useEffect(() => {
    if (openTabs.length > 0) return;

    const handleTablessMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string } | undefined)?.type;
      if (
        type === 'externalMessage' ||
        type === 'prefillInput' ||
        type === 'injectContext' ||
        type === 'ambientCanvasUpdate'
      ) {
        return;
      }
      handleMessage(event);
    };

    window.addEventListener('message', handleTablessMessage);
    return () => window.removeEventListener('message', handleTablessMessage);
  }, [handleMessage, openTabs.length]);

  useEffect(() => {
    const handleScopedDesktopHostMessage = (event: Event) => {
      const message = (event as CustomEvent<ExtensionToWebviewMessage>).detail;
      if (!message?.type) return;
      handleMessage({ data: message } as MessageEvent<ExtensionToWebviewMessage>);
    };

    window.addEventListener(NEKO_AGENT_HOST_MESSAGE_EVENT, handleScopedDesktopHostMessage);
    return () =>
      window.removeEventListener(NEKO_AGENT_HOST_MESSAGE_EVENT, handleScopedDesktopHostMessage);
  }, [handleMessage]);

  // ---- Request data on mount ----
  useEffect(() => {
    isTablessConversationViewRef.current = true;
    AgentHostMessages.getConversations();
    AgentHostMessages.getActiveConversation();
    // The Extension keeps same-process tab state across Webview reloads. Request it
    // explicitly because Developer: Reload Webviews does not trigger a visibility change.
    AgentHostMessages.getTabState();
    requestConfigSnapshot();
    AgentHostMessages.getAgentStates();
    AgentHostMessages.getSkills();
  }, [requestConfigSnapshot]);

  // ---- Context token count on conversation change ----
  useEffect(() => {
    if (visibleConversationId && !isCharacterRoleConversationKind(conversationKind)) {
      requestConversationResourceSnapshot(visibleConversationId);
    }
  }, [conversationKind, requestConversationResourceSnapshot, visibleConversationId]);

  // ---- Sync agent state on conversation change ----
  useEffect(() => {
    if (visibleConversationId) {
      const savedState = conversationAgentStateRef.current.get(visibleConversationId);
      setAgentState(savedState || null);
    } else {
      setAgentState(null);
    }
  }, [visibleConversationId]);

  // ---- Conversation CRUD callbacks ----
  const startNewForegroundConversation = useCallback(() => {
    isTablessConversationViewRef.current = false;
    persistCurrentVisibleConversation();
    beginForegroundConversationActivation();
    requestConfigSnapshot();
    AgentHostMessages.newConversation();
    setActiveTab('chat');
  }, [
    beginForegroundConversationActivation,
    persistCurrentVisibleConversation,
    requestConfigSnapshot,
  ]);

  const handleNewChat = useCallback(() => {
    setPendingSendRequest(null);
    setInitialEntryPromptMenuRequest(null);
    setInitialInputRequest(null);
    setEntryPromptMenu(null);
    startNewForegroundConversation();
  }, [startNewForegroundConversation]);

  const startNewForegroundConversationWithEntryPrompt = useCallback(
    (menu: EntryPromptMenu, messageText?: string) => {
      const id = nextEntryPromptMenuRequestIdRef.current + 1;
      nextEntryPromptMenuRequestIdRef.current = id;
      setPendingSendRequest(null);
      setInitialEntryPromptMenuRequest({ id, menu });
      setEntryPromptMenu(null);
      if (messageText?.trim()) {
        const inputRequestId = nextInitialInputRequestIdRef.current + 1;
        nextInitialInputRequestIdRef.current = inputRequestId;
        setInitialInputRequest({ id: inputRequestId, messageText: messageText.trim() });
      } else {
        setInitialInputRequest(null);
      }
      startNewForegroundConversation();
    },
    [startNewForegroundConversation],
  );

  const handleEntryAction = useCallback(
    (action: EmptyStateEntryAction) => {
      setEntryAction(action);
      setEntrySessionMode('agent');
      const messageText = entryInputValueRef.current.trim();

      switch (action) {
        case 'start-chat':
          setPendingSendRequest(null);
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          setEntryPromptMenu(null);
          updateEntryInputValue('');
          startNewForegroundConversation();
          return;
        case 'generate-assets':
          updateEntryInputValue('');
          startNewForegroundConversationWithEntryPrompt('generate-assets', messageText);
          return;
        case 'roleplay':
          setPendingSendRequest(null);
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          setEntryPromptMenu('roleplay');
          updateMentionSearchFilter('');
          AgentHostMessages.searchProjectFiles('', undefined, { purpose: 'roleplay' });
          return;
      }
    },
    [
      startNewForegroundConversation,
      startNewForegroundConversationWithEntryPrompt,
      updateEntryInputValue,
      updateMentionSearchFilter,
    ],
  );

  const handleSendWithoutConversation = useCallback(
    (input: PendingSendInput) => {
      setInitialEntryPromptMenuRequest(null);
      setInitialInputRequest(null);
      setEntryPromptMenu(null);
      const id = nextPendingSendRequestIdRef.current + 1;
      nextPendingSendRequestIdRef.current = id;
      setPendingSendRequest({ id, input });
      startNewForegroundConversation();
    },
    [startNewForegroundConversation],
  );

  const handleEntryInputSend = useCallback(
    (input?: PendingSendInput) => {
      const messageText = (input?.messageText ?? entryInputValue).trim();
      if (!messageText) return;

      switch (entryAction) {
        case 'start-chat': {
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          handleSendWithoutConversation({
            ...input,
            messageText,
            displayMessageText: input?.displayMessageText ?? messageText,
            sessionMode: input?.sessionMode ?? entrySessionMode,
          });
          updateEntryInputValue('');
          return;
        }
        case 'generate-assets':
          startNewForegroundConversationWithEntryPrompt('generate-assets', messageText);
          updateEntryInputValue('');
          return;
        case 'roleplay':
          setPendingSendRequest(null);
          setInitialEntryPromptMenuRequest(null);
          setInitialInputRequest(null);
          setEntryPromptMenu('roleplay');
          updateMentionSearchFilter('');
          AgentHostMessages.searchProjectFiles('', undefined, { purpose: 'roleplay' });
          return;
      }
    },
    [
      entryAction,
      entryInputValue,
      handleSendWithoutConversation,
      startNewForegroundConversationWithEntryPrompt,
      updateEntryInputValue,
      updateMentionSearchFilter,
    ],
  );

  const handlePendingSendRequestConsumed = useCallback((id: number) => {
    setPendingSendRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleInitialEntryPromptMenuRequestConsumed = useCallback((id: number) => {
    setInitialEntryPromptMenuRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleInitialInputRequestConsumed = useCallback((id: number) => {
    setInitialInputRequest((current) => (current?.id === id ? null : current));
  }, []);

  const handleEntrySessionModeChange = useCallback(
    (mode: SessionMode) => {
      setEntrySessionMode(mode);
      setEntryAction('start-chat');
      setMediaModelSelection((prev) => {
        const projection = projectMediaModelSelectionForSessionModeChange({
          sessionMode: mode,
          mediaModelSelection: prev,
          chatModelOptions: activeSettings.chatModelOptions,
        });
        return projection.updated ? projection.mediaModelSelection : prev;
      });
    },
    [activeSettings.chatModelOptions],
  );

  const handleEntryMediaModelSelect = useCallback((category: MediaCategory, modelId: string) => {
    setMediaModelSelection((prev) => ({ ...prev, [category]: modelId }));
  }, []);

  const handleEntryGenParamsChange = useCallback((partial: Partial<GenerationParams>) => {
    setEntryGenParams((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleBeforeTabOpen = useCallback(() => {
    setPendingSendRequest(null);
    setInitialEntryPromptMenuRequest(null);
    setInitialInputRequest(null);
    setEntryPromptMenu(null);
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    isTablessConversationViewRef.current = false;
  }, []);

  const handleBeforeConversationActivation = useCallback(
    (conversationId: string) => {
      setPendingSendRequest(null);
      setInitialEntryPromptMenuRequest(null);
      setInitialInputRequest(null);
      setEntryPromptMenu(null);
      pendingForegroundConversationActivationRef.current = {
        reason: 'switch-conversation',
        conversationId,
      };
      setIsForegroundConversationActivationPending(true);
      isTablessConversationViewRef.current = false;
      commitConversationTabActivation(conversationId, 'ui-tab');
    },
    [commitConversationTabActivation],
  );

  const handleAllTabsClosed = useCallback(() => {
    setPendingSendRequest(null);
    setInitialEntryPromptMenuRequest(null);
    setInitialInputRequest(null);
    setEntryPromptMenu(null);
    isTablessConversationViewRef.current = true;
    setMessages([]);
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;
    setIsThinking(false);
    setQueuedMessageCount(0);
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    pendingForegroundConversationActivationRef.current = null;
    setIsForegroundConversationActivationPending(false);
    setActiveTab('chat');
  }, [
    activeConversationIdRef,
    setActiveConversationId,
    setIsThinking,
    setMessages,
    setQueuedMessageCount,
    setStreamingMessageId,
    streamingMessageIdRef,
  ]);

  const isProtectedConversation = useCallback(
    (conversationId: string): boolean => {
      const cachedStreaming = conversationStreamingRef.current.get(conversationId);
      const cachedAgentState = conversationAgentStateRef.current.get(conversationId);
      return Boolean(
        openTabs.some((tab) => tab.conversationId === conversationId) ||
        activeConversationId === conversationId ||
        cachedStreaming?.isThinking ||
        cachedStreaming?.streamingMessageId ||
        (cachedAgentState && cachedAgentState.phase !== 'idle'),
      );
    },
    [activeConversationId, conversationStreamingRef, conversationAgentStateRef, openTabs],
  );

  const cleanupClosedConversation = useCallback(
    (conversationId: string) => {
      cleanupConversation(conversationId);
      conversationMessagesRef.current.delete(conversationId);
      conversationStreamingRef.current.delete(conversationId);
      conversationAgentStateRef.current.delete(conversationId);
      setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
    },
    [
      cleanupConversation,
      conversationMessagesRef,
      conversationStreamingRef,
      conversationAgentStateRef,
      setConversations,
    ],
  );

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      if (isProtectedConversation(conversationId)) {
        return;
      }

      cleanupClosedConversation(conversationId);
      AgentHostMessages.deleteConversation(conversationId);
    },
    [cleanupClosedConversation, isProtectedConversation],
  );

  const handleConversationLifecycleAction = useCallback(
    (conversationId: string, action: ConversationLifecycleAction) => {
      AgentHostMessages.conversationLifecycle(conversationId, action);
    },
    [],
  );

  const handleClearClosedConversations = useCallback(() => {
    const historyItems = projectHistoryConversationItems({
      conversations,
      openTabs,
      activeConversationId,
      activeStreaming: {
        streamingMessageId,
        isThinking,
        queuedMessageCount,
      },
      streamingByConversation: conversationStreamingRef.current,
      agentStateByConversation: conversationAgentStateRef.current,
    });
    const cleanup = projectHistoryCleanup({ historyItems });
    for (const conversationId of cleanup.deletableConversationIds) {
      cleanupClosedConversation(conversationId);
      AgentHostMessages.deleteConversation(conversationId);
    }
  }, [
    activeConversationId,
    conversations,
    openTabs,
    streamingMessageId,
    isThinking,
    queuedMessageCount,
    conversationStreamingRef,
    conversationAgentStateRef,
    cleanupClosedConversation,
  ]);

  // ---- Tab management ----
  const prepareCurrentConversationForTabActivation = useCallback(() => {
    // Persist local UI-only state first; a pending canonical Timeline frame then overwrites
    // the cache with the newest delivery before the incoming tab reads it.
    persistCurrentVisibleConversation();
    flushTimelineRendering();
  }, [flushTimelineRendering, persistCurrentVisibleConversation]);

  const { handleOpenTab, handleCloseTab, handleSwitchTab } = useTabManager({
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    onBeforeTabOpen: handleBeforeTabOpen,
    conversations,
    setActiveTab,
    onAllTabsClosed: handleAllTabsClosed,
    onBeforeTabActivation: prepareCurrentConversationForTabActivation,
    onBeforeConversationActivation: handleBeforeConversationActivation,
    onConversationActivated: requestConversationResourceSnapshot,
    onActivateCharacterRoleTab: activateCharacterRoleTab,
    onConfigSnapshotRequested: requestConfigSnapshot,
    hasLocalConversationActivity: (conversationId) => {
      const cachedMessages = conversationMessagesRef.current.get(conversationId);
      const cachedStreaming = conversationStreamingRef.current.get(conversationId);
      const cachedAgentState = conversationAgentStateRef.current.get(conversationId);
      return Boolean(
        (cachedMessages?.length ?? 0) > 0 ||
        cachedStreaming?.isThinking ||
        cachedStreaming?.streamingMessageId ||
        (cachedAgentState && cachedAgentState.phase !== 'idle'),
      );
    },
  });

  const displayTabs = useMemo(
    () =>
      projectDisplayTabs({
        openTabs,
        conversations,
        activeConversationId: visibleConversationId,
        activeMessages: [...visibleSessionState.messages],
        activeStreaming: visibleSessionState.streaming,
        messagesByConversation: conversationMessagesRef.current,
        streamingByConversation: conversationStreamingRef.current,
        agentStateByConversation: conversationAgentStateRef.current,
      }),
    [openTabs, conversations, visibleConversationId, visibleSessionState, projectionVersion],
  );
  const historyConversations = useMemo(
    () =>
      projectHistoryConversationItems({
        conversations,
        openTabs,
        activeConversationId: visibleConversationId,
        activeStreaming: visibleSessionState.streaming,
        streamingByConversation: conversationStreamingRef.current,
        agentStateByConversation: conversationAgentStateRef.current,
      }),
    [conversations, openTabs, visibleConversationId, visibleSessionState, projectionVersion],
  );
  const historyCleanup = useMemo(
    () => projectHistoryCleanup({ historyItems: historyConversations }),
    [historyConversations],
  );

  return (
    <>
      {renderHeader({
        tabs: displayTabs,
        activeTabId,
        activeView: activeTab,
        historyConversations,
        activeConversationId: visibleConversationId,
        onSwitchTab: handleSwitchTab,
        onCloseTab: handleCloseTab,
        onNewChat: handleNewChat,
        onOpenConversation: handleOpenTab,
        onDeleteConversation: handleDeleteConversation,
        onConversationLifecycleAction: handleConversationLifecycleAction,
        onClearClosedConversations: handleClearClosedConversations,
        clearableConversationCount: historyCleanup.deletableConversationIds.length,
        protectedConversationCount: historyCleanup.protectedConversationCount,
      })}

      {activeTab === 'chat' ? (
        openTabs.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <EmptyState
              selectedAction={entryAction}
              disabled={isForegroundConversationActivationPending}
              onEntryAction={handleEntryAction}
            />
            <InputAreaProvider
              isBusy={false}
              sessionMode={entrySessionMode}
              onSessionModeChange={handleEntrySessionModeChange}
              selectedModel={selectedModel}
              availableModels={entryModelState.availableModels}
              onModelSelect={handleModelSelect}
              mediaModelSelection={mediaModelSelection}
              availableMediaModels={entryModelState.availableMediaModels}
              mediaUnderstandingModels={activeSettings.mediaUnderstandingModels}
              mediaUnderstandingSelection={{ image: 'auto', video: 'auto', audio: 'auto' }}
              onMediaModelSelect={handleEntryMediaModelSelect}
              onMediaUnderstandingModelSelect={() => undefined}
              executionMode={activeSettings.executionMode}
              onExecutionModeChange={(mode) => updateActiveSettings({ executionMode: mode })}
              promptMode={activeSettings.promptMode}
              onPromptModeChange={(mode) => updateActiveSettings({ promptMode: mode })}
              maxContextTokens={entryModelState.selectedEffectiveInputBudget}
              outputTokenCap={entryModelState.selectedOutputTokenCap}
              modelMaxOutputTokens={entryModelState.selectedMaxOutputTokens}
              mediaModelCallCount={0}
              skills={skills}
              pluginCommands={pluginCommands}
              mentionItems={mentionItems}
              onRequestFiles={(filter) => {
                updateMentionSearchFilter(filter);
                AgentHostMessages.searchProjectFiles(filter, undefined, { purpose: 'entry' });
              }}
              genCategory={entryGenCategory}
              genParams={entryGenParams}
              onGenCategoryChange={setEntryGenCategory}
              onGenParamsChange={handleEntryGenParamsChange}
              contextTokenCount={0}
              isCompressing={false}
              contextChips={[]}
              onRemoveContextChip={() => undefined}
              ambientNodes={[]}
              conversationKind="chat"
            >
              <InputArea
                inputValue={entryInputValue}
                isThinking={false}
                onInputChange={updateEntryInputValue}
                onSend={handleEntryInputSend}
                disabled={isForegroundConversationActivationPending}
                entryPromptMenu={entryPromptMenu}
                onEntryPromptMenuChange={setEntryPromptMenu}
              />
            </InputAreaProvider>
          </div>
        ) : (
          <ChatWorkspace
            // Conversation state
            messages={[...visibleSessionState.messages]}
            setMessages={setMessages}
            isThinking={visibleSessionState.streaming.isThinking}
            setIsThinking={setIsThinking}
            streamingMessageId={visibleSessionState.streaming.streamingMessageId}
            queuedMessageCount={visibleSessionState.streaming.queuedMessageCount ?? 0}
            queuedMessages={visibleSessionState.streaming.queuedMessages ?? []}
            setStreamingMessageId={setStreamingMessageId}
            streamingMessageIdRef={streamingMessageIdRef}
            activeConversationId={activeConversationId}
            activeConversationIdRef={activeConversationIdRef}
            activeTabConversationId={activeTabConversationId}
            isForegroundConversationActivationPending={isForegroundConversationActivationPending}
            conversationKind={conversationKind}
            characterDialogueSession={activeOpenTab?.characterDialogueSession}
            embodyCharacterSession={embodyCharacterSession}
            clearMessages={clearVisibleConversationMessages}
            // Config
            settings={activeSettings}
            updateSettings={updateActiveSettings}
            // Model selection (owned here for settingsData hydration)
            selectedModel={selectedModel}
            setSelectedModel={handleModelSelect}
            mediaModelSelection={mediaModelSelection}
            setMediaModelSelection={setMediaModelSelection}
            mediaUnderstandingModels={activeSettings.mediaUnderstandingModels}
            mentionItems={mentionItems}
            onMentionSearchFilterChange={updateMentionSearchFilter}
            pluginCommands={pluginCommands}
            // Resources
            workItems={workItems}
            pluginsAvailable={pluginsAvailable}
            // Session
            setActiveTab={setActiveTab}
            conversationMessagesRef={conversationMessagesRef}
            conversationStreamingRef={conversationStreamingRef}
            conversationTokenCountRef={conversationTokenCountRef}
            conversationCompressingRef={conversationCompressingRef}
            conversationAgentStateRef={conversationAgentStateRef}
            // Context management
            contextTokenCount={contextTokenCount}
            isCompressing={isCompressing}
            mediaModelCallCount={mediaModelCallCount}
            // Skills
            skills={skills}
            activeSkill={activeSkill}
            setActiveSkill={setActiveSkill}
            activationProgress={activationProgress}
            // Context chips
            contextChips={contextChips}
            ambientNodes={ambientNodes}
            onAddContextChip={handleAddContextChip}
            onRemoveContextChip={handleRemoveContextChip}
            onInjectContextChip={handleInjectContextChip}
            // Agent state
            agentState={visibleAgentState}
            // Message handler (for pre-intercept)
            handleMessage={handleMessage}
            setAmbientNodes={setAmbientNodesForVisibleConversation}
            onNewChat={handleNewChat}
            onUserMessageSent={handleUserMessageSent}
            onSendWithoutConversation={handleSendWithoutConversation}
            pendingSendRequest={pendingSendRequest}
            onPendingSendRequestConsumed={handlePendingSendRequestConsumed}
            initialInputRequest={initialInputRequest}
            onInitialInputRequestConsumed={handleInitialInputRequestConsumed}
            initialEntryPromptMenuRequest={initialEntryPromptMenuRequest}
            onInitialEntryPromptMenuRequestConsumed={handleInitialEntryPromptMenuRequestConsumed}
            queuedEditRequest={queuedEditRequest}
            onQueuedEditRequestConsumed={(id) => {
              setQueuedEditRequest((current) => (current?.id === id ? null : current));
            }}
            onQueuedEditConflict={() => {
              setGlobalError(t('chat.input.queueEditDraftConflict'));
            }}
            onSessionDiagnostic={(diagnostic) => {
              setGlobalError(`${diagnostic.code}: ${diagnostic.message}`);
            }}
            // Session cleanup registration
            sessionCleanupRef={sessionCleanupRef}
          />
        )
      ) : null}

      {globalError ? (
        <div className="fixed right-4 top-12 z-50 max-w-[360px] rounded-lg border border-[var(--vscode-inputValidation-errorBorder,var(--agent-border))] bg-[var(--vscode-inputValidation-errorBackground,var(--agent-elevated))] px-3 py-2 text-sm text-[var(--vscode-inputValidation-errorForeground,var(--agent-fg))] shadow-lg animate-slide-in">
          <div className="font-medium">全局错误</div>
          <div className="mt-1 opacity-90">{globalError}</div>
        </div>
      ) : null}
    </>
  );
}
