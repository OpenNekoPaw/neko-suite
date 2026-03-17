/**
 * Token Budget Manager — Token usage tracking and budget enforcement
 *
 * Extracted from LayeredContextManager to separate budget/usage concerns
 * from item lifecycle and event broadcasting.
 *
 * NOT exported from context/index.ts — internal implementation detail.
 */

import type { ContextLayer, LayeredContextManagerConfig, LayerUsage } from '@neko/shared';

// =============================================================================
// Constants
// =============================================================================

const LAYERS: ContextLayer[] = ['permanent', 'session', 'turn', 'conversation'];

// =============================================================================
// Implementation
// =============================================================================

export class TokenBudgetManager {
  private config: LayeredContextManagerConfig;
  private usage: Map<ContextLayer, number>;

  constructor(config: LayeredContextManagerConfig) {
    this.config = config;
    this.usage = new Map<ContextLayer, number>(LAYERS.map((l) => [l, 0]));
  }

  /** Reconfigure budgets */
  configure(config: Partial<LayeredContextManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Recalculate usage for a layer from item token counts */
  updateLayerUsage(layer: ContextLayer, tokenCounts: number[]): void {
    const total = tokenCounts.reduce((sum, t) => sum + t, 0);
    this.usage.set(layer, total);
  }

  /** Get usage summary for all layers */
  getUsage(): LayerUsage[] {
    return LAYERS.map((layer) => {
      const used = this.usage.get(layer) ?? 0;
      const budget = this.config.budget[layer];
      return {
        layer,
        used,
        budget,
        percentage: budget > 0 ? used / budget : 0,
      };
    });
  }

  /** Get total token usage across all layers */
  getTotalUsage(): number {
    let total = 0;
    for (const u of this.usage.values()) {
      total += u;
    }
    return total;
  }

  /** Check if a layer exceeds its budget */
  isOverBudget(layer: ContextLayer): boolean {
    const used = this.usage.get(layer) ?? 0;
    const budget = this.config.budget[layer];
    return used > budget;
  }

  /** Check if compression should trigger (token threshold OR turn threshold) */
  shouldCompress(turnCount: number): boolean {
    const totalUsage = this.getTotalUsage();
    const threshold = this.config.budget.total * this.config.compressionThreshold;

    if (totalUsage >= threshold) {
      return true;
    }

    if (turnCount >= this.config.turnCompressionThreshold) {
      return true;
    }

    return false;
  }

  /** Get raw usage map (for ContextState compatibility) */
  getUsageMap(): Map<ContextLayer, number> {
    return new Map(this.usage);
  }

  /** Reset all usage to zero */
  reset(): void {
    for (const layer of LAYERS) {
      this.usage.set(layer, 0);
    }
  }
}
