/**
 * Concurrency Pool - Semaphore-based concurrency control
 *
 * Limits the number of concurrent operations to prevent API overload
 * and resource exhaustion.
 */
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
export class ConcurrencyPool {
    running = 0;
    queue = [];
    maxConcurrent;
    queueTimeout;
    fairQueue;
    totalAcquired = 0;
    totalTimeouts = 0;
    disposed = false;
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent ?? 5;
        this.queueTimeout = options.queueTimeout ?? 30000;
        this.fairQueue = options.fairQueue ?? true;
        if (this.maxConcurrent < 1) {
            throw new Error('maxConcurrent must be at least 1');
        }
    }
    /**
     * Get current pool statistics
     */
    get stats() {
        return {
            running: this.running,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent,
            totalAcquired: this.totalAcquired,
            totalTimeouts: this.totalTimeouts,
        };
    }
    /**
     * Check if pool has available capacity
     */
    get hasCapacity() {
        return this.running < this.maxConcurrent;
    }
    /**
     * Acquire a slot from the pool
     * Blocks until a slot is available or timeout
     *
     * @param priority Higher value = higher priority (default: 0)
     * @throws Error if timeout or pool is disposed
     */
    async acquire(priority = 0) {
        if (this.disposed) {
            throw new Error('ConcurrencyPool has been disposed');
        }
        // Fast path: slot available
        if (this.running < this.maxConcurrent) {
            this.running++;
            this.totalAcquired++;
            return;
        }
        // Slow path: queue and wait
        return new Promise((resolve, reject) => {
            const task = {
                resolve: () => {
                    this.running++;
                    this.totalAcquired++;
                    resolve();
                },
                reject,
                priority,
                enqueuedAt: Date.now(),
            };
            // Setup timeout
            if (this.queueTimeout > 0) {
                task.timeoutId = setTimeout(() => {
                    this.removeFromQueue(task);
                    this.totalTimeouts++;
                    reject(new Error(`Queue timeout after ${this.queueTimeout}ms`));
                }, this.queueTimeout);
            }
            // Insert by priority (higher priority first)
            if (this.fairQueue && priority === 0) {
                // FIFO for default priority
                this.queue.push(task);
            }
            else {
                // Priority queue insertion
                const insertIndex = this.queue.findIndex((t) => t.priority < priority);
                if (insertIndex === -1) {
                    this.queue.push(task);
                }
                else {
                    this.queue.splice(insertIndex, 0, task);
                }
            }
        });
    }
    /**
     * Release a slot back to the pool
     */
    release() {
        if (this.running <= 0) {
            console.warn('[ConcurrencyPool] Release called but no running tasks');
            return;
        }
        this.running--;
        // Process next queued task
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next.timeoutId) {
                clearTimeout(next.timeoutId);
            }
            next.resolve();
        }
    }
    /**
     * Run an operation with automatic acquire/release
     *
     * @param operation The async operation to run
     * @param priority Optional priority (higher = more urgent)
     * @returns The operation result
     */
    async run(operation, priority = 0) {
        await this.acquire(priority);
        try {
            return await operation();
        }
        finally {
            this.release();
        }
    }
    /**
     * Run multiple operations with concurrency control
     *
     * @param operations Array of async operations
     * @returns Array of results in same order
     */
    async runAll(operations) {
        return Promise.all(operations.map((op) => this.run(op)));
    }
    /**
     * Run multiple operations, settling all (no early failure)
     */
    async runAllSettled(operations) {
        return Promise.allSettled(operations.map((op) => this.run(op)));
    }
    /**
     * Try to acquire without waiting
     * Returns true if acquired, false if no capacity
     */
    tryAcquire() {
        if (this.disposed || this.running >= this.maxConcurrent) {
            return false;
        }
        this.running++;
        this.totalAcquired++;
        return true;
    }
    /**
     * Update max concurrent limit dynamically
     */
    setMaxConcurrent(max) {
        if (max < 1) {
            throw new Error('maxConcurrent must be at least 1');
        }
        this.maxConcurrent = max;
        // Process queued tasks if we now have capacity
        while (this.running < this.maxConcurrent && this.queue.length > 0) {
            const next = this.queue.shift();
            if (next.timeoutId) {
                clearTimeout(next.timeoutId);
            }
            next.resolve();
        }
    }
    /**
     * Clear all queued tasks
     */
    clearQueue() {
        const count = this.queue.length;
        for (const task of this.queue) {
            if (task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
            task.reject(new Error('Queue cleared'));
        }
        this.queue = [];
        return count;
    }
    /**
     * Dispose the pool
     * Rejects all queued tasks and prevents new acquisitions
     */
    dispose() {
        this.disposed = true;
        for (const task of this.queue) {
            if (task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
            task.reject(new Error('ConcurrencyPool disposed'));
        }
        this.queue = [];
    }
    removeFromQueue(task) {
        const index = this.queue.indexOf(task);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
    }
}
/**
 * Create a rate-limited version of an async function
 *
 * @param fn The function to wrap
 * @param pool The concurrency pool to use
 * @returns Wrapped function with concurrency control
 */
export function withConcurrencyLimit(fn, pool) {
    return (async (...args) => {
        return pool.run(() => fn(...args));
    });
}
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
export class KeyedConcurrencyPool {
    pools = new Map();
    options;
    constructor(options = {}) {
        this.options = options;
    }
    /**
     * Get or create pool for key
     */
    getPool(key) {
        let pool = this.pools.get(key);
        if (!pool) {
            pool = new ConcurrencyPool(this.options);
            this.pools.set(key, pool);
        }
        return pool;
    }
    /**
     * Run operation with key-specific concurrency control
     */
    async run(key, operation, priority = 0) {
        return this.getPool(key).run(operation, priority);
    }
    /**
     * Get stats for all pools
     */
    getAllStats() {
        const stats = new Map();
        for (const [key, pool] of this.pools) {
            stats.set(key, pool.stats);
        }
        return stats;
    }
    /**
     * Dispose all pools
     */
    dispose() {
        for (const pool of this.pools.values()) {
            pool.dispose();
        }
        this.pools.clear();
    }
}
//# sourceMappingURL=concurrency-pool.js.map