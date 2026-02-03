/**
 * Concurrency Pool - Semaphore-based concurrency control
 *
 * Limits the number of concurrent operations to prevent API overload
 * and resource exhaustion.
 */
/**
 * Concurrency pool options
 */
export interface ConcurrencyPoolOptions {
    /** Maximum concurrent operations (default: 5) */
    maxConcurrent?: number;
    /** Queue timeout in ms (default: 30000) */
    queueTimeout?: number;
    /** Enable fair queuing - FIFO order (default: true) */
    fairQueue?: boolean;
}
/**
 * Pool statistics
 */
export interface PoolStats {
    /** Current running count */
    running: number;
    /** Current queue length */
    queued: number;
    /** Maximum concurrent limit */
    maxConcurrent: number;
    /** Total acquired count */
    totalAcquired: number;
    /** Total timeout count */
    totalTimeouts: number;
}
/**
 * Concurrency pool for limiting parallel operations
 *
 * Usage:
 * ```typescript
 * const pool = new ConcurrencyPool({ maxConcurrent: 3 });
 *
 * // Method 1: Manual acquire/release
 * await pool.acquire();
 * try {
 *   await doWork();
 * } finally {
 *   pool.release();
 * }
 *
 * // Method 2: Using run() helper
 * const result = await pool.run(() => doWork());
 *
 * // Method 3: With priority
 * await pool.acquire(10); // Higher priority
 * ```
 */
export declare class ConcurrencyPool {
    private running;
    private queue;
    private maxConcurrent;
    private queueTimeout;
    private fairQueue;
    private totalAcquired;
    private totalTimeouts;
    private disposed;
    constructor(options?: ConcurrencyPoolOptions);
    /**
     * Get current pool statistics
     */
    get stats(): PoolStats;
    /**
     * Check if pool has available capacity
     */
    get hasCapacity(): boolean;
    /**
     * Acquire a slot from the pool
     * Blocks until a slot is available or timeout
     *
     * @param priority Higher value = higher priority (default: 0)
     * @throws Error if timeout or pool is disposed
     */
    acquire(priority?: number): Promise<void>;
    /**
     * Release a slot back to the pool
     */
    release(): void;
    /**
     * Run an operation with automatic acquire/release
     *
     * @param operation The async operation to run
     * @param priority Optional priority (higher = more urgent)
     * @returns The operation result
     */
    run<T>(operation: () => Promise<T>, priority?: number): Promise<T>;
    /**
     * Run multiple operations with concurrency control
     *
     * @param operations Array of async operations
     * @returns Array of results in same order
     */
    runAll<T>(operations: Array<() => Promise<T>>): Promise<T[]>;
    /**
     * Run multiple operations, settling all (no early failure)
     */
    runAllSettled<T>(operations: Array<() => Promise<T>>): Promise<PromiseSettledResult<T>[]>;
    /**
     * Try to acquire without waiting
     * Returns true if acquired, false if no capacity
     */
    tryAcquire(): boolean;
    /**
     * Update max concurrent limit dynamically
     */
    setMaxConcurrent(max: number): void;
    /**
     * Clear all queued tasks
     */
    clearQueue(): number;
    /**
     * Dispose the pool
     * Rejects all queued tasks and prevents new acquisitions
     */
    dispose(): void;
    private removeFromQueue;
}
/**
 * Create a rate-limited version of an async function
 *
 * @param fn The function to wrap
 * @param pool The concurrency pool to use
 * @returns Wrapped function with concurrency control
 */
export declare function withConcurrencyLimit<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, pool: ConcurrencyPool): T;
/**
 * Per-key concurrency pools for resource-specific limits
 *
 * Usage:
 * ```typescript
 * const pools = new KeyedConcurrencyPool({ maxConcurrent: 2 });
 *
 * // Each provider gets its own limit
 * await pools.run('openai', () => callOpenAI());
 * await pools.run('claude', () => callClaude());
 * ```
 */
export declare class KeyedConcurrencyPool {
    private pools;
    private options;
    constructor(options?: ConcurrencyPoolOptions);
    /**
     * Get or create pool for key
     */
    getPool(key: string): ConcurrencyPool;
    /**
     * Run operation with key-specific concurrency control
     */
    run<T>(key: string, operation: () => Promise<T>, priority?: number): Promise<T>;
    /**
     * Get stats for all pools
     */
    getAllStats(): Map<string, PoolStats>;
    /**
     * Dispose all pools
     */
    dispose(): void;
}
//# sourceMappingURL=concurrency-pool.d.ts.map