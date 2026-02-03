/**
 * Context Persistence Types
 *
 * Defines types for persisting context state across sessions.
 */
/**
 * Default persistence configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG = {
    enabled: true,
    keyPrefix: 'uniedit_context_',
    autoSaveInterval: 30000, // 30 seconds
    maxSessions: 10,
    sessionExpiryMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    persistLayers: ['permanent', 'session'],
    minPriorityToPersist: 3,
};
/**
 * Convert ContextState to serializable format
 */
export function serializeContextState(state, sessionId) {
    const items = {
        permanent: [],
        session: [],
        turn: [],
        conversation: [],
    };
    for (const [layer, layerItems] of state.items) {
        items[layer] = layerItems.map((item) => ({
            id: item.id,
            layer: item.layer,
            type: item.type,
            content: item.content,
            tokenCount: item.tokenCount,
            priority: item.priority,
            addedAt: item.addedAt,
            lastAccessedAt: item.lastAccessedAt,
            metadata: item.metadata,
        }));
    }
    const usage = {
        permanent: state.usage.get('permanent') ?? 0,
        session: state.usage.get('session') ?? 0,
        turn: state.usage.get('turn') ?? 0,
        conversation: state.usage.get('conversation') ?? 0,
    };
    return {
        items,
        usage,
        activeSkills: [...state.activeSkills],
        activeToolCategories: [...state.activeToolCategories],
        turnCount: state.turnCount,
        lastCompressionAt: state.lastCompressionAt,
        sessionId,
        savedAt: Date.now(),
        version: 1,
    };
}
/**
 * Convert serializable format back to ContextState
 */
export function deserializeContextState(serialized) {
    const items = new Map();
    const usage = new Map();
    for (const layer of ['permanent', 'session', 'turn', 'conversation']) {
        items.set(layer, serialized.items[layer] ?? []);
        usage.set(layer, serialized.usage[layer] ?? 0);
    }
    return {
        items,
        usage,
        activeSkills: [...serialized.activeSkills],
        activeToolCategories: [...serialized.activeToolCategories],
        turnCount: serialized.turnCount,
        lastCompressionAt: serialized.lastCompressionAt,
    };
}
//# sourceMappingURL=context-persistence.js.map