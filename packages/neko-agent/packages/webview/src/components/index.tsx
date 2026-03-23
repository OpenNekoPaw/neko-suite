import { useEffect, useCallback, useState, useRef } from 'react';
import { ShellExecutionMode, PromptMode, SessionMode, AgentState } from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import { Header } from '@/components/Header';
import { ChatView } from '@/components/ChatView';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import type { SkillSummary } from '@/components/ChatView/InputArea/types';
// Import custom hooks
import {
  useUIState,
  useConversationState,
  useConfigState,
  useResourceState,
  useConversationSession,
  useTabManager,
  useSlashCommands,
  useChatActions,
  usePlanActions,
  useSkillActions,
} from '@/hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

// Import message handler
import {
  useMessageHandler,
  type BoundSkillConfirmRequest,
  type BoundActiveSkillIndicator,
} from '@/handlers';

export function AIAssistant() {
  // Use custom hooks for state management
  const ui = useUIState();
  const conversation = useConversationState();
  const config = useConfigState();
  const resource = useResourceState();

  // Destructure for easier access
  const {
    activeTab,
    setActiveTab,
    inputValue,
    setInputValue,
    selectedModel,
    setSelectedModel,
    mediaModelSelection,
    setMediaModelSelection,
    clearInput,
  } = ui;

  const {
    messages,
    setMessages,
    isThinking,
    setIsThinking,
    streamingMessageId,
    setStreamingMessageId,
    streamingMessageIdRef,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversationIdRef,
    conversationMessagesRef,
    conversationStreamingRef,
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    clearMessages,
  } = conversation;

  const { settings, setSettings, projectFiles, setProjectFiles, updateSettings } = config;

  const { backgroundTasks, setBackgroundTasks } = resource;

  // Session mode state (top-level workflow routing)
  const [sessionMode, setSessionMode] = useState<SessionMode>('agent');

  // Skills state
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  // Skill confirmation and active skill state (now with conversation binding)
  const [pendingSkillConfirm, setPendingSkillConfirm] = useState<BoundSkillConfirmRequest | null>(
    null,
  );
  const [activeSkill, setActiveSkill] = useState<BoundActiveSkillIndicator | null>(null);

  // Context management state (session-bound using Map for conversation isolation)
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  // Media model call count per conversation
  const conversationMediaCallCountRef = useRef<Map<string, number>>(new Map());
  // Force update counter to trigger re-render when ref values change
  const [, forceUpdate] = useState(0);

  // Agent state (session-bound, per-conversation indicator: idle/thinking/acting/streaming)
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  // Force re-render counter for agent state changes (used by streaming-handlers)
  const forceAgentStateUpdate = useCallback(() => {
    forceUpdate((n) => n + 1);
  }, []);

  // Session-bound state: input/attachment isolation per conversation
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

  // Onboarding overlay state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-show onboarding when no AI service is configured
  const isAiConfigured = !!(
    settings.ssoSession ?? settings.configuredProviders.find((p) => p.enabled !== false && p.apiKey)
  );
  useEffect(() => {
    if (!isAiConfigured) {
      setShowOnboarding(true);
    }
  }, [isAiConfigured]);

  // Auto-dismiss onboarding when AI becomes configured
  useEffect(() => {
    if (isAiConfigured && showOnboarding) {
      setShowOnboarding(false);
    }
  }, [isAiConfigured, showOnboarding]);

  // Derived state for current conversation
  const contextTokenCount = activeConversationId
    ? (conversationTokenCountRef.current.get(activeConversationId) ?? 0)
    : 0;
  const isCompressing = activeConversationId
    ? (conversationCompressingRef.current.get(activeConversationId) ?? false)
    : false;
  const mediaModelCallCount = activeConversationId
    ? (conversationMediaCallCountRef.current.get(activeConversationId) ?? 0)
    : 0;

  // Force update function for context handlers
  const triggerForceUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  // Use message handler hook
  const { handleMessage } = useMessageHandler({
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
    forceContextUpdate: triggerForceUpdate,
  });

  // Listen for messages from extension
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Request data on mount
  useEffect(() => {
    VSCodeMessages.getConversations();
    VSCodeMessages.getActiveConversation();
    VSCodeMessages.getSettings();
    VSCodeMessages.getTasks();
    VSCodeMessages.getAgentStates();
    VSCodeMessages.getConfig();
    VSCodeMessages.getTabState();
  }, []);

  // Request context token count when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      VSCodeMessages.getContextTokenCount(activeConversationId);
    }
  }, [activeConversationId]);

  // Sync agent state when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      const savedState = conversationAgentStateRef.current.get(activeConversationId);
      setAgentState(savedState || null);
    } else {
      setAgentState(null);
    }
  }, [activeConversationId]);

  // --- Model lists (needed by useChatActions and InputAreaProvider) ---

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

  // For non-agent modes, resolve providerId + modelId from the selected ChatModelOption
  const activeMediaModel =
    sessionMode !== 'agent'
      ? availableMediaModels.find(
          (m) => m.id === mediaModelSelection[sessionMode as 'image' | 'video' | 'audio'],
        )
      : undefined;

  // For agent mode, resolve per-category media models (image/video/audio independently)
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
          const img = resolve('image'); if (img) result.image = img;
          const vid = resolve('video'); if (vid) result.video = vid;
          const aud = resolve('audio'); if (aud) result.audio = aud;
          return Object.keys(result).length > 0 ? result : undefined;
        })()
      : undefined;

  // --- Extracted behavior hooks ---

  const { handleSend, handleCancelMessage, copyLastResponse } = useChatActions({
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
        VSCodeMessages.newConversation();
        setActiveTab('chat');
      }),
      COMMON_SHORTCUTS.copyLastResponse(copyLastResponse),
      COMMON_SHORTCUTS.cancel(handleCancelMessage),
    ],
    enabled: true,
  });

  // --- Simple callback handlers ---

  const handleNewChat = () => {
    VSCodeMessages.newConversation();
    setActiveTab('chat');
  };

  const handleDeleteConversation = (conversationId: string) => {
    cleanupConversation(conversationId);
    const tab = openTabs.find((t) => t.conversationId === conversationId);
    if (tab) {
      const tabIndex = openTabs.findIndex((t) => t.id === tab.id);
      const newTabs = openTabs.filter((t) => t.id !== tab.id);
      setOpenTabs(newTabs);
      if (activeTabId === tab.id && newTabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        const newActiveTab = newTabs[newActiveIndex];
        setActiveTabId(newActiveTab.id);
        VSCodeMessages.switchConversation(newActiveTab.conversationId);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
    }
    VSCodeMessages.deleteConversation(conversationId);
  };

  const handleClearAllConversations = () => {
    cleanupAllConversations();
    setOpenTabs([]);
    setActiveTabId(null);
    clearMessages();
    VSCodeMessages.clearAllConversations();
  };

  // Tab management (extracted hook)
  const { handleOpenTab, handleCloseTab, handleSwitchTab } = useTabManager({
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    conversations,
    setActiveTab,
    onNewChat: handleNewChat,
  });

  // Slash command routing (extracted hook)
  const { handleSlashCommand } = useSlashCommands({
    skills,
    inputValue,
    setInputValue,
    setMessages,
    clearInput,
    clearMessages,
    setShowOnboarding,
    onNewChat: handleNewChat,
    conversations,
  });

  // Handle context compression
  const handleCompressContext = useCallback(async () => {
    if (isCompressing || !activeConversationId) return;
    conversationCompressingRef.current.set(activeConversationId, true);
    forceUpdate((n) => n + 1);
    VSCodeMessages.compressContext(activeConversationId);
  }, [isCompressing, activeConversationId]);

  // Handle execution mode change
  const handleExecutionModeChange = (mode: ShellExecutionMode) => {
    updateSettings({ executionMode: mode });
    VSCodeMessages.updateSettings({ executionMode: mode });
  };

  // Handle prompt mode change
  const handlePromptModeChange = (mode: PromptMode) => {
    updateSettings({ promptMode: mode });
    VSCodeMessages.setPromptMode(mode);
  };

  // Handle per-category media model selection
  const handleMediaModelSelect = useCallback(
    (category: 'image' | 'video' | 'audio', modelId: string) => {
      setMediaModelSelection((prev) => ({ ...prev, [category]: modelId }));
    },
    [setMediaModelSelection],
  );

  // Handle session mode change — auto-select first available model for that category
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
    <div className="flex flex-col h-screen bg-[var(--vscode-sideBar-background,var(--vscode-editor-background))] text-[var(--vscode-foreground)]">
      {/* Header */}
      <Header
        tabs={openTabs}
        activeTabId={activeTabId}
        activeView={activeTab}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSwitchTab={handleSwitchTab}
        onCloseTab={handleCloseTab}
        onNewChat={handleNewChat}
        onOpenConversation={handleOpenTab}
        onDeleteConversation={handleDeleteConversation}
        onClearAllConversations={handleClearAllConversations}
        ssoSession={settings.ssoSession}
        configuredProviders={settings.configuredProviders}
        selectedModelId={settings.selectedModelId}
        onOpenOnboarding={() => setShowOnboarding(true)}
      />

      {/* Content Area */}
      {activeTab === 'chat' ? (
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
          onSlashCommand={handleSlashCommand}
          onRequestFiles={(filter) => VSCodeMessages.searchProjectFiles(filter)}
        >
          <ChatView
            messages={messages}
            inputValue={inputValue}
            isThinking={isThinking}
            streamingMessageId={streamingMessageId}
            projectFiles={projectFiles}
            pendingSkillConfirm={
              pendingSkillConfirm?.conversationId === activeConversationId
                ? pendingSkillConfirm
                : null
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
          />
        </InputAreaProvider>
      ) : null}
      {showOnboarding && <OnboardingFlow onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
}
