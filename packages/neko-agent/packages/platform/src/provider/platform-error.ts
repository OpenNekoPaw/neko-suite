/**
 * Platform Error - Error classification and handling
 */

import type {
  ErrorCategory,
  PlatformErrorInfo,
  RetryPolicy,
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

