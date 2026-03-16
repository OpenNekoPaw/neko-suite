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
import type { SkillSummary } from '@/components/ChatView/InputArea/types';
import type {
  SkillConfirmRequest,
  ActiveSkillIndicator,
} from '@/components/ChatView/SkillConfirmBanner';

/** Skill confirm request bound to a specific conversation */
export interface BoundSkillConfirmRequest extends SkillConfirmRequest {
  conversationId: string;
}

/** Active skill indicator bound to a specific conversation */
export interface BoundActiveSkillIndicator extends ActiveSkillIndicator {
  conversationId: string;
}

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
  streaming: StreamingState,
) => { messages: Message[]; streaming: StreamingState };

// =============================================================================
// Semantic sub-interfaces grouped by responsibility
// =============================================================================

/** Chat streaming state: message list, thinking indicator, streaming ID */
export interface ChatStateContext {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  streamingMessageId: string | null;
  streamingMessageIdRef: MutableRefObject<string | null>;
}

/** Conversation refs: current ID + per-conversation message/streaming maps */
export interface ConversationRefContext {
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  conversationMessagesRef: MutableRefObject<Map<string, Message[]>>;
  conversationStreamingRef: MutableRefObject<Map<string, StreamingState>>;
}

/** Tab management: open tabs, active tab selection */
export interface TabContext {
  openTabs: OpenTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
}

/** Settings and model configuration */
export interface SettingsContext {
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  updateSettings: (partial: Partial<SettingsState>) => void;
}

/** Per-conversation agent execution state */
export interface AgentStateContext {
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  forceAgentStateUpdate: () => void;
}

/** Skill management: available skills, confirmation, active indicator */
export interface SkillContext {
  setSkills: React.Dispatch<React.SetStateAction<SkillSummary[]>>;
  setPendingSkillConfirm: React.Dispatch<React.SetStateAction<BoundSkillConfirmRequest | null>>;
  setActiveSkill: React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>;
}

/** Context window token tracking and compression */
export interface ContextManagementContext {
  conversationTokenCountRef: MutableRefObject<Map<string, number>>;
  conversationCompressingRef: MutableRefObject<Map<string, boolean>>;
  forceUpdate: () => void;
}

/** Routing helpers for current/non-current conversation updates */
export interface HelperContext {
  isCurrentConversation: (conversationId?: string) => boolean;
  updateNonCurrentConversation: (
    conversationId: string,
    updater: NonCurrentConversationUpdater,
  ) => void;
}

// =============================================================================
// Full context via intersection — 100% backward compatible
// =============================================================================

/**
 * Message handler context - provides access to all state and actions.
 *
 * Composed from semantic sub-interfaces so individual handlers can
 * reference only the subset they need (e.g., `ChatStateContext & ConversationRefContext`).
 */
export interface MessageHandlerContext
  extends
    ChatStateContext,
    ConversationRefContext,
    TabContext,
    SettingsContext,
    AgentStateContext,
    SkillContext,
    ContextManagementContext,
    HelperContext {
  // Conversation list management
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  // Background tasks
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>;
  // Project files
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  // SSO/Onboarding
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Message handler function signature
 */
export type MessageHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  context: MessageHandlerContext,
) => void;

/**
 * Message handler registration
 */
export interface HandlerRegistration {
  type: string;
  handler: MessageHandler;
}
