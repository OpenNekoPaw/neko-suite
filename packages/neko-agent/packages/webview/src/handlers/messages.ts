/**
 * Extension → Webview Message Contracts
 *
 * Discriminated union of all messages sent from the Extension Host to the Webview.
 * Each interface has a literal `type` discriminant used by MessageHandlerRegistry.
 *
 * Adding a new message type:
 *   1. Define an interface with a unique `type` literal
 *   2. Add it to the ExtensionToWebviewMessage union
 *   3. Register a handler in the appropriate *-handlers.ts file
 */

import type { AgentPhase, ConversationSummary, Message, OpenTab, Plan } from '@/components/types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { AgentContextPayload, ProviderConfig } from '@neko/shared';

// =============================================================================
// Streaming Messages
// =============================================================================

export interface ThinkingMessage {
  type: 'thinking';
  conversationId?: string;
}

export interface StreamTextMessage {
  type: 'streamText';
  content?: string;
  conversationId?: string;
  messageId?: string;
}

export interface StreamCompleteMessage {
  type: 'streamComplete';
  conversationId?: string;
  messageId?: string;
}

export interface StreamThinkingMessage {
  type: 'streamThinking';
  content?: string;
  conversationId?: string;
  messageId?: string;
}

export interface MessageCancelledMessage {
  type: 'messageCancelled';
  conversationId?: string;
}

export interface MessageQueuedMessage {
  type: 'messageQueued';
  content?: string;
  conversationId?: string;
}

export interface AgentPhaseMessage {
  type: 'agentPhase';
  phase: AgentPhase;
  toolName?: string;
  timestamp?: number;
  conversationId?: string;
}

export interface AgentStateSnapshotMessage {
  type: 'agentStateSnapshot';
  agentStates: Array<{
    conversationId: string;
    phase?: AgentPhase;
    toolName?: string;
    startedAt?: number;
  }>;
}

// =============================================================================
// Conversation Messages
// =============================================================================

export interface ErrorMessage {
  type: 'error';
  message?: string;
  conversationId?: string;
}

export interface HistoryClearedMessage {
  type: 'historyCleared';
}

export interface ConversationListMessage {
  type: 'conversationList';
  conversations: ConversationSummary[];
}

export interface ActiveConversationMessage {
  type: 'activeConversation';
  conversation?: {
    id: string;
    title?: string;
    messages?: Message[];
  };
}

// =============================================================================
// Config Messages
// =============================================================================

/**
 * Settings data from Extension. Wire format is loosely typed because the handler
 * maps it to SettingsState (different shape). Typed as index-access to preserve
 * backward compatibility with the handler's property access patterns.
 */
export interface SettingsDataMessage {
  type: 'settingsData';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ProjectFilesMessage {
  type: 'projectFiles';
  files?: Array<{ path: string; name: string; type: 'file' | 'folder'; icon?: string }>;
  mentionExtras?: Array<{
    type: 'canvas-node' | 'character' | 'scene';
    id: string;
    label: string;
    summary: string;
  }>;
}

export interface ConfigStateMessage {
  type: 'configState';
  config?: {
    providers?: ProviderConfig[];
  };
}

export interface ConfigChangedMessage {
  type: 'configChanged';
}

export interface McpServerTestResultMessage {
  type: 'mcpServerTestResult';
  serverId?: string;
  success?: boolean;
  error?: string;
}

export interface PluginCommandsMessage {
  type: 'pluginCommands';
  commands?: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    extensionId: string;
  }>;
}

// =============================================================================
// Tool Messages
// =============================================================================

export interface ToolCallMessage {
  type: 'toolCall';
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'toolResult';
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  success: boolean;
  data?: unknown;
  error?: string;
  plan?: Plan;
}

export interface ToolConfirmationMessage {
  type: 'toolConfirmation';
  conversationId?: string;
  toolCallId: string;
  toolName?: string;
  action?: string;
  description?: string;
  details?: Record<string, unknown>;
}

export interface PlanStepStatusUpdateMessage {
  type: 'planStepStatusUpdate';
  planId: string;
  stepId: string;
  status: string;
  newDescription?: string;
  conversationId?: string;
}

export interface PlanStatusUpdateMessage {
  type: 'planStatusUpdate';
  planId: string;
  status: string;
  conversationId?: string;
}

// =============================================================================
// Task Messages
// =============================================================================

export interface TasksUpdatedMessage {
  type: 'tasksUpdated';
  tasks: BackgroundTask[];
}

export interface TaskCreatedMessage {
  type: 'taskCreated';
  task: BackgroundTask;
}

export interface TaskUpdatedMessage {
  type: 'taskUpdated';
  task: BackgroundTask;
}

export interface TaskRemovedMessage {
  type: 'taskRemoved';
  taskId: string;
}

// =============================================================================
// Tab Messages
// =============================================================================

export interface TabStateMessage {
  type: 'tabState';
  tabState?: {
    openTabs?: OpenTab[];
    activeTabId?: string | null;
  };
}

// =============================================================================
// Command Messages
// =============================================================================

export interface SlashCommandResultMessage {
  type: 'slashCommandResult';
  success: boolean;
  action?: string;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
}

// =============================================================================
// Skill Messages
// =============================================================================

/** Skills list from Extension. Wire format maps to SkillSummary[] in handler. */
export interface SkillsListMessage {
  type: 'skillsList';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface SkillInjectionMessage {
  type: 'skillInjection';
  skillName: string;
  allowedTools?: string[];
  conversationId?: string;
}

// =============================================================================
// Context Messages
// =============================================================================

export interface ContextTokenCountMessage {
  type: 'contextTokenCount';
  conversationId?: string;
  tokenCount?: number;
}

export interface CompressionResultMessage {
  type: 'compressionResult';
  conversationId?: string;
  compressedTokens?: number;
}

export interface CompressionErrorMessage {
  type: 'compressionError';
  conversationId?: string;
  error?: string;
}

// =============================================================================
// Media Task Messages
// =============================================================================

export interface MediaTaskCreatedMessage {
  type: 'mediaTaskCreated';
  task: {
    id: string;
    type: string;
    status: string;
    progress: number;
    providerId: string;
    modelId: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    outputs?: Array<{
      url: string;
      width?: number;
      height?: number;
      duration?: number;
      thumbnailUrl?: string;
    }>;
    error?: { code: string; message: string };
    request: { prompt: string };
  };
  conversationId?: string;
}

export interface MediaTaskProgressMessage {
  type: 'mediaTaskProgress';
  task: MediaTaskCreatedMessage['task'];
}

// =============================================================================
// Pre-intercepted Messages (previously handled in AIAssistant directly)
// =============================================================================

export interface ExternalMessage {
  type: 'externalMessage';
  message?: string;
}

export interface PrefillInputMessage {
  type: 'prefillInput';
  message?: string;
}

export interface InjectContextMessage {
  type: 'injectContext';
  payload?: AgentContextPayload;
}

export interface AmbientCanvasUpdateMessage {
  type: 'ambientCanvasUpdate';
  nodes?: Array<{ nodeId: string; type: string; summary: string }>;
}

// =============================================================================
// Discriminated Union
// =============================================================================

export type ExtensionToWebviewMessage =
  // Streaming
  | ThinkingMessage
  | StreamTextMessage
  | StreamCompleteMessage
  | StreamThinkingMessage
  | MessageCancelledMessage
  | MessageQueuedMessage
  | AgentPhaseMessage
  | AgentStateSnapshotMessage
  // Conversation
  | ErrorMessage
  | HistoryClearedMessage
  | ConversationListMessage
  | ActiveConversationMessage
  // Config
  | SettingsDataMessage
  | ProjectFilesMessage
  | ConfigStateMessage
  | ConfigChangedMessage
  | McpServerTestResultMessage
  | PluginCommandsMessage
  // Tool
  | ToolCallMessage
  | ToolResultMessage
  | ToolConfirmationMessage
  | PlanStepStatusUpdateMessage
  | PlanStatusUpdateMessage
  // Task
  | TasksUpdatedMessage
  | TaskCreatedMessage
  | TaskUpdatedMessage
  | TaskRemovedMessage
  // Tab
  | TabStateMessage
  // Command
  | SlashCommandResultMessage
  // Skill
  | SkillsListMessage
  | SkillInjectionMessage
  // Context
  | ContextTokenCountMessage
  | CompressionResultMessage
  | CompressionErrorMessage
  // Media
  | MediaTaskCreatedMessage
  | MediaTaskProgressMessage
  // Pre-intercepted
  | ExternalMessage
  | PrefillInputMessage
  | InjectContextMessage
  | AmbientCanvasUpdateMessage;

/**
 * Extract a specific message type from the union by its `type` literal.
 *
 * Usage: `MessageOfType<'streamText'>` → `StreamTextMessage`
 */
export type MessageOfType<T extends ExtensionToWebviewMessage['type']> = Extract<
  ExtensionToWebviewMessage,
  { type: T }
>;
