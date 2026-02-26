/**
 * Agent Executor Hooks - Extensible hook system for agent execution
 *
 * Hooks allow extending agent behavior without modifying the core execution loop.
 * Following the Open/Closed principle from SOLID.
 */

import type {
  AgentContext,
  AgentResult,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
  ToolResult,
  SessionMemory,
  ContextManager,
  ChatMessage,
} from '@neko/shared';
import {
  type RetryPolicy,
  type BackoffStrategy,
  calculateBackoff,
  shouldRetry,
  BaseError,
} from '@neko/shared';
import { AgentError } from '../errors';

/**
 * Retry hooks options
 */
export interface RetryHooksOptions {
  /** Tool retry policy */
  toolRetryPolicy?: RetryPolicy;
  /** Model fallback configuration */
  modelFallback?: {
    enabled: boolean;
    fallbackModels: string[];
    maxFallbacks: number;
  };
  /** Callback on retry */
  onRetry?: (error: BaseError, attempt: number) => void;
  /** Callback on model switch */
  onModelSwitch?: (from: string, to: string, reason: string) => void;
}

/**
 * Retry hooks - adds retry and model fallback capabilities
 */
export class RetryHooks implements ExecutorHooks {
  name = 'retry';
  private toolRetryPolicy: RetryPolicy;
  private modelFallback: {
    enabled: boolean;
    fallbackModels: string[];
    maxFallbacks: number;
  };
  private onRetryCallback?: (error: BaseError, attempt: number) => void;
  private onModelSwitchCallback?: (from: string, to: string, reason: string) => void;
  private currentModel?: string;
  private fallbackCount = 0;

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
    this.modelFallback = options.modelFallback || {
      enabled: false,
      fallbackModels: [],
      maxFallbacks: 2,
    };
    this.onRetryCallback = options.onRetry;
    this.onModelSwitchCallback = options.onModelSwitch;
  }

  async onToolCall(
    info: ToolCallInfo,
    execute: () => Promise<ToolResult>
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

  /**
   * Get current model (for multi-model support)
   */
  getCurrentModel(): string | undefined {
    return this.currentModel;
  }

  /**
   * Set current model
   */
  setCurrentModel(model: string): void {
    this.currentModel = model;
  }

  /**
   * Try fallback to next model
   */
  tryFallback(error: BaseError): string | null {
    if (!this.modelFallback.enabled) return null;
    if (this.fallbackCount >= this.modelFallback.maxFallbacks) return null;

    const nextModel = this.modelFallback.fallbackModels[this.fallbackCount];
    if (!nextModel) return null;

    this.fallbackCount++;
    const previousModel = this.currentModel || 'default';
    this.currentModel = nextModel;
    this.onModelSwitchCallback?.(previousModel, nextModel, error.message);

    return nextModel;
  }

  /**
   * Reset fallback state
   */
  resetFallback(): void {
    this.fallbackCount = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Memory hooks options
 */
export interface MemoryHooksOptions {
  /** Session memory for cross-session persistence */
  sessionMemory?: SessionMemory;
  /** Context manager for token management */
  contextManager?: ContextManager;
}

/**
 * Memory hooks - adds context compression and session memory
 */
export class MemoryHooks implements ExecutorHooks {
  name = 'memory';
  private sessionMemory?: SessionMemory;
  private contextManager?: ContextManager;
  private userInput?: string;
  private historyLoaded = false;

  constructor(options: MemoryHooksOptions = {}) {
    this.sessionMemory = options.sessionMemory;
    this.contextManager = options.contextManager;
  }

  async onExecuteStart(input: string, context: AgentContext): Promise<void> {
    this.userInput = input;
    this.historyLoaded = false;

    // Load session memory if available
    if (this.sessionMemory) {
      const hasOnlySystemPrompt = context.messages.length <= 2 &&
        context.messages.every((m) => m.role === 'system' || m.role === 'user');
      const userMsgCount = context.messages.filter((m) => m.role === 'user').length;

      // Only load history if there's at most one user message (the current one)
      if (hasOnlySystemPrompt && userMsgCount <= 1) {
        const history = await this.sessionMemory.getHistory();
        if (history.length > 0) {
          this.historyLoaded = true;
          const systemMsg = context.messages.find((m) => m.role === 'system');
          const userMsg = context.messages.find((m) => m.role === 'user');
          context.messages.length = 0;
          if (systemMsg) context.messages.push(systemMsg);
          context.messages.push(...history);
          if (userMsg) context.messages.push(userMsg);
        }
      }
    }
  }

  async beforeThink(context: AgentContext): Promise<AgentContext> {
    // Apply context compression if manager available
    if (this.contextManager) {
      context.messages = await this.contextManager.compress(context.messages);
    }
    return context;
  }

  async onExecuteEnd(result: AgentResult): Promise<void> {
    // Save to session memory (only successful responses)
    if (this.sessionMemory && this.userInput && result.success) {
      await this.sessionMemory.addMessage({ role: 'user', content: this.userInput });
      await this.sessionMemory.addMessage({ role: 'assistant', content: result.response });
    }
  }

  /**
   * Get session memory
   */
  getSessionMemory(): SessionMemory | undefined {
    return this.sessionMemory;
  }

  /**
   * Get context manager
   */
  getContextManager(): ContextManager | undefined {
    return this.contextManager;
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
