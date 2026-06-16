/**
 * Message Handler Types
 *
 * Defines the context and handler interfaces for message processing.
 */

import type { MutableRefObject } from 'react';
import type { ExtensionToWebviewMessage, MessageOfType } from './messages';
import type {
  Message,
  ConversationSummary,
  OpenTab,
  PromptMode,
  TabType,
  SettingsState,
  AgentState,
} from '@neko-agent/types';
import type { MediaModelSelection } from '@/hooks/useUIState';
import type { AgentWorkItemStore } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { ProjectFileInfo } from '@/hooks/useConfigState';
import type {
  SkillSummary,
  MentionItem,
  PluginSlashCommandDef,
} from '@/components/ChatView/InputArea/types';
import type { ActiveSkillIndicator } from '@/components/ChatView/SkillIndicator';

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
  queuedMessageCount?: number;
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
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isThinking: boolean;
  setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setQueuedMessageCount?: React.Dispatch<React.SetStateAction<number>>;
  streamingMessageId: string | null;
  queuedMessageCount?: number;
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
  activeTabId: string | null;
  setOpenTabs: React.Dispatch<React.SetStateAction<OpenTab[]>>;
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
}

/** Settings and model configuration */
export interface SettingsContext {
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  setMediaModelSelection: React.Dispatch<React.SetStateAction<MediaModelSelection>>;
  updateSettings: (partial: Partial<SettingsState>) => void;
  setPromptModeForConversation: (conversationId: string, mode: PromptMode) => void;
}

/** Per-conversation agent execution state */
export interface AgentStateContext {
  setAgentState: React.Dispatch<React.SetStateAction<AgentState | null>>;
  conversationAgentStateRef: MutableRefObject<Map<string, AgentState>>;
  forceAgentStateUpdate: () => void;
}

/** Skill management: available skills and active indicator */
export interface SkillContext {
  setSkills: React.Dispatch<React.SetStateAction<SkillSummary[]>>;
  setActiveSkill: React.Dispatch<React.SetStateAction<BoundActiveSkillIndicator | null>>;
}

/** Global, non-conversation-scoped UI notifications */
export interface GlobalNotificationContext {
  setGlobalError: React.Dispatch<React.SetStateAction<string | null>>;
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
    GlobalNotificationContext,
    ContextManagementContext,
    HelperContext {
  // Conversation list management
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  // Observable work items
  setWorkItemsByConversation: React.Dispatch<React.SetStateAction<AgentWorkItemStore>>;
  // Project files
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFileInfo[]>>;
  // Unified @mention items (files + canvas nodes + characters)
  mentionSearchFilter: string;
  setMentionItems: React.Dispatch<React.SetStateAction<MentionItem[]>>;
  // Plugin slash commands registered by external extensions
  setPluginCommands: React.Dispatch<React.SetStateAction<PluginSlashCommandDef[]>>;
  setPluginsAvailable: React.Dispatch<React.SetStateAction<PluginsAvailable>>;
  // SSO/Onboarding
  setShowOnboarding: React.Dispatch<React.SetStateAction<boolean>>;
}

export type WebviewMessageType = ExtensionToWebviewMessage['type'];

/**
 * Type guard that keeps the runtime dispatch boundary aligned with the protocol union.
 */
function isMessageOfType<T extends WebviewMessageType>(
  message: ExtensionToWebviewMessage,
  type: T,
): message is MessageOfType<T> {
  return message.type === type;
}

/**
 * Message handler function signature bound to a concrete protocol message type.
 */
export type MessageHandler<T extends WebviewMessageType = WebviewMessageType> = (
  message: MessageOfType<T>,
  context: MessageHandlerContext,
) => void;

/**
 * Type-safe message handler that receives a narrowed message type.
 *
 * Usage: `const handler: TypedMessageHandler<'streamText'> = (message, ctx) => { ... }`
 * The `message` parameter is automatically narrowed to `StreamTextMessage`.
 */
export type TypedMessageHandler<T extends WebviewMessageType> = (
  message: MessageOfType<T>,
  context: MessageHandlerContext,
) => void;

/**
 * Erased dispatcher stored by the registry after defineHandler() validates the
 * concrete type/handler pairing at the module boundary.
 */
export type ProtocolMessageDispatcher = (
  message: ExtensionToWebviewMessage,
  context: MessageHandlerContext,
) => void;

/**
 * Message handler registration
 */
export interface HandlerRegistration<T extends WebviewMessageType = WebviewMessageType> {
  type: T;
  handler: ProtocolMessageDispatcher;
}

export function defineHandler<T extends WebviewMessageType>(
  type: T,
  handler: MessageHandler<T>,
): HandlerRegistration<T> {
  return {
    type,
    handler: (message, context) => {
      if (isMessageOfType(message, type)) {
        handler(message, context);
      }
    },
  };
}
