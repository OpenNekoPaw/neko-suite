/**
 * Router - Unified routing interfaces for LLM/Media/Workflow
 *
 * Defines common routing abstractions used across the platform.
 */

/**
 * Generic router interface
 *
 * @template TContext - The routing context type
 * @template TResult - The routing result type
 */
export interface IRouter<TContext, TResult> {
  /**
   * Select the best provider/target based on context
   */
  selectProvider(context: TContext): Promise<TResult | null>;

  /**
   * Select a fallback provider/target after failure
   */
  selectFallback(
    context: TContext,
    excludeTargets: string[]
  ): Promise<TResult | null>;
}

/**
 * Routing candidate with scoring
 *
 * @template T - The candidate type (Provider, Model, ExecutionTarget, etc.)
 */
export interface RoutingCandidate<T> {
  /** The candidate item */
  item: T;
  /** Total accumulated score */
  score: number;
  /** Score breakdown by strategy */
  scoreBreakdown: Record<string, number>;
}

/**
 * Routing strategy interface
 *
 * Strategies are executed in priority order (highest first).
 * Each strategy can filter candidates and/or add scores.
 *
 * @template TCandidate - The candidate type
 * @template TContext - The routing context type
 */
export interface IRoutingStrategy<TCandidate, TContext> {
  /** Strategy name (used in score breakdown) */
  readonly name: string;
  /** Priority (higher = executed first) */
  readonly priority: number;

  /**
   * Filter candidates that don't meet criteria
   * Return filtered list (can be empty)
   */
  filter(
    candidates: RoutingCandidate<TCandidate>[],
    context: TContext
  ): RoutingCandidate<TCandidate>[];

  /**
   * Score remaining candidates
   * Return candidates with updated scores
   */
  score(
    candidates: RoutingCandidate<TCandidate>[],
    context: TContext
  ): RoutingCandidate<TCandidate>[];
}

/**
 * Base routing result
 */
export interface BaseRoutingResult {
  /** Final score */
  score: number;
  /** Human-readable reason for selection */
  reason: string;
}

/**
 * Base routing preference
 */
export interface BaseRoutingPreference {
  /** Optimization target */
  optimize?: 'cost' | 'speed' | 'quality';
  /** Allow fallback on failure */
  allowFallback?: boolean;
  /** Providers/targets to exclude */
  excludeTargets?: string[];
}

/**
 * Error categories that can trigger fallback
 */
export type ErrorCategory =
  | 'rate_limit'
  | 'timeout'
  | 'server_error'
  | 'network'
  | 'authentication'
  | 'validation'
  | 'not_found'
  | 'context_length'
  | 'content_filter'
  | 'quota_exceeded'
  | 'unavailable'
  | 'unknown';

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /** Enable fallback behavior */
  enabled: boolean;
  /** Maximum fallback attempts */
  maxAttempts: number;
  /** Error categories that trigger fallback */
  triggerOn: ErrorCategory[];
}

/**
 * Abstract base class for routing managers
 *
 * Provides common routing logic using strategy chain pattern.
 *
 * @template TCandidate - The candidate type
 * @template TContext - The routing context type
 * @template TResult - The routing result type
 */
export abstract class BaseRoutingManager<TCandidate, TContext, TResult>
  implements IRouter<TContext, TResult>
{
  protected strategies: IRoutingStrategy<TCandidate, TContext>[] = [];

  /**
   * Register a routing strategy
   */
  registerStrategy(strategy: IRoutingStrategy<TCandidate, TContext>): void {
    this.strategies.push(strategy);
    // Sort by priority descending (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a strategy by name
   */
  unregisterStrategy(name: string): void {
    this.strategies = this.strategies.filter((s) => s.name !== name);
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): readonly IRoutingStrategy<TCandidate, TContext>[] {
    return this.strategies;
  }

  /**
   * Run the strategy chain on candidates
   */
  protected runStrategyChain(
    candidates: RoutingCandidate<TCandidate>[],
    context: TContext
  ): RoutingCandidate<TCandidate>[] {
    let result = candidates;

    for (const strategy of this.strategies) {
      // Filter phase
      result = strategy.filter(result, context);
      if (result.length === 0) {
        return [];
      }

      // Score phase
      result = strategy.score(result, context);
    }

    return result;
  }

  /**
   * Select the best candidate from scored list
   */
  protected selectBest(
    candidates: RoutingCandidate<TCandidate>[]
  ): RoutingCandidate<TCandidate> | null {
    if (candidates.length === 0) return null;

    // Sort by score descending
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    return sorted[0];
  }

  /**
   * Build human-readable selection reason
   */
  protected buildReason(candidate: RoutingCandidate<TCandidate>): string {
    const parts: string[] = [];
    for (const [strategy, score] of Object.entries(candidate.scoreBreakdown)) {
      if (score !== 0) {
        parts.push(`${strategy}: ${score >= 0 ? '+' : ''}${score.toFixed(1)}`);
      }
    }
    return parts.length > 0
      ? `Selected based on: ${parts.join(', ')}`
      : 'Default selection';
  }

  /**
   * Abstract: Get initial candidates
   */
  protected abstract getCandidates(
    context: TContext
  ): RoutingCandidate<TCandidate>[];

  /**
   * Abstract: Convert candidate to result
   */
  protected abstract toResult(
    candidate: RoutingCandidate<TCandidate>,
    reason: string
  ): TResult;

  /**
   * Select provider implementation
   */
  async selectProvider(context: TContext): Promise<TResult | null> {
    const candidates = this.getCandidates(context);
    if (candidates.length === 0) return null;

    const scored = this.runStrategyChain(candidates, context);
    const best = this.selectBest(scored);
    if (!best) return null;

    const reason = this.buildReason(best);
    return this.toResult(best, reason);
  }

  /**
   * Abstract: Select fallback implementation
   */
  abstract selectFallback(
    context: TContext,
    excludeTargets: string[]
  ): Promise<TResult | null>;
}

/**
 * Create an initial routing candidate with zero score
 */
export function createCandidate<T>(item: T): RoutingCandidate<T> {
  return {
    item,
    score: 0,
    scoreBreakdown: {},
  };
}

/**
 * Add score to a candidate
 */
export function addScore<T>(
  candidate: RoutingCandidate<T>,
  strategyName: string,
  score: number
): RoutingCandidate<T> {
  return {
    ...candidate,
    score: candidate.score + score,
    scoreBreakdown: {
      ...candidate.scoreBreakdown,
      [strategyName]: score,
    },
  };
}
