/**
 * Retry Executor - Execute operations with retry support
 */

import type {
  RetryPolicy,
  TimeoutPolicy,
  RetryEvent,
  TimeoutEvent,
} from '../types/error';
import {
  PlatformError,
  calculateBackoff,
  shouldRetry,
  sleep,
} from './platform-error';

/**
 * Retry executor options
 */
export interface RetryExecutorOptions {
  retryPolicy: RetryPolicy;
  timeoutPolicy?: TimeoutPolicy;
  onRetry?: (event: RetryEvent) => void;
  onTimeout?: (event: TimeoutEvent) => void;
}

/**
 * Execute operation with retry and timeout support
 */
export async function executeWithRetry<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  options: RetryExecutorOptions
): Promise<T> {
  const { retryPolicy, timeoutPolicy, onRetry, onTimeout } = options;
  const startTime = Date.now();
  let lastError: PlatformError | null = null;

  for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
    try {
      // Check total timeout
      if (timeoutPolicy?.totalTimeout) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeoutPolicy.totalTimeout) {
          onTimeout?.({
            type: 'total',
            timeoutMs: timeoutPolicy.totalTimeout,
            elapsedMs: elapsed,
            timestamp: Date.now(),
          });
          throw new PlatformError({
            category: 'timeout',
            code: 'TOTAL_TIMEOUT',
            message: 'Total timeout exceeded',
            retryable: false,
          });
        }
      }

      // Execute with request timeout
      const result = await executeWithTimeout(
        operation,
        timeoutPolicy?.requestTimeout,
        onTimeout
      );
      return result;
    } catch (error) {
      lastError = PlatformError.fromError(error as Error);

      // Check if we should retry
      if (!shouldRetry(lastError, retryPolicy, attempt)) {
        throw lastError;
      }

      // Calculate delay
      let delay = calculateBackoff(retryPolicy.backoffStrategy, attempt);

      // Use retry-after if provided
      if (lastError.retryAfter) {
        delay = Math.max(delay, lastError.retryAfter);
      }

      // Emit retry event
      onRetry?.({
        attempt: attempt + 1,
        error: lastError,
        delayMs: delay,
        timestamp: Date.now(),
      });

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError || new PlatformError({
    category: 'unknown',
    code: 'RETRY_EXHAUSTED',
    message: 'All retry attempts exhausted',
    retryable: false,
  });
}

/**
 * Execute operation with timeout
 */
async function executeWithTimeout<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  timeoutMs?: number,
  onTimeout?: (event: TimeoutEvent) => void
): Promise<T> {
  if (!timeoutMs) {
    return operation();
  }

  const controller = new AbortController();
  const startTime = Date.now();

  const timeoutId = setTimeout(() => {
    onTimeout?.({
      type: 'request',
      timeoutMs,
      elapsedMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
    controller.abort();
  }, timeoutMs);

  try {
    const result = await operation(controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Stream timeout wrapper
 */
export async function* withStreamTimeout<T>(
  stream: AsyncIterable<T>,
  timeoutMs: number,
  onTimeout?: (event: TimeoutEvent) => void
): AsyncIterable<T> {
  const startTime = Date.now();
  let lastChunkTime = Date.now();

  for await (const chunk of stream) {
    const now = Date.now();
    const sinceLastChunk = now - lastChunkTime;

    if (sinceLastChunk > timeoutMs) {
      onTimeout?.({
        type: 'stream',
        timeoutMs,
        elapsedMs: now - startTime,
        timestamp: now,
      });
      throw new PlatformError({
        category: 'timeout',
        code: 'STREAM_TIMEOUT',
        message: `No data received for ${timeoutMs}ms`,
        retryable: true,
      });
    }

    lastChunkTime = now;
    yield chunk;
  }
}
