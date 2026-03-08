import { useEffect, useCallback, useState, useRef } from 'react';
import {
  Message,
  ShellExecutionMode,
  PromptMode,
  AgentState,
} from '@/components/types';
import { VSCodeMessages, postMessage } from '@/components/hooks/useVSCode';
import { Header } from '@/components/Header';
import { ChatView } from '@/components/ChatView';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import { AttachedFile } from '@/components/ChatView/InputArea';
import type { SkillSummary } from '@/components/ChatView/InputArea/types';
// Import custom hooks
import {
  useUIState,
  useConversationState,
  useConfigState,
  useResourceState,
  useMessageQueue,
  useConversationSession,
  useTabManager,
  useSlashCommands,
} from '@/hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

// Import message handler
import { useMessageHandler, setExternalMessageContext, type BoundSkillConfirmRequest, type BoundActiveSkillIndicator } from '@/handlers';

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

  const {
    settings,
    setSettings,
    projectFiles,
    setProjectFiles,
    updateSettings,
  } = config;

  // Local model presets setter (no longer in useConfigState but still required by useMessageHandler)
  const [, setModelPresets] = useState<unknown[]>([]);

  const {
    backgroundTasks,
    setBackgroundTasks,
  } = resource;

  // Message queue for queuing messages while agent is thinking
  const messageQueue = useMessageQueue();

  // Skills state
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  // Skill confirmation and active skill state (now with conversation binding)
  const [pendingSkillConfirm, setPendingSkillConfirm] = useState<BoundSkillConfirmRequest | null>(null);
  const [activeSkill, setActiveSkill] = useState<BoundActiveSkillIndicator | null>(null);

  // Context management state (session-bound using Map for conversation isolation)
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  // Force update counter to trigger re-render when ref values change
  const [, forceUpdate] = useState(0);

  // Agent state (session-bound, per-conversation indicator: idle/thinking/acting/streaming)
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  // Force re-render counter for agent state changes (used by streaming-handlers)
  const forceAgentStateUpdate = useCallback(() => {
    forceUpdate(n => n + 1);
  }, []);

  // Session-bound state: input/attachment isolation per conversation
  const { attachedFiles, setAttachedFiles, cleanupConversation, cleanupAllConversations } = useConversationSession({
    activeConversationId,
    inputValue,
    setInputValue,
    conversationMessagesRef,
    conversationStreamingRef,
    conversationTokenCountRef,
    conversationCompressingRef,
    conversationAgentStateRef,
    messageQueue,
  });

  // Onboarding overlay state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-show onboarding when no AI service is configured
  const isAiConfigured = !!(settings.ssoSession ?? settings.configuredProviders.find(p => p.enabled !== false && p.apiKey));
  useEffect(() => {
    if (!isAiConfigured) {
      setShowOnboarding(true);
    }
  }, [isAiConfigured]);

  // Auto-dismiss onboarding when AI becomes configured (e.g. user adds key to config file)
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

  // Force update function for context handlers
  const triggerForceUpdate = useCallback(() => forceUpdate(n => n + 1), []);

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
    VSCodeMessages.getModelPresets();
    VSCodeMessages.getConfig(); // Load configuration from Platform
    VSCodeMessages.getSkills(); // Load available skills
    VSCodeMessages.getHooks(); // Load available hooks
    VSCodeMessages.getTabState(); // Load persisted tab state
  }, []);

  // Note: save/restore inputValue/attachedFiles is now handled by useConversationSession
  // Note: tab state persistence is now handled by useTabManager
  // Note: skill/SSO/context messages are now handled by unified handler registry

  // Request context token count when conversation changes (if not cached)
  useEffect(() => {
    if (activeConversationId) {
      // Always request fresh token count when switching conversations
      // The cached value will be displayed immediately, then updated when response arrives
      VSCodeMessages.getContextTokenCount(activeConversationId);
    }
  }, [activeConversationId]);

  // Sync agent state when conversation changes
  useEffect(() => {
    if (activeConversationId) {
      // Restore agent state from ref for the active conversation
      const savedState = conversationAgentStateRef.current.get(activeConversationId);
      setAgentState(savedState || null);
    } else {
      setAgentState(null);
    }
  }, [activeConversationId]);

  // Handlers
  const handleSend = (attachments?: AttachedFile[]) => {
    const trimmed = inputValue.trim();
    if (!trimmed && (!attachments || attachments.length === 0)) return;

    // Check if THIS conversation is thinking (not global isThinking)
    // This prevents cross-conversation blocking
    const currentConvStreaming = activeConversationId
      ? conversationStreamingRef.current.get(activeConversationId)
      : null;
    const isCurrentConvThinking = currentConvStreaming?.isThinking || isThinking;

    // If current conversation's agent is thinking, queue the message
    if (isCurrentConvThinking) {
      // Queue message for current conversation (session-bound)
      if (activeConversationId) {
        messageQueue.enqueue(trimmed, activeConversationId, attachments);
      }
      clearInput();
      // Clear attachments for this conversation after queuing
      setAttachedFiles([]);
      return;
    }

    // Clear streaming state from previous turn to prevent tool calls
    // from being added to the wrong message
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      attachments: attachments,
    };

    setMessages(prev => [...prev, userMessage]);
    clearInput();
    setAttachedFiles([]); // Clear attachments after sending
    setIsThinking(true);

    let providerId: string | undefined;
    let modelId: string | undefined;
    if (selectedModel !== 'auto' && selectedModel.includes(':')) {
      const parts = selectedModel.split(':');
      providerId = parts[0];
      modelId = parts.slice(1).join(':');
    }

    // promptId is no longer used - system prompt comes from AGENTS.md and skills
    VSCodeMessages.sendMessage(trimmed, providerId, modelId, attachments, undefined, activeConversationId || undefined);
  };

  // Trigger send from external message (with custom message text)
  const triggerSend = useCallback((messageText: string) => {
    if (isThinking) return;

    // Clear streaming state from previous turn to prevent tool calls
    // from being added to the wrong message
    setStreamingMessageId(null);
    streamingMessageIdRef.current = null;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsThinking(true);
    setActiveTab('chat'); // Switch to chat view

    let providerId: string | undefined;
    let modelId: string | undefined;
    if (selectedModel !== 'auto' && selectedModel.includes(':')) {
      const parts = selectedModel.split(':');
      providerId = parts[0];
      modelId = parts.slice(1).join(':');
    }

    // promptId is no longer used - system prompt comes from AGENTS.md and skills
    VSCodeMessages.sendMessage(messageText, providerId, modelId, undefined, undefined, activeConversationIdRef.current || undefined);
  }, [isThinking, selectedModel, setMessages, setIsThinking, setActiveTab, setStreamingMessageId, streamingMessageIdRef]);

  // Set external message context for handlers
  useEffect(() => {
    setExternalMessageContext({
      setInputValue,
      triggerSend,
    });
  }, [setInputValue, triggerSend]);

  // Auto-send queued messages when agent finishes thinking
  // Only process messages for the current active conversation (session-bound)
  useEffect(() => {
    if (!isThinking && activeConversationId && messageQueue.hasMessagesForConversation(activeConversationId)) {
      const nextMessage = messageQueue.peekForConversation(activeConversationId);
      if (nextMessage) {
        // Remove from queue first (for this conversation)
        messageQueue.shiftForConversation(activeConversationId);

        // Clear streaming state
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;

        // Create user message
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: nextMessage.content,
          timestamp: Date.now(),
          attachments: nextMessage.attachments,
        };

        setMessages(prev => [...prev, userMessage]);
        setIsThinking(true);

        // Get provider/model info
        let providerId: string | undefined;
        let modelId: string | undefined;
        if (selectedModel !== 'auto' && selectedModel.includes(':')) {
          const parts = selectedModel.split(':');
          providerId = parts[0];
          modelId = parts.slice(1).join(':');
        }

        // promptId is no longer used - system prompt comes from AGENTS.md and skills
        VSCodeMessages.sendMessage(
          nextMessage.content,
          providerId,
          modelId,
          nextMessage.attachments,
          undefined,
          nextMessage.conversationId, // Use the conversation ID from the queued message
          nextMessage.messageTrackingId // Pass tracking ID for end-to-end deduplication
        );
      }
    }
  }, [isThinking, activeConversationId, messageQueue.queue]); // Use queue array for proper dependency tracking

  // P2: Keyboard shortcuts
  // Copy last assistant response
  const copyLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
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

  useKeyboardShortcuts({
    shortcuts: [
      COMMON_SHORTCUTS.focusInput(() => {
        // Focus the input textarea - use document query as fallback
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
      // ESC to cancel current message generation
      COMMON_SHORTCUTS.cancel(handleCancelMessage),
    ],
    enabled: true,
  });

  const handleNewChat = () => {
    VSCodeMessages.newConversation();
    setActiveTab('chat');
  };

  const handleDeleteConversation = (conversationId: string) => {
    // Clean up conversation-level resources to prevent memory leaks
    cleanupConversation(conversationId);

    // Close tab if open (without switching to it first)
    const tab = openTabs.find(t => t.conversationId === conversationId);
    if (tab) {
      const tabIndex = openTabs.findIndex(t => t.id === tab.id);
      const newTabs = openTabs.filter(t => t.id !== tab.id);
      setOpenTabs(newTabs);

      // If this was the active tab, switch to another
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

    // Close all tabs
    setOpenTabs([]);
    setActiveTabId(null);

    // Clear messages in current view
    clearMessages();

    // Request backend to clear all conversations
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

  // Request project files for @ reference
  const handleRequestFiles = (filter: string) => {
    VSCodeMessages.searchProjectFiles(filter);
  };

  // Skill confirmation handlers (with conversation binding check)
  const handleConfirmSkill = useCallback(() => {
    if (pendingSkillConfirm) {
      // Only confirm if the skill request is for the current conversation
      if (pendingSkillConfirm.conversationId === activeConversationId) {
        VSCodeMessages.confirmSkill(pendingSkillConfirm.skillName, true, pendingSkillConfirm.conversationId);
        setPendingSkillConfirm(null);
      }
    }
  }, [pendingSkillConfirm, activeConversationId]);

  const handleDeclineSkill = useCallback(() => {
    if (pendingSkillConfirm) {
      // Only decline if the skill request is for the current conversation
      if (pendingSkillConfirm.conversationId === activeConversationId) {
        VSCodeMessages.confirmSkill(pendingSkillConfirm.skillName, false, pendingSkillConfirm.conversationId);
        setPendingSkillConfirm(null);
      }
    }
  }, [pendingSkillConfirm, activeConversationId]);

  const handleClearActiveSkill = useCallback(() => {
    // Only clear if active skill is for current conversation
    if (activeSkill && activeSkill.conversationId === activeConversationId) {
      setActiveSkill(null);
      // Notify extension to clear skill state for this conversation
      postMessage({ type: 'clearActiveSkill', conversationId: activeConversationId });
    }
  }, [activeSkill, activeConversationId]);

  // Handle context compression
  const handleCompressContext = useCallback(async () => {
    if (isCompressing || !activeConversationId) return;

    // Set compressing state for this conversation
    conversationCompressingRef.current.set(activeConversationId, true);
    forceUpdate(n => n + 1);
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

  // Background task handlers (used by inline TaskCards in ChatView)
  const handleCancelTask = (taskId: string) => {
    VSCodeMessages.cancelTask(taskId);
  };

  const handleViewTaskResult = (taskId: string) => {
    VSCodeMessages.viewTaskResult(taskId);
  };

  // Plan review handlers
  const handleApprovePlanStep = (planId: string, stepId: string) => {
    VSCodeMessages.approvePlanStep(planId, stepId, activeConversationId || undefined);
  };

  const handleRejectPlanStep = (planId: string, stepId: string) => {
    VSCodeMessages.rejectPlanStep(planId, stepId, activeConversationId || undefined);
  };

  const handleModifyPlanStep = (planId: string, stepId: string, newDescription: string) => {
    VSCodeMessages.modifyPlanStep(planId, stepId, newDescription, activeConversationId || undefined);
  };

  const handleApproveAllPlanSteps = (planId: string) => {
    VSCodeMessages.approveAllPlanSteps(planId, activeConversationId || undefined);
  };

  const handleRejectAllPlanSteps = (planId: string) => {
    VSCodeMessages.rejectAllPlanSteps(planId, activeConversationId || undefined);
  };

  // Get available models from Platform ConfigManager (via settings.chatModelOptions)
  // Fallback to default 'auto' option if not yet received from extension
  const availableModels = settings.chatModelOptions.length > 0
    ? settings.chatModelOptions
    : [{ id: 'auto', label: 'Auto', providerId: '', modelId: '' }];

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
        <ChatView
          messages={messages}
          inputValue={inputValue}
          isThinking={isThinking}
          streamingMessageId={streamingMessageId}
          selectedModel={selectedModel}
          availableModels={availableModels}
          projectFiles={projectFiles}
          executionMode={settings.executionMode}
          promptMode={settings.promptMode}
          skills={skills}
          pendingSkillConfirm={pendingSkillConfirm?.conversationId === activeConversationId ? pendingSkillConfirm : null}
          activeSkill={activeSkill?.conversationId === activeConversationId ? activeSkill : null}
          onConfirmSkill={handleConfirmSkill}
          onDeclineSkill={handleDeclineSkill}
          onClearActiveSkill={handleClearActiveSkill}
          backgroundTasks={backgroundTasks}
          onCancelTask={handleCancelTask}
          onViewTaskResult={handleViewTaskResult}
          onInputChange={setInputValue}
          onSend={handleSend}
          onCancel={handleCancelMessage}
          onModelSelect={setSelectedModel}
          onSlashCommand={handleSlashCommand}
          onRequestFiles={handleRequestFiles}
          onExecutionModeChange={handleExecutionModeChange}
          onPromptModeChange={handlePromptModeChange}
          queuedMessages={activeConversationId ? messageQueue.getQueueForConversation(activeConversationId) : []}
          onRemoveQueuedMessage={messageQueue.remove}
          onClearQueue={activeConversationId ? () => messageQueue.clearForConversation(activeConversationId) : messageQueue.clear}
          attachedFiles={attachedFiles}
          onAttachedFilesChange={setAttachedFiles}
          contextTokenCount={contextTokenCount}
          isCompressing={isCompressing}
          onCompressContext={handleCompressContext}
          agentState={agentState}
          onApprovePlanStep={handleApprovePlanStep}
          onRejectPlanStep={handleRejectPlanStep}
          onModifyPlanStep={handleModifyPlanStep}
          onApproveAllPlanSteps={handleApproveAllPlanSteps}
          onRejectAllPlanSteps={handleRejectAllPlanSteps}
        />
      ) : null}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
