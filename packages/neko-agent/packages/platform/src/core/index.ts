/**
 * Core module - Shared abstractions and utilities
 *
 * This module provides the foundational building blocks used across
 * the platform, including:
 *
 * - BaseRegistry: Generic registry for adapters
 * - SelectionStrategy: Unified selection algorithms
 * - Router: Routing interfaces and base classes
 * - HealthMonitor: Centralized health monitoring
 */

// Base Registry
export { BaseRegistry, type IRegistry } from './base-registry';

// Selection Strategies
export {
  type SelectionContext,
  type ISelectionStrategy,
  type ItemIdGetter,
  type CostInfo,
  type QualityInfo,
  type LatencyInfo,
  type CapabilityInfo,
  PrioritySelectionStrategy,
  RoundRobinSelectionStrategy,
  WeightedSelectionStrategy,
  CostOptimalSelectionStrategy,
  QualityOptimalSelectionStrategy,
  LatencyOptimalSelectionStrategy,
  CapabilityMatchSelectionStrategy,
  SelectionStrategyFactory,
  createDefaultStrategyFactory,
} from './selection-strategy';

// Router
export {
  type IRouter,
  type RoutingCandidate,
  type IRoutingStrategy,
  type BaseRoutingResult,
  type BaseRoutingPreference,
  type ErrorCategory,
  type FallbackConfig,
  BaseRoutingManager,
  createCandidate,
  addScore,
} from './router';

// Health Monitor
export {
  type HealthStatus,
  type HealthChecker,
  type HealthChangeListener,
  type HealthMonitorConfig,
  HealthMonitor,
  createHttpHealthChecker,
} from './health-monitor';

// HTTP Client
export {
  type HttpRequestConfig,
  type HttpError,
  type HttpResult,
  HttpClient,
  getHttpClient,
  createHttpClient,
} from './http-client';

// Concurrency Control - Re-export from shared
export {
  type ConcurrencyPoolOptions,
  type PoolStats,
  ConcurrencyPool,
  KeyedConcurrencyPool,
  withConcurrencyLimit,
} from '@uniedit/shared';

// Circuit Breaker
export {
  type CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerStats,
  CircuitBreaker,
  CircuitOpenError,
  KeyedCircuitBreaker,
} from './circuit-breaker';

// Rate Limiter
export {
  type RateLimiterOptions,
  type RateLimiterStats,
  type RateLimitResult,
  RateLimiter,
  RateLimitError,
  KeyedRateLimiter,
  AdaptiveRateLimiter,
} from './rate-limiter';
