/**
 * Base Error - Shared error base class
 *
 * All package-specific errors should extend this class.
 * - AgentError extends BaseError (in @uniedit/agent)
 * - PlatformError extends BaseError (in @uniedit/platform)
 */
/**
 * Base error class for all packages
 */
export class BaseError extends Error {
    category;
    code;
    retryable;
    retryAfter;
    context;
    constructor(info) {
        super(info.message);
        this.name = 'BaseError';
        this.category = info.category;
        this.code = info.code;
        this.retryable = info.retryable;
        this.retryAfter = info.retryAfter;
        this.cause = info.cause;
        this.context = info.context;
    }
    /**
     * Check if error is retryable
     */
    static isRetryable(error) {
        if (error instanceof BaseError) {
            return error.retryable;
        }
        return false;
    }
    /**
     * Create from generic error
     */
    static fromError(error, context) {
        if (error instanceof BaseError) {
            return error;
        }
        return new BaseError({
            category: 'unknown',
            code: 'UNKNOWN_ERROR',
            message: error.message,
            retryable: false,
            cause: error,
            context,
        });
    }
}
/**
 * Calculate backoff delay
 */
export function calculateBackoff(strategy, attempt) {
    switch (strategy.type) {
        case 'fixed':
            return strategy.delayMs;
        case 'linear':
            return Math.min(strategy.initialDelayMs + strategy.incrementMs * attempt, strategy.maxDelayMs);
        case 'exponential':
            return Math.min(strategy.initialDelayMs * Math.pow(strategy.multiplier, attempt), strategy.maxDelayMs);
        case 'jitter': {
            const baseDelay = calculateBackoff(strategy.baseStrategy, attempt);
            const jitter = baseDelay * strategy.jitterFactor * Math.random();
            return baseDelay + jitter;
        }
        default:
            return 1000;
    }
}
/**
 * Check if error should trigger retry
 */
export function shouldRetry(error, policy, attempt) {
    if (attempt >= policy.maxRetries) {
        return false;
    }
    if (!error.retryable) {
        return false;
    }
    return policy.retryableCategories.includes(error.category);
}
/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=base-error.js.map