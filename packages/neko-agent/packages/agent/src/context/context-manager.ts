/**
 * Context Manager Implementation
 *
 * Manages context lifecycle and token budgets across different layers:
 * - Permanent: Always retained (global prompt, core tools, indexes)
 * - Session: Session-level (active skills, tool categories)
 * - Turn: Turn-level, can be discarded (on-demand tools, temp references)
 * - Conversation: Conversation history
 */

import type {
  ContextLayer,
  ContextItem,
  ContextState,
  LayeredContextManagerConfig,
  ContextEvent,
  ContextEventListener,
  LayerUsage,
  ILayeredContextManager,
} from '@neko/shared';
import { DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG } from '@neko/shared';

/**
 * Layered Context Manager implementation
 */
export class LayeredContextManager implements ILayeredContextManager {
  /** Configuration */
  private config: LayeredContextManagerConfig;

  /** Current state */
  private state: ContextState;

  /** Event listeners */
  private listeners: Set<ContextEventListener> = new Set();

  /** Skill usage tracking (skillId -> last used turn) */
  private skillUsage: Map<string, number> = new Map();

  constructor(config?: Partial<LayeredContextManagerConfig>) {
    this.config = { ...DEFAULT_LAYERED_CONTEXT_MANAGER_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create initial state
   */
  private createInitialState(): ContextState {
    return {
      items: new Map([
        ['permanent', []],
        ['session', []],
        ['turn', []],
        ['conversation', []],
      ]),
      usage: new Map([
        ['permanent', 0],
        ['session', 0],
        ['turn', 0],
        ['conversation', 0],
      ]),
      activeSkills: [],
      activeToolCategories: [],
      turnCount: 0,
      lastCompressionAt: undefined,
    };
  }

  /**
   * Configure the context manager
   */
  configure(config: Partial<LayeredContextManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): LayeredContextManagerConfig {
    return { ...this.config };
  }

  /**
   * Get current context state
   */
  getState(): ContextState {
    return {
      items: new Map(this.state.items),
      usage: new Map(this.state.usage),
      activeSkills: [...this.state.activeSkills],
      activeToolCategories: [...this.state.activeToolCategories],
      turnCount: this.state.turnCount,
      lastCompressionAt: this.state.lastCompressionAt,
    };
  }

  /**
   * Add an item to a layer
   */
  addItem(item: Omit<ContextItem, 'addedAt' | 'lastAccessedAt'>): void {
    const now = Date.now();
    const fullItem: ContextItem = {
      ...item,
      addedAt: now,
      lastAccessedAt: now,
    };

    const layerItems = this.state.items.get(item.layer) ?? [];
    layerItems.push(fullItem);
    this.state.items.set(item.layer, layerItems);

    // Update usage
    this.updateLayerUsage(item.layer);

    this.emitEvent({
      type: 'item_added',
      timestamp: now,
      layer: item.layer,
      item: fullItem,
    });

    // Check for overflow
    if (this.isOverBudget(item.layer)) {
      this.emitEvent({
        type: 'layer_overflow',
        timestamp: now,
        layer: item.layer,
        data: {
          used: this.state.usage.get(item.layer),
          budget: this.config.budget[item.layer],
        },
      });
    }
  }

  /**
   * Remove an item by ID
   */
  removeItem(id: string): void {
    for (const [layer, items] of this.state.items) {
      const index = items.findIndex((item) => item.id === id);
      if (index !== -1) {
        const removed = items.splice(index, 1)[0];
        this.updateLayerUsage(layer);

        this.emitEvent({
          type: 'item_removed',
          timestamp: Date.now(),
          layer,
          item: removed,
        });
        return;
      }
    }
  }

  /**
   * Access an item (updates lastAccessedAt)
   */
  accessItem(id: string): ContextItem | undefined {
    for (const items of this.state.items.values()) {
      const item = items.find((i) => i.id === id);
      if (item) {
        item.lastAccessedAt = Date.now();

        this.emitEvent({
          type: 'item_accessed',
          timestamp: Date.now(),
          layer: item.layer,
          item,
        });

        return item;
      }
    }
    return undefined;
  }

  /**
   * Get items by layer
   */
  getItemsByLayer(layer: ContextLayer): ContextItem[] {
    return [...(this.state.items.get(layer) ?? [])];
  }

  /**
   * Update token usage for a layer
   */
  private updateLayerUsage(layer: ContextLayer): void {
    const items = this.state.items.get(layer) ?? [];
    const usage = items.reduce((sum, item) => sum + item.tokenCount, 0);
    this.state.usage.set(layer, usage);
  }

  /**
   * Get token usage summary
   */
  getUsage(): LayerUsage[] {
    const layers: ContextLayer[] = ['permanent', 'session', 'turn', 'conversation'];
    return layers.map((layer) => {
      const used = this.state.usage.get(layer) ?? 0;
      const budget = this.config.budget[layer];
      return {
        layer,
        used,
        budget,
        percentage: budget > 0 ? used / budget : 0,
      };
    });
  }

  /**
   * Get total token usage
   */
  getTotalUsage(): number {
    let total = 0;
    for (const usage of this.state.usage.values()) {
      total += usage;
    }
    return total;
  }

  /**
   * Check if a layer is over budget
   */
  isOverBudget(layer: ContextLayer): boolean {
    const used = this.state.usage.get(layer) ?? 0;
    const budget = this.config.budget[layer];
    return used > budget;
  }

  /**
   * Check if total usage exceeds threshold
   */
  shouldCompress(): boolean {
    const totalUsage = this.getTotalUsage();
    const threshold = this.config.budget.total * this.config.compressionThreshold;

    if (totalUsage >= threshold) {
      return true;
    }

    if (this.state.turnCount >= this.config.turnCompressionThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Trigger compression
   * Note: Actual compression logic should be implemented with a compressor
   */
  async compress(): Promise<void> {
    this.emitEvent({
      type: 'compression_triggered',
      timestamp: Date.now(),
      data: {
        totalUsage: this.getTotalUsage(),
        turnCount: this.state.turnCount,
      },
    });

    // Clear turn layer (always safe to clear)
    const turnItems = this.state.items.get('turn') ?? [];
    this.state.items.set('turn', []);
    this.updateLayerUsage('turn');

    // Deactivate inactive skills
    this.deactivateInactiveSkills();

    // Update compression timestamp
    this.state.lastCompressionAt = Date.now();

    this.emitEvent({
      type: 'compression_completed',
      timestamp: Date.now(),
      data: {
        itemsRemoved: turnItems.length,
        newTotalUsage: this.getTotalUsage(),
      },
    });
  }

  /**
   * Deactivate skills that haven't been used recently
   */
  private deactivateInactiveSkills(): void {
    const currentTurn = this.state.turnCount;
    const threshold = this.config.skillInactivityThreshold;

    for (const skillId of [...this.state.activeSkills]) {
      const lastUsed = this.skillUsage.get(skillId) ?? 0;
      if (currentTurn - lastUsed >= threshold) {
        this.deactivateSkill(skillId);
      }
    }
  }

  /**
   * Called at turn start
   */
  onTurnStart(): void {
    this.state.turnCount++;

    this.emitEvent({
      type: 'turn_started',
      timestamp: Date.now(),
      data: { turnCount: this.state.turnCount },
    });

    // Auto-compress if needed
    if (this.config.autoCompress && this.shouldCompress()) {
      void this.compress();
    }
  }

  /**
   * Called at turn end
   */
  onTurnEnd(): void {
    this.emitEvent({
      type: 'turn_ended',
      timestamp: Date.now(),
      data: { turnCount: this.state.turnCount },
    });

    // Evaluate turn items for promotion to session layer
    this.evaluateTurnItems();
  }

  /**
   * Evaluate turn items for potential promotion
   */
  private evaluateTurnItems(): void {
    const turnItems = this.state.items.get('turn') ?? [];

    // Items with high priority or frequent access could be promoted
    // For now, just clear low-priority items
    const retained = turnItems.filter((item) => item.priority >= 5);
    this.state.items.set('turn', retained);
    this.updateLayerUsage('turn');
  }

  /**
   * Activate a skill
   */
  activateSkill(skillId: string): void {
    if (this.state.activeSkills.includes(skillId)) {
      // Update usage tracking
      this.skillUsage.set(skillId, this.state.turnCount);
      return;
    }

    // Check max active skills limit
    if (this.state.activeSkills.length >= this.config.maxActiveSkills) {
      // Deactivate least recently used skill
      this.deactivateLeastRecentlyUsedSkill();
    }

    this.state.activeSkills.push(skillId);
    this.skillUsage.set(skillId, this.state.turnCount);

    this.emitEvent({
      type: 'skill_activated',
      timestamp: Date.now(),
      data: { skillId },
    });
  }

  /**
   * Deactivate least recently used skill
   */
  private deactivateLeastRecentlyUsedSkill(): void {
    let lruSkill: string | undefined;
    let lruTurn = Infinity;

    for (const skillId of this.state.activeSkills) {
      const lastUsed = this.skillUsage.get(skillId) ?? 0;
      if (lastUsed < lruTurn) {
        lruTurn = lastUsed;
        lruSkill = skillId;
      }
    }

    if (lruSkill) {
      this.deactivateSkill(lruSkill);
    }
  }

  /**
   * Deactivate a skill
   */
  deactivateSkill(skillId: string): void {
    const index = this.state.activeSkills.indexOf(skillId);
    if (index === -1) {
      return;
    }

    this.state.activeSkills.splice(index, 1);
    this.skillUsage.delete(skillId);

    // Remove skill-related items from session layer
    const sessionItems = this.state.items.get('session') ?? [];
    const filtered = sessionItems.filter(
      (item) => item.metadata?.skillId !== skillId
    );
    this.state.items.set('session', filtered);
    this.updateLayerUsage('session');

    this.emitEvent({
      type: 'skill_deactivated',
      timestamp: Date.now(),
      data: { skillId },
    });
  }

  /**
   * Get active skills
   */
  getActiveSkills(): string[] {
    return [...this.state.activeSkills];
  }

  /**
   * Reset context state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.skillUsage.clear();

    this.emitEvent({
      type: 'state_reset',
      timestamp: Date.now(),
    });
  }

  /**
   * Add event listener
   */
  addEventListener(listener: ContextEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: ContextEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[ContextManager] Event listener error:', error);
      }
    }
  }
}

/**
 * Factory function to create a layered context manager
 */
export function createLayeredContextManager(
  config?: Partial<LayeredContextManagerConfig>
): ILayeredContextManager {
  return new LayeredContextManager(config);
}
