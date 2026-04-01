/**
 * Metrics Hooks — Observes agent execution lifecycle to collect experiment metrics
 *
 * Responsibility: Implement ExecutorHooks as a passive observer (first in the chain).
 * Does NOT intercept or modify any execution — only records timing, tokens, tool calls.
 */

import type {
  AgentContext,
  AgentResult,
  AgentStep,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
} from '@neko/shared';
import type { ExperimentMetrics, TokenMetrics, TurnMetrics, ToolCallMetric } from './types';

// =============================================================================
// MetricsHooks
// =============================================================================

/**
 * Passive observer hook that collects experiment metrics.
 * Must be inserted as the FIRST hook in the chain to observe all events.
 *
 * - onToolCall returns null (does not intercept execution)
 * - beforeThink returns context unchanged (pass-through)
 * - All other hooks record timing and counts only
 */
export class MetricsHooks implements ExecutorHooks {
  readonly name = 'experiment-metrics';

  private _startTime = 0;
  private _turnStartTime = 0;
  private _turnIndex = 0;
  private _actStartTimes = new Map<string, number>();

  private _turns: TurnMetrics[] = [];
  private _currentTurnToolCalls: ToolCallMetric[] = [];
  private _totalTokens: TokenMetrics = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private _iterations = 0;
  private _totalLatencyMs = 0;

  // Tool summary accumulators
  private _toolTotalCalls = 0;
  private _toolSuccessCount = 0;
  private _toolFailureCount = 0;
  private _toolByName: Record<string, { calls: number; successes: number; failures: number }> = {};

  // ---------------------------------------------------------------------------
  // ExecutorHooks implementation
  // ---------------------------------------------------------------------------

  async onExecuteStart(_input: string, _context: AgentContext): Promise<void> {
    this._startTime = Date.now();
    this._turnIndex = 0;
  }

  async beforeThink(_context: AgentContext): Promise<AgentContext | void> {
    // Record turn start time, pass through without modification
    this._turnStartTime = Date.now();
    this._currentTurnToolCalls = [];
    return undefined;
  }

  async afterThink(step: AgentStep, _context: AgentContext): Promise<void> {
    // Extract token usage from step
    if (step.usage) {
      this._totalTokens.promptTokens += step.usage.promptTokens ?? 0;
      this._totalTokens.completionTokens += step.usage.completionTokens ?? 0;
      this._totalTokens.totalTokens += step.usage.totalTokens ?? 0;
    }
  }

  async beforeAct(toolCalls: ToolCallInfo[]): Promise<void> {
    // Record start time for each tool call in the batch
    const now = Date.now();
    for (const call of toolCalls) {
      this._actStartTimes.set(call.id, now);
    }
  }

  async afterAct(results: ToolResultWithMeta[]): Promise<void> {
    const now = Date.now();

    for (const result of results) {
      const startTime = this._actStartTimes.get(result.callId) ?? now;
      const latencyMs = now - startTime;
      this._actStartTimes.delete(result.callId);

      const metric: ToolCallMetric = {
        name: result.name,
        success: result.success,
        latencyMs,
        retryCount: result.retryCount ?? 0,
        error: result.error,
      };

      this._currentTurnToolCalls.push(metric);

      // Update summary
      this._toolTotalCalls++;
      if (result.success) {
        this._toolSuccessCount++;
      } else {
        this._toolFailureCount++;
      }

      const byTool = this._toolByName[result.name] ?? { calls: 0, successes: 0, failures: 0 };
      byTool.calls++;
      if (result.success) {
        byTool.successes++;
      } else {
        byTool.failures++;
      }
      this._toolByName[result.name] = byTool;
    }
  }

  async onIterationComplete(_iteration: number, _context: AgentContext): Promise<void> {
    // Finalize the current turn
    const turnLatency = Date.now() - this._turnStartTime;

    // Compute per-turn token delta (approximate: use accumulated since last turn)
    const prevTurnTokens = this._turns.reduce((sum, t) => sum + t.tokenUsage.totalTokens, 0);
    const turnTokens: TokenMetrics = {
      promptTokens:
        this._totalTokens.promptTokens -
        this._turns.reduce((s, t) => s + t.tokenUsage.promptTokens, 0),
      completionTokens:
        this._totalTokens.completionTokens -
        this._turns.reduce((s, t) => s + t.tokenUsage.completionTokens, 0),
      totalTokens: this._totalTokens.totalTokens - prevTurnTokens,
    };

    this._turns.push({
      turnIndex: this._turnIndex,
      tokenUsage: turnTokens,
      toolCalls: [...this._currentTurnToolCalls],
      latencyMs: turnLatency,
    });

    this._turnIndex++;
    this._iterations++;
    this._currentTurnToolCalls = [];
  }

  async onExecuteEnd(_result: AgentResult): Promise<void> {
    this._totalLatencyMs = Date.now() - this._startTime;
  }

  async onError(_error: Error, _context: AgentContext): Promise<void> {
    // Ensure timing is recorded even on error
    this._totalLatencyMs = Date.now() - this._startTime;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Get collected metrics. Call after execution completes.
   */
  getMetrics(): ExperimentMetrics {
    return {
      totalTokens: { ...this._totalTokens },
      turns: [...this._turns],
      iterations: this._iterations,
      totalLatencyMs: this._totalLatencyMs,
      toolSummary: {
        totalCalls: this._toolTotalCalls,
        successCount: this._toolSuccessCount,
        failureCount: this._toolFailureCount,
        byTool: { ...this._toolByName },
      },
      custom: {},
    };
  }

  /**
   * Reset all metrics for reuse.
   */
  reset(): void {
    this._startTime = 0;
    this._turnStartTime = 0;
    this._turnIndex = 0;
    this._actStartTimes.clear();
    this._turns = [];
    this._currentTurnToolCalls = [];
    this._totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    this._iterations = 0;
    this._totalLatencyMs = 0;
    this._toolTotalCalls = 0;
    this._toolSuccessCount = 0;
    this._toolFailureCount = 0;
    this._toolByName = {};
  }
}
