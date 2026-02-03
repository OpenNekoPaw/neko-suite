/**
 * Error Types - Platform error handling
 */

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'server'
  | 'validation'
  | 'not_found'
  | 'context_length'
  | 'content_filter'
  | 'unknown';

/**
 * Platform error with classification
 */
export interface PlatformErrorInfo {
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
export type BackoffStrategy =
  | FixedBackoff
  | LinearBackoff
  | ExponentialBackoff
  | JitterBackoff;

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
  jitterFactor: number; // 0-1, percentage of delay to randomize
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
 * Retry event for monitoring
 */
export interface RetryEvent {
  /** Attempt number (1-based) */
  attempt: number;
  /** Error that triggered retry */
  error: PlatformErrorInfo;
  /** Delay before next retry */
  delayMs: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Timeout event for monitoring
 */
export interface TimeoutEvent {
  /** Timeout type */
  type: 'request' | 'total' | 'stream';
  /** Timeout value in ms */
  timeoutMs: number;
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Retry/timeout presets
 */
export interface RetryTimeoutPreset {
  /** Preset name */
  name: string;
  /** Retry policy */
  retry: RetryPolicy;
  /** Timeout policy */
  timeout: TimeoutPolicy;
}

/**
 * Built-in preset names
 */
export type BuiltinPresetName = 'modelCall' | 'toolExecution' | 'mcpRequest' | 'workflowExecution';
