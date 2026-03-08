/**
 * Config Section - Generic base class for configuration sections
 *
 * Encapsulates common CRUD and merge logic for each config type,
 * reducing code duplication in ConfigManager.
 */

import type { IUserConfigManager } from './user-config';

/**
 * Base interface for all config items
 */
export interface ConfigItem {
  id: string;
  enabled?: boolean;
  builtin?: boolean;
}

/**
 * Merge context containing user and workspace data
 */
export interface MergeContext<T> {
  userItems: T[];
  userOverrides: Record<string, Partial<T>>;
  workspaceItems?: T[];
  workspaceOverrides?: Record<string, Partial<T>>;
}

/**
 * Config section options
 */
export interface ConfigSectionOptions<T extends ConfigItem> {
  /** Section name for event notifications */
  name: string;
  /** User config manager (optional - if not provided, write operations will fail) */
  userConfigManager?: IUserConfigManager | null;
  /** Callbacks for config change notifications */
  onInvalidate?: () => void;
  onNotify?: (ids: string[]) => void;
  /** Fields that should be preserved from builtin when merging user config */
  builtinProtectedFields?: (keyof T)[];
  /** Fields that users can override on builtin items */
  builtinOverridableFields?: (keyof T)[];
}

/**
 * Base class for configuration sections
 *
 * Each section manages one type of config (providers, models, etc.)
 * and provides:
 * - CRUD operations with caching
 * - Three-tier merge logic (builtin → user → workspace)
 * - Builtin field protection
 */
export abstract class BaseConfigSection<T extends ConfigItem> {
  protected items: Map<string, T> = new Map();
  protected readonly name: string;
  protected readonly userConfigManager: IUserConfigManager | null;
  protected readonly onInvalidate?: () => void;
  protected readonly onNotify?: (ids: string[]) => void;
  protected readonly builtinProtectedFields: Set<keyof T>;
  protected readonly builtinOverridableFields: Set<keyof T>;

  constructor(options: ConfigSectionOptions<T>) {
    this.name = options.name;
    this.userConfigManager = options.userConfigManager ?? null;
    this.onInvalidate = options.onInvalidate;
    this.onNotify = options.onNotify;
    this.builtinProtectedFields = new Set(options.builtinProtectedFields ?? []);
    this.builtinOverridableFields = new Set(options.builtinOverridableFields ?? []);
  }

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  /**
   * Get item by ID
   */
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /**
   * Get all items
   */
  getAll(): T[] {
    return Array.from(this.items.values());
  }

  /**
   * Get enabled items
   */
  getEnabled(): T[] {
    return this.getAll().filter((item) => item.enabled !== false);
  }

  /**
   * Check if item exists
   */
  has(id: string): boolean {
    return this.items.has(id);
  }

  // ==========================================================================
  // Write Operations (require IUserConfigManager)
  // ==========================================================================

  /**
   * Add or update item in user config
   */
  async set(item: T): Promise<void> {
    this.ensureIUserConfigManager();
    await this.doSet(item);
    this.invalidateAndNotify([item.id]);
  }

  /**
   * Remove item from user config
   */
  async remove(id: string): Promise<void> {
    this.ensureIUserConfigManager();
    await this.doRemove(id);
    this.invalidateAndNotify([id]);
  }

  /**
   * Update override for an existing item
   */
  async updateOverride(id: string, override: Partial<T>): Promise<void> {
    this.ensureIUserConfigManager();
    await this.doUpdateOverride(id, override);
    this.invalidateAndNotify([id]);
  }

  /**
   * Remove override for an item
   */
  async removeOverride(id: string): Promise<void> {
    this.ensureIUserConfigManager();
    await this.doRemoveOverride(id);
    this.invalidateAndNotify([id]);
  }

  // ==========================================================================
  // Abstract Methods - Implemented by subclasses
  // ==========================================================================

  /**
   * Perform the actual set operation on user config
   */
  protected abstract doSet(item: T): Promise<void>;

  /**
   * Perform the actual remove operation on user config
   */
  protected abstract doRemove(id: string): Promise<void>;

  /**
   * Perform the actual update override operation
   */
  protected abstract doUpdateOverride(id: string, override: Partial<T>): Promise<void>;

  /**
   * Perform the actual remove override operation
   */
  protected abstract doRemoveOverride(id: string): Promise<void>;

  // ==========================================================================
  // Merge Operations
  // ==========================================================================

  /**
   * Merge configuration from all three tiers
   */
  merge(builtinItems: T[], context: MergeContext<T>): void {
    this.items.clear();

    // Layer 1: Builtin presets
    if (Array.isArray(builtinItems)) {
      for (const item of builtinItems) {
        this.items.set(item.id, { ...item });
      }
    }

    // Layer 2: User config
    if (Array.isArray(context.userItems)) {
      this.mergeUserItems(context.userItems);
    }
    if (context.userOverrides && typeof context.userOverrides === 'object') {
      this.mergeOverrides(context.userOverrides, true);
    }

    // Layer 3: Workspace config (highest priority)
    if (context.workspaceItems && Array.isArray(context.workspaceItems)) {
      this.mergeWorkspaceItems(context.workspaceItems);
    }
    if (context.workspaceOverrides && typeof context.workspaceOverrides === 'object') {
      this.mergeOverrides(context.workspaceOverrides, false);
    }
  }

  /**
   * Merge user items with builtin protection
   */
  protected mergeUserItems(userItems: T[]): void {
    for (const userItem of userItems) {
      const existing = this.items.get(userItem.id);

      if (existing?.builtin) {
        // For builtin items, only apply overridable fields
        const merged = { ...existing };
        for (const field of this.builtinOverridableFields) {
          if (userItem[field] !== undefined) {
            (merged as Record<keyof T, unknown>)[field] = userItem[field];
          }
        }
        this.items.set(userItem.id, merged);
      } else {
        // For non-builtin items, use user config as-is
        this.items.set(userItem.id, { ...userItem, builtin: false });
      }
    }
  }

  /**
   * Merge overrides
   */
  protected mergeOverrides(
    overrides: Record<string, Partial<T>>,
    respectBuiltinProtection: boolean
  ): void {
    for (const [id, override] of Object.entries(overrides)) {
      const existing = this.items.get(id);
      if (!existing) continue;

      if (respectBuiltinProtection && existing.builtin) {
        // For builtin items, only apply overridable fields
        const allowedOverrides: Partial<T> = {};
        for (const field of this.builtinOverridableFields) {
          if (override[field] !== undefined) {
            (allowedOverrides as Record<keyof T, unknown>)[field] = override[field];
          }
        }
        this.items.set(id, { ...existing, ...allowedOverrides });
      } else {
        // Apply all overrides but preserve builtin flag
        this.items.set(id, { ...existing, ...override, builtin: existing.builtin });
      }
    }
  }

  /**
   * Merge workspace items
   */
  protected mergeWorkspaceItems(workspaceItems: T[]): void {
    for (const item of workspaceItems) {
      const existing = this.items.get(item.id);
      // Preserve builtin flag if exists
      this.items.set(item.id, { ...item, builtin: existing?.builtin });
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  protected ensureIUserConfigManager(): asserts this is { userConfigManager: IUserConfigManager } {
    if (!this.userConfigManager) {
      throw new Error('User config storage not available');
    }
  }

  protected invalidateAndNotify(ids: string[]): void {
    this.onInvalidate?.();
    this.onNotify?.(ids);
  }
}
