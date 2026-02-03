/**
 * Selection Strategy - Unified strategy implementations for Group routing
 *
 * Provides common selection algorithms used by both GroupManager and
 * ExecutionGroupManager, eliminating code duplication.
 */

/**
 * Context for selection operations
 */
export interface SelectionContext {
  /** Group ID for stateful operations like round-robin */
  groupId: string;
  /** Shared round-robin state across groups */
  roundRobinState: Map<string, number>;
  /** Weights for weighted selection */
  weights?: Record<string, number>;
  /** Maximum cost constraint */
  maxCost?: number;
  /** Maximum latency constraint */
  maxLatency?: number;
  /** Required capabilities filter */
  requiredCapabilities?: string[];
}

/**
 * Interface for selection strategies
 */
export interface ISelectionStrategy<T> {
  /** Strategy type identifier */
  readonly type: string;
  /** Select an item from the list based on strategy */
  select(items: T[], context: SelectionContext): T | null;
}

/**
 * Helper to get item ID for strategies that need it
 */
export type ItemIdGetter<T> = (item: T) => string;

/**
 * Priority Strategy - Select the first available item
 */
export class PrioritySelectionStrategy<T> implements ISelectionStrategy<T> {
  readonly type = 'priority';

  select(items: T[]): T | null {
    return items[0] ?? null;
  }
}

/**
 * Round-Robin Strategy - Cycle through items in order
 */
export class RoundRobinSelectionStrategy<T> implements ISelectionStrategy<T> {
  readonly type = 'round-robin';

  select(items: T[], context: SelectionContext): T | null {
    if (items.length === 0) return null;

    const currentIndex = context.roundRobinState.get(context.groupId) ?? 0;
    const selectedIndex = currentIndex % items.length;
    context.roundRobinState.set(context.groupId, currentIndex + 1);

    return items[selectedIndex];
  }
}

/**
 * Weighted Strategy - Random selection based on weights
 */
export class WeightedSelectionStrategy<T> implements ISelectionStrategy<T> {
  readonly type = 'weighted';
  private getItemId: ItemIdGetter<T>;

  constructor(getItemId: ItemIdGetter<T>) {
    this.getItemId = getItemId;
  }

  select(items: T[], context: SelectionContext): T | null {
    if (items.length === 0) return null;

    const weights = context.weights ?? {};
    const totalWeight = items.reduce(
      (sum, item) => sum + (weights[this.getItemId(item)] ?? 1),
      0
    );

    let random = Math.random() * totalWeight;

    for (const item of items) {
      const weight = weights[this.getItemId(item)] ?? 1;
      random -= weight;
      if (random <= 0) {
        return item;
      }
    }

    return items[items.length - 1];
  }
}

/**
 * Cost information interface for cost-optimal strategy
 */
export interface CostInfo {
  estimatedCost?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
}

/**
 * Cost-Optimal Strategy - Select the lowest cost item
 */
export class CostOptimalSelectionStrategy<T extends CostInfo>
  implements ISelectionStrategy<T>
{
  readonly type = 'cost-optimal';

  select(items: T[], context: SelectionContext): T | null {
    if (items.length === 0) return null;

    let filtered = items;

    // Filter by max cost if specified
    if (context.maxCost !== undefined) {
      filtered = items.filter((item) => {
        const cost = this.getCost(item);
        return cost <= context.maxCost!;
      });
    }

    if (filtered.length === 0) return null;

    // Sort by cost ascending
    const sorted = [...filtered].sort(
      (a, b) => this.getCost(a) - this.getCost(b)
    );

    return sorted[0];
  }

  private getCost(item: T): number {
    if (item.estimatedCost !== undefined) {
      return item.estimatedCost;
    }
    // Calculate average cost from input/output costs
    const inputCost = item.inputCostPer1k ?? 0;
    const outputCost = item.outputCostPer1k ?? 0;
    return (inputCost + outputCost) / 2;
  }
}

/**
 * Quality information interface for quality-optimal strategy
 */
export interface QualityInfo {
  qualityScore?: number;
}

/**
 * Quality-Optimal Strategy - Select the highest quality item
 */
export class QualityOptimalSelectionStrategy<T extends QualityInfo>
  implements ISelectionStrategy<T>
{
  readonly type = 'quality-optimal';

  select(items: T[]): T | null {
    if (items.length === 0) return null;

    // Sort by quality descending
    const sorted = [...items].sort(
      (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
    );

    return sorted[0];
  }
}

/**
 * Latency information interface for latency-optimal strategy
 */
export interface LatencyInfo {
  estimatedLatency?: number;
}

/**
 * Latency-Optimal Strategy - Select the lowest latency item
 */
export class LatencyOptimalSelectionStrategy<T extends LatencyInfo>
  implements ISelectionStrategy<T>
{
  readonly type = 'latency-optimal';

  select(items: T[], context: SelectionContext): T | null {
    if (items.length === 0) return null;

    let filtered = items;

    // Filter by max latency if specified
    if (context.maxLatency !== undefined) {
      filtered = items.filter(
        (item) => (item.estimatedLatency ?? 0) <= context.maxLatency!
      );
    }

    if (filtered.length === 0) return null;

    // Sort by latency ascending
    const sorted = [...filtered].sort(
      (a, b) => (a.estimatedLatency ?? 0) - (b.estimatedLatency ?? 0)
    );

    return sorted[0];
  }
}

/**
 * Capability information interface for capability-match strategy
 */
export interface CapabilityInfo {
  capabilities?: string[];
}

/**
 * Capability-Match Strategy - Filter by required capabilities
 */
export class CapabilityMatchSelectionStrategy<T extends CapabilityInfo>
  implements ISelectionStrategy<T>
{
  readonly type = 'capability-match';

  select(items: T[], context: SelectionContext): T | null {
    if (items.length === 0) return null;

    const required = context.requiredCapabilities ?? [];
    if (required.length === 0) {
      return items[0];
    }

    // Filter items that have all required capabilities
    const filtered = items.filter((item) => {
      const caps = item.capabilities ?? [];
      return required.every((req) => caps.includes(req));
    });

    return filtered[0] ?? null;
  }
}

/**
 * Strategy Factory - Creates and manages selection strategies
 */
export class SelectionStrategyFactory {
  private strategies: Map<string, ISelectionStrategy<unknown>> = new Map();

  constructor() {
    // Register default strategies
    this.registerDefault();
  }

  private registerDefault(): void {
    this.register(new PrioritySelectionStrategy());
    this.register(new RoundRobinSelectionStrategy());
  }

  /**
   * Register a strategy
   */
  register<T>(strategy: ISelectionStrategy<T>): void {
    this.strategies.set(strategy.type, strategy as ISelectionStrategy<unknown>);
  }

  /**
   * Get a strategy by type
   */
  get<T>(type: string): ISelectionStrategy<T> | undefined {
    return this.strategies.get(type) as ISelectionStrategy<T> | undefined;
  }

  /**
   * Check if a strategy exists
   */
  has(type: string): boolean {
    return this.strategies.has(type);
  }

  /**
   * List all registered strategy types
   */
  listTypes(): string[] {
    return Array.from(this.strategies.keys());
  }
}

/**
 * Create a default strategy factory with all strategies
 */
export function createDefaultStrategyFactory<T extends CostInfo & QualityInfo & LatencyInfo & CapabilityInfo>(
  getItemId: ItemIdGetter<T>
): SelectionStrategyFactory {
  const factory = new SelectionStrategyFactory();
  factory.register(new WeightedSelectionStrategy(getItemId));
  factory.register(new CostOptimalSelectionStrategy());
  factory.register(new QualityOptimalSelectionStrategy());
  factory.register(new LatencyOptimalSelectionStrategy());
  factory.register(new CapabilityMatchSelectionStrategy());
  return factory;
}
