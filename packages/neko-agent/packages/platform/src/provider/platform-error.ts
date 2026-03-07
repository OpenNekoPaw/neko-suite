/**
 * Platform Error - Error classification and handling
 */

import type {
  ErrorCategory,
  PlatformErrorInfo,
  RetryPolicy,
  TimeoutPolicy,
  BackoffStrategy,
  RetryEvent,
  TimeoutEvent,
} from '../types/error';
import { calculateBackoff, sleep } from '@neko/shared';

export { calculateBackoff, sleep };

/**
 * Platform error with classification
 */
export class PlatformError extends Error implements PlatformErrorInfo {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfter?: number;
  readonly cause?: Error;
  readonly context?: Record<string, unknown>;

  constructor(info: PlatformErrorInfo) {
    super(info.message);
    this.name = 'PlatformError';
    this.category = info.category;
    this.code = info.code;
    this.retryable = info.retryable;
    this.retryAfter = info.retryAfter;
    this.cause = info.cause;
    this.context = info.context;
  }

  /**
   * Create from HTTP response
   */
  static fromHttpResponse(
    status: number,
    body: string,
    context?: Record<string, unknown>
  ): PlatformError {
    const info = classifyHttpError(status, body);
    return new PlatformError({
      ...info,
      context,
    });
  }

  /**
   * Create from generic error
   */
  static fromError(error: Error, context?: Record<string, unknown>): PlatformError {
    if (error instanceof PlatformError) {
      return error;
    }

    const info = classifyError(error);
    return new PlatformError({
      ...info,
      cause: error,
      context,
    });
  }
}

/**
 * Classify HTTP error by status code
 */
function classifyHttpError(status: number, body: string): PlatformErrorInfo {
  // Rate limiting
  if (status === 429) {
    const retryAfter = parseRetryAfter(body);
    return {
      category: 'rate_limit',
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      retryable: true,
      retryAfter,
    };
  }

  // Authentication errors
  if (status === 401) {
    return {
      category: 'authentication',
      code: 'UNAUTHORIZED',
      message: 'Authentication failed',
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      category: 'authentication',
      code: 'FORBIDDEN',
      message: 'Access forbidden',
      retryable: false,
    };
  }

  // Not found
  if (status === 404) {
    return {
      category: 'not_found',
      code: 'NOT_FOUND',
      message: 'Resource not found',
      retryable: false,
    };
  }

  // Validation errors
  if (status === 400 || status === 422) {
    // Check for context length errors
    if (body.includes('context_length') || body.includes('token') || body.includes('too long')) {
      return {
        category: 'context_length',
        code: 'CONTEXT_LENGTH_EXCEEDED',
        message: 'Context length exceeded',
        retryable: false,
      };
    }

    return {
      category: 'validation',
      code: 'VALIDATION_ERROR',
      message: `Validation error: ${body.slice(0, 200)}`,
      retryable: false,
    };
  }

  // Content filter
  if (body.includes('content_filter') || body.includes('safety') || body.includes('blocked')) {
    return {
      category: 'content_filter',
      code: 'CONTENT_FILTERED',
      message: 'Content was filtered',
      retryable: false,
    };
  }

  // Server errors
  if (status >= 500) {
    return {
      category: 'server',
      code: 'SERVER_ERROR',
      message: `Server error: ${status}`,
      retryable: true,
    };
  }

  return {
    category: 'unknown',
    code: 'UNKNOWN_ERROR',
    message: `HTTP error: ${status}`,
    retryable: false,
  };
}

/**
 * Classify generic error
 */
function classifyError(error: Error): PlatformErrorInfo {
  const message = error.message.toLowerCase();

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out') || error.name === 'TimeoutError') {
    return {
      category: 'timeout',
      code: 'TIMEOUT',
      message: error.message,
      retryable: true,
    };
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('socket')
  ) {
    return {
      category: 'network',
      code: 'NETWORK_ERROR',
      message: error.message,
      retryable: true,
    };
  }

  // Abort errors
  if (error.name === 'AbortError') {
    return {
      category: 'timeout',
      code: 'ABORTED',
      message: 'Request was aborted',
      retryable: false,
    };
  }

  return {
    category: 'unknown',
    code: 'UNKNOWN_ERROR',
    message: error.message,
    retryable: false,
  };
}

/**
 * Parse retry-after from response body
 */
function parseRetryAfter(body: string): number | undefined {
  try {
    const data = JSON.parse(body);
    if (data.retry_after) {
      return typeof data.retry_after === 'number'
        ? data.retry_after * 1000
        : parseInt(data.retry_after) * 1000;
    }
  } catch {
    // Not JSON or no retry_after field
  }
  return undefined;
}

/**
 * Check if error should trigger retry
 */
export function shouldRetry(
  error: PlatformError,
  policy: RetryPolicy,
  attempt: number
): boolean {
  if (attempt >= policy.maxRetries) {
    return false;
  }

  if (!error.retryable) {
    return false;
  }

  return policy.retryableCategories.includes(error.category);
}

