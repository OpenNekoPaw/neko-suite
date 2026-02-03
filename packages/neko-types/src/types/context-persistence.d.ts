/**
 * Context Persistence Types
 *
 * Defines types for persisting context state across sessions.
 */
import type { ContextLayer, ContextState } from './context-manager';
/**
 * Serializable context item (for persistence)
 */
export interface SerializableContextItem {
    id: string;
    layer: ContextLayer;
    type: 'prompt' | 'skill' | 'tool' | 'message' | 'reference' | 'index';
    content: string;
    tokenCount: number;
    priority: number;
    addedAt: number;
    lastAccessedAt: number;
    metadata?: Record<string, unknown>;
}
/**
 * Serializable context state (for persistence)
 */
export interface SerializableContextState {
    /** Items by layer (as arrays for JSON serialization) */
    items: Record<ContextLayer, SerializableContextItem[]>;
    /** Token usage by layer */
    usage: Record<ContextLayer, number>;
    /** Active skills */
    activeSkills: string[];
    /** Active tool categories */
    activeToolCategories: string[];
    /** Turn counter */
    turnCount: number;
    /** Last compression timestamp */
    lastCompressionAt?: number;
    /** Session ID */
    sessionId: string;
    /** Timestamp when state was saved */
    savedAt: number;
    /** Version for migration */
    version: number;
}
/**
 * Context persistence configuration
 */
export interface ContextPersistenceConfig {
    /** Enable persistence */
    enabled: boolean;
    /** Storage key prefix */
    keyPrefix: string;
    /** Auto-save interval in milliseconds (0 = disabled) */
    autoSaveInterval: number;
    /** Maximum number of sessions to keep */
    maxSessions: number;
    /** Session expiry time in milliseconds */
    sessionExpiryMs: number;
    /** Layers to persist */
    persistLayers: ContextLayer[];
    /** Minimum priority to persist */
    minPriorityToPersist: number;
}
/**
 * Default persistence configuration
 */
export declare const DEFAULT_PERSISTENCE_CONFIG: ContextPersistenceConfig;
/**
 * Session metadata
 */
export interface SessionMetadata {
    /** Session ID */
    id: string;
    /** Session name/title */
    name?: string;
    /** Creation timestamp */
    createdAt: number;
    /** Last access timestamp */
    lastAccessedAt: number;
    /** Turn count */
    turnCount: number;
    /** Active skills at save time */
    activeSkills: string[];
    /** Total token usage */
    totalTokens: number;
    /** Whether session is complete */
    isComplete: boolean;
}
/**
 * Storage backend interface
 */
export interface IContextStorage {
    /**
     * Save context state
     */
    save(sessionId: string, state: SerializableContextState): Promise<void>;
    /**
     * Load context state
     */
    load(sessionId: string): Promise<SerializableContextState | null>;
    /**
     * Delete context state
     */
    delete(sessionId: string): Promise<void>;
    /**
     * List all session IDs
     */
    listSessions(): Promise<string[]>;
    /**
     * Get session metadata
     */
    getSessionMetadata(sessionId: string): Promise<SessionMetadata | null>;
    /**
     * Clear all sessions
     */
    clearAll(): Promise<void>;
    /**
     * Clean up expired sessions
     */
    cleanupExpired(expiryMs: number): Promise<number>;
}
/**
 * Context persistence manager interface
 */
export interface IContextPersistence {
    /**
     * Configure persistence
     */
    configure(config: Partial<ContextPersistenceConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): ContextPersistenceConfig;
    /**
     * Save current context state
     */
    save(state: ContextState, sessionId?: string): Promise<string>;
    /**
     * Load context state
     */
    load(sessionId: string): Promise<ContextState | null>;
    /**
     * Delete a session
     */
    deleteSession(sessionId: string): Promise<void>;
    /**
     * List all sessions
     */
    listSessions(): Promise<SessionMetadata[]>;
    /**
     * Get current session ID
     */
    getCurrentSessionId(): string | null;
    /**
     * Start a new session
     */
    startNewSession(name?: string): string;
    /**
     * Resume a session
     */
    resumeSession(sessionId: string): Promise<ContextState | null>;
    /**
     * Enable/disable auto-save
     */
    setAutoSave(enabled: boolean): void;
    /**
     * Clean up old sessions
     */
    cleanup(): Promise<number>;
}
/**
 * Convert ContextState to serializable format
 */
export declare function serializeContextState(state: ContextState, sessionId: string): SerializableContextState;
/**
 * Convert serializable format back to ContextState
 */
export declare function deserializeContextState(serialized: SerializableContextState): ContextState;
//# sourceMappingURL=context-persistence.d.ts.map