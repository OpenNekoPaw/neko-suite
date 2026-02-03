/**
 * Execution Monitor - Track and aggregate execution metrics
 */

import type { AgentStep, AgentResult } from '@neko/shared';

// =============================================================================
// Event Types (simplified for agent package)
// =============================================================================

/**
 * Error info for retry events
 */
export interface ErrorInfo {
  /** Error category */
  category: string;
  /** Error message */
  message: string;
  /** Whether the error is retryable */
  retryable?: boolean;
}

/**
 * Retry event for monitoring
 */
export interface RetryEvent {
  /** Attempt number (1-based) */
  attempt: number;
  /** Error that triggered retry */
  error: ErrorInfo;
  /** Delay before next retry */
  delayMs: number;
  /** Operation being retried */
  operation?: string;
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
  /** Operation that timed out */
  operation?: string;
}

// =============================================================================
// Execution Statistics
// =============================================================================

/**
 * Execution statistics
 */
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalRetries: number;
  totalTimeouts: number;
  averageDuration: number;
  averageIterations: number;
}

// =============================================================================
// Execution Events
// =============================================================================

/**
 * Execution event
 */
export type ExecutionEvent =
  | { type: 'execution_start'; agentName: string; timestamp: number }
  | { type: 'execution_end'; agentName: string; result: AgentResult; timestamp: number }
  | { type: 'step'; agentName: string; step: AgentStep; timestamp: number }
  | { type: 'retry'; event: RetryEvent; timestamp: number }
  | { type: 'timeout'; event: TimeoutEvent; timestamp: number };

/**
 * Execution monitor listener
 */
export type ExecutionMonitorListener = (event: ExecutionEvent) => void;

// =============================================================================
// Execution Monitor
// =============================================================================

/**
 * Execution monitor for tracking agent executions
 */
export class ExecutionMonitor {
  private events: ExecutionEvent[] = [];
  private listeners: Set<ExecutionMonitorListener> = new Set();
  private maxEvents: number;

  constructor(maxEvents: number = 1000) {
    this.maxEvents = maxEvents;
  }

  /**
   * Record execution start
   */
  recordExecutionStart(agentName: string): void {
    this.recordEvent({
      type: 'execution_start',
      agentName,
      timestamp: Date.now(),
    });
  }

  /**
   * Record execution end
   */
  recordExecutionEnd(agentName: string, result: AgentResult): void {
    this.recordEvent({
      type: 'execution_end',
      agentName,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Record step
   */
  recordStep(agentName: string, step: AgentStep): void {
    this.recordEvent({
      type: 'step',
      agentName,
      step,
      timestamp: Date.now(),
    });
  }

  /**
   * Record retry event
   */
  recordRetry(event: RetryEvent): void {
    this.recordEvent({
      type: 'retry',
      event,
      timestamp: Date.now(),
    });
  }

  /**
   * Record timeout event
   */
  recordTimeout(event: TimeoutEvent): void {
    this.recordEvent({
      type: 'timeout',
      event,
      timestamp: Date.now(),
    });
  }

  /**
   * Get execution statistics
   */
  getStats(): ExecutionStats {
    const executions = this.events.filter((e) => e.type === 'execution_end') as Array<{
      type: 'execution_end';
      result: AgentResult;
    }>;

    const successful = executions.filter((e) => e.result.success);
    const failed = executions.filter((e) => !e.result.success);
    const retries = this.events.filter((e) => e.type === 'retry');
    const timeouts = this.events.filter((e) => e.type === 'timeout');

    const totalDuration = executions.reduce(
      (sum, e) => sum + e.result.timing.duration,
      0
    );
    const totalIterations = executions.reduce(
      (sum, e) => sum + e.result.iterations,
      0
    );

    return {
      totalExecutions: executions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      totalRetries: retries.length,
      totalTimeouts: timeouts.length,
      averageDuration: executions.length > 0 ? totalDuration / executions.length : 0,
      averageIterations: executions.length > 0 ? totalIterations / executions.length : 0,
    };
  }

  /**
   * Get recent events
   */
  getEvents(limit?: number): ExecutionEvent[] {
    const events = [...this.events].reverse();
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Subscribe to events
   */
  subscribe(listener: ExecutionMonitorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }

  private recordEvent(event: ExecutionEvent): void {
    this.events.push(event);

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Create an execution monitor
 */
export function createExecutionMonitor(maxEvents?: number): ExecutionMonitor {
  return new ExecutionMonitor(maxEvents);
}
