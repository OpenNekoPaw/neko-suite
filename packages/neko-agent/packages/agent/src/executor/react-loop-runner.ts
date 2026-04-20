/**
 * ReAct Loop Runner — integrates the primitive activation planner with
 * AgentExecutor's existing think → act → observe loop.
 *
 * See: docs/architecture/dual-flow-architecture.md §3.3, §3.4
 *      plan v2 P1.6 (ReAct Loop Orchestrator)
 *
 * Design choice: registers as ExecutorHooks instead of patching the
 * executor directly. The executor stays ReAct-pure; the dual-flow
 * machinery is bolted on as a pluggable hook that any session which
 * opts in to dual-flow can wire up.
 *
 * Per-iteration behaviour:
 *   beforeThink:
 *     - Classify the task shape (heuristic — see classifyTaskShape)
 *     - Ask the planner for a PrimitiveActivationDecision
 *     - Assert the decision passes dispatcher DAG checks
 *     - Record the round summary on the WorkflowRun store
 *     - Stash the decision so onIterationComplete can post-annotate
 *   afterAct:
 *     - Inspect tool results to decide the NEXT round's lastObserveHint
 *       (retry if any tool errored, normal otherwise)
 *
 * Intentional non-goals (kept for P3 / P4 / P5):
 *   - Does not enforce mode × primitive whitelist at the tool level
 *     (that's ActivationGuard / R8 — handled by ToolGuard + Approval).
 *   - Does not emit telemetry events (ExecutionRoundActivationDecidedEvent
 *     etc.) on the runtime bus — EventBus is P5.
 *   - Does not write autoheal rounds — that's P3's strategy packs.
 */

import type { AgentContext, AgentResult, ExecutorHooks, ToolResultWithMeta } from '@neko/shared';
import type { FlowKind, PrimitiveActivationDecision, TaskShape } from '@neko-agent/types';
import { EXECUTION_CHANNELS, roundSummaryFromDecision, CREATION_CHANNELS } from '@neko-agent/types';

import type { FlowSwitcher } from '../skill/flow-switcher';
import { plan as planPrimitives } from '../skill/activation/activation-planner';
import type { L2Mode } from '../skill/activation/mode-activation-matrix';
import { assertDispatch } from './primitive-dispatcher';
import type { IWorkflowRunStore } from './workflow-run-store';
import type { IEventBus } from '../events/event-bus';
import type { IAutohealChain, AutohealOutcome } from '../autoheal';
import { getLogger } from '../utils/logger';

const logger = getLogger('ReActLoopRunner');

// =============================================================================
// Inputs
// =============================================================================

export interface ReActLoopRunnerDeps {
  /** Source of truth for the current FlowKind. */
  flowSwitcher: FlowSwitcher;
  /** Where round summaries get aggregated. */
  runStore: IWorkflowRunStore;
  /**
   * Resolves the current L2 mode each time a decision is needed. Callers
   * that wire ExecutionMode → L2Mode should pass a closure rather than a
   * snapshot so the runner always reads the live mode.
   */
  getMode: () => L2Mode;
  /**
   * Resolves the TaskShape for the *next* iteration. Defaults to the
   * built-in heuristic; callers can override for domain-specific
   * classifiers.
   */
  classifyTaskShape?: (ctx: TaskShapeSignals) => TaskShape;
  /**
   * Optional EventBus. When provided, the runner emits
   * `execution.round.activation.decided` each round and
   * `creation.run.started` / `creation.run.ended` on lifecycle
   * boundaries, compacted per plan v2 R9.
   */
  eventBus?: IEventBus;
  /**
   * Optional autoheal chain. When provided, errored tool results in
   * `afterAct` are routed through the chain so L1-L5 strategies can
   * decide whether the next round retries (healed), proceeds normally
   * (all levels passed without a resolution), or aborts (user-cancel).
   * Without this dep, the runner falls back to the bare retry-hint
   * behaviour (just flip hint to 'retry' on any tool error).
   */
  autohealChain?: IAutohealChain;
  /** Clock injection for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export interface TaskShapeSignals {
  /** Current flow kind. */
  flow: FlowKind;
  /** 0-based iteration index (matches AgentContext.iteration - 1). */
  round: number;
  /** Tool results from the previous iteration, empty on first round. */
  lastToolResults: readonly ToolResultWithMeta[];
  /** Whether any tool errored last round. */
  lastHadError: boolean;
  /** Whether the model produced any tool calls last think step. */
  lastHadToolCalls: boolean;
}

export interface ReActLoopRunnerState {
  /** Last decision emitted; null before first iteration. */
  lastDecision: PrimitiveActivationDecision | null;
  /** Observe hint to feed into the NEXT decision. */
  nextObserveHint: 'retry' | 'user-cancel' | 'normal';
  /** Current round counter (0-based). */
  round: number;
  /** Most recent autoheal outcome for the current subject; null if never fired. */
  lastAutohealOutcome: AutohealOutcome | null;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Build an ExecutorHooks that plugs the primitive activation planner
 * into AgentExecutor's think→act→observe loop.
 *
 * Returns both the hooks and a `state` handle so callers can inspect
 * decisions from outside (e.g. AgentSession queries, tests).
 */
export function createReActLoopRunner(deps: ReActLoopRunnerDeps): {
  hooks: ExecutorHooks;
  state: Readonly<ReActLoopRunnerState>;
} {
  const clock = deps.now ?? (() => Date.now());
  const classify = deps.classifyTaskShape ?? defaultClassifyTaskShape;

  // Mutable state shared between hooks. `state` below is returned as a
  // Readonly handle; callers see updates because it's the same object.
  const state: ReActLoopRunnerState = {
    lastDecision: null,
    nextObserveHint: 'normal',
    round: 0,
    lastAutohealOutcome: null,
  };

  let lastToolResults: readonly ToolResultWithMeta[] = [];
  let lastHadError = false;
  let lastHadToolCalls = false;
  // Per-subject retry attempts across rounds so the L1 retry budget holds
  // when the same tool keeps failing on successive rounds.
  const subjectAttempts = new Map<string, number>();

  const hooks: ExecutorHooks = {
    name: 'react-loop-runner',

    async onExecuteStart(_input, _ctx) {
      state.lastDecision = null;
      state.nextObserveHint = 'normal';
      state.round = 0;
      state.lastAutohealOutcome = null;
      lastToolResults = [];
      lastHadError = false;
      lastHadToolCalls = false;
      subjectAttempts.clear();
    },

    async beforeThink(_ctx: AgentContext) {
      const flow = deps.flowSwitcher.kind;
      const taskShape = classify({
        flow,
        round: state.round,
        lastToolResults,
        lastHadError,
        lastHadToolCalls,
      });
      const decision = planPrimitives({
        mode: deps.getMode(),
        flowContext: { kind: flow, reason: deps.flowSwitcher.context.reason },
        taskShape,
        round: state.round,
        now: clock,
        lastObserveHint: state.nextObserveHint,
      });

      try {
        assertDispatch(decision);
      } catch (err) {
        // Dispatch assertion failure is a bug. Log and continue — we
        // still record the round so operators see what went wrong.
        logger.error(`Dispatch assertion failed: ${String(err)}`);
      }

      deps.runStore.recordRound(decision, state.nextObserveHint);
      state.lastDecision = decision;

      // P5 — compacted round event per plan v2 R9.
      if (deps.eventBus) {
        const activeRun = deps.runStore.getActive();
        if (activeRun) {
          deps.eventBus.emit({
            channel: EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED,
            runId: activeRun.id,
            taskShape: decision.taskShape,
            summary: roundSummaryFromDecision(decision, state.nextObserveHint),
            at: decision.decidedAt,
          });
        }
      }
    },

    async afterAct(results: ToolResultWithMeta[]) {
      lastToolResults = results;
      lastHadToolCalls = results.length > 0;
      lastHadError = results.some((r) => ('success' in r ? !r.success : false));

      if (!lastHadError) {
        state.nextObserveHint = 'normal';
        state.lastAutohealOutcome = null;
        return;
      }

      // Without a chain, fall back to the bare retry hint behaviour (P1.6).
      if (!deps.autohealChain) {
        state.nextObserveHint = 'retry';
        return;
      }

      // Route the first failure of the batch through the chain. We pick
      // the first failure deterministically — real multi-failure batches
      // will be surfaced as individual rounds when the chain heals the
      // first and the loop re-runs.
      const failed = results.find((r) => ('success' in r ? !r.success : false));
      if (!failed) {
        state.nextObserveHint = 'retry';
        return;
      }

      const subject = getSubject(failed);
      const attempt = subjectAttempts.get(subject) ?? 0;
      subjectAttempts.set(subject, attempt + 1);

      const errorCode = getErrorCode(failed);
      const message = getErrorMessage(failed);
      const runId = deps.runStore.getActive()?.id;
      try {
        const outcome = await deps.autohealChain.run(
          { subject, errorCode, message, attempt, cause: failed },
          { round: state.round, ...(runId ? { runId } : {}) },
        );
        state.lastAutohealOutcome = outcome;
        state.nextObserveHint = autohealOutcomeToHint(outcome);
        if (outcome.resolution === 'healed') {
          // Reset retry budget for this subject — the chain decided we
          // can try again cleanly with a new plan.
          subjectAttempts.delete(subject);
        }
      } catch (err) {
        // Chain itself failed — very unusual. Fall back to simple retry
        // hint and log; do not abort the run.
        logger.warn(`Autoheal chain threw during afterAct: ${String(err)}`);
        state.nextObserveHint = 'retry';
      }
    },

    async onIterationComplete(_iteration, _ctx) {
      state.round += 1;
    },

    async onExecuteEnd(result: AgentResult) {
      const terminal = result.success ? 'completed' : 'failed';
      const activeRun = deps.runStore.getActive();
      deps.runStore.endRun(
        terminal,
        result.success
          ? undefined
          : {
              code: 'executor-error',
              message: result.response ?? 'unknown',
              cause: result.error,
            },
      );

      if (deps.eventBus && activeRun) {
        deps.eventBus.emit({
          channel: CREATION_CHANNELS.RUN_ENDED,
          runId: activeRun.id,
          status: terminal,
          at: clock(),
        });
      }
    },
  };

  return { hooks, state };
}

// =============================================================================
// Default task-shape heuristic
// =============================================================================

/**
 * Default classifier. Heuristic, not final:
 *   - round 0 with outer-ring flow: multi-step (planner will prune)
 *   - lastHadError: retry
 *   - lastHadToolCalls && no error: multi-step (loop continues)
 *   - no tool calls last round: pure-think (model just reasoned)
 *   - first round on execution ring: multi-step
 *
 * Callers with better signal (e.g. tool traits, user intent) should
 * inject their own classifier via `classifyTaskShape`.
 */
export function defaultClassifyTaskShape(s: TaskShapeSignals): TaskShape {
  if (s.lastHadError) return 'retry';
  if (s.round === 0) return 'multi-step';
  if (!s.lastHadToolCalls) return 'pure-think';
  return 'multi-step';
}

// =============================================================================
// Autoheal helpers
// =============================================================================

/**
 * Extract a stable subject string from a ToolResultWithMeta. Tool
 * results carry their name under `name` by convention; fall back to
 * 'unknown' when missing so the chain always gets something to key on.
 */
function getSubject(result: ToolResultWithMeta): string {
  const r = result as ToolResultWithMeta & { name?: string };
  return r.name && r.name.length > 0 ? r.name : 'unknown';
}

/**
 * Derive an error code for the autoheal chain. Tool results vary —
 * some carry a `code`, some a `kind`, some only a freeform error
 * message. We check in priority order and default to 'TOOL_ERROR'.
 */
function getErrorCode(result: ToolResultWithMeta): string {
  const r = result as ToolResultWithMeta & {
    code?: string;
    kind?: string;
    error?: unknown;
  };
  if (typeof r.code === 'string' && r.code.length > 0) return r.code;
  if (typeof r.kind === 'string' && r.kind.length > 0) return r.kind;
  return 'TOOL_ERROR';
}

function getErrorMessage(result: ToolResultWithMeta): string {
  const r = result as ToolResultWithMeta & {
    error?: unknown;
    message?: string;
  };
  if (typeof r.message === 'string' && r.message.length > 0) return r.message;
  const err: unknown = r.error;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return 'tool reported failure';
}

/**
 * Map an AutohealOutcome to the observe hint consumed by the next
 * beforeThink:
 *   - healed  → 'retry'       (next round reuses Plan with the fix)
 *   - pass    → 'retry'       (nothing fixed it, but loop continues)
 *   - aborted → 'user-cancel' (chain exited; runner should not retry
 *                              silently — the classifier may emit a
 *                              pure-think round instead)
 */
function autohealOutcomeToHint(outcome: AutohealOutcome): 'retry' | 'user-cancel' | 'normal' {
  switch (outcome.resolution) {
    case 'healed':
    case 'pass':
      return 'retry';
    case 'aborted':
      return 'user-cancel';
  }
}
