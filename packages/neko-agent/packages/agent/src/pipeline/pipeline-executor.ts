/**
 * Pipeline Executor — Runs a stage chain with gate control, hook injection, and progress events
 *
 * Execution model:
 * - Iterates through stages sequentially
 * - Skips stages listed in config.skipStages
 * - Pauses at 'confirm' gates, waiting for confirmGate() or cancelGate()
 * - Runs hooks before/after each stage
 * - For parallel stages, delegates to stage.tasks() + Promise.allSettled
 * - Emits PipelineEvent for each lifecycle point
 */

import { getLogger } from '../utils/logger';
import type {
  IPipelineStage,
  IParallelStage,
  PipelineConfig,
  PipelineContext,
  PipelineEvent,
  PipelineHandle,
  IPipelineExecutor,
  StageHookConfig,
} from './types';
import type { PipelineHookRegistry } from './hook-registry';

const logger = getLogger('PipelineExecutor');

let nextPipelineId = 1;

/**
 * Pipeline executor implementation
 */
export class PipelineExecutor implements IPipelineExecutor {
  constructor(private readonly hookRegistry?: PipelineHookRegistry) {}

  execute(
    stages: IPipelineStage[],
    config: PipelineConfig,
    initialCtx: PipelineContext,
  ): PipelineHandle {
    const id = `pipeline-${nextPipelineId++}-${Date.now()}`;
    const skipSet = new Set(config.skipStages ?? []);
    const hooks = config.hooks ?? [];
    const userCheckpointSet = new Set(config.userCheckpoints ?? []);

    // Gate control channel
    type GateResult = { confirmed: boolean; modifications?: Partial<PipelineContext> };
    let gateResolve: ((value: GateResult) => void) | null = null;
    let cancelled = false;

    // Event queue (push from executor, pull from consumer)
    const eventQueue: PipelineEvent[] = [];
    let eventNotify: (() => void) | null = null;
    let pipelineDone = false;

    function emit(event: PipelineEvent): void {
      eventQueue.push(event);
      if (eventNotify) {
        const notify = eventNotify;
        eventNotify = null;
        notify();
      }
    }

    function signalDone(): void {
      pipelineDone = true;
      if (eventNotify) {
        const notify = eventNotify;
        eventNotify = null;
        notify();
      }
    }

    // Async iterable for events
    const events: AsyncIterable<PipelineEvent> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<PipelineEvent>> {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            while (true) {
              // Drain queue first
              const event = eventQueue.shift();
              if (event) {
                return { value: event, done: false };
              }
              // If pipeline is done and queue is empty, signal iterator done
              if (pipelineDone) {
                return { value: undefined as unknown as PipelineEvent, done: true };
              }
              // Wait for next emit() or signalDone()
              await new Promise<void>((resolve) => {
                eventNotify = resolve;
              });
            }
          },
        };
      },
    };

    // Main execution promise
    const result = (async (): Promise<PipelineContext> => {
      let ctx: PipelineContext = {
        ...initialCtx,
        stageParams: {
          ...initialCtx.stageParams,
          ...config.stageParams,
        },
      };

      if (config.globalStyle) {
        ctx.globalStyle = config.globalStyle;
      }

      const stageNames = stages.filter((s) => !skipSet.has(s.name)).map((s) => s.name);

      emit({ type: 'pipeline_start', flowId: config.flowId, stages: stageNames });

      let stageIndex = 0;
      const totalStages = stageNames.length;

      for (const stage of stages) {
        if (cancelled) {
          throw new Error('Pipeline cancelled');
        }

        // Skip check
        if (skipSet.has(stage.name)) {
          emit({ type: 'stage_skipped', stage: stage.name, reason: 'Skipped by config' });
          continue;
        }

        // Run before hooks
        ctx = await runHooks(hooks, stage.name, 'before', ctx, this.hookRegistry);

        // Execute stage
        emit({ type: 'stage_start', stage: stage.name, index: stageIndex, total: totalStages });

        try {
          if (stage.type === 'parallel') {
            ctx = await executeParallelStage(stage as IParallelStage, ctx, stage.name, emit);
          } else if (stage.type === 'reactive') {
            throw new Error(
              `ReactiveStage not implemented (stage: ${stage.name}). Reserved for Phase 3+.`,
            );
          } else {
            // linear
            ctx = await stage.execute(ctx);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ type: 'pipeline_error', error: message, stage: stage.name });
          throw error;
        }

        emit({ type: 'stage_complete', stage: stage.name });

        // Post-execution gate — pause for user review after stage produces output.
        // This means generatePrompts runs first, then the user reviews the prompts;
        // generatePilot runs first, then the user reviews the pilot media.
        //
        // A stage may pause either because it declares `gate: 'confirm'` or
        // because the plan's `userCheckpoints` list includes its name
        // (checkpoint-aware pause — see plan-mode.md §6.2).
        const pauseForGate = stage.gate === 'confirm' || userCheckpointSet.has(stage.name);
        if (pauseForGate) {
          emit({ type: 'gate_waiting', stage: stage.name, preview: ctx });

          const gateResult = await new Promise<{
            confirmed: boolean;
            modifications?: Partial<PipelineContext>;
          }>((resolve) => {
            gateResolve = resolve;
          });
          gateResolve = null;

          if (!gateResult.confirmed) {
            emit({ type: 'gate_cancelled', stage: stage.name });
            throw new Error(`Pipeline cancelled at gate: ${stage.name}`);
          }

          emit({ type: 'gate_confirmed', stage: stage.name });

          // Apply modifications from user (e.g. edited prompts)
          if (gateResult.modifications) {
            ctx = { ...ctx, ...gateResult.modifications };
          }
        }

        // Run after hooks
        ctx = await runHooks(hooks, stage.name, 'after', ctx, this.hookRegistry);

        stageIndex++;
      }

      emit({ type: 'pipeline_complete', result: ctx });
      signalDone();

      return ctx;
    })();

    // Catch unhandled rejection to signal event iterator
    result.catch(() => {
      signalDone();
    });

    const handle: PipelineHandle = {
      id,
      flowId: config.flowId,
      confirmGate(modifications) {
        if (gateResolve) {
          gateResolve({ confirmed: true, modifications });
        }
      },
      cancelGate() {
        if (gateResolve) {
          gateResolve({ confirmed: false });
        }
      },
      cancel() {
        cancelled = true;
        if (gateResolve) {
          gateResolve({ confirmed: false });
        }
      },
      events,
      result,
    };

    return handle;
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

async function executeParallelStage(
  stage: IParallelStage,
  ctx: PipelineContext,
  stageName: string,
  emit: (event: PipelineEvent) => void,
): Promise<PipelineContext> {
  const tasks = stage.tasks(ctx);
  const total = tasks.length;

  logger.info('Starting parallel stage', { stage: stageName, taskCount: total });

  const results = await Promise.allSettled(
    tasks.map(async (task, i) => {
      emit({ type: 'task_progress', stage: stageName, taskId: task.id, progress: 0, total });
      const result = await task.execute();
      emit({
        type: 'task_progress',
        stage: stageName,
        taskId: task.id,
        progress: i + 1,
        total,
      });
      return result;
    }),
  );

  // Convert settled results to ParallelTaskResult[]
  const taskResults = results.map((settled, i) => {
    const task = tasks[i];
    if (!task) {
      return { id: `unknown-${i}`, success: false, error: 'Task not found' };
    }
    if (settled.status === 'fulfilled') {
      return settled.value;
    }
    return {
      id: task.id,
      success: false,
      error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
    };
  });

  return stage.merge(ctx, taskResults);
}

async function runHooks(
  hooks: StageHookConfig[],
  stageName: string,
  timing: 'before' | 'after',
  ctx: PipelineContext,
  registry?: PipelineHookRegistry,
): Promise<PipelineContext> {
  const matching = hooks.filter(
    (h) => (h.stageName === stageName || h.stageName === '*') && h.timing === timing,
  );

  for (const hook of matching) {
    if (registry?.has(hook.action)) {
      logger.debug('Executing hook', { action: hook.action, stage: stageName, timing });
      ctx = await registry.execute(hook.action, ctx, stageName, hook.params);
    } else {
      logger.debug('Hook action not registered, skipping', {
        action: hook.action,
        stage: stageName,
        timing,
      });
    }
  }

  return ctx;
}

/**
 * Create a pipeline executor instance
 */
export function createPipelineExecutor(hookRegistry?: PipelineHookRegistry): IPipelineExecutor {
  return new PipelineExecutor(hookRegistry);
}
