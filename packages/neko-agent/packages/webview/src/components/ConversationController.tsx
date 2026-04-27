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

import { type ReactNode, useEffect, useCallback, useState, useRef } from 'react';
import type { AgentContextPayload } from '@neko/shared';
import type {
  SettingsState,
  AgentState,
  ConversationSummary,
  OpenTab,
  TabType,
} from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type { MediaModelSelection } from '@/hooks/useUIState';
import { useConversationState, useTabManager } from '@/hooks';
import {
  useMessageHandler,
  type BoundSkillConfirmRequest,
  type BoundActiveSkillIndicator,
} from '@/handlers';
import { ChatWorkspace } from './ChatWorkspace';

// =============================================================================
// Props
// =============================================================================

interface HeaderRenderProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  activeView: TabType;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearAllConversations: () => void;
}

export interface ConversationControllerProps {
  // From AppShell (config + resource state)
  settings: SettingsState;
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  mentionItems: MentionItem[];
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  pluginCommands: PluginSlashCommandDef[];
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  updateSettings: (partial: Partial<SettingsState>) => void;
  backgroundTasks: BackgroundTask[];
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>;
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
  renderHeader: (props: HeaderRenderProps) => ReactNode;
}

// =============================================================================
// Component
// =============================================================================

export function ConversationController({
  settings,
  setSettings,
  setProjectFiles,
  mentionItems,
  setMentionItems,
  pluginCommands,
  setPluginCommands,
  updateSettings,
  backgroundTasks,
  setBackgroundTasks,
  setShowOnboarding,
  renderHeader,
}: ConversationControllerProps) {
  // ---- Conversation state ----
  const conversation = useConversationState();
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

  // ---- UI state for active tab ----
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  // Model selection state — owned here so the settingsData handler can hydrate
  // it on reload. Passed down to ChatWorkspace which reads it for send().
  const [selectedModel, setSelectedModel] = useState('auto');
  const [mediaModelSelection, setMediaModelSelection] = useState<MediaModelSelection>({
    image: 'none',
    video: 'none',
    audio: 'none',
  });

  // ---- Per-conversation ref Maps ----
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  const conversationMediaCallCountRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  // ---- Skills state ----
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [pendingSkillConfirm, setPendingSkillConfirm] = useState<BoundSkillConfirmRequest | null>(
    null,
  );
  const [activeSkill, setActiveSkill] = useState<BoundActiveSkillIndicator | null>(null);

  // ---- Agent state ----
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  const forceAgentStateUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  // ---- Context chips & ambient nodes ----
  const [contextChips, setContextChips] = useState<AgentContextPayload[]>([]);
  const [ambientNodes, setAmbientNodes] = useState<
    Array<{ nodeId: string; type: string; summary: string }>
  >([]);
  const handleRemoveContextChip = useCallback((id: string) => {
    setContextChips((prev) => prev.filter((c) => c.id !== id));
  }, []);
  const handleAddContextChip = useCallback((payload: AgentContextPayload) => {
    setContextChips((prev) => {
      if (prev.some((c) => c.id === payload.id)) return prev;
      return [...prev, payload];
    });
  }, []);

  // Session-bound cleanup ref — ChatWorkspace registers its useConversationSession cleanup
  // callbacks here so ConversationController can invoke them when deleting conversations.
  const sessionCleanupRef = useRef<{
    cleanupConversation: (id: string) => void;
    cleanupAllConversations: () => void;
  } | null>(null);

  const cleanupConversation = useCallback((conversationId: string) => {
    // Delegate to ChatWorkspace's useConversationSession (cleans input/attachment caches)
    sessionCleanupRef.current?.cleanupConversation(conversationId);
    // Also clean shared refs not covered by useConversationSession
    conversationMediaCallCountRef.current.delete(conversationId);
  }, []);

  const cleanupAllConversations = useCallback(() => {
    sessionCleanupRef.current?.cleanupAllConversations();
    conversationMediaCallCountRef.current.clear();
  }, []);

  // ---- Derived state for current conversation ----
  const contextTokenCount = activeConversationId
    ? (conversationTokenCountRef.current.get(activeConversationId) ?? 0)
    : 0;
  const isCompressing = activeConversationId
    ? (conversationCompressingRef.current.get(activeConversationId) ?? false)
    : false;
  const mediaModelCallCount = activeConversationId
    ? (conversationMediaCallCountRef.current.get(activeConversationId) ?? 0)
    : 0;
  const activeTabConversationId = activeTabId
    ? (openTabs.find((tab) => tab.id === activeTabId)?.conversationId ?? null)
    : null;

  const triggerForceUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  // ---- Message handler ----
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
    setMediaModelSelection,
    setBackgroundTasks,
    setProjectFiles,
    setMentionItems,
    setPluginCommands,
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

  // ---- Request data on mount ----
  useEffect(() => {
    VSCodeMessages.getConversations();
    VSCodeMessages.getActiveConversation();
    VSCodeMessages.getSettings();
    VSCodeMessages.getTasks();
    VSCodeMessages.getAgentStates();
    VSCodeMessages.getConfig();
    VSCodeMessages.getTabState();
  }, []);

  // ---- Context token count on conversation change ----
  useEffect(() => {
    if (activeConversationId) {
      VSCodeMessages.getContextTokenCount(activeConversationId);
    }
  }, [activeConversationId]);

  // ---- Sync agent state on conversation change ----
  useEffect(() => {
    if (activeConversationId) {
      const savedState = conversationAgentStateRef.current.get(activeConversationId);
      setAgentState(savedState || null);
    } else {
      setAgentState(null);
    }
  }, [activeConversationId]);

  // ---- Conversation CRUD callbacks ----
  const handleNewChat = useCallback(() => {
    VSCodeMessages.newConversation();
    setActiveTab('chat');
  }, []);

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      cleanupConversation(conversationId);
      const tab = openTabs.find((t) => t.conversationId === conversationId);
      if (tab) {
        const tabIndex = openTabs.findIndex((t) => t.id === tab.id);
        const newTabs = openTabs.filter((t) => t.id !== tab.id);
        setOpenTabs(newTabs);
        if (activeTabId === tab.id && newTabs.length > 0) {
          const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
          const newActiveTab = newTabs[newActiveIndex];
          if (newActiveTab) {
            setActiveTabId(newActiveTab.id);
            VSCodeMessages.switchConversation(newActiveTab.conversationId);
          }
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }
      }
      VSCodeMessages.deleteConversation(conversationId);
    },
    [openTabs, activeTabId, cleanupConversation, setOpenTabs, setActiveTabId],
  );

  const handleClearAllConversations = useCallback(() => {
    cleanupAllConversations();
    setOpenTabs([]);
    setActiveTabId(null);
    clearMessages();
    VSCodeMessages.clearAllConversations();
  }, [cleanupAllConversations, setOpenTabs, setActiveTabId, clearMessages]);

  // ---- Tab management ----
  const { handleOpenTab, handleCloseTab, handleSwitchTab } = useTabManager({
    openTabs,
    setOpenTabs,
    activeTabId,
    setActiveTabId,
    conversations,
    setActiveTab,
    onNewChat: handleNewChat,
  });

  return (
    <>
      {renderHeader({
        tabs: openTabs,
        activeTabId,
        activeView: activeTab,
        conversations,
        activeConversationId,
        onSwitchTab: handleSwitchTab,
        onCloseTab: handleCloseTab,
        onNewChat: handleNewChat,
        onOpenConversation: handleOpenTab,
        onDeleteConversation: handleDeleteConversation,
        onClearAllConversations: handleClearAllConversations,
      })}

      {activeTab === 'chat' ? (
        <ChatWorkspace
          // Conversation state
          messages={messages}
          setMessages={setMessages}
          isThinking={isThinking}
          setIsThinking={setIsThinking}
          streamingMessageId={streamingMessageId}
          setStreamingMessageId={setStreamingMessageId}
          streamingMessageIdRef={streamingMessageIdRef}
          activeConversationId={activeConversationId}
          activeConversationIdRef={activeConversationIdRef}
          activeTabConversationId={activeTabConversationId}
          clearMessages={clearMessages}
          // Config
          settings={settings}
          updateSettings={updateSettings}
          // Model selection (owned here for settingsData hydration)
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          mediaModelSelection={mediaModelSelection}
          setMediaModelSelection={setMediaModelSelection}
          mentionItems={mentionItems}
          pluginCommands={pluginCommands}
          // Resources
          backgroundTasks={backgroundTasks}
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
          pendingSkillConfirm={pendingSkillConfirm}
          activeSkill={activeSkill}
          setPendingSkillConfirm={setPendingSkillConfirm}
          setActiveSkill={setActiveSkill}
          // Context chips
          contextChips={contextChips}
          ambientNodes={ambientNodes}
          onAddContextChip={handleAddContextChip}
          onRemoveContextChip={handleRemoveContextChip}
          // Agent state
          agentState={agentState}
          // Message handler (for pre-intercept)
          handleMessage={handleMessage}
          setContextChips={setContextChips}
          setAmbientNodes={setAmbientNodes}
          onNewChat={handleNewChat}
          // Session cleanup registration
          sessionCleanupRef={sessionCleanupRef}
        />
      ) : null}
    </>
  );
}
