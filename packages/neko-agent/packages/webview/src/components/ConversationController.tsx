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
import type {
  SettingsState,
  AgentState,
  ConversationSummary,
  OpenTab,
  PromptMode,
  TabType,
} from '@/components/types';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import {
  getWorkItemsForConversation,
  removeConversationWorkItems,
} from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type { MediaModelSelection } from '@/hooks/useUIState';
import { useConversationState, useTabManager } from '@/hooks';
import { useMessageHandler, type BoundActiveSkillIndicator } from '@/handlers';
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
  setProjectFiles,
  mentionItems,
  setMentionItems,
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
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ---- Per-conversation ref Maps ----
  const conversationTokenCountRef = useRef<Map<string, number>>(new Map());
  const conversationCompressingRef = useRef<Map<string, boolean>>(new Map());
  const conversationMediaCallCountRef = useRef<Map<string, number>>(new Map());
  const [, forceUpdate] = useState(0);

  // Prompt mode is session state, not global settings: each tab/conversation can plan independently.
  const [promptModeByConversation, setPromptModeByConversation] = useState<Map<string, PromptMode>>(
    () => new Map(),
  );
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
  const activeSkill = activeConversationId
    ? (activeSkillByConversation.get(activeConversationId) ?? null)
    : null;
  const setActiveSkill = useCallback<
    React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>
  >(
    (value) => {
      setActiveSkillByConversation((prev) => {
        const currentValue = activeConversationId ? (prev.get(activeConversationId) ?? null) : null;
        const nextValue = typeof value === 'function' ? value(currentValue) : value;
        const targetConversationId = nextValue?.conversationId ?? activeConversationId;
        if (!targetConversationId) return prev;

        const next = new Map(prev);
        if (nextValue) {
          next.set(targetConversationId, nextValue);
        } else {
          next.delete(targetConversationId);
        }
        return next;
      });
    },
    [activeConversationId],
  );

  // ---- Agent state ----
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const conversationAgentStateRef = useRef<Map<string, AgentState>>(new Map());
  const forceAgentStateUpdate = useCallback(() => forceUpdate((n) => n + 1), []);

  // ---- Context chips & ambient nodes ----
  const [contextChipsByConversation, setContextChipsByConversation] = useState<
    Map<string, AgentContextPayload[]>
  >(() => new Map());
  const [ambientNodes, setAmbientNodes] = useState<
    Array<{ nodeId: string; type: string; summary: string }>
  >([]);

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
      if (!activeConversationId) return;
      setContextChipsForConversation(activeConversationId, (prev) =>
        prev.filter((c) => c.id !== id),
      );
    },
    [activeConversationId, setContextChipsForConversation],
  );
  const handleAddContextChip = useCallback(
    (payload: AgentContextPayload) => {
      if (!activeConversationId) return;
      setContextChipsForConversation(activeConversationId, (prev) => {
        if (prev.some((c) => c.id === payload.id)) return prev;
        return [...prev, payload];
      });
    },
    [activeConversationId, setContextChipsForConversation],
  );
  const handleInjectContextChip = useCallback(
    (payload: AgentContextPayload, conversationId?: string | null) => {
      const targetConversationId = conversationId ?? activeConversationId;
      if (!targetConversationId) return;
      setContextChipsForConversation(targetConversationId, (prev) => {
        if (prev.some((c) => c.id === payload.id)) return prev;
        return [...prev, payload];
      });
    },
    [activeConversationId, setContextChipsForConversation],
  );

  const contextChips = activeConversationId
    ? (contextChipsByConversation.get(activeConversationId) ?? [])
    : [];

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
      setPromptModeByConversation((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
    },
    [setWorkItemsByConversation],
  );

  const cleanupAllConversations = useCallback(() => {
    sessionCleanupRef.current?.cleanupAllConversations();
    conversationMediaCallCountRef.current.clear();
    setWorkItemsByConversation(() => new Map());
    setContextChipsByConversation(() => new Map());
    setActiveSkillByConversation(() => new Map());
    setPromptModeByConversation(() => new Map());
  }, [setWorkItemsByConversation]);

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
  const workItems = getWorkItemsForConversation(workItemsByConversation, activeConversationId);
  const activePromptMode = activeConversationId
    ? (promptModeByConversation.get(activeConversationId) ?? 'default')
    : settings.promptMode;
  const activeSettings = useMemo<SettingsState>(
    () => ({ ...settings, promptMode: activePromptMode }),
    [settings, activePromptMode],
  );
  const updateActiveSettings = useCallback(
    (partial: Partial<SettingsState>) => {
      const { promptMode, ...globalSettings } = partial;
      if (promptMode && activeConversationId) {
        setPromptModeForConversation(activeConversationId, promptMode);
      }
      if (Object.keys(globalSettings).length > 0) {
        updateSettings(globalSettings);
      }
    },
    [activeConversationId, setPromptModeForConversation, updateSettings],
  );
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
    setWorkItemsByConversation,
    setPluginsAvailable,
    setProjectFiles,
    setMentionItems,
    setPluginCommands,
    setAgentState,
    conversationAgentStateRef,
    forceAgentStateUpdate,
    setSkills,
    setActiveSkill,
    updateSettings,
    setPromptModeForConversation,
    setShowOnboarding,
    setGlobalError,
    conversationTokenCountRef,
    conversationCompressingRef,
    forceContextUpdate: triggerForceUpdate,
  });

  useEffect(() => {
    if (!globalError) return;
    const timer = window.setTimeout(() => setGlobalError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [globalError]);

  // ---- Request data on mount ----
  useEffect(() => {
    VSCodeMessages.getConversations();
    VSCodeMessages.getActiveConversation();
    VSCodeMessages.getSettings();
    VSCodeMessages.getAgentStates();
    VSCodeMessages.getConfig();
    VSCodeMessages.getSkills();
    VSCodeMessages.getTabState();
  }, []);

  // ---- Context token count on conversation change ----
  useEffect(() => {
    if (activeConversationId) {
      VSCodeMessages.getContextTokenCount(activeConversationId);
      VSCodeMessages.getTasks(activeConversationId);
      VSCodeMessages.getPromptMode(activeConversationId);
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
          settings={activeSettings}
          updateSettings={updateActiveSettings}
          // Model selection (owned here for settingsData hydration)
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          mediaModelSelection={mediaModelSelection}
          setMediaModelSelection={setMediaModelSelection}
          mentionItems={mentionItems}
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
          // Context chips
          contextChips={contextChips}
          ambientNodes={ambientNodes}
          onAddContextChip={handleAddContextChip}
          onRemoveContextChip={handleRemoveContextChip}
          onInjectContextChip={handleInjectContextChip}
          // Agent state
          agentState={agentState}
          // Message handler (for pre-intercept)
          handleMessage={handleMessage}
          setAmbientNodes={setAmbientNodes}
          onNewChat={handleNewChat}
          // Session cleanup registration
          sessionCleanupRef={sessionCleanupRef}
        />
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
