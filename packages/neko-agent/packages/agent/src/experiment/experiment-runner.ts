/**
 * Experiment Runner — Orchestrates ablation experiment execution
 *
 * Responsibility: Execute the same task across multiple variants,
 * collect per-variant metrics, and produce a structured ExperimentResult.
 */

import type { AgentEvent } from '../session/types';
import type {
  EvaluationResult,
  ExperimentConfig,
  ExperimentIsolationMode,
  ExperimentMetrics,
  ExperimentOutputFile,
  ExperimentProgressEvent,
  ExperimentResult,
  ExperimentRunDescriptor,
  ExperimentRunIsolation,
  TokenMetrics,
  VariantResult,
  VariantRunResult,
} from './types';
import { applyAblationToggles } from './apply-toggles';
import { MetricsHooks } from './metrics-hooks';
import { buildComparison, formatComparisonMarkdown } from './comparison';

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

        const descriptor = this._createRunDescriptor(variant.name, rep);
        const isolation = createRunIsolation(descriptor);
        let metricsHooks: MetricsHooks | undefined;
        let session: IExperimentSession | undefined;

        try {
          // 1. Apply toggles
          const sessionConfig = applyAblationToggles(
            this._config.baseSessionConfig,
            variant.toggles,
          );

          // 2. Create MetricsHooks (prepend to hooks)
          metricsHooks = new MetricsHooks();
          sessionConfig.hooks = [metricsHooks, ...(sessionConfig.hooks ?? [])];

          // 3. Create session
          session = this._sessionFactory.create(sessionConfig);

          // 4. Execute with timeout
          const agentResult = await this._executeWithTimeout(session, metricsHooks, isolation);
          const evaluation = await this._evaluateRun(agentResult, descriptor);
          const metrics = withEvaluation(metricsHooks.getMetrics(), evaluation);

          // 5. Collect
          const runResult: VariantRunResult = {
            variantName: variant.name,
            repetitionIndex: rep,
            success: evaluation?.passed ?? agentResult.success,
            agentResult,
            metrics,
            toggles: variant.toggles,
          };
          runs.push(runResult);

          yield {
            type: 'variant_complete',
            variant: variant.name,
            repetition: rep,
            metrics: runResult.metrics,
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const metrics = withEvaluation(metricsHooks?.getMetrics() ?? createEmptyMetrics());
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
            metrics,
            toggles: variant.toggles,
            error: errorMsg,
          });

          yield {
            type: 'variant_error',
            variant: variant.name,
            repetition: rep,
            error: errorMsg,
          };
        } finally {
          session?.dispose();
        }
      }

      allRunResults.set(variant.name, runs);
    }

    // Build final result
    const result = await this._buildResult(allRunResults);
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
    if (!finalResult) {
      throw new Error('Experiment completed without a final result');
    }
    return finalResult;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async _executeWithTimeout(
    session: IExperimentSession,
    _metricsHooks: MetricsHooks,
    isolation: ExperimentRunIsolation,
  ): Promise<import('@neko/shared').AgentResult> {
    const timeoutMs = this._config.variantTimeoutMs;

    const executePromise = (async () => {
      let lastEvent: AgentEvent | undefined;
      for await (const event of session.execute(
        this._config.taskPrompt,
        this._createTaskContext(isolation),
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

  private async _buildResult(
    allRunResults: Map<string, VariantRunResult[]>,
  ): Promise<ExperimentResult> {
    const variants: VariantResult[] = this._config.variants.map((variant) => {
      const runs = allRunResults.get(variant.name) ?? [];
      return {
        variant,
        runs,
        averageMetrics: averageMetrics(runs.map((r) => r.metrics)),
      };
    });

    const result: ExperimentResult = {
      name: this._config.name,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      taskPrompt: this._config.taskPrompt,
      variants,
      comparison: buildComparison(variants),
    };

    const outputFiles = await this._writeOutputs(result);
    return outputFiles.length > 0 ? { ...result, outputFiles } : result;
  }

  private async _writeOutputs(result: ExperimentResult): Promise<ExperimentOutputFile[]> {
    if (!this._config.outputDir || !this._config.outputWriter) {
      return [];
    }

    const baseDir = joinPath(this._config.outputDir, sanitizePathSegment(this._config.name));
    const jsonPath = joinPath(baseDir, 'result.json');
    const markdownPath = joinPath(baseDir, 'comparison.md');

    await this._config.outputWriter.writeTextFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    await this._config.outputWriter.writeTextFile(
      markdownPath,
      `${formatComparisonMarkdown(result.comparison)}\n`,
    );

    return [
      { kind: 'json', path: jsonPath },
      { kind: 'markdown', path: markdownPath },
    ];
  }

  private _createRunDescriptor(
    variantName: string,
    repetitionIndex: number,
  ): ExperimentRunDescriptor {
    const isolationMode = resolveIsolationMode(this._config);
    return {
      experimentName: this._config.name,
      variantName,
      repetitionIndex,
      isolationMode,
      ...(this._config.outputDir && {
        outputDir: joinPath(
          this._config.outputDir,
          sanitizePathSegment(this._config.name),
          sanitizePathSegment(variantName),
          `run-${repetitionIndex}`,
        ),
      }),
    };
  }

  private _createTaskContext(
    isolation: ExperimentRunIsolation,
  ): import('../session/types').ExecutionContext | undefined {
    const baseContext = this._config.taskContext;
    if (!baseContext && Object.keys(isolation.contextMetadata).length === 0) {
      return undefined;
    }

    return {
      ...baseContext,
      ...(isolation.outputDir && resolveIsolationMode(this._config) === 'workspace-root'
        ? { workspaceRoot: isolation.outputDir }
        : {}),
      metadata: {
        ...(baseContext?.metadata ?? {}),
        ...isolation.contextMetadata,
      },
    };
  }

  private async _evaluateRun(
    agentResult: import('@neko/shared').AgentResult,
    descriptor: ExperimentRunDescriptor,
  ): Promise<EvaluationResult | undefined> {
    if (!this._config.evaluator) {
      return undefined;
    }
    return this._config.evaluator.evaluate(agentResult, descriptor);
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

function resolveIsolationMode(config: ExperimentConfig): ExperimentIsolationMode {
  return config.isolation ?? (config.outputDir ? 'metadata-only' : 'none');
}

function createRunIsolation(descriptor: ExperimentRunDescriptor): ExperimentRunIsolation {
  if (descriptor.isolationMode === 'none' || !descriptor.outputDir) {
    return { contextMetadata: {} };
  }

  return {
    outputDir: descriptor.outputDir,
    contextMetadata: {
      experiment: {
        name: descriptor.experimentName,
        variant: descriptor.variantName,
        repetition: descriptor.repetitionIndex,
        outputDir: descriptor.outputDir,
        isolationMode: descriptor.isolationMode,
      },
    },
  };
}

function withEvaluation(
  metrics: ExperimentMetrics,
  evaluation?: EvaluationResult,
): ExperimentMetrics {
  if (!evaluation) {
    return metrics;
  }

  return {
    ...metrics,
    custom: {
      ...metrics.custom,
      evaluation,
    },
  };
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || 'unnamed';
}

function joinPath(...segments: string[]): string {
  return segments
    .filter((segment) => segment.length > 0)
    .map((segment, index) => {
      if (index === 0) return segment.replace(/\/+$/g, '');
      return segment.replace(/^\/+|\/+$/g, '');
    })
    .filter((segment) => segment.length > 0)
    .join('/');
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
