/**
 * Unified Agent Message Types
 *
 * Defines all message types for communication between:
 * - Extension Host and Webview (assistant)
 * - Agent session events
 * - CLI output events
 *
 * This is the Single Source of Truth for agent-related message types.
 */
import type { TokenUsage } from './platform';
/**
 * All possible agent message types
 */
export type AgentMessageType = 'text' | 'streamText' | 'streamComplete' | 'thinking' | 'streamThinking' | 'thinkingComplete' | 'toolCall' | 'toolResult' | 'toolConfirmation' | 'planStepStatusUpdate' | 'planStatusUpdate' | 'agentPhase' | 'agentStateSnapshot' | 'response' | 'messageQueued' | 'messageCancelled' | 'conversationList' | 'activeConversation' | 'historyCleared' | 'error' | 'slashCommandResult' | 'configState' | 'configChanged' | 'settingsData' | 'projectFiles' | 'tasksUpdated' | 'taskCreated' | 'taskUpdated' | 'taskRemoved' | 'tabState' | 'externalMessage' | 'prefillInput' | 'modelPresetsData' | 'modelPresetConfigured' | 'modelPresetToggled' | 'modelPresetConfigRemoved' | 'mcpServerTestResult' | 'workflowTestResult' | 'skillsData' | 'skillsChanged' | 'hooksData' | 'hooksChanged';
/**
 * Base interface for all agent messages
 */
export interface AgentMessageBase {
    /** Message type discriminator */
    type: AgentMessageType;
    /** Conversation ID (optional, for multi-conversation support) */
    conversationId?: string;
    /** Message ID (optional, for streaming updates) */
    messageId?: string;
    /** Timestamp (optional) */
    timestamp?: number;
}
/**
 * Text content message (final or streaming)
 */
export interface TextMessage extends AgentMessageBase {
    type: 'text' | 'streamText';
    /** Text content */
    content: string;
    /** Message ID for streaming updates */
    messageId?: string;
}
/**
 * Stream complete notification
 */
export interface StreamCompleteMessage extends AgentMessageBase {
    type: 'streamComplete';
    /** Final message ID */
    messageId?: string;
    /** Token usage info */
    usage?: TokenUsage;
}
/**
 * Agent response message (initial response creation)
 */
export interface AgentResponseMessage extends AgentMessageBase {
    type: 'response';
    /** Initial content */
    content?: string;
    /** Message ID */
    messageId: string;
}
/**
 * Thinking content message
 */
export interface ThinkingMessage extends AgentMessageBase {
    type: 'thinking' | 'streamThinking';
    /** Thinking content */
    content: string;
    /** Message ID for streaming updates */
    messageId?: string;
}
/**
 * Thinking complete notification
 */
export interface ThinkingCompleteMessage extends AgentMessageBase {
    type: 'thinkingComplete';
    /** Message ID */
    messageId?: string;
}
/**
 * Tool call message
 */
export interface ToolCallMessage extends AgentMessageBase {
    type: 'toolCall';
    /** Tool call ID */
    toolCallId: string;
    /** Tool name */
    toolName: string;
    /** Tool arguments */
    arguments: Record<string, unknown>;
    /** Server name (for MCP tools) */
    serverName?: string;
    /** Message ID */
    messageId?: string;
}
/**
 * Tool result message
 */
export interface ToolResultMessage extends AgentMessageBase {
    type: 'toolResult';
    /** Tool call ID */
    toolCallId: string;
    /** Tool name */
    toolName?: string;
    /** Whether execution was successful */
    success: boolean;
    /** Result data */
    result?: unknown;
    /** Error message if failed */
    error?: string;
    /** Message ID */
    messageId?: string;
}
/**
 * Tool confirmation request
 */
export interface ToolConfirmationMessage extends AgentMessageBase {
    type: 'toolConfirmation';
    /** Tool call ID */
    toolCallId: string;
    /** Tool name */
    toolName: string;
    /** Tool arguments */
    arguments: Record<string, unknown>;
    /** Server name (for MCP tools) */
    serverName?: string;
    /** Message ID */
    messageId?: string;
}
/**
 * Plan step status values
 */
export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
/**
 * Plan status values
 */
export type PlanStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
/**
 * Plan step status update
 */
export interface PlanStepStatusUpdateMessage extends AgentMessageBase {
    type: 'planStepStatusUpdate';
    /** Plan ID */
    planId: string;
    /** Step ID */
    stepId: string;
    /** New status */
    status: PlanStepStatus;
    /** Error message if failed */
    error?: string;
    /** Output preview */
    outputPreview?: string;
}
/**
 * Plan status update
 */
export interface PlanStatusUpdateMessage extends AgentMessageBase {
    type: 'planStatusUpdate';
    /** Plan ID */
    planId: string;
    /** New status */
    status: PlanStatus;
    /** Error message if failed */
    error?: string;
}
/**
 * Agent execution phase
 */
export type AgentPhase = 'idle' | 'thinking' | 'generating' | 'tool_calling' | 'tool_executing' | 'streaming' | 'waiting_confirmation' | 'error';
/**
 * Agent phase change notification
 */
export interface AgentPhaseMessage extends AgentMessageBase {
    type: 'agentPhase';
    /** Current phase */
    phase: AgentPhase;
    /** Additional details */
    details?: string;
}
/**
 * Agent state snapshot
 */
export interface AgentStateSnapshotMessage extends AgentMessageBase {
    type: 'agentStateSnapshot';
    /** Snapshot data */
    state: AgentStateData;
}
/**
 * Agent state data structure
 */
export interface AgentStateData {
    phase: AgentPhase;
    isThinking: boolean;
    isStreaming: boolean;
    pendingToolCalls: number;
    tokenCount?: number;
    turnCount?: number;
}
/**
 * Message queued notification
 */
export interface MessageQueuedMessage extends AgentMessageBase {
    type: 'messageQueued';
    /** Queue position */
    position?: number;
}
/**
 * Message cancelled notification
 */
export interface MessageCancelledMessage extends AgentMessageBase {
    type: 'messageCancelled';
    /** Reason for cancellation */
    reason?: string;
}
/**
 * Conversation summary
 */
export interface ConversationSummaryData {
    id: string;
    title: string;
    messageCount: number;
    lastMessageAt?: number;
    tokenCount?: number;
}
/**
 * Conversation list message
 */
export interface ConversationListMessage extends AgentMessageBase {
    type: 'conversationList';
    /** List of conversations */
    conversations: ConversationSummaryData[];
}
/**
 * Active conversation notification
 */
export interface ActiveConversationMessage extends AgentMessageBase {
    type: 'activeConversation';
    /** Active conversation ID */
    conversationId: string;
}
/**
 * History cleared notification
 */
export interface HistoryClearedMessage extends AgentMessageBase {
    type: 'historyCleared';
}
/**
 * Error message
 */
export interface ErrorMessage extends AgentMessageBase {
    type: 'error';
    /** Error message */
    message: string;
    /** Error code */
    code?: string;
    /** Stack trace (development only) */
    stack?: string;
}
/**
 * Slash command result
 */
export interface SlashCommandResultMessage extends AgentMessageBase {
    type: 'slashCommandResult';
    /** Whether command was successful */
    success: boolean;
    /** Command action to perform */
    action?: CommandAction;
    /** Output message */
    message?: string;
    /** Error message if failed */
    error?: string;
    /** Additional data */
    data?: Record<string, unknown>;
}
/**
 * Command actions
 */
export type CommandAction = 'exit' | 'showHelp' | 'showStatus' | 'showSettings' | 'showModelSelector' | 'showMCPServers' | 'showPermissions' | 'showTasks' | 'togglePlanMode' | 'initProject' | 'resumeConversation' | 'newConversation' | 'clearHistory' | 'compressContext';
/**
 * Union of all agent message types
 *
 * Use type narrowing with the `type` discriminator:
 * ```typescript
 * function handleMessage(msg: AgentMessage) {
 *   switch (msg.type) {
 *     case 'text':
 *     case 'streamText':
 *       console.log(msg.content);
 *       break;
 *     case 'toolCall':
 *       console.log(msg.toolName, msg.arguments);
 *       break;
 *   }
 * }
 * ```
 */
export type AgentMessage = TextMessage | StreamCompleteMessage | AgentResponseMessage | ThinkingMessage | ThinkingCompleteMessage | ToolCallMessage | ToolResultMessage | ToolConfirmationMessage | PlanStepStatusUpdateMessage | PlanStatusUpdateMessage | AgentPhaseMessage | AgentStateSnapshotMessage | MessageQueuedMessage | MessageCancelledMessage | ConversationListMessage | ActiveConversationMessage | HistoryClearedMessage | ErrorMessage | SlashCommandResultMessage;
/**
 * Check if message is a text message
 */
export declare function isTextMessage(msg: AgentMessage): msg is TextMessage;
/**
 * Check if message is a thinking message
 */
export declare function isThinkingMessage(msg: AgentMessage): msg is ThinkingMessage;
/**
 * Check if message is a tool-related message
 */
export declare function isToolMessage(msg: AgentMessage): msg is ToolCallMessage | ToolResultMessage | ToolConfirmationMessage;
/**
 * Check if message is a plan-related message
 */
export declare function isPlanMessage(msg: AgentMessage): msg is PlanStepStatusUpdateMessage | PlanStatusUpdateMessage;
/**
 * Check if message is an error message
 */
export declare function isErrorMessage(msg: AgentMessage): msg is ErrorMessage;
/**
 * Factory for creating agent messages with proper typing
 */
export declare const AgentMessageFactory: {
    text(content: string, messageId?: string, conversationId?: string): TextMessage;
    streamText(content: string, messageId?: string, conversationId?: string): TextMessage;
    thinking(content: string, messageId?: string, conversationId?: string): ThinkingMessage;
    toolCall(toolCallId: string, toolName: string, args: Record<string, unknown>, options?: {
        serverName?: string;
        messageId?: string;
        conversationId?: string;
    }): ToolCallMessage;
    toolResult(toolCallId: string, success: boolean, result?: unknown, error?: string, options?: {
        toolName?: string;
        messageId?: string;
        conversationId?: string;
    }): ToolResultMessage;
    error(message: string, code?: string, conversationId?: string): ErrorMessage;
    agentPhase(phase: AgentPhase, details?: string, conversationId?: string): AgentPhaseMessage;
};
//# sourceMappingURL=agent-message.d.ts.map