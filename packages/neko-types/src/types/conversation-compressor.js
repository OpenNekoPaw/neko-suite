/**
 * Conversation Compressor Types
 *
 * Defines types for compressing conversation history using
 * sliding window and summarization strategies.
 *
 * Note: Types are prefixed with "Conversation" to avoid conflicts with
 * the simpler compression types in memory.ts.
 */
/**
 * Default compressor configuration
 */
export const DEFAULT_COMPRESSOR_CONFIG = {
    toolResultCompression: {
        maxLength: 500,
        keepFields: ['status', 'summary', 'error', 'result'],
        discardFields: ['rawData', 'debug', 'trace', 'stackTrace'],
    },
    conversationWindow: {
        recentTurns: 10,
        olderTurnsStrategy: 'summary',
        olderTurnsSummaryMaxTokens: 2000,
    },
    skillCompression: {
        inactiveSkillsStrategy: 'index-only',
        activeSkillAge: 5,
    },
    triggers: {
        tokenThreshold: 80000,
        turnThreshold: 20,
    },
};
//# sourceMappingURL=conversation-compressor.js.map