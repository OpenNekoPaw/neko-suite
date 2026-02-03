/**
 * Base Error - Shared error base class
 *
 * All package-specific errors should extend this class.
 * - AgentError extends BaseError (in @neko/agent)
 * - PlatformError extends BaseError (in @neko/platform)
 */
/**
 * Error category for classification
 */
export type ErrorCategory = 'authentication' | 'rate_limit' | 'timeout' | 'network' | 'server' | 'validation' | 'not_found' | 'context_length' | 'content_filter' | 'mcp' | 'tool' | 'execution' | 'permission' | 'skill' | 'unknown';
/**
 * Base error info
 */
export interface BaseErrorInfo {
    /** Error category */
    category: ErrorCategory;
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Whether error is retryable */
    retryable: boolean;
    /** Suggested retry delay in ms */
    retryAfter?: number;
    /** Original error */
    cause?: Error;
    /** Additional context */
    context?: Record<string, unknown>;
}
/**
 * Base error class for all packages
 */
export declare class BaseError extends Error implements BaseErrorInfo {
    readonly category: ErrorCategory;
    readonly code: string;
    readonly retryable: boolean;
    readonly retryAfter?: number;
    readonly cause?: Error;
    readonly context?: Record<string, unknown>;
    constructor(info: BaseErrorInfo);
    /**
     * Check if error is retryable
     */
    static isRetryable(error: unknown): boolean;
    /**
     * Create from generic error
     */
    static fromError(error: Error, context?: Record<string, unknown>): BaseError;
}
/**
 * Retry policy configuration
 */
export interface RetryPolicy {
    /** Maximum number of retries */
    maxRetries: number;
    /** Backoff strategy */
    backoffStrategy: BackoffStrategy;
    /** Errors that should trigger retry */
    retryableCategories: ErrorCategory[];
    /** Maximum total retry time in ms */
    maxRetryTime?: number;
}
/**
 * Backoff strategy
 */
export type BackoffStrategy = FixedBackoff | LinearBackoff | ExponentialBackoff | JitterBackoff;
export interface FixedBackoff {
    type: 'fixed';
    delayMs: number;
}
export interface LinearBackoff {
    type: 'linear';
    initialDelayMs: number;
    incrementMs: number;
    maxDelayMs: number;
}
export interface ExponentialBackoff {
    type: 'exponential';
    initialDelayMs: number;
    multiplier: number;
    maxDelayMs: number;
}
export interface JitterBackoff {
    type: 'jitter';
    baseStrategy: Exclude<BackoffStrategy, JitterBackoff>;
    jitterFactor: number;
}
/**
 * Timeout policy configuration
 */
export interface TimeoutPolicy {
    /** Request timeout in ms */
    requestTimeout: number;
    /** Total timeout for all retries in ms */
    totalTimeout?: number;
    /** Stream chunk timeout in ms */
    streamTimeout?: number;
}
/**
 * Calculate backoff delay
 */
export declare function calculateBackoff(strategy: BackoffStrategy, attempt: number): number;
/**
 * Check if error should trigger retry
 */
export declare function shouldRetry(error: BaseError, policy: RetryPolicy, attempt: number): boolean;
/**
 * Sleep for specified milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=base-error.d.ts.map