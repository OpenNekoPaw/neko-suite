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

import { type MutableRefObject, useEffect, useCallback, useState } from 'react';
import type { AgentContextPayload } from '@neko/shared';
import {
  ShellExecutionMode,
  PromptMode,
  SessionMode,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
} from '@neko-agent/types';
import type { SettingsState, Message, TabType } from '@neko-agent/types';
import { VSCodeMessages } from '@/messages';
import { ChatView } from '@/components/ChatView';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { BoundActiveSkillIndicator } from '@/handlers';
import {
  useUIState,
  useConversationSession,
  useChatActions,
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
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  activeTabConversationId: string | null;
  conversationKind: ConversationKind;
  characterDialogueSession?: CharacterDialogueSessionProjection;
  embodyCharacterSession?: EmbodyCharacterSessionProjection;
  clearMessages: () => void;
  // Config
  settings: SettingsState;
  updateSettings: (partial: Partial<SettingsState>) => void;
  // Model selection (owned by ConversationController for settingsData hydration)
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  mediaModelSelection: import('@/hooks/useUIState').MediaModelSelection;
  setMediaModelSelection: React.Dispatch<
    React.SetStateAction<import('@/hooks/useUIState').MediaModelSelection>
  >;
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
  setStreamingMessageId,
  streamingMessageIdRef,
  activeConversationId,
  activeConversationIdRef,
  activeTabConversationId,
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
  } = ui;

  // ---- Session-bound state: input/attachment isolation per conversation ----
  const {
    attachedFiles,
    setAttachedFiles,
    selectedFileReferences,
    setSelectedFileReferences,
    cleanupConversation,
    cleanupAllConversations,
  } = useConversationSession({
    activeConversationId,
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
  const [sessionMode, setSessionMode] = useState<SessionMode>('agent');
  const isCharacterRoleSession = isCharacterRoleConversationKind(conversationKind);
  const isConversationSwitching = Boolean(
    activeTabConversationId && activeTabConversationId !== activeConversationId,
  );

  // ---- Model lists ----
  const {
    availableModels,
    availableMediaModels,
    activeMediaModel,
    agentMediaModels,
    selectedContextWindow,
  } = projectChatWorkspaceModelState({
    chatModelOptions: settings.chatModelOptions,
    selectedModel,
    defaultContextWindow: settings.maxTokens,
    sessionMode,
    mediaModelSelection,
  });

  // ---- Behavior hooks ----
  const { handleSend, triggerSend, handleCancelMessage, copyLastResponse } = useChatActions({
    inputValue,
    isThinking,
    isCharacterRoleSession,
    selectedModel,
    sessionMode,
    mediaProviderId: activeMediaModel?.providerId,
    mediaModelId: activeMediaModel?.modelId,
    agentMediaModels,
    activeConversationId,
    activeConversationIdRef,
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
    onUserMessageSent,
  });

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
          }
          break;
        case 'injectContext':
          if (isCharacterRoleSession) {
            break;
          }
          if (msg.payload) {
            setActiveTab('chat');
            const injectConversationId = msg.conversationId ?? activeConversationIdRef.current;
            onInjectContextChip(msg.payload, injectConversationId);
            const shouldPrefillActiveInput =
              !injectConversationId || injectConversationId === activeConversationIdRef.current;
            if (shouldPrefillActiveInput && msg.payload.intent) {
              setInputValue(msg.payload.intent);
            }
          }
          break;
        case 'ambientCanvasUpdate':
          if (isCharacterRoleSession) {
            break;
          }
          if (msg.conversationId && msg.conversationId !== activeConversationIdRef.current) {
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
      activeConversationIdRef,
      isCharacterRoleSession,
    ],
  );

  // Listen for messages from extension
  useEffect(() => {
    window.addEventListener('message', handleMessageWithExtras);
    return () => window.removeEventListener('message', handleMessageWithExtras);
  }, [handleMessageWithExtras]);

  const planActions = usePlanActions({ activeConversationId });

  const skillActions = useSkillActions({
    activeConversationId,
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
        if (!activeConversationId) return;
        if (isCharacterRoleSession) {
          clearMessages();
          clearInput();
          return;
        }
        VSCodeMessages.clearHistory(activeConversationId);
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
    activeConversationId,
    setMessages,
    clearInput,
  });

  // ---- Simple callback handlers ----
  // Force re-render counter — used when ref values change but no React state did
  const [, forceRender] = useState(0);

  const handleCompressContext = useCallback(async () => {
    if (isCharacterRoleSession || isCompressing || !activeConversationId) return;
    conversationCompressingRef.current.set(activeConversationId, true);
    forceRender((n) => n + 1);
    VSCodeMessages.compressContext(activeConversationId);
  }, [isCharacterRoleSession, isCompressing, activeConversationId, conversationCompressingRef]);

  const handleExecutionModeChange = (mode: ShellExecutionMode) => {
    updateSettings({ executionMode: mode });
    VSCodeMessages.updateSettings({ executionMode: mode });
  };

  const handlePromptModeChange = (mode: PromptMode) => {
    if (!activeConversationId) return;
    updateSettings({ promptMode: mode });
    VSCodeMessages.setPromptMode(mode, activeConversationId);
  };

  const handleMediaModelSelect = useCallback(
    (category: 'image' | 'video' | 'audio', modelId: string) => {
      setMediaModelSelection((prev) => ({ ...prev, [category]: modelId }));
    },
    [setMediaModelSelection],
  );

  const handleSessionModeChange = useCallback(
    (mode: SessionMode) => {
      setSessionMode(mode);
      setMediaModelSelection((prev) => {
        const projection = projectMediaModelSelectionForSessionModeChange({
          sessionMode: mode,
          mediaModelSelection: prev,
          chatModelOptions: settings.chatModelOptions,
        });
        return projection.updated ? projection.mediaModelSelection : prev;
      });
    },
    [settings.chatModelOptions, setMediaModelSelection],
  );

  return (
    <InputAreaProvider
      sessionMode={sessionMode}
      conversationKind={conversationKind}
      onSessionModeChange={handleSessionModeChange}
      selectedModel={selectedModel}
      availableModels={availableModels}
      onModelSelect={setSelectedModel}
      mediaModelSelection={mediaModelSelection}
      availableMediaModels={availableMediaModels}
      onMediaModelSelect={handleMediaModelSelect}
      executionMode={settings.executionMode}
      onExecutionModeChange={handleExecutionModeChange}
      promptMode={settings.promptMode}
      onPromptModeChange={handlePromptModeChange}
      contextTokenCount={contextTokenCount}
      maxContextTokens={selectedContextWindow}
      isCompressing={isCompressing}
      onCompressContext={handleCompressContext}
      mediaModelCallCount={mediaModelCallCount}
      skills={skills}
      pluginCommands={pluginCommands}
      onSlashCommand={handleSlashCommand}
      onRequestFiles={(filter) => {
        onMentionSearchFilterChange(filter);
        if (!isCharacterRoleSession && activeConversationId) {
          VSCodeMessages.searchProjectFiles(filter, activeConversationId);
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
        streamingMessageId={streamingMessageId}
        activeConversationId={activeConversationId}
        conversationKind={conversationKind}
        characterDialogueSession={characterDialogueSession}
        embodyCharacterSession={embodyCharacterSession}
        isConversationSwitching={isConversationSwitching}
        activeSkill={
          !isCharacterRoleSession && activeSkill?.conversationId === activeConversationId
            ? activeSkill
            : null
        }
        onClearActiveSkill={skillActions.handleClearActiveSkill}
        workItems={workItems}
        pluginsAvailable={pluginsAvailable}
        contextChips={contextChips}
        ambientNodes={ambientNodes}
        onCancelTask={(taskId) => {
          if (!isCharacterRoleSession && activeConversationId) {
            VSCodeMessages.cancelTask(taskId, activeConversationId);
          }
        }}
        onRetryTask={(taskId) => {
          if (!isCharacterRoleSession && activeConversationId) {
            VSCodeMessages.retryTask(taskId, activeConversationId);
          }
        }}
        onViewTaskResult={(taskId) => {
          if (!isCharacterRoleSession && activeConversationId) {
            VSCodeMessages.viewTaskResult(taskId, activeConversationId);
          }
        }}
        onInputChange={setInputValue}
        onSend={handleSend}
        onCancel={handleCancelMessage}
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
