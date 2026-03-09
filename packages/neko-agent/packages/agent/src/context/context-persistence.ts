/**
 * Context Persistence Manager Implementation
 *
 * Manages persisting context state across sessions.
 */

import type {
  ContextState,
  ContextLayer,
  ContextPersistenceConfig,
  SerializableContextState,
  SessionMetadata,
  IContextStorage,
  IContextPersistence,
} from '@neko/shared';
import {
  DEFAULT_PERSISTENCE_CONFIG,
  serializeContextState,
  deserializeContextState,
} from '@neko/shared';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * In-memory storage implementation (for testing or non-persistent use)
 */
export class InMemoryContextStorage implements IContextStorage {
  private storage: Map<string, SerializableContextState> = new Map();

  async save(sessionId: string, state: SerializableContextState): Promise<void> {
    this.storage.set(sessionId, state);
  }

  async load(sessionId: string): Promise<SerializableContextState | null> {
    return this.storage.get(sessionId) ?? null;
  }

  async delete(sessionId: string): Promise<void> {
    this.storage.delete(sessionId);
  }

  async listSessions(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const state = this.storage.get(sessionId);
    if (!state) {
      return null;
    }

    // Calculate total tokens
    let totalTokens = 0;
    for (const layer of Object.keys(state.usage) as ContextLayer[]) {
      totalTokens += state.usage[layer];
    }

    return {
      id: sessionId,
      createdAt: state.savedAt,
      lastAccessedAt: state.savedAt,
      turnCount: state.turnCount,
      activeSkills: state.activeSkills,
      totalTokens,
      isComplete: false,
    };
  }

  async clearAll(): Promise<void> {
    this.storage.clear();
  }

  async cleanupExpired(expiryMs: number): Promise<number> {
    const now = Date.now();
    let removed = 0;

    for (const [sessionId, state] of this.storage) {
      if (now - state.savedAt > expiryMs) {
        this.storage.delete(sessionId);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Context persistence manager implementation
 */
export class ContextPersistenceManager implements IContextPersistence {
  /** Configuration */
  private config: ContextPersistenceConfig;

  /** Storage backend */
  private storage: IContextStorage;

  /** Current session ID */
  private currentSessionId: string | null = null;

  /** Auto-save timer */
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  /** Pending state to save */
  private pendingState: ContextState | null = null;

  constructor(storage: IContextStorage, config?: Partial<ContextPersistenceConfig>) {
    this.storage = storage;
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
  }

  /**
   * Configure persistence
   */
  configure(config: Partial<ContextPersistenceConfig>): void {
    const wasAutoSaveEnabled = this.config.autoSaveInterval > 0;
    this.config = { ...this.config, ...config };

    // Restart auto-save if interval changed
    if (wasAutoSaveEnabled || this.config.autoSaveInterval > 0) {
      this.setupAutoSave();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextPersistenceConfig {
    return { ...this.config };
  }

  /**
   * Save current context state
   */
  async save(state: ContextState, sessionId?: string): Promise<string> {
    if (!this.config.enabled) {
      throw new Error('Context persistence is disabled');
    }

    const id = sessionId ?? this.currentSessionId ?? generateSessionId();

    // Filter items by layer and priority
    const filteredState = this.filterStateForPersistence(state);

    // Serialize and save
    const serialized = serializeContextState(filteredState, id);
    await this.storage.save(id, serialized);

    // Update current session
    if (!sessionId) {
      this.currentSessionId = id;
    }

    // Cleanup old sessions if needed
    await this.enforceMaxSessions();

    return id;
  }

  /**
   * Filter state for persistence based on config
   */
  private filterStateForPersistence(state: ContextState): ContextState {
    const filteredItems = new Map(state.items);
    const filteredUsage = new Map(state.usage);

    // Filter by layer
    for (const layer of ['permanent', 'session', 'turn', 'conversation'] as ContextLayer[]) {
      if (!this.config.persistLayers.includes(layer)) {
        filteredItems.set(layer, []);
        filteredUsage.set(layer, 0);
      } else {
        // Filter by priority
        const items = filteredItems.get(layer) ?? [];
        const filtered = items.filter((item) => item.priority >= this.config.minPriorityToPersist);
        filteredItems.set(layer, filtered);

        // Recalculate usage
        const usage = filtered.reduce((sum, item) => sum + item.tokenCount, 0);
        filteredUsage.set(layer, usage);
      }
    }

    return {
      ...state,
      items: filteredItems,
      usage: filteredUsage,
    };
  }

  /**
   * Load context state
   */
  async load(sessionId: string): Promise<ContextState | null> {
    if (!this.config.enabled) {
      return null;
    }

    const serialized = await this.storage.load(sessionId);
    if (!serialized) {
      return null;
    }

    return deserializeContextState(serialized);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.storage.delete(sessionId);

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<SessionMetadata[]> {
    const sessionIds = await this.storage.listSessions();
    const metadata: SessionMetadata[] = [];

    for (const id of sessionIds) {
      const meta = await this.storage.getSessionMetadata(id);
      if (meta) {
        metadata.push(meta);
      }
    }

    // Sort by last accessed (most recent first)
    return metadata.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Start a new session
   */
  startNewSession(name?: string): string {
    this.currentSessionId = generateSessionId();
    return this.currentSessionId;
  }

  /**
   * Resume a session
   */
  async resumeSession(sessionId: string): Promise<ContextState | null> {
    const state = await this.load(sessionId);
    if (state) {
      this.currentSessionId = sessionId;
    }
    return state;
  }

  /**
   * Enable/disable auto-save
   */
  setAutoSave(enabled: boolean): void {
    if (enabled) {
      this.setupAutoSave();
    } else {
      this.clearAutoSave();
    }
  }

  /**
   * Setup auto-save timer
   */
  private setupAutoSave(): void {
    this.clearAutoSave();

    if (this.config.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        if (this.pendingState && this.currentSessionId) {
          void this.save(this.pendingState, this.currentSessionId);
          this.pendingState = null;
        }
      }, this.config.autoSaveInterval);
    }
  }

  /**
   * Clear auto-save timer
   */
  private clearAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Queue state for auto-save
   */
  queueForAutoSave(state: ContextState): void {
    this.pendingState = state;
  }

  /**
   * Clean up old sessions
   */
  async cleanup(): Promise<number> {
    // Clean up expired sessions
    const expiredRemoved = await this.storage.cleanupExpired(this.config.sessionExpiryMs);

    // Enforce max sessions
    const maxRemoved = await this.enforceMaxSessions();

    return expiredRemoved + maxRemoved;
  }

  /**
   * Enforce maximum number of sessions
   */
  private async enforceMaxSessions(): Promise<number> {
    const sessions = await this.listSessions();

    if (sessions.length <= this.config.maxSessions) {
      return 0;
    }

    // Remove oldest sessions (already sorted by lastAccessedAt desc)
    const toRemove = sessions.slice(this.config.maxSessions);
    for (const session of toRemove) {
      await this.storage.delete(session.id);
    }

    return toRemove.length;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clearAutoSave();
  }
}

/**
 * Factory function to create a context persistence manager
 */
export function createContextPersistenceManager(
  storage?: IContextStorage,
  config?: Partial<ContextPersistenceConfig>,
): IContextPersistence {
  const storageBackend = storage ?? new InMemoryContextStorage();
  return new ContextPersistenceManager(storageBackend, config);
}
