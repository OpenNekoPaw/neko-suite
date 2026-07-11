/**
 * ChatWorkspace — View composition layer.
 *
 * Responsibilities:
 *   - UI state: useUIState (model selection, input, gen params)
 *   - Behavior hooks: useChatActions, usePlanActions, useSkillActions, useSlashCommands
 *   - Model derivation (allModels, availableModels, mediaModels)
 *   - Keyboard shortcuts
 *   - Pre-intercept handler (externalMessage, prefillInput, injectContext, ambientCanvasUpdate)
 *   - Assembles InputAreaProvider + ChatView
 *
 * Extracted from the former 589-line AIAssistant component (ADR P0.1).
 */

import { type MutableRefObject, useEffect, useCallback, useRef, useState } from 'react';
import type { AgentContextPayload, ChatModelOption } from '@neko/shared';
import {
  ShellExecutionMode,
  PromptMode,
  SessionMode,
  AgentState,
  buildAgentSessionDiagnosticMessage,
  type ConversationKind,
  type AgentSessionDiagnosticMessage,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
  type AgentQueuedMessageItem,
} from '@neko-agent/types';
import type {
  MediaUnderstandingModelSelections,
  MediaUnderstandingModels,
  SettingsState,
  Message,
  TabType,
} from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import { ChatView } from '@/components/ChatView';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import type {
  EntryPromptMenu,
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { BoundActiveSkillIndicator } from '@/handlers';
import type { ActivationProgressTimeline } from '@/presenters/activation-progress-presenter';
import { projectTrailingMention } from '@/components/ChatView/InputArea/mention-input';
import {
  useUIState,
  useConversationSession,
  useChatActions,
  type PendingSendInput,
  usePlanActions,
  useSkillActions,
  useSlashCommands,
} from '@/hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import {
  projectChatWorkspaceModelState,
  projectMediaModelSelectionForSessionModeChange,
} from '@/presenters/config-message-presenter';
import { isCharacterRoleConversationKind } from '@/presenters/character-role-session-presenter';

// =============================================================================
// Props
// =============================================================================

export interface ChatWorkspaceProps {
  // Conversation state
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isThinking: boolean;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  streamingMessageId: string | null;
  queuedMessageCount: number;
  queuedMessages: readonly AgentQueuedMessageItem[];
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  activeTabConversationId: string | null;
  isForegroundConversationActivationPending?: boolean;
  conversationKind: ConversationKind;
  characterDialogueSession?: CharacterDialogueSessionProjection;
  embodyCharacterSession?: EmbodyCharacterSessionProjection;
  clearMessages: () => void;
  // Config
  settings: SettingsState;
  updateSettings: (partial: Partial<SettingsState>) => void;
  // Model selection (owned by ConversationController for settingsData hydration)
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  mediaModelSelection: import('@/hooks/useUIState').MediaModelSelection;
  setMediaModelSelection: React.Dispatch<
    React.SetStateAction<import('@/hooks/useUIState').MediaModelSelection>
  >;
  mediaUnderstandingModels?: MediaUnderstandingModels;
  mentionItems: MentionItem[];
  onMentionSearchFilterChange: (filter: string) => void;
  pluginCommands: PluginSlashCommandDef[];
  // Resources
  workItems: AgentWorkItem[];
  pluginsAvailable: PluginsAvailable;
  // Session
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  // Conversation session refs (for useConversationSession)
  conversationMessagesRef: MutableRefObject<Map<string, unknown>>;
  conversationStreamingRef: MutableRefObject<Map<string, unknown>>;
  conversationTokenCountRef: MutableRefObject<Map<string, number>>;
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  // Context management
  contextTokenCount: number;
  isCompressing: boolean;
  mediaModelCallCount: number;
  // Skills
  skills: SkillSummary[];
  activeSkill: BoundActiveSkillIndicator | null;
  setActiveSkill: React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>;
  activationProgress?: readonly ActivationProgressTimeline[];
  // Context chips
  contextChips: AgentContextPayload[];
  ambientNodes: Array<{ nodeId: string; type: string; summary: string }>;
  onAddContextChip: (payload: AgentContextPayload) => void;
  onRemoveContextChip: (id: string) => void;
  onInjectContextChip: (payload: AgentContextPayload, conversationId?: string | null) => void;
  // Agent state
  agentState: AgentState | null;
  // Message handler (for pre-intercept)
  handleMessage: (event: MessageEvent) => void;
  setAmbientNodes: React.Dispatch<
    React.SetStateAction<Array<{ nodeId: string; type: string; summary: string }>>
  >;
  onNewChat: () => void;
  onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
  onSendWithoutConversation?: (input: PendingSendInput) => void;
  pendingSendRequest?: { id: number; input: PendingSendInput } | null;
  onPendingSendRequestConsumed?: (id: number) => void;
  initialInputRequest?: { id: number; messageText: string } | null;
  onInitialInputRequestConsumed?: (id: number) => void;
  initialEntryPromptMenuRequest?: { id: number; menu: EntryPromptMenu } | null;
  onInitialEntryPromptMenuRequestConsumed?: (id: number) => void;
  queuedEditRequest?: {
    id: number;
    conversationId: string;
    item: AgentQueuedMessageItem;
  } | null;
  onQueuedEditRequestConsumed?: (id: number) => void;
  onQueuedEditConflict?: (event: { conversationId: string; item: AgentQueuedMessageItem }) => void;
  onSessionDiagnostic?: (diagnostic: AgentSessionDiagnosticMessage) => void;
  // Session cleanup: ConversationController registers a ref so it can call our cleanup
  sessionCleanupRef: MutableRefObject<{
    cleanupConversation: (id: string) => void;
    cleanupAllConversations: () => void;
  } | null>;
}

// =============================================================================
// Component
// =============================================================================

export function ChatWorkspace({
  messages,
  setMessages,
  isThinking,
  setIsThinking,
  streamingMessageId,
  queuedMessageCount,
  queuedMessages,
  setStreamingMessageId,
  streamingMessageIdRef,
  activeConversationId,
  activeTabConversationId,
  isForegroundConversationActivationPending = false,
  conversationKind,
  characterDialogueSession,
  embodyCharacterSession,
  clearMessages,
  settings,
  updateSettings,
  selectedModel,
  setSelectedModel,
  mediaModelSelection,
  setMediaModelSelection,
  mediaUnderstandingModels,
  mentionItems,
  onMentionSearchFilterChange,
  pluginCommands,
  workItems,
  pluginsAvailable,
  setActiveTab,
  conversationMessagesRef,
  conversationStreamingRef,
  conversationTokenCountRef,
  conversationCompressingRef,
  conversationAgentStateRef,
  contextTokenCount,
  isCompressing,
  mediaModelCallCount,
  skills,
  activeSkill,
  setActiveSkill,
  activationProgress = [],
  contextChips,
  ambientNodes,
  onAddContextChip,
  onRemoveContextChip,
  onInjectContextChip,
  agentState,
  handleMessage,
  setAmbientNodes,
  onNewChat,
  onUserMessageSent,
  onSendWithoutConversation,
  pendingSendRequest,
  onPendingSendRequestConsumed,
  initialInputRequest,
  onInitialInputRequestConsumed,
  initialEntryPromptMenuRequest,
  onInitialEntryPromptMenuRequestConsumed,
  queuedEditRequest,
  onQueuedEditRequestConsumed,
  onQueuedEditConflict,
  onSessionDiagnostic,
  sessionCleanupRef,
}: ChatWorkspaceProps) {
  // ---- UI state (model selection comes from props, not useUIState) ----
  const ui = useUIState();
  const {
    inputValue,
    setInputValue,
    clearInput,
    genCategory,
    setGenCategory,
    genParams,
    updateGenParams,
    mediaUnderstandingSelection,
    setMediaUnderstandingSelection,
  } = ui;

  const visibleSessionConversationId = activeTabConversationId ?? activeConversationId;
  const isCharacterRoleSession = isCharacterRoleConversationKind(conversationKind);
  const hasActiveTabConversationMismatch = Boolean(
    activeTabConversationId && activeTabConversationId !== activeConversationId,
  );
  const isConversationSwitching = Boolean(
    hasActiveTabConversationMismatch ||
    (isForegroundConversationActivationPending && !activeTabConversationId),
  );
  const sessionMutationConversationId = isConversationSwitching
    ? null
    : visibleSessionConversationId;
  const sessionMutationConversationIdRef = useRef<string | null>(sessionMutationConversationId);

  useEffect(() => {
    sessionMutationConversationIdRef.current = sessionMutationConversationId;
  }, [sessionMutationConversationId]);

  useEffect(() => {
    if (!isConversationSwitching || !hasActiveTabConversationMismatch || !activeTabConversationId) {
      return;
    }
    onSessionDiagnostic?.(
      buildAgentSessionDiagnosticMessage({
        code: 'active-tab-mismatch',
        action: 'session-mutation',
        conversationId: activeTabConversationId,
        activeConversationId,
        activeTabConversationId,
        message: `Active tab conversation "${activeTabConversationId}" does not match host active conversation "${activeConversationId ?? 'none'}".`,
      }),
    );
  }, [
    activeConversationId,
    activeTabConversationId,
    hasActiveTabConversationMismatch,
    isConversationSwitching,
    onSessionDiagnostic,
  ]);

  // ---- Session-bound state: input/attachment isolation per conversation ----
  const {
    attachedFiles,
    setAttachedFiles,
    selectedFileReferences,
    setSelectedFileReferences,
    cleanupConversation,
    cleanupAllConversations,
  } = useConversationSession({
    activeConversationId: visibleSessionConversationId,
    inputValue,
    setInputValue,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationTokenCountRef,
    conversationCompressingRef,
    conversationAgentStateRef,
  });

  // Register cleanup callbacks so ConversationController can invoke them
  sessionCleanupRef.current = { cleanupConversation, cleanupAllConversations };

  // ---- Session mode ----
  const [sessionModeByConversation, setSessionModeByConversation] = useState<
    Map<string, SessionMode>
  >(() => new Map());
  const sessionMode = visibleSessionConversationId
    ? (sessionModeByConversation.get(visibleSessionConversationId) ?? 'agent')
    : 'agent';
  const setVisibleSessionMode = useCallback(
    (mode: SessionMode) => {
      if (!visibleSessionConversationId) return;
      setSessionModeByConversation((prev) => {
        const next = new Map(prev);
        if (mode === 'agent') {
          next.delete(visibleSessionConversationId);
        } else {
          next.set(visibleSessionConversationId, mode);
        }
        return next;
      });
    },
    [visibleSessionConversationId],
  );
  const [entryPromptMenu, setEntryPromptMenu] = useState<EntryPromptMenu | null>(null);
  const consumedEntryPromptRequestIdRef = useRef<number | null>(null);
  const consumedInitialInputRequestIdRef = useRef<number | null>(null);
  const inputValueRef = useRef(inputValue);
  const consumedPendingSendRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    inputValueRef.current = inputValue;
  }, [inputValue]);

  // ---- Model lists ----
  const {
    availableModels,
    availableMediaModels,
    activeMediaModel,
    agentMediaModels,
    selectedEffectiveInputBudget,
    selectedOutputTokenCap,
    selectedMaxOutputTokens,
  } = projectChatWorkspaceModelState({
    chatModelOptions: settings.chatModelOptions,
    selectedModel,
    defaultMaxOutputTokens: settings.maxTokens,
    sessionMode,
    mediaModelSelection,
  });

  useEffect(() => {
    if (sessionMode === 'agent') return;
    const hasCurrentSessionModel = availableMediaModels.some(
      (model) => model.category === sessionMode,
    );
    if (!hasCurrentSessionModel) {
      setVisibleSessionMode('agent');
    }
  }, [availableMediaModels, sessionMode, setVisibleSessionMode]);

  // ---- Behavior hooks ----
  const handleSendWithoutConversation = useCallback(
    (input: PendingSendInput) => {
      setVisibleSessionMode('agent');
      onSendWithoutConversation?.(input);
    },
    [onSendWithoutConversation, setVisibleSessionMode],
  );

  const { handleSend, triggerSend, handleCancelMessage, copyLastResponse } = useChatActions({
    inputValue,
    isThinking,
    isCharacterRoleSession,
    selectedModel,
    availableModels,
    sessionMode,
    mediaProviderId: activeMediaModel?.providerId,
    mediaModelId: activeMediaModel?.modelId,
    agentMediaModels,
    understandingModels: buildRuntimeUnderstandingModelSelections(
      mediaUnderstandingSelection,
      settings.chatModelOptions,
    ),
    activeConversationId: sessionMutationConversationId,
    activeConversationIdRef: sessionMutationConversationIdRef,
    isConversationSwitching,
    streamingMessageIdRef,
    messages,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setActiveTab,
    clearInput,
    setAttachedFiles,
    setSelectedFileReferences,
    ensureConversationForSend: handleSendWithoutConversation,
    onUserMessageSent,
  });

  useEffect(() => {
    if (!pendingSendRequest || !sessionMutationConversationId) return;
    if (consumedPendingSendRequestIdRef.current === pendingSendRequest.id) return;

    consumedPendingSendRequestIdRef.current = pendingSendRequest.id;
    handleSend(pendingSendRequest.input);
    onPendingSendRequestConsumed?.(pendingSendRequest.id);
  }, [handleSend, onPendingSendRequestConsumed, pendingSendRequest, sessionMutationConversationId]);

  useEffect(() => {
    if (!initialInputRequest || !sessionMutationConversationId) return;
    if (consumedInitialInputRequestIdRef.current === initialInputRequest.id) return;

    consumedInitialInputRequestIdRef.current = initialInputRequest.id;
    setInputValue(initialInputRequest.messageText);
    inputValueRef.current = initialInputRequest.messageText;
    const trailingMention = projectTrailingMention(initialInputRequest.messageText);
    if (trailingMention && !isCharacterRoleSession) {
      onMentionSearchFilterChange(trailingMention.requestFilter);
      AgentHostMessages.searchProjectFiles(
        trailingMention.requestFilter,
        sessionMutationConversationId,
      );
    }
    onInitialInputRequestConsumed?.(initialInputRequest.id);
  }, [
    initialInputRequest,
    isCharacterRoleSession,
    onMentionSearchFilterChange,
    onInitialInputRequestConsumed,
    sessionMutationConversationId,
    setInputValue,
  ]);

  useEffect(() => {
    if (!initialEntryPromptMenuRequest || !sessionMutationConversationId) return;
    if (consumedEntryPromptRequestIdRef.current === initialEntryPromptMenuRequest.id) return;

    consumedEntryPromptRequestIdRef.current = initialEntryPromptMenuRequest.id;
    setEntryPromptMenu(initialEntryPromptMenuRequest.menu);
    if (initialEntryPromptMenuRequest.menu === 'roleplay') {
      onMentionSearchFilterChange('');
      AgentHostMessages.searchProjectFiles('', sessionMutationConversationId, {
        purpose: 'roleplay',
      });
    }
    onInitialEntryPromptMenuRequestConsumed?.(initialEntryPromptMenuRequest.id);
  }, [
    initialEntryPromptMenuRequest,
    onInitialEntryPromptMenuRequestConsumed,
    onMentionSearchFilterChange,
    sessionMutationConversationId,
  ]);

  useEffect(() => {
    if (!queuedEditRequest || !sessionMutationConversationId) return;
    if (queuedEditRequest.conversationId !== sessionMutationConversationId) return;

    const currentInputValue = inputValueRef.current;
    if (currentInputValue.trim().length === 0) {
      setInputValue(queuedEditRequest.item.content);
      inputValueRef.current = queuedEditRequest.item.content;
    } else {
      onQueuedEditConflict?.({
        conversationId: queuedEditRequest.conversationId,
        item: queuedEditRequest.item,
      });
    }
    onQueuedEditRequestConsumed?.(queuedEditRequest.id);
  }, [
    onQueuedEditConflict,
    onQueuedEditRequestConsumed,
    queuedEditRequest,
    sessionMutationConversationId,
    setInputValue,
  ]);

  // Pre-intercept handler: catches messages not in the registry
  const handleMessageWithExtras = useCallback(
    (event: MessageEvent) => {
      const msg = event.data as {
        type?: string;
        message?: string;
        payload?: AgentContextPayload;
        conversationId?: string | null;
        nodes?: Array<{ nodeId: string; type: string; summary: string }>;
      };
      if (!msg?.type) return handleMessage(event);
      switch (msg.type) {
        case 'externalMessage':
          if (isCharacterRoleSession) {
            break;
          }
          if (typeof msg.message === 'string') {
            setActiveTab('chat');
            triggerSend(msg.message);
          }
          break;
        case 'prefillInput':
          if (isCharacterRoleSession) {
            break;
          }
          if (typeof msg.message === 'string') {
            setActiveTab('chat');
            setInputValue(msg.message);
            inputValueRef.current = msg.message;
          }
          break;
        case 'injectContext':
          if (isCharacterRoleSession) {
            break;
          }
          if (msg.payload) {
            setActiveTab('chat');
            const injectConversationId = msg.conversationId ?? sessionMutationConversationId;
            if (!injectConversationId) {
              break;
            }
            onInjectContextChip(msg.payload, injectConversationId);
            const shouldPrefillActiveInput = injectConversationId === sessionMutationConversationId;
            if (shouldPrefillActiveInput && msg.payload.intent) {
              setInputValue(msg.payload.intent);
              inputValueRef.current = msg.payload.intent;
            }
          }
          break;
        case 'ambientCanvasUpdate':
          if (isCharacterRoleSession) {
            break;
          }
          const ambientConversationId = msg.conversationId ?? sessionMutationConversationId;
          if (!ambientConversationId || ambientConversationId !== sessionMutationConversationId) {
            break;
          }
          setAmbientNodes(msg.nodes ?? []);
          break;
        default:
          handleMessage(event);
      }
    },
    [
      handleMessage,
      triggerSend,
      setInputValue,
      setActiveTab,
      onInjectContextChip,
      setAmbientNodes,
      sessionMutationConversationId,
      isCharacterRoleSession,
    ],
  );

  // Listen for messages from extension
  useEffect(() => {
    window.addEventListener('message', handleMessageWithExtras);
    return () => window.removeEventListener('message', handleMessageWithExtras);
  }, [handleMessageWithExtras]);

  const planActions = usePlanActions({ activeConversationId: sessionMutationConversationId });

  const skillActions = useSkillActions({
    activeConversationId: sessionMutationConversationId,
    activeSkill,
    setActiveSkill,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      COMMON_SHORTCUTS.focusInput(() => {
        const textarea = document.querySelector('textarea');
        textarea?.focus();
      }),
      COMMON_SHORTCUTS.clearConversation(() => {
        if (!sessionMutationConversationId) return;
        if (isCharacterRoleSession) {
          clearMessages();
          clearInput();
          return;
        }
        AgentHostMessages.clearHistory(sessionMutationConversationId);
        clearMessages();
        clearInput();
      }),
      COMMON_SHORTCUTS.newConversation(() => {
        onNewChat();
      }),
      COMMON_SHORTCUTS.copyLastResponse(copyLastResponse),
      COMMON_SHORTCUTS.cancel(handleCancelMessage),
    ],
    enabled: true,
  });

  // Slash command routing
  const { handleSlashCommand } = useSlashCommands({
    skills,
    pluginCommands,
    inputValue,
    activeConversationId: sessionMutationConversationId,
    setMessages,
    clearInput,
  });

  // ---- Simple callback handlers ----
  // Force re-render counter — used when ref values change but no React state did
  const [, forceRender] = useState(0);

  const handleCompressContext = useCallback(async () => {
    if (isCharacterRoleSession || isCompressing || !sessionMutationConversationId) return;
    conversationCompressingRef.current.set(sessionMutationConversationId, true);
    forceRender((n) => n + 1);
    AgentHostMessages.compressContext(sessionMutationConversationId);
  }, [
    isCharacterRoleSession,
    isCompressing,
    sessionMutationConversationId,
    conversationCompressingRef,
  ]);

  const handleExecutionModeChange = (mode: ShellExecutionMode) => {
    updateSettings({ executionMode: mode });
    if (sessionMutationConversationId) {
      AgentHostMessages.updateSettings({ executionMode: mode }, sessionMutationConversationId);
    }
  };

  const handlePromptModeChange = (mode: PromptMode) => {
    if (!sessionMutationConversationId) return;
    updateSettings({ promptMode: mode });
    AgentHostMessages.setPromptMode(mode, sessionMutationConversationId);
  };

  const handleMediaModelSelect = useCallback(
    (category: 'image' | 'video' | 'audio', modelId: string) => {
      setMediaModelSelection((prev) => ({ ...prev, [category]: modelId }));
    },
    [setMediaModelSelection],
  );

  const handleMediaUnderstandingModelSelect = useCallback(
    (category: 'image' | 'video' | 'audio', modelId: string) => {
      setMediaUnderstandingSelection((prev) => ({ ...prev, [category]: modelId }));
    },
    [setMediaUnderstandingSelection],
  );

  const handleSessionModeChange = useCallback(
    (mode: SessionMode) => {
      setEntryPromptMenu(null);
      setVisibleSessionMode(mode);
      setMediaModelSelection((prev) => {
        const projection = projectMediaModelSelectionForSessionModeChange({
          sessionMode: mode,
          mediaModelSelection: prev,
          chatModelOptions: settings.chatModelOptions,
        });
        return projection.updated ? projection.mediaModelSelection : prev;
      });
    },
    [settings.chatModelOptions, setMediaModelSelection, setVisibleSessionMode],
  );
  const isModelConfigurationBusy = isThinking || workItems.some(isActiveWorkItem);

  const handlePromoteQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      AgentHostMessages.promoteQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  const handleCancelQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      AgentHostMessages.cancelQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  const handleEditQueuedMessage = useCallback(
    (queueItemId: string) => {
      if (!sessionMutationConversationId || isCharacterRoleSession) return;
      AgentHostMessages.editQueuedMessage(sessionMutationConversationId, queueItemId);
    },
    [sessionMutationConversationId, isCharacterRoleSession],
  );

  return (
    <InputAreaProvider
      isBusy={isModelConfigurationBusy}
      sessionMode={sessionMode}
      conversationKind={conversationKind}
      onSessionModeChange={handleSessionModeChange}
      selectedModel={selectedModel}
      availableModels={availableModels}
      onModelSelect={setSelectedModel}
      mediaModelSelection={mediaModelSelection}
      availableMediaModels={availableMediaModels}
      mediaUnderstandingModels={mediaUnderstandingModels}
      mediaUnderstandingSelection={mediaUnderstandingSelection}
      onMediaModelSelect={handleMediaModelSelect}
      onMediaUnderstandingModelSelect={handleMediaUnderstandingModelSelect}
      executionMode={settings.executionMode}
      onExecutionModeChange={handleExecutionModeChange}
      promptMode={settings.promptMode}
      onPromptModeChange={handlePromptModeChange}
      contextTokenCount={contextTokenCount}
      maxContextTokens={selectedEffectiveInputBudget}
      outputTokenCap={selectedOutputTokenCap}
      modelMaxOutputTokens={selectedMaxOutputTokens}
      isCompressing={isCompressing}
      onCompressContext={handleCompressContext}
      mediaModelCallCount={mediaModelCallCount}
      skills={skills}
      pluginCommands={pluginCommands}
      onSlashCommand={handleSlashCommand}
      onRequestFiles={(filter) => {
        onMentionSearchFilterChange(filter);
        if (!isCharacterRoleSession && sessionMutationConversationId) {
          AgentHostMessages.searchProjectFiles(filter, sessionMutationConversationId);
        }
      }}
      mentionItems={mentionItems}
      onAddContextChip={onAddContextChip}
      contextChips={contextChips}
      onRemoveContextChip={onRemoveContextChip}
      ambientNodes={ambientNodes}
      genCategory={genCategory}
      genParams={genParams}
      onGenCategoryChange={setGenCategory}
      onGenParamsChange={updateGenParams}
    >
      <ChatView
        messages={messages}
        inputValue={inputValue}
        isThinking={isThinking}
        queuedMessageCount={queuedMessageCount}
        queuedMessages={queuedMessages}
        streamingMessageId={streamingMessageId}
        activeConversationId={visibleSessionConversationId}
        conversationKind={conversationKind}
        characterDialogueSession={characterDialogueSession}
        embodyCharacterSession={embodyCharacterSession}
        isConversationSwitching={isConversationSwitching}
        activeSkill={
          !isCharacterRoleSession && activeSkill?.conversationId === sessionMutationConversationId
            ? activeSkill
            : null
        }
        activationProgress={!isCharacterRoleSession ? activationProgress : []}
        onClearActiveSkill={skillActions.handleClearActiveSkill}
        workItems={workItems}
        pluginsAvailable={pluginsAvailable}
        contextChips={contextChips}
        ambientNodes={ambientNodes}
        onCancelTask={(taskId) => {
          if (!isCharacterRoleSession && sessionMutationConversationId) {
            AgentHostMessages.cancelTask(taskId, sessionMutationConversationId);
          }
        }}
        onRetryTask={(taskId) => {
          if (!isCharacterRoleSession && sessionMutationConversationId) {
            AgentHostMessages.retryTask(taskId, sessionMutationConversationId);
          }
        }}
        onViewTaskResult={(taskId, resultRef) => {
          if (!isCharacterRoleSession && sessionMutationConversationId) {
            AgentHostMessages.viewTaskResult(taskId, sessionMutationConversationId, resultRef);
          }
        }}
        onInputChange={setInputValue}
        onSend={handleSend}
        onCancel={handleCancelMessage}
        onPromoteQueuedMessage={handlePromoteQueuedMessage}
        onCancelQueuedMessage={handleCancelQueuedMessage}
        onEditQueuedMessage={handleEditQueuedMessage}
        entryPromptMenu={entryPromptMenu}
        onEntryPromptMenuChange={setEntryPromptMenu}
        attachedFiles={attachedFiles}
        onAttachedFilesChange={setAttachedFiles}
        selectedFileReferences={selectedFileReferences}
        onSelectedFileReferencesChange={setSelectedFileReferences}
        agentState={agentState}
        onApprovePlanStep={planActions.handleApprovePlanStep}
        onRejectPlanStep={planActions.handleRejectPlanStep}
        onModifyPlanStep={planActions.handleModifyPlanStep}
        onApproveAllPlanSteps={planActions.handleApproveAllPlanSteps}
        onRejectAllPlanSteps={planActions.handleRejectAllPlanSteps}
      />
    </InputAreaProvider>
  );
}

function isActiveWorkItem(item: AgentWorkItem): boolean {
  return item.status === 'queued' || item.status === 'processing';
}

function buildRuntimeUnderstandingModelSelections(
  selection: import('@/hooks/useUIState').MediaUnderstandingSelection,
  options: readonly ChatModelOption[],
): MediaUnderstandingModelSelections | undefined {
  const result: MediaUnderstandingModelSelections = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const selectedId = selection[category];
    if (selectedId === 'auto') continue;
    const option = options.find((model) => model.id === selectedId);
    if (!option?.providerId || !option.modelId) continue;
    result[category] = {
      providerId: option.providerId,
      modelId: option.modelId,
      category: 'llm',
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
