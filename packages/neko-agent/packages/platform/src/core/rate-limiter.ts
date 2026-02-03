/**
 * Rate Limiter - Token bucket and sliding window rate limiting
 *
 * Controls request rates per time window to prevent API throttling.
 * Supports:
 * - Token bucket algorithm for burst handling
 * - Sliding window for smooth rate limiting
 * - Dynamic rate adjustment based on API responses
 * - Per-key rate limiting for multiple resources
 */

/**
 * Rate limiter options
 */
export interface RateLimiterOptions {
  /** Maximum requests per window (default: 60) */
  maxRequests?: number;
  /** Window size in ms (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Algorithm type (default: 'sliding_window') */
  algorithm?: 'token_bucket' | 'sliding_window';
  /** For token bucket: tokens to add per interval */
  tokensPerInterval?: number;
  /** For token bucket: interval in ms to add tokens */
  refillInterval?: number;
}

/**
 * Rate limiter statistics
 */
export interface RateLimiterStats {
  /** Current available tokens/capacity */
  available: number;
  /** Maximum capacity */
  max: number;
  /** Requests in current window */
  windowCount: number;
  /** Total requests made */
  totalRequests: number;
  /** Total requests throttled */
  totalThrottled: number;
  /** Time until next token available (ms) */
  retryAfterMs: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether request is allowed */
  allowed: boolean;
  /** Time to wait before retry (ms), 0 if allowed */
  retryAfterMs: number;
  /** Remaining capacity */
  remaining: number;
}

/**
 * Request timestamp for sliding window
 */
interface RequestRecord {
  timestamp: number;
}

/**
 * Rate limiter using sliding window or token bucket algorithm
 *
 * Usage:
 * ```typescript
 * const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60000 });
 *
 * // Check before request
 * const result = limiter.tryAcquire();
 * if (!result.allowed) {
 *   await sleep(result.retryAfterMs);
 * }
 *
 * // Or use with automatic wait
 * await limiter.acquire();
 * await makeRequest();
 * ```
 */
export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private algorithm: 'token_bucket' | 'sliding_window';

  // Sliding window state
  private requests: RequestRecord[] = [];

  // Token bucket state
  private tokens: number;
  private tokensPerInterval: number;
  private refillInterval: number;
  private lastRefill: number;
  private refillTimer?: ReturnType<typeof setInterval>;

  // Stats
  private totalRequests = 0;
  private totalThrottled = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.maxRequests = options.maxRequests ?? 60;
    this.windowMs = options.windowMs ?? 60000;
    this.algorithm = options.algorithm ?? 'sliding_window';

    // Token bucket config
    this.tokens = this.maxRequests;
    this.tokensPerInterval = options.tokensPerInterval ?? Math.ceil(this.maxRequests / 10);
    this.refillInterval = options.refillInterval ?? this.windowMs / 10;
    this.lastRefill = Date.now();

    if (this.algorithm === 'token_bucket') {
      this.startRefillTimer();
    }
  }

  /**
   * Get current statistics
   */
  get stats(): RateLimiterStats {
    this.cleanup();
    const available = this.algorithm === 'token_bucket'
      ? this.tokens
      : this.maxRequests - this.requests.length;

    return {
      available: Math.max(0, available),
      max: this.maxRequests,
      windowCount: this.requests.length,
      totalRequests: this.totalRequests,
      totalThrottled: this.totalThrottled,
      retryAfterMs: this.calculateRetryAfter(),
    };
  }

  /**
   * Check if request is allowed without consuming
   */
  canAcquire(): boolean {
    this.cleanup();
    if (this.algorithm === 'token_bucket') {
      return this.tokens >= 1;
    }
    return this.requests.length < this.maxRequests;
  }

  /**
   * Try to acquire a rate limit token
   * Returns result with allowed status and retry timing
   */
  tryAcquire(): RateLimitResult {
    this.cleanup();
    this.totalRequests++;

    if (this.algorithm === 'token_bucket') {
      return this.tryAcquireTokenBucket();
    }
    return this.tryAcquireSlidingWindow();
  }

  /**
   * Acquire with automatic wait if rate limited
   */
  async acquire(): Promise<void> {
    const result = this.tryAcquire();
    if (!result.allowed && result.retryAfterMs > 0) {
      this.totalThrottled++;
      await this.sleep(result.retryAfterMs);
      // Retry after wait
      const retryResult = this.tryAcquire();
      if (!retryResult.allowed) {
        throw new RateLimitError(
          `Rate limit exceeded, retry after ${retryResult.retryAfterMs}ms`,
          retryResult.retryAfterMs
        );
      }
    }
  }

  /**
   * Execute operation with rate limiting
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    return operation();
  }

  /**
   * Update rate limit dynamically (e.g., from API response headers)
   */
  updateLimit(newMaxRequests: number, newWindowMs?: number): void {
    this.maxRequests = newMaxRequests;
    if (newWindowMs !== undefined) {
      this.windowMs = newWindowMs;
    }

    if (this.algorithm === 'token_bucket') {
      // Adjust tokens proportionally
      this.tokens = Math.min(this.tokens, newMaxRequests);
      this.tokensPerInterval = Math.ceil(newMaxRequests / 10);
    }
  }

  /**
   * Handle rate limit response from API
   * Adjusts limits based on response headers
   */
  handleRateLimitResponse(headers: {
    'retry-after'?: string;
    'x-ratelimit-limit'?: string;
    'x-ratelimit-remaining'?: string;
    'x-ratelimit-reset'?: string;
  }): number {
    // Parse retry-after
    let retryAfterMs = 0;
    if (headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after'], 10);
      if (!isNaN(retryAfter)) {
        // Could be seconds or Unix timestamp
        retryAfterMs = retryAfter < 1000000000 ? retryAfter * 1000 : retryAfter - Date.now();
      }
    }

    // Update limit from headers
    if (headers['x-ratelimit-limit']) {
      const limit = parseInt(headers['x-ratelimit-limit'], 10);
      if (!isNaN(limit)) {
        this.updateLimit(limit);
      }
    }

    // Sync remaining tokens
    if (headers['x-ratelimit-remaining']) {
      const remaining = parseInt(headers['x-ratelimit-remaining'], 10);
      if (!isNaN(remaining) && this.algorithm === 'token_bucket') {
        this.tokens = Math.min(remaining, this.maxRequests);
      }
    }

    return retryAfterMs;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
    this.tokens = this.maxRequests;
    this.lastRefill = Date.now();
    this.totalRequests = 0;
    this.totalThrottled = 0;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = undefined;
    }
  }

  private tryAcquireSlidingWindow(): RateLimitResult {
    if (this.requests.length >= this.maxRequests) {
      const retryAfterMs = this.calculateRetryAfter();
      return {
        allowed: false,
        retryAfterMs,
        remaining: 0,
      };
    }

    this.requests.push({ timestamp: Date.now() });
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: this.maxRequests - this.requests.length,
    };
  }

  private tryAcquireTokenBucket(): RateLimitResult {
    this.refillTokens();

    if (this.tokens < 1) {
      const retryAfterMs = this.refillInterval;
      return {
        allowed: false,
        retryAfterMs,
        remaining: 0,
      };
    }

    this.tokens--;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.floor(this.tokens),
    };
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervals = Math.floor(elapsed / this.refillInterval);

    if (intervals > 0) {
      this.tokens = Math.min(
        this.maxRequests,
        this.tokens + intervals * this.tokensPerInterval
      );
      this.lastRefill = now;
    }
  }

  private startRefillTimer(): void {
    this.refillTimer = setInterval(() => {
      this.refillTokens();
    }, this.refillInterval);
  }

  private cleanup(): void {
    if (this.algorithm === 'sliding_window') {
      const cutoff = Date.now() - this.windowMs;
      this.requests = this.requests.filter((r) => r.timestamp > cutoff);
    }
  }

  private calculateRetryAfter(): number {
    if (this.algorithm === 'token_bucket') {
      if (this.tokens >= 1) return 0;
      return this.refillInterval;
    }

    // Sliding window: time until oldest request expires
    if (this.requests.length === 0) return 0;
    if (this.requests.length < this.maxRequests) return 0;

    const oldest = this.requests[0];
    const expiresAt = oldest.timestamp + this.windowMs;
    return Math.max(0, expiresAt - Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Per-key rate limiters for resource-specific limits
 *
 * Usage:
 * ```typescript
 * const limiters = new KeyedRateLimiter({ maxRequests: 100, windowMs: 60000 });
 *
 * // Each provider gets its own limit
 * await limiters.acquire('openai');
 * await limiters.acquire('claude');
 *
 * // Update limit for specific provider
 * limiters.updateLimit('openai', 200);
 * ```
 */
export class KeyedRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();
  private options: RateLimiterOptions;
  private perKeyOptions: Map<string, RateLimiterOptions> = new Map();

  constructor(options: RateLimiterOptions = {}) {
    this.options = options;
  }

  /**
   * Set options for specific key
   */
  setKeyOptions(key: string, options: RateLimiterOptions): void {
    this.perKeyOptions.set(key, options);
    // Update existing limiter if present
    const limiter = this.limiters.get(key);
    if (limiter) {
      limiter.dispose();
      this.limiters.delete(key);
    }
  }

  /**
   * Get or create rate limiter for key
   */
  getLimiter(key: string): RateLimiter {
    let limiter = this.limiters.get(key);
    if (!limiter) {
      const keyOptions = this.perKeyOptions.get(key) || this.options;
      limiter = new RateLimiter(keyOptions);
      this.limiters.set(key, limiter);
    }
    return limiter;
  }

  /**
   * Try to acquire for key
   */
  tryAcquire(key: string): RateLimitResult {
    return this.getLimiter(key).tryAcquire();
  }

  /**
   * Acquire with wait for key
   */
  async acquire(key: string): Promise<void> {
    return this.getLimiter(key).acquire();
  }

  /**
   * Run operation with rate limiting for key
   */
  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return this.getLimiter(key).run(operation);
  }

  /**
   * Update limit for specific key
   */
  updateLimit(key: string, maxRequests: number, windowMs?: number): void {
    this.getLimiter(key).updateLimit(maxRequests, windowMs);
  }

  /**
   * Handle rate limit response for key
   */
  handleRateLimitResponse(
    key: string,
    headers: {
      'retry-after'?: string;
      'x-ratelimit-limit'?: string;
      'x-ratelimit-remaining'?: string;
      'x-ratelimit-reset'?: string;
    }
  ): number {
    return this.getLimiter(key).handleRateLimitResponse(headers);
  }

  /**
   * Get stats for all keys
   */
  getAllStats(): Map<string, RateLimiterStats> {
    const stats = new Map<string, RateLimiterStats>();
    for (const [key, limiter] of this.limiters) {
      stats.set(key, limiter.stats);
    }
    return stats;
  }

  /**
   * Reset all limiters
   */
  resetAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.reset();
    }
  }

  /**
   * Dispose all limiters
   */
  dispose(): void {
    for (const limiter of this.limiters.values()) {
      limiter.dispose();
    }
    this.limiters.clear();
  }
}

/**
 * Adaptive rate limiter that adjusts based on response patterns
 *
 * Automatically reduces rate when encountering 429s and
 * gradually increases when requests succeed.
 */
export class AdaptiveRateLimiter extends RateLimiter {
  private baseMaxRequests: number;
  private minRequests: number;
  private maxMultiplier: number;
  private currentMultiplier: number;
  private consecutiveSuccesses: number;
  private successesForIncrease: number;

  constructor(
    options: RateLimiterOptions & {
      /** Minimum requests per window (default: 10) */
      minRequests?: number;
      /** Maximum multiplier for rate increase (default: 2) */
      maxMultiplier?: number;
      /** Consecutive successes needed to increase rate (default: 10) */
      successesForIncrease?: number;
    } = {}
  ) {
    super(options);
    this.baseMaxRequests = options.maxRequests ?? 60;
    this.minRequests = options.minRequests ?? 10;
    this.maxMultiplier = options.maxMultiplier ?? 2;
    this.successesForIncrease = options.successesForIncrease ?? 10;
    this.currentMultiplier = 1;
    this.consecutiveSuccesses = 0;
  }

  /**
   * Record successful request (may increase rate)
   */
  recordSuccess(): void {
    this.consecutiveSuccesses++;
    if (this.consecutiveSuccesses >= this.successesForIncrease) {
      this.increaseRate();
      this.consecutiveSuccesses = 0;
    }
  }

  /**
   * Record rate limit hit (reduces rate)
   */
  recordRateLimit(): void {
    this.consecutiveSuccesses = 0;
    this.decreaseRate();
  }

  /**
   * Get current effective rate
   */
  getEffectiveRate(): number {
    return Math.floor(this.baseMaxRequests * this.currentMultiplier);
  }

  private increaseRate(): void {
    if (this.currentMultiplier < this.maxMultiplier) {
      this.currentMultiplier = Math.min(
        this.maxMultiplier,
        this.currentMultiplier * 1.1
      );
      this.updateLimit(this.getEffectiveRate());
    }
  }

  private decreaseRate(): void {
    this.currentMultiplier = Math.max(
      this.minRequests / this.baseMaxRequests,
      this.currentMultiplier * 0.5
    );
    this.updateLimit(this.getEffectiveRate());
  }
}
