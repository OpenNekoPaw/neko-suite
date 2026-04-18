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
import { ShellExecutionMode, PromptMode, SessionMode, AgentState } from '@/components/types';
import type { SettingsState, Message, ConversationSummary, TabType } from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import { ChatView } from '@/components/ChatView';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import { WorkflowPlanPanel } from '@/components/ChatView/WorkflowPlanPanel';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { BoundSkillConfirmRequest, BoundActiveSkillIndicator } from '@/handlers';
import {
  useUIState,
  useConversationSession,
  useChatActions,
  usePlanActions,
  useSkillActions,
  useSlashCommands,
} from '@/hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

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
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  streamingMessageIdRef: MutableRefObject<string | null>;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  clearMessages: () => void;
  conversations: ConversationSummary[];
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
  pluginCommands: PluginSlashCommandDef[];
  // Resources
  backgroundTasks: BackgroundTask[];
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
  pendingSkillConfirm: BoundSkillConfirmRequest | null;
  activeSkill: BoundActiveSkillIndicator | null;
  setPendingSkillConfirm: React.Dispatch<React.SetStateAction<BoundSkillConfirmRequest | null>>;
  setActiveSkill: React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>;
  // Context chips
  contextChips: AgentContextPayload[];
  ambientNodes: Array<{ nodeId: string; type: string; summary: string }>;
  onAddContextChip: (payload: AgentContextPayload) => void;
  onRemoveContextChip: (id: string) => void;
  // Agent state
  agentState: AgentState | null;
  // Message handler (for pre-intercept)
  handleMessage: (event: MessageEvent) => void;
  setContextChips: React.Dispatch<React.SetStateAction<AgentContextPayload[]>>;
  setAmbientNodes: React.Dispatch<
    React.SetStateAction<Array<{ nodeId: string; type: string; summary: string }>>
  >;
  // Onboarding
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  onNewChat: () => void;
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
  setStreamingMessageId,
  streamingMessageIdRef,
  activeConversationId,
  activeConversationIdRef,
  clearMessages,
  conversations,
  settings,
  updateSettings,
  selectedModel,
  setSelectedModel,
  mediaModelSelection,
  setMediaModelSelection,
  mentionItems,
  pluginCommands,
  backgroundTasks,
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
  pendingSkillConfirm,
  activeSkill,
  setPendingSkillConfirm,
  setActiveSkill,
  contextChips,
  ambientNodes,
  onAddContextChip,
  onRemoveContextChip,
  agentState,
  handleMessage,
  setContextChips,
  setAmbientNodes,
  setShowOnboarding,
  onNewChat,
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
  const { attachedFiles, setAttachedFiles, cleanupConversation, cleanupAllConversations } =
    useConversationSession({
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

  // ---- Model lists ----
  const allModels =
    settings.chatModelOptions.length > 0
      ? settings.chatModelOptions
      : [{ id: 'auto', label: 'Auto', providerId: '', modelId: '' }];

  const MEDIA_CATEGORIES = new Set(['image', 'video', 'audio']);
  const availableModels = allModels.filter(
    (m) => m.id === 'auto' || !m.category || !MEDIA_CATEGORIES.has(m.category),
  );
  const availableMediaModels = allModels.filter(
    (m) => m.category && MEDIA_CATEGORIES.has(m.category),
  );

  const activeMediaModel =
    sessionMode !== 'agent'
      ? availableMediaModels.find(
          (m) => m.id === mediaModelSelection[sessionMode as 'image' | 'video' | 'audio'],
        )
      : undefined;

  const agentMediaModels =
    sessionMode === 'agent'
      ? (() => {
          const resolve = (cat: 'image' | 'video' | 'audio') => {
            const id = mediaModelSelection[cat];
            if (!id || id === 'none') return undefined;
            const m = availableMediaModels.find((m) => m.id === id);
            if (!m?.modelId) return undefined;
            return { providerId: m.providerId || undefined, modelId: m.modelId };
          };
          const result: import('@/hooks/useChatActions').AgentMediaModels = {};
          const img = resolve('image');
          if (img) result.image = img;
          const vid = resolve('video');
          if (vid) result.video = vid;
          const aud = resolve('audio');
          if (aud) result.audio = aud;
          return Object.keys(result).length > 0 ? result : undefined;
        })()
      : undefined;

  // ---- Behavior hooks ----
  const { handleSend, triggerSend, handleCancelMessage, copyLastResponse } = useChatActions({
    inputValue,
    isThinking,
    selectedModel,
    sessionMode,
    mediaProviderId: activeMediaModel?.providerId,
    mediaModelId: activeMediaModel?.modelId,
    agentMediaModels,
    activeConversationId,
    activeConversationIdRef,
    streamingMessageIdRef,
    messages,
    setMessages,
    setIsThinking,
    setStreamingMessageId,
    setActiveTab,
    clearInput,
    setAttachedFiles,
  });

  // Pre-intercept handler: catches messages not in the registry
  const handleMessageWithExtras = useCallback(
    (event: MessageEvent) => {
      const msg = event.data as {
        type?: string;
        message?: string;
        payload?: AgentContextPayload;
        nodes?: Array<{ nodeId: string; type: string; summary: string }>;
      };
      if (!msg?.type) return handleMessage(event);
      switch (msg.type) {
        case 'externalMessage':
          if (typeof msg.message === 'string') {
            setActiveTab('chat');
            triggerSend(msg.message);
          }
          break;
        case 'prefillInput':
          if (typeof msg.message === 'string') {
            setActiveTab('chat');
            setInputValue(msg.message);
          }
          break;
        case 'injectContext':
          if (msg.payload) {
            setActiveTab('chat');
            setContextChips((prev) => {
              const exists = prev.some((c) => c.id === msg.payload!.id);
              return exists ? prev : [...prev, msg.payload!];
            });
            if (msg.payload.intent) {
              setInputValue(msg.payload.intent);
            }
          }
          break;
        case 'ambientCanvasUpdate':
          setAmbientNodes(msg.nodes ?? []);
          break;
        default:
          handleMessage(event);
      }
    },
    [handleMessage, triggerSend, setInputValue, setActiveTab, setContextChips, setAmbientNodes],
  );

  // Listen for messages from extension
  useEffect(() => {
    window.addEventListener('message', handleMessageWithExtras);
    return () => window.removeEventListener('message', handleMessageWithExtras);
  }, [handleMessageWithExtras]);

  const planActions = usePlanActions({ activeConversationId });

  const skillActions = useSkillActions({
    activeConversationId,
    pendingSkillConfirm,
    activeSkill,
    setPendingSkillConfirm,
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
        VSCodeMessages.clearHistory();
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
    inputValue,
    setInputValue,
    setMessages,
    clearInput,
    clearMessages,
    setShowOnboarding,
    onNewChat,
    conversations,
  });

  // ---- Simple callback handlers ----
  // Force re-render counter — used when ref values change but no React state did
  const [, forceRender] = useState(0);

  const handleCompressContext = useCallback(async () => {
    if (isCompressing || !activeConversationId) return;
    conversationCompressingRef.current.set(activeConversationId, true);
    forceRender((n) => n + 1);
    VSCodeMessages.compressContext(activeConversationId);
  }, [isCompressing, activeConversationId, conversationCompressingRef]);

  const handleExecutionModeChange = (mode: ShellExecutionMode) => {
    updateSettings({ executionMode: mode });
    VSCodeMessages.updateSettings({ executionMode: mode });
  };

  const handlePromptModeChange = (mode: PromptMode) => {
    updateSettings({ promptMode: mode });
    VSCodeMessages.setPromptMode(mode);
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
      if (mode !== 'agent') {
        const first = allModels.find((m) => m.category === mode);
        if (first) {
          setMediaModelSelection((prev) => ({ ...prev, [mode]: first.id }));
        }
      }
    },
    [allModels, setMediaModelSelection],
  );

  return (
    <InputAreaProvider
      sessionMode={sessionMode}
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
      isCompressing={isCompressing}
      onCompressContext={handleCompressContext}
      mediaModelCallCount={mediaModelCallCount}
      skills={skills}
      pluginCommands={pluginCommands}
      onSlashCommand={handleSlashCommand}
      onRequestFiles={(filter) => VSCodeMessages.searchProjectFiles(filter)}
      mentionItems={mentionItems}
      onAddContextChip={onAddContextChip}
      contextChips={contextChips}
      onRemoveContextChip={onRemoveContextChip}
      ambientNodes={ambientNodes}
      onTriggerSend={triggerSend}
      genCategory={genCategory}
      genParams={genParams}
      onGenCategoryChange={setGenCategory}
      onGenParamsChange={updateGenParams}
    >
      <ChatView
        messages={messages}
        inputValue={inputValue}
        isThinking={isThinking}
        streamingMessageId={streamingMessageId}
        pendingSkillConfirm={
          pendingSkillConfirm?.conversationId === activeConversationId ? pendingSkillConfirm : null
        }
        activeSkill={activeSkill?.conversationId === activeConversationId ? activeSkill : null}
        onConfirmSkill={skillActions.handleConfirmSkill}
        onDeclineSkill={skillActions.handleDeclineSkill}
        onClearActiveSkill={skillActions.handleClearActiveSkill}
        backgroundTasks={backgroundTasks}
        onCancelTask={(taskId) => VSCodeMessages.cancelTask(taskId)}
        onViewTaskResult={(taskId) => VSCodeMessages.viewTaskResult(taskId)}
        onInputChange={setInputValue}
        onSend={handleSend}
        onCancel={handleCancelMessage}
        attachedFiles={attachedFiles}
        onAttachedFilesChange={setAttachedFiles}
        agentState={agentState}
        onApprovePlanStep={planActions.handleApprovePlanStep}
        onRejectPlanStep={planActions.handleRejectPlanStep}
        onModifyPlanStep={planActions.handleModifyPlanStep}
        onApproveAllPlanSteps={planActions.handleApproveAllPlanSteps}
        onRejectAllPlanSteps={planActions.handleRejectAllPlanSteps}
        workflowPlanPanel={<WorkflowPlanPanel />}
      />
    </InputAreaProvider>
  );
}
