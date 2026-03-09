/**
 * EnabledStateStore - Generic persistent enabled-state storage via VSCode globalState
 *
 * Used by both skill and toolSkill handlers to persist toggle state.
 */

import type * as vscode from 'vscode';
import { getLogger } from '../../base';

const logger = getLogger('EnabledStateStore');

export class EnabledStateStore {
  private state: Map<string, boolean> = new Map();

  constructor(
    private readonly storageKey: string,
    private readonly context?: vscode.ExtensionContext,
  ) {
    this.load();
  }

  /**
   * Get stored enabled state for a key, or undefined if not set
   */
  get(key: string): boolean | undefined {
    return this.state.get(key);
  }

  /**
   * Set enabled state for a key and persist
   */
  set(key: string, enabled: boolean): void {
    this.state.set(key, enabled);
    this.save();
  }

  /**
   * Apply stored enabled state to items with an `enabled` property
   */
  applyTo<T extends { enabled?: boolean }>(items: T[], keyFn: (item: T) => string): T[] {
    return items.map((item) => {
      const stored = this.state.get(keyFn(item));
      if (stored !== undefined) {
        return { ...item, enabled: stored };
      }
      return item;
    });
  }

  private load(): void {
    if (!this.context) return;

    try {
      const stored = this.context.globalState.get<Record<string, boolean>>(this.storageKey);
      if (stored) {
        this.state = new Map(Object.entries(stored));
      }
    } catch (error) {
      logger.error(`Failed to load enabled state (${this.storageKey}):`, error);
    }
  }

  private save(): void {
    if (!this.context) return;

    try {
      const obj: Record<string, boolean> = {};
      for (const [key, value] of this.state) {
        obj[key] = value;
      }
      this.context.globalState.update(this.storageKey, obj);
    } catch (error) {
      logger.error(`Failed to save enabled state (${this.storageKey}):`, error);
    }
  }
}
