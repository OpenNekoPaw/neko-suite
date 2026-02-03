/**
 * Provider Registry - Manages provider health, adapters, and fault isolation
 *
 * This class is focused on:
 * - Provider health monitoring and status tracking
 * - Adapter instance management (via adapter registry)
 * - Circuit breaker pattern for fault isolation
 * - Rate limiting for API throttling prevention
 *
 * For provider/model configuration data, use ConfigManager directly.
 */

import type { Provider, ProviderStatus, ModelCapability, Model, ProviderType } from '../types/provider';
import type { Adapter } from '../types/adapter';
import type { ConfigManager } from '../config/config-manager';
import { getAdapterRegistry } from '../llm/adapter/adapter-registry';
import {
  CircuitBreaker,
  CircuitOpenError,
  type CircuitBreakerOptions,
  type CircuitState,
} from '../core/circuit-breaker';
import {
  KeyedRateLimiter,
  AdaptiveRateLimiter,
  type RateLimiterOptions,
  type RateLimiterStats,
  type RateLimitResult,
} from '../core/rate-limiter';

/**
 * Provider-specific rate limit configuration
 */
export interface ProviderRateLimitConfig {
  /** Requests per minute (default: 60) */
  requestsPerMinute?: number;
  /** Use adaptive rate limiting (default: false) */
  adaptive?: boolean;
}

/**
 * Provider registry options
 */
export interface ProviderRegistryOptions {
  /** Circuit breaker configuration for providers */
  circuitBreaker?: CircuitBreakerOptions;
  /** Default rate limit configuration */
  rateLimit?: RateLimiterOptions;
  /** Per-provider rate limit overrides */
  providerRateLimits?: Record<string, ProviderRateLimitConfig>;
  /** Health check interval in ms (default: 60000) */
  healthCheckInterval?: number;
  /**
   * Circuit breaker isolation mode:
   * - 'provider': One circuit breaker per provider (default, protects provider)
   * - 'session': One circuit breaker per provider+session (full isolation)
   */
  circuitBreakerIsolation?: 'provider' | 'session';
}

/**
 * Extended provider status with circuit breaker and rate limit info
 */
export interface ExtendedProviderStatus extends ProviderStatus {
  /** Circuit breaker state */
  circuitState?: CircuitState;
  /** Circuit breaker stats */
  circuitStats?: {
    failures: number;
    totalRequests: number;
    totalRejected: number;
  };
  /** Rate limiter stats */
  rateLimitStats?: {
    available: number;
    max: number;
    totalRequests: number;
    totalThrottled: number;
  };
}

/**
 * Provider registry for health monitoring and adapter management
 */
export class ProviderRegistry {
  private configManager: ConfigManager;
  private providerStatus: Map<string, ProviderStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private circuitBreakerOptions: CircuitBreakerOptions;
  private defaultHealthCheckIntervalMs: number;
  private rateLimiter: KeyedRateLimiter;
  private providerRateLimits: Record<string, ProviderRateLimitConfig>;
  private circuitBreakerIsolation: 'provider' | 'session';

  constructor(configManager: ConfigManager, options: ProviderRegistryOptions = {}) {
    this.configManager = configManager;
    this.circuitBreakerOptions = options.circuitBreaker ?? {
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
    };
    this.defaultHealthCheckIntervalMs = options.healthCheckInterval ?? 60000;
    this.providerRateLimits = options.providerRateLimits ?? {};
    this.circuitBreakerIsolation = options.circuitBreakerIsolation ?? 'session'; // Default to session isolation

    // Initialize rate limiter with default options
    this.rateLimiter = new KeyedRateLimiter(options.rateLimit ?? {
      maxRequests: 60,
      windowMs: 60000, // 1 minute
      algorithm: 'sliding_window',
    });

    // Apply per-provider rate limit configurations
    for (const [providerId, config] of Object.entries(this.providerRateLimits)) {
      this.rateLimiter.setKeyOptions(providerId, {
        maxRequests: config.requestsPerMinute ?? 60,
        windowMs: 60000,
      });
    }
  }

  /**
   * Get circuit breaker key based on isolation mode
   */
  private getCircuitBreakerKey(providerId: string, sessionId?: string): string {
    if (this.circuitBreakerIsolation === 'session' && sessionId) {
      return `${providerId}:${sessionId}`;
    }
    return providerId;
  }

  /**
   * Get or create circuit breaker for provider (optionally scoped to session)
   */
  private getCircuitBreaker(providerId: string, sessionId?: string): CircuitBreaker {
    const key = this.getCircuitBreakerKey(providerId, sessionId);
    let breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker({
        ...this.circuitBreakerOptions,
        onStateChange: (from, to) => {
          console.log(`[ProviderRegistry] Circuit ${key}: ${from} -> ${to}`);
          // Update provider status when circuit opens (only for provider-level circuits)
          if (to === 'open' && this.circuitBreakerIsolation === 'provider') {
            const status = this.providerStatus.get(providerId);
            if (status) {
              status.available = false;
              status.error = 'Circuit breaker open due to repeated failures';
            }
          }
        },
      });
      this.circuitBreakers.set(key, breaker);
    }
    return breaker;
  }

  /**
   * Check if provider circuit is open (failing)
   * @param providerId Provider ID
   * @param sessionId Optional session ID for session-scoped check
   */
  isCircuitOpen(providerId: string, sessionId?: string): boolean {
    const key = this.getCircuitBreakerKey(providerId, sessionId);
    const breaker = this.circuitBreakers.get(key);
    return breaker ? breaker.getState() === 'open' : false;
  }

  /**
   * Get circuit breaker state for provider
   * @param providerId Provider ID
   * @param sessionId Optional session ID for session-scoped check
   */
  getCircuitState(providerId: string, sessionId?: string): CircuitState {
    const key = this.getCircuitBreakerKey(providerId, sessionId);
    const breaker = this.circuitBreakers.get(key);
    return breaker ? breaker.getState() : 'closed';
  }

  /**
   * Record a successful request to provider
   * @param providerId Provider ID
   * @param sessionId Optional session ID for session-scoped tracking
   */
  recordSuccess(providerId: string, sessionId?: string): void {
    this.getCircuitBreaker(providerId, sessionId).recordSuccess();
  }

  /**
   * Record a failed request to provider
   * @param providerId Provider ID
   * @param error The error that occurred
   * @param sessionId Optional session ID for session-scoped tracking
   */
  recordFailure(providerId: string, error: Error, sessionId?: string): void {
    this.getCircuitBreaker(providerId, sessionId).recordFailure(error);
  }

  /**
   * Execute operation with circuit breaker protection
   * @param providerId Provider ID
   * @param operation The operation to execute
   * @param sessionId Optional session ID for session-scoped protection
   */
  async executeWithCircuitBreaker<T>(
    providerId: string,
    operation: () => Promise<T>,
    sessionId?: string
  ): Promise<T> {
    return this.getCircuitBreaker(providerId, sessionId).execute(operation);
  }

  /**
   * Check if provider can accept requests (circuit not open)
   * @param providerId Provider ID
   * @param sessionId Optional session ID for session-scoped check
   */
  canExecute(providerId: string, sessionId?: string): boolean {
    return this.getCircuitBreaker(providerId, sessionId).canExecute();
  }

  /**
   * Force reset circuit breaker for provider
   * @param providerId Provider ID
   * @param sessionId Optional session ID for session-scoped reset
   */
  resetCircuit(providerId: string, sessionId?: string): void {
    const key = this.getCircuitBreakerKey(providerId, sessionId);
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clean up session-specific circuit breakers
   * @param sessionId Session ID to clean up
   */
  cleanupSession(sessionId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.circuitBreakers.keys()) {
      if (key.endsWith(`:${sessionId}`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      const breaker = this.circuitBreakers.get(key);
      breaker?.dispose();
      this.circuitBreakers.delete(key);
    }
    if (keysToDelete.length > 0) {
      console.log(`[ProviderRegistry] Cleaned up ${keysToDelete.length} circuit breakers for session: ${sessionId}`);
    }
  }

  // ============================================================================
  // Rate Limiting Methods
  // ============================================================================

  /**
   * Try to acquire rate limit token for provider
   * Returns result with allowed status and retry timing
   */
  tryAcquireRateLimit(providerId: string): RateLimitResult {
    return this.rateLimiter.tryAcquire(providerId);
  }

  /**
   * Acquire rate limit token, waiting if necessary
   */
  async acquireRateLimit(providerId: string): Promise<void> {
    return this.rateLimiter.acquire(providerId);
  }

  /**
   * Check if provider has rate limit capacity
   */
  hasRateLimitCapacity(providerId: string): boolean {
    const result = this.rateLimiter.tryAcquire(providerId);
    return result.allowed;
  }

  /**
   * Update rate limit for provider (e.g., from API response headers)
   */
  updateRateLimit(providerId: string, maxRequests: number, windowMs?: number): void {
    this.rateLimiter.updateLimit(providerId, maxRequests, windowMs);
  }

  /**
   * Handle rate limit response headers from API
   * Updates rate limiter based on headers like x-ratelimit-limit, retry-after
   */
  handleRateLimitResponse(
    providerId: string,
    headers: {
      'retry-after'?: string;
      'x-ratelimit-limit'?: string;
      'x-ratelimit-remaining'?: string;
      'x-ratelimit-reset'?: string;
    }
  ): number {
    return this.rateLimiter.handleRateLimitResponse(providerId, headers);
  }

  /**
   * Get rate limiter stats for provider
   */
  getRateLimitStats(providerId: string): RateLimiterStats {
    return this.rateLimiter.getLimiter(providerId).stats;
  }

  /**
   * Get all rate limiter stats
   */
  getAllRateLimitStats(): Map<string, RateLimiterStats> {
    return this.rateLimiter.getAllStats();
  }

  /**
   * Reset rate limiter for provider
   */
  resetRateLimit(providerId: string): void {
    this.rateLimiter.getLimiter(providerId).reset();
  }

  /**
   * Reset all rate limiters
   */
  resetAllRateLimits(): void {
    this.rateLimiter.resetAll();
  }

  /**
   * Execute operation with rate limiting
   */
  async executeWithRateLimit<T>(
    providerId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.rateLimiter.run(providerId, operation);
  }

  /**
   * Execute operation with both circuit breaker and rate limiting
   * @param providerId Provider ID
   * @param operation The operation to execute
   * @param sessionId Optional session ID for session-scoped circuit breaker
   */
  async executeWithProtection<T>(
    providerId: string,
    operation: () => Promise<T>,
    sessionId?: string
  ): Promise<T> {
    // First check rate limit
    await this.rateLimiter.acquire(providerId);

    // Then execute with circuit breaker (session-scoped if provided)
    return this.getCircuitBreaker(providerId, sessionId).execute(operation);
  }

  /**
   * Get adapter for provider, optionally considering model-specific protocol
   * @param providerId - The provider ID
   * @param model - Optional model config. If provided and has protocol, uses model.protocol instead of provider.type
   */
  getAdapter(providerId: string, model?: Model): Adapter | undefined {
    const provider = this.configManager.getProvider(providerId);
    if (!provider) return undefined;

    // Priority: model.protocol > inferred from model name (only for generic type) > provider.type
    // Only infer from model name when provider.type is 'generic', because other provider types
    // (like 'newapi') already specify which adapter to use, even if they serve GPT models.
    const inferredProtocol = provider.type === 'generic' ? this.inferProtocolFromModelName(model?.name) : undefined;
    const adapterType = model?.protocol || inferredProtocol || provider.type;
    return getAdapterRegistry().getForType(adapterType);
  }

  /**
   * Infer protocol type from model name
   * @param modelName - The model name to analyze
   * @returns The inferred protocol type, or undefined if cannot be determined
   */
  private inferProtocolFromModelName(modelName?: string): ProviderType | undefined {
    if (!modelName) return undefined;

    const name = modelName.toLowerCase();

    // Anthropic/Claude models
    if (name.includes('claude') || name.includes('anthropic')) {
      return 'anthropic';
    }

    // Google models
    if (name.includes('gemini') || name.includes('palm') || name.includes('bard')) {
      return 'google';
    }

    // OpenAI models (explicit check)
    if (
      name.includes('gpt-') ||
      name.includes('o1') ||
      name.includes('dall-e') ||
      name.includes('whisper') ||
      name.includes('tts-')
    ) {
      return 'openai';
    }

    // Cannot determine - will fall back to provider.type
    return undefined;
  }

  /**
   * Get models with specific capability
   */
  getModelsWithCapability(capability: ModelCapability | string): Model[] {
    return this.configManager.getEnabledModels().filter((m) =>
      (m.capabilities as (ModelCapability | string)[]).includes(capability)
    );
  }

  /**
   * Get provider status with circuit breaker and rate limit info
   */
  getProviderStatus(providerId: string): ExtendedProviderStatus | undefined {
    const status = this.providerStatus.get(providerId);
    if (!status) return undefined;

    const result: ExtendedProviderStatus = { ...status };

    // Add circuit breaker stats
    const breaker = this.circuitBreakers.get(providerId);
    if (breaker) {
      const stats = breaker.getStats();
      result.circuitState = stats.state;
      result.circuitStats = {
        failures: stats.failures,
        totalRequests: stats.totalRequests,
        totalRejected: stats.totalRejected,
      };
    }

    // Add rate limiter stats
    const rateLimitStats = this.rateLimiter.getLimiter(providerId).stats;
    result.rateLimitStats = {
      available: rateLimitStats.available,
      max: rateLimitStats.max,
      totalRequests: rateLimitStats.totalRequests,
      totalThrottled: rateLimitStats.totalThrottled,
    };

    return result;
  }

  /**
   * Check if provider is available (considers both health and circuit state)
   * @param providerId Provider ID
   * @param sessionId Optional session ID for session-scoped circuit check
   */
  isProviderAvailable(providerId: string, sessionId?: string): boolean {
    // Check circuit breaker first (session-scoped if provided)
    if (this.isCircuitOpen(providerId, sessionId)) {
      return false;
    }

    const status = this.providerStatus.get(providerId);
    return status?.available ?? true; // Assume available if not checked
  }

  /**
   * Check provider health
   */
  async checkProviderHealth(providerId: string): Promise<ProviderStatus> {
    const provider = this.configManager.getProvider(providerId);
    if (!provider) {
      const status: ProviderStatus = {
        providerId,
        available: false,
        lastChecked: new Date(),
        error: 'Provider not found',
      };
      this.providerStatus.set(providerId, status);
      return status;
    }

    const startTime = Date.now();

    try {
      // Simple health check by making a request to the API
      const response = await fetch(provider.apiUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - startTime;
      const status: ProviderStatus = {
        providerId,
        available: response.ok || response.status === 405, // 405 is OK for HEAD on some APIs
        latency,
        lastChecked: new Date(),
      };
      this.providerStatus.set(providerId, status);
      return status;
    } catch (error) {
      const status: ProviderStatus = {
        providerId,
        available: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.providerStatus.set(providerId, status);
      return status;
    }
  }

  /**
   * Check health of all providers
   */
  async checkAllProvidersHealth(): Promise<Map<string, ProviderStatus>> {
    const providers = this.configManager.getEnabledProviders();
    const results = await Promise.all(
      providers.map((p) => this.checkProviderHealth(p.id))
    );

    const statusMap = new Map<string, ProviderStatus>();
    for (const status of results) {
      statusMap.set(status.providerId, status);
    }
    return statusMap;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(intervalMs: number = 60000): void {
    this.stopHealthChecks();
    this.healthCheckInterval = setInterval(() => {
      this.checkAllProvidersHealth().catch(console.error);
    }, intervalMs);

    // Initial check
    this.checkAllProvidersHealth().catch(console.error);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stopHealthChecks();
    this.providerStatus.clear();
    // Dispose circuit breakers
    for (const breaker of this.circuitBreakers.values()) {
      breaker.dispose();
    }
    this.circuitBreakers.clear();
    // Dispose rate limiter
    this.rateLimiter.dispose();
  }

  /**
   * Get all circuit breaker states
   */
  getAllCircuitStates(): Map<string, CircuitState> {
    const states = new Map<string, CircuitState>();
    for (const [providerId, breaker] of this.circuitBreakers) {
      states.set(providerId, breaker.getState());
    }
    return states;
  }

  /**
   * Get list of providers with open circuits
   */
  getOpenCircuits(): string[] {
    return Array.from(this.circuitBreakers.entries())
      .filter(([, breaker]) => breaker.getState() === 'open')
      .map(([providerId]) => providerId);
  }
}
