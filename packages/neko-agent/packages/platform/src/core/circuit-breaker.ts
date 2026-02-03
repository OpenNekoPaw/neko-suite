/**
 * Circuit Breaker - Fault isolation pattern
 *
 * Prevents cascading failures by stopping requests to failing services.
 * Automatically recovers after a cooldown period.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing, requests are rejected immediately
 * - HALF_OPEN: Testing recovery, limited requests pass through
 */

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  /** Failure threshold to open circuit (default: 5) */
  failureThreshold?: number;
  /** Success threshold to close circuit from half-open (default: 2) */
  successThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeout?: number;
  /** Time window in ms for counting failures (default: 60000) */
  failureWindow?: number;
  /** Max requests in half-open state (default: 3) */
  halfOpenMaxRequests?: number;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  totalRejected: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  openedAt?: number;
}

/**
 * Failure record for windowed counting
 */
interface FailureRecord {
  timestamp: number;
  error: Error;
}

/**
 * Circuit Breaker implementation
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 3 });
 *
 * // Method 1: Check before calling
 * if (breaker.canExecute()) {
 *   try {
 *     const result = await callExternalService();
 *     breaker.recordSuccess();
 *   } catch (error) {
 *     breaker.recordFailure(error);
 *     throw error;
 *   }
 * }
 *
 * // Method 2: Use execute() wrapper
 * const result = await breaker.execute(() => callExternalService());
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: FailureRecord[] = [];
  private halfOpenSuccesses = 0;
  private halfOpenRequests = 0;
  private openedAt?: number;
  private resetTimer?: ReturnType<typeof setTimeout>;

  // Stats
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private totalRejected = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;

  // Options
  private failureThreshold: number;
  private successThreshold: number;
  private resetTimeout: number;
  private failureWindow: number;
  private halfOpenMaxRequests: number;
  private onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.failureWindow = options.failureWindow ?? 60000;
    this.halfOpenMaxRequests = options.halfOpenMaxRequests ?? 3;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.getRecentFailureCount(),
      successes: this.halfOpenSuccesses,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalRejected: this.totalRejected,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
    };
  }

  /**
   * Check if request can be executed
   */
  canExecute(): boolean {
    this.cleanupOldFailures();

    switch (this.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if reset timeout has passed
        if (this.openedAt && Date.now() - this.openedAt >= this.resetTimeout) {
          this.transitionTo('half_open');
          return true;
        }
        return false;

      case 'half_open':
        // Allow limited requests in half-open state
        return this.halfOpenRequests < this.halfOpenMaxRequests;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'half_open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(error: Error): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    this.failures.push({
      timestamp: Date.now(),
      error,
    });

    if (this.state === 'half_open') {
      // Any failure in half-open immediately opens circuit
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      // Check if threshold reached
      this.cleanupOldFailures();
      if (this.failures.length >= this.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (!this.canExecute()) {
      this.totalRejected++;
      throw new CircuitOpenError(
        `Circuit breaker is ${this.state}`,
        this.getStats()
      );
    }

    if (this.state === 'half_open') {
      this.halfOpenRequests++;
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      throw error;
    }
  }

  /**
   * Force circuit to open state
   */
  forceOpen(): void {
    this.transitionTo('open');
  }

  /**
   * Force circuit to closed state
   */
  forceClose(): void {
    this.transitionTo('closed');
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.clearResetTimer();
    this.state = 'closed';
    this.failures = [];
    this.halfOpenSuccesses = 0;
    this.halfOpenRequests = 0;
    this.openedAt = undefined;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clearResetTimer();
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    // State-specific setup
    switch (newState) {
      case 'open':
        this.openedAt = Date.now();
        this.scheduleReset();
        break;

      case 'half_open':
        this.halfOpenSuccesses = 0;
        this.halfOpenRequests = 0;
        this.clearResetTimer();
        break;

      case 'closed':
        this.failures = [];
        this.halfOpenSuccesses = 0;
        this.halfOpenRequests = 0;
        this.openedAt = undefined;
        this.clearResetTimer();
        break;
    }

    this.onStateChange?.(oldState, newState);
  }

  private scheduleReset(): void {
    this.clearResetTimer();
    this.resetTimer = setTimeout(() => {
      if (this.state === 'open') {
        this.transitionTo('half_open');
      }
    }, this.resetTimeout);
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.failureWindow;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  private getRecentFailureCount(): number {
    this.cleanupOldFailures();
    return this.failures.length;
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly stats: CircuitBreakerStats;

  constructor(message: string, stats: CircuitBreakerStats) {
    super(message);
    this.name = 'CircuitOpenError';
    this.stats = stats;
  }
}

/**
 * Keyed circuit breakers for per-resource fault isolation
 *
 * Usage:
 * ```typescript
 * const breakers = new KeyedCircuitBreaker({ failureThreshold: 3 });
 *
 * // Each provider has its own circuit
 * await breakers.execute('openai', () => callOpenAI());
 * await breakers.execute('claude', () => callClaude());
 * ```
 */
export class KeyedCircuitBreaker {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = options;
  }

  /**
   * Get or create circuit breaker for key
   */
  getBreaker(key: string): CircuitBreaker {
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker({
        ...this.options,
        onStateChange: (from, to) => {
          this.options.onStateChange?.(from, to);
          console.log(`[CircuitBreaker:${key}] ${from} -> ${to}`);
        },
      });
      this.breakers.set(key, breaker);
    }
    return breaker;
  }

  /**
   * Execute operation with key-specific circuit breaker
   */
  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return this.getBreaker(key).execute(operation);
  }

  /**
   * Check if key's circuit can execute
   */
  canExecute(key: string): boolean {
    return this.getBreaker(key).canExecute();
  }

  /**
   * Get all circuit states
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [key, breaker] of this.breakers) {
      stats.set(key, breaker.getStats());
    }
    return stats;
  }

  /**
   * Get open circuits
   */
  getOpenCircuits(): string[] {
    return Array.from(this.breakers.entries())
      .filter(([, breaker]) => breaker.getState() === 'open')
      .map(([key]) => key);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Dispose all circuit breakers
   */
  dispose(): void {
    for (const breaker of this.breakers.values()) {
      breaker.dispose();
    }
    this.breakers.clear();
  }
}
