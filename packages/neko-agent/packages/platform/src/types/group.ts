/**
 * Group Types - Model routing and grouping
 */

/**
 * Model group for routing
 */
export interface Group {
  /** Unique group identifier */
  id: string;
  /** Display name */
  name: string;
  /** Group description */
  description?: string;
  /** Model IDs in this group (ordered by priority) */
  models: string[];
  /** Routing strategy */
  strategy: RoutingStrategy;
  /** Fallback behavior */
  fallback: FallbackConfig;
  /** Whether group is enabled */
  enabled: boolean;
}

/**
 * Routing strategy for model selection
 */
export type RoutingStrategy =
  | PriorityStrategy
  | RoundRobinStrategy
  | WeightedStrategy
  | CostOptimalStrategy;

export interface PriorityStrategy {
  type: 'priority';
}

export interface RoundRobinStrategy {
  type: 'round-robin';
}

export interface WeightedStrategy {
  type: 'weighted';
  weights: Record<string, number>;
}

export interface CostOptimalStrategy {
  type: 'cost-optimal';
  maxCostPer1k?: number;
}

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /** Whether to enable fallback */
  enabled: boolean;
  /** Maximum number of fallback attempts */
  maxAttempts: number;
  /** Error types that trigger fallback */
  triggerOn: FallbackTrigger[];
}

export type FallbackTrigger =
  | 'rate_limit'
  | 'timeout'
  | 'server_error'
  | 'unavailable'
  | 'context_length';

/**
 * Routing result
 */
export interface RoutingResult {
  modelId: string;
  providerId: string;
  attempt: number;
  reason: string;
}
