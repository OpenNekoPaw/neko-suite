/**
 * Experiment Runner — Orchestrates ablation experiment execution
 *
 * Responsibility: Execute the same task across multiple variants,
 * collect per-variant metrics, and produce a structured ExperimentResult.
 */

import type { AgentEvent } from '../session/types';
import type {
  ExperimentConfig,
  ExperimentMetrics,
  ExperimentProgressEvent,
  ExperimentResult,
  TokenMetrics,
  VariantResult,
  VariantRunResult,
} from './types';
import { applyAblationToggles } from './apply-toggles';
import { MetricsHooks } from './metrics-hooks';
import { buildComparison } from './comparison';

// =============================================================================
// Types
// =============================================================================

/**
 * Factory for creating agent sessions.
 * Decoupled from AgentSession to allow testing with mocks.
 */
export interface ISessionFactory {
  create(config: import('../session/types').AgentSessionConfig): IExperimentSession;
}

/**
 * Minimal session interface required by the runner.
 * Matches AgentSession's public API.
 */
export interface IExperimentSession {
  execute(
    input: string,
    context?: import('../session/types').ExecutionContext,
  ): AsyncIterable<AgentEvent>;
  dispose(): void;
}

// =============================================================================
// Runner
// =============================================================================

export class ExperimentRunner {
  private _config: ExperimentConfig;
  private _sessionFactory: ISessionFactory;

  constructor(config: ExperimentConfig, sessionFactory: ISessionFactory) {
    this._config = config;
    this._sessionFactory = sessionFactory;
  }

  /**
   * Run all variants, yielding progress events for live monitoring.
   */
  async *run(): AsyncIterable<ExperimentProgressEvent> {
    const allRunResults: Map<string, VariantRunResult[]> = new Map();

    for (const variant of this._config.variants) {
      const repetitions = variant.repetitions ?? 1;
      const runs: VariantRunResult[] = [];

      for (let rep = 0; rep < repetitions; rep++) {
        yield { type: 'variant_start', variant: variant.name, repetition: rep };

        try {
          // 1. Apply toggles
          const sessionConfig = applyAblationToggles(
            this._config.baseSessionConfig,
            variant.toggles,
          );

          // 2. Create MetricsHooks (prepend to hooks)
          const metricsHooks = new MetricsHooks();
          sessionConfig.hooks = [metricsHooks, ...(sessionConfig.hooks ?? [])];

          // 3. Create session
          const session = this._sessionFactory.create(sessionConfig);

          // 4. Execute with timeout
          const agentResult = await this._executeWithTimeout(session, metricsHooks);

          // 5. Collect
          const runResult: VariantRunResult = {
            variantName: variant.name,
            repetitionIndex: rep,
            success: agentResult.success,
            agentResult,
            metrics: metricsHooks.getMetrics(),
            toggles: variant.toggles,
          };
          runs.push(runResult);

          yield {
            type: 'variant_complete',
            variant: variant.name,
            repetition: rep,
            metrics: runResult.metrics,
          };

          session.dispose();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          runs.push({
            variantName: variant.name,
            repetitionIndex: rep,
            success: false,
            agentResult: {
              success: false,
              response: '',
              steps: [],
              iterations: 0,
              error: error instanceof Error ? error : new Error(errorMsg),
              timing: { startTime: 0, endTime: 0, duration: 0 },
            },
            metrics: createEmptyMetrics(),
            toggles: variant.toggles,
            error: errorMsg,
          });

          yield {
            type: 'variant_error',
            variant: variant.name,
            repetition: rep,
            error: errorMsg,
          };
        }
      }

      allRunResults.set(variant.name, runs);
    }

    // Build final result
    const result = this._buildResult(allRunResults);
    yield { type: 'experiment_complete', result };
  }

  /**
   * Run all variants and return final aggregated result.
   */
  async runAll(): Promise<ExperimentResult> {
    let finalResult: ExperimentResult | undefined;
    for await (const event of this.run()) {
      if (event.type === 'experiment_complete') {
        finalResult = event.result;
      }
    }
    return finalResult!;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _executeWithTimeout(
    session: IExperimentSession,
    _metricsHooks: MetricsHooks,
  ): Promise<import('@neko/shared').AgentResult> {
    const timeoutMs = this._config.variantTimeoutMs;

    const executePromise = (async () => {
      let lastEvent: AgentEvent | undefined;
      for await (const event of session.execute(
        this._config.taskPrompt,
        this._config.taskContext,
      )) {
        lastEvent = event;
      }
      // Extract result from last 'done' event or construct from metrics
      if (lastEvent?.type === 'done') {
        return {
          success: true,
          response: lastEvent.content ?? '',
          steps: [],
          iterations: lastEvent.iteration?.current ?? 0,
          timing: {
            startTime: 0,
            endTime: 0,
            duration: _metricsHooks.getMetrics().totalLatencyMs,
          },
          usage: lastEvent.usage
            ? {
                promptTokens: lastEvent.usage.inputTokens,
                completionTokens: lastEvent.usage.outputTokens,
                totalTokens: lastEvent.usage.totalTokens,
              }
            : undefined,
        } satisfies import('@neko/shared').AgentResult;
      }
      if (lastEvent?.type === 'error') {
        return {
          success: false,
          response: '',
          steps: [],
          iterations: 0,
          error: lastEvent.error,
          timing: {
            startTime: 0,
            endTime: 0,
            duration: _metricsHooks.getMetrics().totalLatencyMs,
          },
        } satisfies import('@neko/shared').AgentResult;
      }
      return {
        success: true,
        response: '',
        steps: [],
        iterations: 0,
        timing: { startTime: 0, endTime: 0, duration: 0 },
      } satisfies import('@neko/shared').AgentResult;
    })();

    if (!timeoutMs) {
      return executePromise;
    }

    return Promise.race([
      executePromise,
      new Promise<import('@neko/shared').AgentResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Variant timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  private _buildResult(allRunResults: Map<string, VariantRunResult[]>): ExperimentResult {
    const variants: VariantResult[] = this._config.variants.map((variant) => {
      const runs = allRunResults.get(variant.name) ?? [];
      return {
        variant,
        runs,
        averageMetrics: averageMetrics(runs.map((r) => r.metrics)),
      };
    });

    return {
      name: this._config.name,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      taskPrompt: this._config.taskPrompt,
      variants,
      comparison: buildComparison(variants),
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function createEmptyMetrics(): ExperimentMetrics {
  return {
    totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    turns: [],
    iterations: 0,
    totalLatencyMs: 0,
    toolSummary: { totalCalls: 0, successCount: 0, failureCount: 0, byTool: {} },
    custom: {},
  };
}

function averageMetrics(metricsList: ExperimentMetrics[]): ExperimentMetrics {
  if (metricsList.length === 0) return createEmptyMetrics();

  const count = metricsList.length;
  const sum = (fn: (m: ExperimentMetrics) => number): number =>
    metricsList.reduce((s, m) => s + fn(m), 0) / count;

  const avgTokens: TokenMetrics = {
    promptTokens: Math.round(sum((m) => m.totalTokens.promptTokens)),
    completionTokens: Math.round(sum((m) => m.totalTokens.completionTokens)),
    totalTokens: Math.round(sum((m) => m.totalTokens.totalTokens)),
  };

  const totalToolCalls = Math.round(sum((m) => m.toolSummary.totalCalls));
  const totalSuccesses = Math.round(sum((m) => m.toolSummary.successCount));
  const totalFailures = Math.round(sum((m) => m.toolSummary.failureCount));

  return {
    totalTokens: avgTokens,
    turns: [], // Turns are per-run, not averaged
    iterations: Math.round(sum((m) => m.iterations) * 10) / 10,
    totalLatencyMs: Math.round(sum((m) => m.totalLatencyMs)),
    toolSummary: {
      totalCalls: totalToolCalls,
      successCount: totalSuccesses,
      failureCount: totalFailures,
      byTool: {}, // Per-tool averages not aggregated (complex and rarely needed)
    },
    custom: {},
  };
}
