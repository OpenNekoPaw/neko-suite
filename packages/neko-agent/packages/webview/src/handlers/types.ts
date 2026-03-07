/**
 * Message Handler Types
 *
 * Defines the context and handler interfaces for message processing.
 */

import type { MutableRefObject } from 'react';
import type {
  Message,
  ConversationSummary,
  OpenTab,
  TabType,
  SettingsState,
  AgentState,
} from '@/components/types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { ProjectFileInfo } from '@/hooks/useConfigState';

/**
 * Streaming state for a conversation
 */
export interface StreamingState {
  streamingMessageId: string | null;
  isThinking: boolean;
}

/**
 * Non-current conversation update function signature
 */
export type NonCurrentConversationUpdater = (
  messages: Message[],
  streaming: StreamingState
) => { messages: Message[]; streaming: StreamingState };

/**
 * Message handler context - provides access to all state and actions
 */
export interface MessageHandlerContext {
  // Current conversation ID
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;

  // Refs for conversation state
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;

  // Chat state setters
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;

  // Current streaming state (for handlers that need it)
  streamingMessageId: string | null;
  // Ref for immediate access (fixes race condition with async state updates)
  streamingMessageIdRef: MutableRefObject<string | null>;

  // Conversation state setters
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;

  // Tab state
  openTabs: OpenTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;

  // Settings state
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;

  // Background tasks
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>;

  // Model presets (kept for backward compatibility; setter is a no-op in current UI)
  setModelPresets: React.Dispatch<React.SetStateAction<unknown[]>>;

  // Project files
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;

  // Agent state (per-conversation indicator: idle/thinking/acting/streaming)
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  // Ref for conversation-specific agent states (session-bound)
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  // Force re-render when agent state changes (for useMemo recalculation)
  forceAgentStateUpdate: () => void;

  // Helper functions
  isCurrentConversation: (conversationId?: string) => boolean;
  updateNonCurrentConversation: (
    conversationId: string,
    updater: NonCurrentConversationUpdater
  ) => void;
}

/**
 * Message handler function signature
 */
export type MessageHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  context: MessageHandlerContext
) => void;

/**
 * Message handler registration
 */
export interface HandlerRegistration {
  type: string;
  handler: MessageHandler;
}
