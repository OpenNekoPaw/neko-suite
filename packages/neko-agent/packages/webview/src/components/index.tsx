import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  Message,
  OpenTab,
  ConfiguredMCPServer,
  ConfiguredProvider,
  ShellExecutionMode,
  PromptMode,
  AgentState,
} from '@/components/types';
import { VSCodeMessages, postMessage } from '@/components/hooks/useVSCode';
import { Header } from '@/components/Header';
import { ChatView } from '@/components/ChatView';
import { SettingsView } from '@/components/SettingsView';
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
    modelPresets,
    setModelPresets,
    projectFiles,
    setProjectFiles,
    updateSettings,
  } = config;

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
      COMMON_SHORTCUTS.settings(() => {
        setActiveTab(activeTab === 'settings' ? 'chat' : 'settings');
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
      case 'settings':
        setActiveTab('settings');
        clearInput();
        break;
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

  // Settings handlers
  // Helper: Get adapter type from Platform data (builtin providers)
  const getAdapterType = (providerTypeId: string): string => {
    // Find builtin provider with this ID and get its adapter type
    const builtinProvider = settings.configuredProviders.find(
      p => p.builtin && (p.id === providerTypeId || p.type === providerTypeId)
    );
    return builtinProvider?.type || providerTypeId;
  };

  const handleAddProvider = (provider: {
    id?: string; // Optional: provided when editing, undefined when creating new
    type: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
  }) => {
    // Use existing ID when editing, generate new ID when creating
    const providerId = provider.id || `${provider.type}-${Date.now()}`;
    const isEditing = !!provider.id;

    // Get the correct adapter type from Platform builtin providers
    const adapterType = getAdapterType(provider.type);

    // Convert to ProviderConfig and use new API
    const providerConfig: import('@neko/shared').ProviderConfig = {
      id: providerId,
      name: provider.name || provider.type,
      displayName: provider.name || provider.type,
      type: adapterType as import('@neko/shared').ProviderType,
      apiUrl: provider.baseUrl || '',
      apiKey: provider.apiKey,
      enabled: true,
    };
    VSCodeMessages.updateProvider(providerConfig);

    // Also update local state immediately for responsiveness
    const newConfiguredProvider: ConfiguredProvider = {
      id: providerId,
      type: provider.type,
      name: provider.name || provider.type,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      enabled: true,
    };

    if (isEditing) {
      // Update existing provider
      setSettings(prev => ({
        ...prev,
        configuredProviders: prev.configuredProviders.map(p =>
          p.id === providerId ? newConfiguredProvider : p
        ),
      }));
    } else {
      // Add new provider
      setSettings(prev => ({
        ...prev,
        configuredProviders: [...prev.configuredProviders, newConfiguredProvider],
      }));
    }
  };

  const handleRemoveProvider = (providerId: string) => {
    // Use new API
    VSCodeMessages.deleteProvider(providerId);
    // Update local state
    setSettings(prev => ({
      ...prev,
      configuredProviders: prev.configuredProviders.filter(p => p.id !== providerId),
    }));
  };

  const handleToggleProvider = (providerId: string, enabled: boolean) => {
    // Find the provider and update it
    const provider = settings.configuredProviders.find(p => p.id === providerId);
    if (provider) {
      // Get the correct adapter type from Platform builtin providers
      const adapterType = getAdapterType(provider.type);

      const providerConfig: import('@neko/shared').ProviderConfig = {
        id: provider.id,
        name: provider.name,
        displayName: provider.name,
        type: adapterType as import('@neko/shared').ProviderType,
        apiUrl: provider.baseUrl || '',
        apiKey: provider.apiKey,
        enabled: enabled,
      };
      VSCodeMessages.updateProvider(providerConfig);
      // Update local state
      setSettings(prev => ({
        ...prev,
        configuredProviders: prev.configuredProviders.map(p =>
          p.id === providerId ? { ...p, enabled } : p
        ),
      }));
    }
  };

  const handleUpdateMCPServers = (servers: ConfiguredMCPServer[]) => {
    setSettings(prev => ({ ...prev, configuredMCPServers: servers }));
    // Persist each server to backend
    servers.forEach(server => {
      VSCodeMessages.updateMCPServer(server);
    });
  };

  const handleDeleteMCPServer = (serverId: string) => {
    setSettings(prev => ({
      ...prev,
      configuredMCPServers: prev.configuredMCPServers.filter(s => s.id !== serverId),
    }));
    VSCodeMessages.deleteMCPServer(serverId);
  };

  // Provider handlers for Platform ConfigManager
  const handleUpdateProviders = (providers: ConfiguredProvider[]) => {
    setSettings(prev => ({ ...prev, configuredProviders: providers }));
    // Persist each provider to backend
    providers.forEach(provider => {
      // Get the correct adapter type from Platform builtin providers
      const adapterType = getAdapterType(provider.type);

      const providerConfig: import('@neko/shared').ProviderConfig = {
        id: provider.id,
        name: provider.name,
        displayName: provider.name,
        type: adapterType as import('@neko/shared').ProviderType,
        apiUrl: provider.baseUrl || '',
        apiKey: provider.apiKey,
        enabled: provider.enabled ?? true,
      };
      VSCodeMessages.updateProvider(providerConfig);
    });
  };

  const handleDeleteProvider = (providerId: string) => {
    setSettings(prev => ({
      ...prev,
      configuredProviders: prev.configuredProviders.filter(p => p.id !== providerId),
    }));
    VSCodeMessages.deleteProvider(providerId);
  };

  // Model CRUD handlers
  const handleAddModel = (model: Omit<import('@neko/shared').ModelConfig, 'id'>) => {
    const newModel: import('@neko/shared').ModelConfig = {
      ...model,
      id: `model-${Date.now()}`,
    };
    setSettings(prev => ({
      ...prev,
      configuredModels: [...prev.configuredModels, newModel],
    }));
    VSCodeMessages.updateModel(newModel);
  };

  const handleUpdateModel = (model: import('@neko/shared').ModelConfig) => {
    setSettings(prev => ({
      ...prev,
      configuredModels: prev.configuredModels.map(m => m.id === model.id ? model : m),
    }));
    VSCodeMessages.updateModel(model);
  };

  const handleDeleteModel = (modelId: string) => {
    setSettings(prev => ({
      ...prev,
      configuredModels: prev.configuredModels.filter(m => m.id !== modelId),
    }));
    VSCodeMessages.deleteModel(modelId);
  };

  // Skill handlers
  const handleUpdateSkill = (skill: import('@neko/shared').ConfiguredSkill) => {
    setSettings(prev => ({
      ...prev,
      configuredSkills: prev.configuredSkills.map(s => s.name === skill.name ? skill : s),
    }));
    VSCodeMessages.updateSkill(skill);
  };

  const handleDeleteSkill = (skillName: string) => {
    setSettings(prev => ({
      ...prev,
      configuredSkills: prev.configuredSkills.filter(s => s.name !== skillName),
    }));
    VSCodeMessages.deleteSkill(skillName);
  };

  const handleUpdateCommand = (command: import('@neko/shared').ConfiguredSlashCommand) => {
    setSettings(prev => ({
      ...prev,
      configuredCommands: prev.configuredCommands.map(c => c.command === command.command ? command : c),
    }));
    VSCodeMessages.updateCommand(command);
  };

  const handleDeleteCommand = (commandName: string) => {
    setSettings(prev => ({
      ...prev,
      configuredCommands: prev.configuredCommands.filter(c => c.command !== commandName),
    }));
    VSCodeMessages.deleteCommand(commandName);
  };

  const handleDuplicateSkill = (skill: import('@neko/shared').ConfiguredSkill) => {
    // Determine target source:
    // - personal stays personal
    // - builtin/project go to project
    const targetSource = skill.source === 'personal' ? 'personal' : 'project';
    
    // Generate unique name by checking existing skills
    const baseName = skill.name.replace(/-copy(-\d+)?$/, ''); // Remove existing -copy suffix
    let newName = `${baseName}-copy`;
    let counter = 1;
    
    // Check if name already exists and increment counter
    while (settings.configuredSkills.some(s => s.name === newName)) {
      counter++;
      newName = `${baseName}-copy-${counter}`;
    }

    // Use duplicateSkill to copy the entire directory (including references, scripts, etc.)
    VSCodeMessages.duplicateSkill(skill, newName, targetSource);
    // Note: The skill list will be updated via the broadcast from ConfigBridge after scanning
  };

  const handleDuplicateCommand = (command: import('@neko/shared').ConfiguredSlashCommand) => {
    // Generate unique name by checking existing commands
    const baseName = command.command.replace(/-copy(-\d+)?$/, ''); // Remove existing -copy suffix
    let newCommandName = `${baseName}-copy`;
    let counter = 1;
    
    // Check if name already exists and increment counter
    while (settings.configuredCommands.some(c => c.command === newCommandName)) {
      counter++;
      newCommandName = `${baseName}-copy-${counter}`;
    }

    // Create a copy with a new command name
    // Use the source from the passed command (already computed in SkillSettings):
    // - personal stays personal
    // - builtin/project go to project
    const newCommand: import('@neko/shared').ConfiguredSlashCommand = {
      ...command,
      command: newCommandName,
    };
    setSettings(prev => ({
      ...prev,
      configuredCommands: [...prev.configuredCommands, newCommand],
    }));
    VSCodeMessages.updateCommand(newCommand);
  };

  const handleCreateSkill = (source: 'personal' | 'project') => {
    // Generate a unique name for the new skill
    const timestamp = Date.now();
    const newName = `new-skill-${timestamp}`;
    
    // Create the skill via VSCodeMessages
    VSCodeMessages.createSkill(newName, source);
    // Note: The skill list will be updated via the broadcast from ConfigBridge after scanning
  };

  // Test MCP server connection - returns Promise for async result
  const handleTestMCPServer = (server: ConfiguredMCPServer): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const requestId = `mcp-test-${Date.now()}`;

      const handleTestResult = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'mcpServerTestResult' && message.requestId === requestId) {
          window.removeEventListener('message', handleTestResult);
          resolve({
            success: message.success,
            error: message.error,
          });
        }
      };

      window.addEventListener('message', handleTestResult);

      // Send test request
      VSCodeMessages.testMCPServer({
        ...server,
        requestId,
      } as any);

      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleTestResult);
        resolve({
          success: false,
          error: 'Connection timeout (30s)',
        });
      }, 30000);
    });
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

  // Model preset handlers
  const handleConfigureModelPreset = (modelId: string, apiKey: string, baseUrl?: string) => {
    VSCodeMessages.configureModelPreset(modelId, apiKey, baseUrl);
  };

  const handleToggleModelPreset = (modelId: string, enabled: boolean) => {
    VSCodeMessages.toggleModelPreset(modelId, enabled);
  };

  const handleRemoveModelPresetConfig = (modelId: string) => {
    VSCodeMessages.removeModelPresetConfig(modelId);
  };

  // Export model config
  const handleExportModelConfig = (includeSecrets: boolean) => {
    VSCodeMessages.exportModelConfig(includeSecrets);
  };

  // Import model config - returns a promise for async handling
  const handleImportModelConfig = async (
    jsonString: string,
    options: { overwrite?: boolean; includeSecrets?: boolean }
  ): Promise<{ success: boolean; message: string }> => {
    return new Promise((resolve) => {
      // Set up one-time listener for response
      const handleResponse = (event: MessageEvent) => {
        if (event.data.type === 'modelConfigImported') {
          window.removeEventListener('message', handleResponse);
          resolve({
            success: event.data.success,
            message: event.data.message,
          });
        }
      };
      window.addEventListener('message', handleResponse);

      // Send import request
      VSCodeMessages.importModelConfig(jsonString, options);

      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        resolve({ success: false, message: 'Request timed out' });
      }, 30000);
    });
  };

  // Add custom model
  const handleAddCustomModel = async (
    configJson: string,
    apiKey?: string
  ): Promise<{ success: boolean; message: string }> => {
    return new Promise((resolve) => {
      // Set up one-time listener for response
      const handleResponse = (event: MessageEvent) => {
        if (event.data.type === 'customModelAdded') {
          window.removeEventListener('message', handleResponse);
          resolve({
            success: event.data.success,
            message: event.data.message,
          });
        }
      };
      window.addEventListener('message', handleResponse);

      // Send add request
      VSCodeMessages.addCustomModel(configJson, apiKey);

      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        resolve({ success: false, message: 'Request timed out' });
      }, 30000);
    });
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
        onToggleSettings={() => setActiveTab(activeTab === 'settings' ? 'chat' : 'settings')}
        onToggleTasks={() => setActiveTab(activeTab === 'tasks' ? 'chat' : 'tasks')}
        onToggleAgents={() => setActiveTab(activeTab === 'agents' ? 'chat' : 'agents')}
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
      ) : (
        <SettingsView
          settings={settings}
          onAddProvider={handleAddProvider}
          onRemoveProvider={handleRemoveProvider}
          onToggleProvider={handleToggleProvider}
          onUpdateProviders={handleUpdateProviders}
          onDeleteProvider={handleDeleteProvider}
          onAddModel={handleAddModel}
          onUpdateModel={handleUpdateModel}
          onDeleteModel={handleDeleteModel}
          onUpdateMCPServers={handleUpdateMCPServers}
          onDeleteMCPServer={handleDeleteMCPServer}
          onTestMCPServer={handleTestMCPServer}
          models={modelPresets}
          onConfigureModel={handleConfigureModelPreset}
          onToggleModel={handleToggleModelPreset}
          onRemoveModelConfig={handleRemoveModelPresetConfig}
          onExportConfig={handleExportModelConfig}
          onImportConfig={handleImportModelConfig}
          onAddCustomModel={handleAddCustomModel}
          skills={settings.configuredSkills}
          commands={settings.configuredCommands}
          onUpdateSkill={handleUpdateSkill}
          onDeleteSkill={handleDeleteSkill}
          onUpdateCommand={handleUpdateCommand}
          onDeleteCommand={handleDeleteCommand}
          onDuplicateSkill={handleDuplicateSkill}
          onDuplicateCommand={handleDuplicateCommand}
          onCreateSkill={handleCreateSkill}
        />
      )}
    </div>
  );
}
