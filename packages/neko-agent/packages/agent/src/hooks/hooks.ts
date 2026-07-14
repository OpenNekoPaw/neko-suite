/**
 * Agent Executor Hooks - Extensible hook system for agent execution
 *
 * Hooks allow extending agent behavior without modifying the core execution loop.
 * Following the Open/Closed principle from SOLID.
 */

import type {
  AgentContext,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
  ToolResult,
  IConversationCompressor,
} from '@neko/shared';
import {
  type RetryPolicy,
  type BackoffStrategy,
  calculateBackoff,
  shouldRetry,
  BaseError,
} from '@neko/shared';

/**
 * Retry hooks options
 */
export interface RetryHooksOptions {
  /** Tool retry policy */
  toolRetryPolicy?: RetryPolicy;
  /** Callback on retry */
  onRetry?: (error: BaseError, attempt: number) => void;
}

/**
 * Retry hooks - adds retry capabilities for transient tool failures
 */
export class RetryHooks implements ExecutorHooks {
  name = 'retry';
  private toolRetryPolicy: RetryPolicy;
  private onRetryCallback?: (error: BaseError, attempt: number) => void;

  constructor(options: RetryHooksOptions = {}) {
    const defaultBackoff: BackoffStrategy = {
      type: 'exponential',
      initialDelayMs: 1000,
      multiplier: 2,
      maxDelayMs: 10000,
    };
    this.toolRetryPolicy = options.toolRetryPolicy || {
      maxRetries: 3,
      backoffStrategy: defaultBackoff,
      retryableCategories: ['timeout', 'rate_limit', 'server', 'network'],
    };
    this.onRetryCallback = options.onRetry;
  }

  async onToolCall(
    info: ToolCallInfo,
    execute: () => Promise<ToolResult>,
  ): Promise<ToolResultWithMeta> {
    let lastError: BaseError | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.toolRetryPolicy.maxRetries; attempt++) {
      try {
        const result = await execute();
        return {
          ...result,
          callId: info.id,
          name: info.name,
          retryCount,
        };
      } catch (error) {
        lastError = BaseError.fromError(error as Error);
        retryCount = attempt + 1;

        if (!shouldRetry(lastError, this.toolRetryPolicy, attempt)) {
          break;
        }

        this.onRetryCallback?.(lastError, attempt + 1);

        const delay = calculateBackoff(this.toolRetryPolicy.backoffStrategy, attempt);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Tool execution failed',
      callId: info.id,
      name: info.name,
      retryCount,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Memory hooks options
 */
export interface MemoryHooksOptions {
  /** Conversation compressor for turn-aware token management */
  compressor?: IConversationCompressor;
}

/**
 * Memory hooks - adds context compression
 */
export class MemoryHooks implements ExecutorHooks {
  name = 'memory';
  private compressor?: IConversationCompressor;

  constructor(options: MemoryHooksOptions = {}) {
    this.compressor = options.compressor;
  }

  async beforeThink(context: AgentContext): Promise<AgentContext> {
    // Apply context compression via ConversationCompressor
    if (this.compressor) {
      const result = await this.compressor.compress(context.messages);
      context.messages = result.messages.map((m) => m.message);
    }
    return context;
  }

  /**
   * Get compressor
   */
  getCompressor(): IConversationCompressor | undefined {
    return this.compressor;
  }
}

/**
 * Compose multiple hooks into one array
 */
export function composeHooks(...hooks: ExecutorHooks[]): ExecutorHooks[] {
  return hooks.filter(Boolean);
}

/**
 * Create retry hooks with default options
 */
export function createRetryHooks(options?: RetryHooksOptions): RetryHooks {
  return new RetryHooks(options);
}

/**
 * Create memory hooks with default options
 */
export function createMemoryHooks(options?: MemoryHooksOptions): MemoryHooks {
  return new MemoryHooks(options);
}
