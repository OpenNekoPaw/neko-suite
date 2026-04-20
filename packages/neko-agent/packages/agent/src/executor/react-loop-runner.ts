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

import type { FlowSwitcher } from '../skill/flow-switcher';
import { plan as planPrimitives } from '../skill/activation/activation-planner';
import type { L2Mode } from '../skill/activation/mode-activation-matrix';
import { assertDispatch } from './primitive-dispatcher';
import type { IWorkflowRunStore } from './workflow-run-store';
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
  };

  let lastToolResults: readonly ToolResultWithMeta[] = [];
  let lastHadError = false;
  let lastHadToolCalls = false;

  const hooks: ExecutorHooks = {
    name: 'react-loop-runner',

    async onExecuteStart(_input, _ctx) {
      state.lastDecision = null;
      state.nextObserveHint = 'normal';
      state.round = 0;
      lastToolResults = [];
      lastHadError = false;
      lastHadToolCalls = false;
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
    },

    async afterAct(results: ToolResultWithMeta[]) {
      lastToolResults = results;
      lastHadToolCalls = results.length > 0;
      lastHadError = results.some((r) => ('success' in r ? !r.success : false));
      state.nextObserveHint = lastHadError ? 'retry' : 'normal';
    },

    async onIterationComplete(_iteration, _ctx) {
      state.round += 1;
    },

    async onExecuteEnd(result: AgentResult) {
      const terminal = result.success ? 'completed' : 'failed';
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
