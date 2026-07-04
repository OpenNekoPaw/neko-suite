/**
 * ReAct Loop Runner — integrates the IDC stage-activation planner with
 * AgentExecutor's existing think → act → observe loop.
 *
 * See: docs/architecture/agent-unified-workflow.md §3 (entry rules), §4 (stages)
 *
 * Design choice: registers as ExecutorHooks instead of patching the
 * executor directly. The executor stays ReAct-pure; the stage guidance is
 * bolted on as a pluggable hook that any session which opts in can wire.
 *
 * Per-iteration behaviour:
 *   beforeThink:
 *     - Classify the task shape (heuristic — see classifyTaskShape)
 *     - Derive an entry signal from task shape + round index
 *     - Ask the planner for a StageActivationDecision
 *     - Assert the decision passes dispatcher DAG checks
 *     - Record the round summary on the Agent-native creation state
 *   afterAct:
 *     - Inspect tool results to decide the NEXT round's lastObserveHint
 *       (retry if any tool errored, normal otherwise)
 *
 * Intentional non-goals (kept for later phases):
 *   - Does not enforce mode × stage whitelist at the tool level
 *     (that's handled by ToolGuard + Approval).
 *   - Does not emit telemetry beyond the round-activation compaction.
 *   - Does not write autoheal rounds — autoheal chain owns that.
 */

import {
  deriveAgentTraceContext,
  withAgentTrace,
  type AgentContext,
  type AgentResult,
  type AutohealOutcome,
  type ExecutorHooks,
  type IAutohealChain,
  type ToolResultWithMeta,
} from '@neko/shared';
import type { IdcStage, StageActivationDecision, StageTaskShape } from '@neko-agent/types';
import { CREATION_CHANNELS, EXECUTION_CHANNELS } from '@neko-agent/types';
import { DEFAULT_READ_ONLY_TOOLS } from '../permission/types';

import { planStages, type StageEntrySignal } from '../skill/activation/stage-planner';
import type { StageMode } from '../skill/activation/stage-activation-matrix';
import type { StageTracker } from '../skill/stage-tracker';
import { assertStageDispatch } from './stage-dispatcher';
import type { IEventBus } from '../events/event-bus';
import { getLogger } from '../utils/logger';

const logger = getLogger('ReActLoopRunner');

// =============================================================================
// Inputs
// =============================================================================

export interface ReActLoopRunnerDeps {
  /**
   * Tracks the current built-in creation stage. The runner calls `stageTracker.enter()`
   * with the terminal stage of each round's activation decision, which lets
   * listeners (e.g. StagePersonaBinding) swap the active persona Skill.
   * Optional so lightweight call sites (tests, headless executions) can
   * skip stage tracking entirely.
   */
  stageTracker?: StageTracker;
  /**
   * Existing Agent execution context used for event correlation. This is not a
   * creation runtime; the runner must not own lifecycle or stage state.
   */
  getRunContext: () => ReActLoopRunContext | null;
  /**
   * Resolves the current L2 mode each time a decision is needed. Callers
   * that wire ExecutionMode → StageMode should pass a closure rather than
   * a snapshot so the runner always reads the live mode.
   */
  getMode: () => StageMode;
  /**
   * Resolves the StageTaskShape for the *next* iteration. Defaults to the
   * built-in heuristic; callers can override for domain-specific
   * classifiers.
   */
  classifyTaskShape?: (ctx: TaskShapeSignals) => StageTaskShape;
  /**
   * Resolves the entry signal (ADR §3.2) for the *next* iteration.
   * Defaults to deriving from task shape + round index. Callers with
   * stronger signal (user cited @proposal, prompt-chain skill) can
   * override.
   */
  classifyEntrySignal?: (ctx: TaskShapeSignals & { taskShape: StageTaskShape }) => StageEntrySignal;
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

export interface ReActLoopRunContext {
  readonly runId: string;
  readonly creationKind: string;
}

export interface TaskShapeSignals {
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
  lastDecision: StageActivationDecision | null;
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
  const classifyEntry = deps.classifyEntrySignal ?? defaultClassifyEntrySignal;

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

      if (deps.eventBus) {
        const runContext = deps.getRunContext();
        if (runContext) {
          deps.eventBus.emit({
            channel: CREATION_CHANNELS.RUN_STARTED,
            runId: runContext.runId,
            creationKind: runContext.creationKind,
            at: clock(),
          });
        }
      }
    },

    async beforeThink(_ctx: AgentContext) {
      const startedAt = clock();
      const signals: TaskShapeSignals = {
        round: state.round,
        lastToolResults,
        lastHadError,
        lastHadToolCalls,
      };
      const taskShape = classify(signals);
      const entrySignal = classifyEntry({ ...signals, taskShape });
      const decision = planStages({
        mode: deps.getMode(),
        taskShape,
        entrySignal,
        round: state.round,
        now: clock,
        lastObserveHint: state.nextObserveHint,
      });

      try {
        assertStageDispatch(decision);
      } catch (err) {
        // Dispatch assertion failure is a bug. Log and continue — we
        // still record the round so operators see what went wrong.
        logger.error(`Dispatch assertion failed: ${String(err)}`);
      }

      state.lastDecision = decision;
      const activeRunId = deps.getRunContext()?.runId;
      const trace = deriveAgentTraceContext(_ctx.trace, {
        ...(activeRunId ? { runId: activeRunId } : {}),
        phase: 'creation',
      });

      // Tell the tracker which stage this round terminated in — persona
      // bindings subscribe to `stage.entered` to swap Skills. We pick the
      // terminal activated stage (already DAG-sorted by the planner).
      const terminal = terminalStage(decision.activated);
      if (deps.stageTracker && activeRunId) {
        if (terminal) {
          deps.stageTracker.enter(terminal);
        }
      }
      logger.debug(
        'neko.agent.workflow.stage_activation.decided',
        withAgentTrace(trace, {
          round: state.round,
          mode: deps.getMode(),
          taskShape,
          entrySignal,
          observeHint: state.nextObserveHint,
          activatedStages: decision.activated,
          terminalStage: terminal,
          durationMs: Math.max(0, clock() - startedAt),
        }),
      );

      // P5 — compacted round event per plan v2 R9.
      if (deps.eventBus) {
        const runContext = deps.getRunContext();
        if (runContext) {
          deps.eventBus.emit({
            channel: EXECUTION_CHANNELS.ROUND_ACTIVATION_DECIDED,
            runId: runContext.runId,
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

      // Emit execution.apply.committed for every successful tool call in the
      // batch. Each successful tool is an Apply from the Implement-stage
      // persona's perspective — the resource boundary crossed. Consumers
      // (StageGuardian.approval-skipped, audit logs, UI milestones) key off
      // this channel. Errors do NOT emit; they route through the autoheal
      // chain and appear as execution.autoheal.* instead.
      //
      // The `kind` field uses the `tool:<name>` canonical subject form so
      // it matches ApprovalSubject.kind emitted by the ApprovalEngine.
      // StageGuardian pairs approvals and applies by exact subject match.
      if (deps.eventBus && results.length > 0) {
        const activeRunId = deps.getRunContext()?.runId;
        if (activeRunId) {
          const at = Date.now();
          for (const result of results) {
            if ('success' in result && !result.success) continue;
            if (isReadOnlyApplySubject(result)) continue;
            deps.eventBus.emit({
              channel: EXECUTION_CHANNELS.APPLY_COMMITTED,
              runId: activeRunId,
              kind: `tool:${getSubject(result)}`,
              at,
            });
          }
        }
      }

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
      const runId = deps.getRunContext()?.runId;
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
      // Emit execution.step.completed for every ReAct round (think →
      // act → observe) before bumping the counter. A "step" is the
      // round as a whole — different from apply.committed which fires
      // per successful tool call inside the act phase.
      //
      // `thinkOnly` distinguishes pure-think steps (model responded
      // without calling tools) from think+act steps. Consumers of the
      // steps.jsonl audit log use this to bucket rounds.
      if (deps.eventBus) {
        const activeRunId = deps.getRunContext()?.runId;
        if (activeRunId) {
          deps.eventBus.emit({
            channel: EXECUTION_CHANNELS.STEP_COMPLETED,
            runId: activeRunId,
            round: state.round,
            thinkOnly: !lastHadToolCalls,
            at: Date.now(),
          });
        }
      }
      state.round += 1;
    },

    async onExecuteEnd(result: AgentResult) {
      const terminal = result.success ? 'completed' : 'failed';
      const runContext = deps.getRunContext();

      if (deps.eventBus && runContext) {
        deps.eventBus.emit({
          channel: CREATION_CHANNELS.RUN_ENDED,
          runId: runContext.runId,
          status: terminal,
          at: clock(),
        });
      }
    },
  };

  return { hooks, state };
}

export function roundSummaryFromDecision(
  decision: StageActivationDecision,
  lastObserveHint?: string,
): import('@neko-agent/types').StageActivationRoundSummary {
  return {
    round: decision.round,
    activatedStages: decision.activated,
    skippedStages: decision.skipped,
    decidedAt: decision.decidedAt,
    lastObserveHint,
  };
}

// =============================================================================
// Default task-shape heuristic
// =============================================================================

/**
 * Default classifier. Heuristic, not final:
 *   - lastHadError: retry
 *   - round 0: multi-step (planner will prune based on entry signal)
 *   - no tool calls last round: pure-think (model just reasoned)
 *   - tool calls succeeded: multi-step (loop continues)
 *
 * Callers with better signal (e.g. tool traits, user intent) should
 * inject their own classifier via `classifyTaskShape`.
 */
export function defaultClassifyTaskShape(s: TaskShapeSignals): StageTaskShape {
  if (s.lastHadError) return 'retry';
  if (s.round === 0) return 'multi-step';
  if (!s.lastHadToolCalls) return 'pure-think';
  return 'multi-step';
}

/**
 * Default entry-signal classifier. Conservative: treats round 0 of a
 * multi-step task as vague-creative (full IDC path) and subsequent
 * rounds as atomic-instruction (straight to Implement). Callers with
 * user-intent signal — `@proposal-001` references, `/workflow` triggers,
 * or high-risk operation hints — should override.
 */
export function defaultClassifyEntrySignal(
  s: TaskShapeSignals & { taskShape: StageTaskShape },
): StageEntrySignal {
  // After round 0, the stage-planner reuses prior decisions anyway —
  // atomic-instruction keeps Implement on the activation set cleanly.
  if (s.round > 0) return 'atomic-instruction';
  switch (s.taskShape) {
    case 'single-read':
    case 'single-write':
    case 'clarification':
      return 'atomic-instruction';
    case 'multi-step':
      return 'multi-step';
    case 'pure-think':
    case 'plan-only':
    case 'retry':
      return 'vague-creative';
  }
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

function isReadOnlyApplySubject(result: ToolResultWithMeta): boolean {
  return DEFAULT_READ_ONLY_TOOLS.includes(getSubject(result));
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

/**
 * Pick the "current" stage from a decision's activated set. The planner
 * DAG-sorts activations (specify → plan → tasks → implement), so the last
 * element is the deepest stage the round reaches. Returns null for empty
 * sets, which shouldn't happen post-dispatch-validation but we guard anyway.
 */
function terminalStage(activated: readonly IdcStage[]): IdcStage | null {
  if (activated.length === 0) return null;
  return activated[activated.length - 1] ?? null;
}
