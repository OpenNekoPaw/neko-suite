import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  Message,
  OpenTab,
  ShellExecutionMode,
  PromptMode,
  AgentState,
  SsoSession,
} from '@/components/types';
import { VSCodeMessages, postMessage } from '@/components/hooks/useVSCode';
import { Header } from '@/components/Header';
import { ChatView } from '@/components/ChatView';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import { AgentsPanel } from '@/components/AgentsPanel';
import { AgentControlCenter, type AgentSessionInfo, getActiveSessions } from '@/components/AgentControlCenter';
import { AttachedFile } from '@/components/ChatView/InputArea';
import type { SlashCommand, SkillSummary } from '@/components/ChatView/InputArea/types';
import type { SkillConfirmRequest, ActiveSkillIndicator } from '@/components/ChatView/SkillConfirmBanner';

// Import custom hooks
import {
  useUIState,
  useConversationState,
  useConfigState,
  useResourceState,
  useMessageQueue,
} from '@/hooks';
import { useKeyboardShortcuts, COMMON_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

// Import message handler
import { useMessageHandler, setExternalMessageContext } from '@/handlers';
import { getLogger } from '../utils/logger';

const logger = getLogger('AIAssistant');

// Extended skill confirm request with conversation binding
interface BoundSkillConfirmRequest extends SkillConfirmRequest {
  conversationId: string;
}

// Extended active skill indicator with conversation binding
interface BoundActiveSkillIndicator extends ActiveSkillIndicator {
  conversationId: string;
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [, setModelPresets] = useState<any[]>([]);

  const {
    backgroundTasks,
    setBackgroundTasks,
  } = resource;

  // Message queue for queuing messages while agent is thinking
  const messageQueue = useMessageQueue();

  // Session-bound state caches (for P0/P1 fixes)
  const conversationInputRef = useRef<Map<string, string>>(new Map());
  const conversationAttachmentsRef = useRef<Map<string, AttachedFile[]>>(new Map());

  // Attachments state (managed at conversation level)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

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
  // Version counter to force useMemo recalculation when ref changes
  const [agentStateVersion, setAgentStateVersion] = useState(0);
  const forceAgentStateUpdate = useCallback(() => {
    setAgentStateVersion(v => v + 1);
  }, []);

  // Onboarding overlay state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-show onboarding when no AI service is configured
  const isAiConfigured = !!(settings.ssoSession ?? settings.configuredProviders.find(p => p.enabled !== false && p.apiKey));
  useEffect(() => {
    if (!isAiConfigured) {
      setShowOnboarding(true);
    }
  }, [isAiConfigured]);

  // Derived state for current conversation
  const contextTokenCount = activeConversationId
    ? (conversationTokenCountRef.current.get(activeConversationId) ?? 0)
    : 0;
  const isCompressing = activeConversationId
    ? (conversationCompressingRef.current.get(activeConversationId) ?? false)
    : false;

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

  // Session-bound state: save/restore inputValue and attachedFiles on conversation switch
  const prevConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    const newId = activeConversationId;

    // Save previous conversation's state before switching
    if (prevId && prevId !== newId) {
      conversationInputRef.current.set(prevId, inputValue);
      conversationAttachmentsRef.current.set(prevId, attachedFiles);
    }

    // Restore new conversation's state
    if (newId && newId !== prevId) {
      const savedInput = conversationInputRef.current.get(newId) || '';
      const savedAttachments = conversationAttachmentsRef.current.get(newId) || [];
      setInputValue(savedInput);
      setAttachedFiles(savedAttachments);
    }

    prevConversationIdRef.current = newId;
  }, [activeConversationId]); // Only depend on activeConversationId to avoid loops

  // Sync tab state to extension for persistence across panel close/reopen
  const isInitialTabStateRef = useRef(true);
  useEffect(() => {
    // Skip initial render to avoid overwriting restored state
    if (isInitialTabStateRef.current) {
      isInitialTabStateRef.current = false;
      return;
    }
    VSCodeMessages.updateTabState(openTabs, activeTabId);
  }, [openTabs, activeTabId]);

  // Listen for skill-related messages from extension
  useEffect(() => {
    const handleSkillsMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'skillsList':
          // Update available skills list
          setSkills(message.skills || []);
          break;

        case 'skillConfirmRequest':
          // Show skill confirmation banner (bound to conversation)
          setPendingSkillConfirm({
            skillName: message.skillName,
            skillDescription: message.skillDescription,
            relevance: message.relevance,
            reason: message.reason,
            conversationId: message.conversationId || activeConversationIdRef.current || '',
          });
          break;

        case 'skillInjection':
          // Skill has been applied - show indicator (bound to conversation)
          setActiveSkill({
            skillName: message.skillName,
            allowedTools: message.allowedTools,
            conversationId: message.conversationId || activeConversationIdRef.current || '',
          });
          // Clear any pending confirmation for this conversation
          setPendingSkillConfirm(prev => {
            if (prev && prev.conversationId === (message.conversationId || activeConversationIdRef.current)) {
              return null;
            }
            return prev;
          });
          break;

        case 'skillCleared':
          // Skill has been cleared for a conversation
          setActiveSkill(prev => {
            if (prev && prev.conversationId === (message.conversationId || activeConversationIdRef.current)) {
              return null;
            }
            return prev;
          });
          break;
      }
    };
    window.addEventListener('message', handleSkillsMessage);
    return () => window.removeEventListener('message', handleSkillsMessage);
  }, []);

  // Listen for SSO session changes from extension
  useEffect(() => {
    const handleSsoMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'ssoSessionChanged') {
        updateSettings({ ssoSession: (message.session as SsoSession | null) ?? null });
        setShowOnboarding(false);
      }
    };
    window.addEventListener('message', handleSsoMessage);
    return () => window.removeEventListener('message', handleSsoMessage);
  }, [updateSettings]);

  // Listen for context management messages from extension
  useEffect(() => {
    const handleContextMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'contextTokenCount':
          // Update token count for the specific conversation (session-isolated)
          if (message.conversationId) {
            conversationTokenCountRef.current.set(message.conversationId, message.tokenCount || 0);
            // Trigger re-render if it's the current conversation
            if (message.conversationId === activeConversationIdRef.current) {
              forceUpdate(n => n + 1);
            }
          }
          break;

        case 'compressionResult':
          // Compression completed for specific conversation
          if (message.conversationId) {
            conversationCompressingRef.current.set(message.conversationId, false);
            conversationTokenCountRef.current.set(message.conversationId, message.compressedTokens || 0);
            // Trigger re-render if it's the current conversation
            if (message.conversationId === activeConversationIdRef.current) {
              forceUpdate(n => n + 1);
            }
          }
          break;

        case 'compressionError':
          // Compression failed for specific conversation
          if (message.conversationId) {
            conversationCompressingRef.current.set(message.conversationId, false);
            if (message.conversationId === activeConversationIdRef.current) {
              forceUpdate(n => n + 1);
            }
          }
          logger.error('Compression failed:', message.error);
          break;
      }
    };
    window.addEventListener('message', handleContextMessage);
    return () => window.removeEventListener('message', handleContextMessage);
  }, []);

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
    conversationMessagesRef.current.delete(conversationId);
    conversationStreamingRef.current.delete(conversationId);
    conversationInputRef.current.delete(conversationId);
    conversationAttachmentsRef.current.delete(conversationId);
    conversationTokenCountRef.current.delete(conversationId);
    conversationCompressingRef.current.delete(conversationId);
    conversationAgentStateRef.current.delete(conversationId);
    messageQueue.clearForConversation(conversationId);

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
    // Clean up all conversation-level resources
    conversationMessagesRef.current.clear();
    conversationStreamingRef.current.clear();
    conversationInputRef.current.clear();
    conversationAttachmentsRef.current.clear();
    conversationTokenCountRef.current.clear();
    conversationCompressingRef.current.clear();
    conversationAgentStateRef.current.clear();
    messageQueue.clear();

    // Close all tabs
    setOpenTabs([]);
    setActiveTabId(null);

    // Clear messages in current view
    clearMessages();

    // Request backend to clear all conversations
    VSCodeMessages.clearAllConversations();
  };

  const handleOpenTab = (conversationId: string, title: string) => {
    const existingTab = openTabs.find(t => t.conversationId === conversationId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTab: OpenTab = {
        id: `tab-${Date.now()}`,
        title: title || 'New Chat',
        conversationId,
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
    VSCodeMessages.switchConversation(conversationId);
    setActiveTab('chat');
  };

  const handleCloseTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const tab = openTabs.find(t => t.id === tabId);
    if (!tab) return;

    const conversation = conversations.find(c => c.id === tab.conversationId);
    const hasMessages = conversation && conversation.messageCount > 0;

    if (!hasMessages) {
      VSCodeMessages.deleteConversation(tab.conversationId);
    }

    const tabIndex = openTabs.findIndex(t => t.id === tabId);
    const newTabs = openTabs.filter(t => t.id !== tabId);
    setOpenTabs(newTabs);

    if (activeTabId === tabId && newTabs.length > 0) {
      const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
      const newActiveTab = newTabs[newActiveIndex];
      setActiveTabId(newActiveTab.id);
      VSCodeMessages.switchConversation(newActiveTab.conversationId);
    } else if (newTabs.length === 0) {
      setActiveTabId(null);
      handleNewChat();
    }
  };

  const handleSwitchTab = (tabId: string) => {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      VSCodeMessages.switchConversation(tab.conversationId);
      setActiveTab('chat');
    }
  };

  // Slash command handler - supports both builtin and skill commands
  const handleSlashCommand = (command: SlashCommand) => {
    // Handle skill commands
    if (command.source === 'skill' && command.skillId) {
      clearInput();
      VSCodeMessages.executeSkill(command.skillId, { userInput: inputValue });
      return;
    }

    // Handle builtin commands
    switch (command.id) {
      case 'clear':
        VSCodeMessages.clearHistory();
        clearMessages();
        clearInput();
        break;
      case 'new':
        handleNewChat();
        clearInput();
        break;
      case 'help': {
        clearInput();
        // Build help text including skill commands
        const skillCommands = skills
          .filter(s => s.slashCommand && s.enabled)
          .map(s => `- \`/${s.slashCommand}\` - ${s.description}`)
          .join('\n');

        const helpContent = `**Available Commands:**
- \`/clear\` - Clear conversation history
- \`/new\` - Start a new conversation
- \`/resume\` - Show recent conversations to resume
- \`/help\` - Show this help message
- \`/image\` - Generate an image
- \`/video\` - Generate a video
- \`/script\` - Write a script
- \`/storyboard\` - Create a storyboard
- \`/settings\` - Open settings
${skillCommands ? `\n**Skill Commands:**\n${skillCommands}` : ''}

**Tips:**
- Use \`@\` to reference files
- Attach files using the 📎 button
- Press Enter to send, Shift+Enter for new line`;

        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: helpContent,
            timestamp: Date.now(),
          },
        ]);
        break;
      }
      case 'resume': {
        clearInput();
        // Show recent conversations that can be resumed
        const recentConversations = conversations
          .slice(0, 5)
          .map((c, i) => `${i + 1}. **${c.title}** (${c.messageCount} messages)`)
          .join('\n');

        const resumeContent = recentConversations
          ? `**Recent Conversations:**\n${recentConversations}\n\nUse the History button (📋) in the header to open a conversation.`
          : `No conversations yet. Start a new chat!`;

        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: resumeContent,
            timestamp: Date.now(),
          },
        ]);
        break;
      }
      case 'image':
        // Pre-fill for image generation
        setInputValue('/image ');
        break;
      case 'video':
        // Pre-fill for video generation
        setInputValue('/video ');
        break;
      case 'script':
        // Pre-fill for script writing
        setInputValue('/script ');
        break;
      case 'storyboard':
        // Pre-fill for storyboard creation
        setInputValue('/storyboard ');
        break;
      default:
        // For unhandled builtin commands, delegate to extension host
        clearInput();
        VSCodeMessages.invokeSlashCommand(command.id);
        break;
    }
  };

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

  // Background task handlers
  const handleCancelTask = (taskId: string) => {
    VSCodeMessages.cancelTask(taskId);
  };

  const handleRemoveTask = (taskId: string) => {
    VSCodeMessages.removeTask(taskId);
  };

  const handleViewTaskResult = (taskId: string) => {
    VSCodeMessages.viewTaskResult(taskId);
  };

  const handleClearCompletedTasks = () => {
    VSCodeMessages.clearCompletedTasks();
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

  // Get active tasks count for header badge
  const activeTasksCount = backgroundTasks.filter(t => t.status === 'queued' || t.status === 'processing').length;

  // Compute agent sessions for AgentControlCenter (only open tabs)
  const agentSessions: AgentSessionInfo[] = useMemo(() => {
    return openTabs.map(tab => ({
      conversationId: tab.conversationId,
      conversationTitle: tab.title,
      agentState: conversationAgentStateRef.current.get(tab.conversationId) ?? null,
      tokenCount: conversationTokenCountRef.current.get(tab.conversationId),
      queuedMessagesCount: messageQueue.getQueueForConversation(tab.conversationId).length,
      lastActivity: conversations.find(c => c.id === tab.conversationId)?.updatedAt,
    }));
  }, [openTabs, conversations, messageQueue.queue, agentStateVersion]); // Re-compute when open tabs, queue, or agent state changes

  // Get active agents count for header badge
  const activeAgentsCount = useMemo(() => getActiveSessions(agentSessions).length, [agentSessions]);

  // Handle stop agent for a conversation
  const handleStopAgent = useCallback((conversationId: string) => {
    VSCodeMessages.stopAgent(conversationId);
  }, []);

  // Handle navigate to conversation from agent control center (switch to existing tab)
  const handleNavigateToAgent = useCallback((conversationId: string) => {
    const tab = openTabs.find(t => t.conversationId === conversationId);
    if (tab) {
      handleSwitchTab(tab.id);
    }
  }, [openTabs, handleSwitchTab]);

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
        activeTasksCount={activeTasksCount}
        activeAgentsCount={activeAgentsCount}
        onSwitchTab={handleSwitchTab}
        onCloseTab={handleCloseTab}
        onNewChat={handleNewChat}
        onOpenConversation={handleOpenTab}
        onDeleteConversation={handleDeleteConversation}
        onClearAllConversations={handleClearAllConversations}
        onToggleTasks={() => setActiveTab(activeTab === 'tasks' ? 'chat' : 'tasks')}
        onToggleAgents={() => setActiveTab(activeTab === 'agents' ? 'chat' : 'agents')}
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
      ) : activeTab === 'tasks' ? (
        <AgentsPanel
          tasks={backgroundTasks}
          onCancelTask={handleCancelTask}
          onRemoveTask={handleRemoveTask}
          onViewResult={handleViewTaskResult}
          onClearCompleted={handleClearCompletedTasks}
        />
      ) : activeTab === 'agents' ? (
        <AgentControlCenter
          sessions={agentSessions}
          activeConversationId={activeConversationId}
          onNavigateToConversation={handleNavigateToAgent}
          onStopAgent={handleStopAgent}
        />
      ) : null}
      {showOnboarding && (
        <OnboardingFlow
          providerTemplates={settings.providerTemplates}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
