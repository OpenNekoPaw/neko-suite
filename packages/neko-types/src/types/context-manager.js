/**
 * Context Manager Types
 *
 * Defines types for managing context lifecycle and token budgets
 * across different context layers (permanent, session, turn, conversation).
 *
 * Note: These types are prefixed with "Layered" to avoid conflicts with
 * the simpler ContextManager types in memory.ts.
 */
/**
 * Default layered context manager configuration
 */
export const DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG = {
    budget: {
        total: 100000,
        permanent: 10000,
        session: 20000,
        turn: 15000,
        conversation: 55000,
    },
    compressionThreshold: 0.8,
    turnCompressionThreshold: 20,
    maxActiveSkills: 3,
    skillInactivityThreshold: 5,
    autoCompress: true,
};
//# sourceMappingURL=context-manager.js.map