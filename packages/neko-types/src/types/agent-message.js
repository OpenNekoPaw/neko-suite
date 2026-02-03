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
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if message is a text message
 */
export function isTextMessage(msg) {
    return msg.type === 'text' || msg.type === 'streamText';
}
/**
 * Check if message is a thinking message
 */
export function isThinkingMessage(msg) {
    return msg.type === 'thinking' || msg.type === 'streamThinking';
}
/**
 * Check if message is a tool-related message
 */
export function isToolMessage(msg) {
    return msg.type === 'toolCall' || msg.type === 'toolResult' || msg.type === 'toolConfirmation';
}
/**
 * Check if message is a plan-related message
 */
export function isPlanMessage(msg) {
    return msg.type === 'planStepStatusUpdate' || msg.type === 'planStatusUpdate';
}
/**
 * Check if message is an error message
 */
export function isErrorMessage(msg) {
    return msg.type === 'error';
}
// =============================================================================
// Message Factory
// =============================================================================
/**
 * Factory for creating agent messages with proper typing
 */
export const AgentMessageFactory = {
    text(content, messageId, conversationId) {
        return { type: 'text', content, messageId, conversationId };
    },
    streamText(content, messageId, conversationId) {
        return { type: 'streamText', content, messageId, conversationId };
    },
    thinking(content, messageId, conversationId) {
        return { type: 'thinking', content, messageId, conversationId };
    },
    toolCall(toolCallId, toolName, args, options) {
        return {
            type: 'toolCall',
            toolCallId,
            toolName,
            arguments: args,
            ...options,
        };
    },
    toolResult(toolCallId, success, result, error, options) {
        return {
            type: 'toolResult',
            toolCallId,
            success,
            result,
            error,
            ...options,
        };
    },
    error(message, code, conversationId) {
        return { type: 'error', message, code, conversationId };
    },
    agentPhase(phase, details, conversationId) {
        return { type: 'agentPhase', phase, details, conversationId };
    },
};
//# sourceMappingURL=agent-message.js.map