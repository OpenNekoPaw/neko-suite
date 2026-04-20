/**
 * Primitive Activation Planner — pure function `plan(...)`
 *
 * See: docs/architecture/dual-flow-architecture.md §3.2, §3.3, §3.4, §4.2
 *
 * Responsibility: for one ReAct round, decide which primitives to run and
 * which to skip, given:
 *   - L2 mode (PlanMode / AskMode / AutoMode)
 *   - Current flow context (which ring we're in)
 *   - Task shape (single-read, multi-step, pure-think, retry, etc.)
 *   - Last observation (optional — for in-loop replanning)
 *
 * Pure: no side effects, no clock reads (caller supplies `now`), no I/O.
 * Safe to unit-test without mocking.
 *
 * Intentional scope limits:
 *   - Does NOT dispatch primitives (that's P1.6 ReAct-loop runner).
 *   - Does NOT talk to the executor or FlowSwitcher.
 *   - Does NOT enforce the mode × primitive white-list in a security sense
 *     (that's ActivationGuard R8). Violations here produce a warning at
 *     most — the runtime guard is authoritative.
 */

import type {
  FlowContext,
  FlowKind,
  Primitive,
  PrimitiveActivationDecision,
  PrimitiveSkipReason,
  TaskShape,
} from '@neko-agent/types';

import { PRIMITIVE_REGISTRY, sortByDag } from './primitive-registry';
import { getModeActivation, type L2Mode } from './mode-activation-matrix';

// =============================================================================
// Inputs
// =============================================================================

export interface PlanInputs {
  /** L2 mode for this round. */
  mode: L2Mode;
  /** Current flow context from FlowSwitcher. */
  flowContext: Pick<FlowContext, 'kind' | 'reason'>;
  /** Classification of the upcoming work. */
  taskShape: TaskShape;
  /** Round index within the current flow (0-based). */
  round: number;
  /** Wall-clock for the decision timestamp (injected for determinism). */
  now: () => number;
  /**
   * Optional hint from the last observe — e.g. "autoheal retry", "user
   * cancelled". Kept free-form for now; typed as opt-in for the ReAct-loop
   * runner (P1.6) to elaborate later.
   */
  lastObserveHint?: 'retry' | 'user-cancel' | 'normal';
}

// =============================================================================
// Main
// =============================================================================

/**
 * Decide which primitives to activate this round.
 *
 * Algorithm:
 *   1. Start from the mode-allowed set for the current ring.
 *   2. Apply ADR §3.2 / §3.3 skip tables based on task shape.
 *   3. Always keep the flow's default-mandatory primitives (ADR §4.2 Step,
 *      outer-ring Execution/Status) unless the mode explicitly forbids them
 *      (e.g. PlanMode removes Apply-chain — but Step is still produced by
 *      whatever primitives do activate).
 *   4. Sort the activated set by DAG order.
 *   5. Emit skipped reasons for the primitives we actively considered and
 *      rejected (so downstream telemetry can surface drift).
 */
export function plan(inputs: PlanInputs): PrimitiveActivationDecision {
  const { mode, flowContext, taskShape, round, now, lastObserveHint } = inputs;
  const flow = flowContext.kind;

  const activated = new Set<Primitive>();
  const skipped: { primitive: Primitive; reason: PrimitiveSkipReason }[] = [];

  if (flow === 'creation') {
    planCreation({ mode, taskShape, activated, skipped });
  } else {
    planExecution({ mode, taskShape, lastObserveHint, activated, skipped });
  }

  return {
    flow,
    taskShape,
    activated: sortByDag([...activated]),
    skipped,
    decidedAt: now(),
    round,
  };
}

// =============================================================================
// Creation (outer ring)
// =============================================================================

interface CreationInputs {
  mode: L2Mode;
  taskShape: TaskShape;
  activated: Set<Primitive>;
  skipped: { primitive: Primitive; reason: PrimitiveSkipReason }[];
}

function planCreation({ mode, taskShape, activated, skipped }: CreationInputs): void {
  const modeAllowed = new Set<Primitive>(getModeActivation(mode).creationAllowed);

  // Always-mandatory primitives on the outer ring (ADR §3.2): execution + status.
  // PlanMode is the exception — it explicitly stops before Apply, so Execution/
  // Status are not produced this round.
  const mandatoryHere: Primitive[] = mode === 'plan' ? [] : ['execution', 'status'];

  // ADR §3.2 skip table — what the task shape implies for the outer ring.
  const shapeSkips: Record<TaskShape, Primitive[]> = {
    'single-read': ['orchestration', 'proposal', 'review'],
    'single-write': ['orchestration'],
    'multi-step': [],
    'pure-think': ['orchestration', 'proposal', 'review'],
    retry: ['orchestration', 'proposal', 'review'],
    'plan-only': [],
    clarification: ['orchestration', 'proposal', 'review'],
  };

  for (const p of modeAllowed) {
    const skippedByShape = shapeSkips[taskShape].includes(p);
    const mandatory = mandatoryHere.includes(p);

    if (mandatory) {
      activated.add(p);
      continue;
    }
    if (skippedByShape) {
      skipped.push({ primitive: p, reason: 'task-shape' });
      continue;
    }
    activated.add(p);
  }

  // Primitives the mode forbids outright (present in registry but not allowed):
  for (const p of Object.keys(PRIMITIVE_REGISTRY) as Primitive[]) {
    if (PRIMITIVE_REGISTRY[p].flow !== 'creation') continue;
    if (!modeAllowed.has(p) && !activated.has(p)) {
      skipped.push({ primitive: p, reason: 'mode' });
    }
  }
}

// =============================================================================
// Execution (inner ring)
// =============================================================================

interface ExecutionInputs {
  mode: L2Mode;
  taskShape: TaskShape;
  lastObserveHint: PlanInputs['lastObserveHint'];
  activated: Set<Primitive>;
  skipped: { primitive: Primitive; reason: PrimitiveSkipReason }[];
}

function planExecution({
  mode,
  taskShape,
  lastObserveHint,
  activated,
  skipped,
}: ExecutionInputs): void {
  const modeAllowed = new Set<Primitive>(getModeActivation(mode).executionAllowed);
  const modeInfo = getModeActivation(mode);

  // Step is always produced (ADR §4.2).
  if (modeAllowed.has('step')) {
    activated.add('step');
  }

  // ADR §3.3 skip table.
  //   - single-read / single-write: skip Plan + TODO
  //   - pure-think: no Apply (think-only Step)
  //   - retry: reuse Plan, skip TODO + Approve
  //   - plan-only: Plan then stop (handled via mode=plan)
  //   - clarification: typically direct Step, no Plan
  switch (taskShape) {
    case 'single-read':
    case 'single-write':
    case 'clarification': {
      skipIfAllowed('plan', 'task-shape', modeAllowed, activated, skipped);
      skipIfAllowed('todo', 'task-shape', modeAllowed, activated, skipped);
      break;
    }
    case 'pure-think': {
      skipIfAllowed('plan', 'task-shape', modeAllowed, activated, skipped);
      skipIfAllowed('todo', 'task-shape', modeAllowed, activated, skipped);
      skipIfAllowed('apply', 'task-shape', modeAllowed, activated, skipped);
      skipIfAllowed('approve', 'task-shape', modeAllowed, activated, skipped);
      break;
    }
    case 'retry': {
      // Plan is reused from the previous round, not re-activated.
      skipIfAllowed('plan', 'retry-reuse', modeAllowed, activated, skipped);
      skipIfAllowed('todo', 'retry-reuse', modeAllowed, activated, skipped);
      skipIfAllowed('approve', 'retry-reuse', modeAllowed, activated, skipped);
      break;
    }
    case 'multi-step':
    case 'plan-only':
      // Defaults handled below.
      break;
  }

  // Activate remaining mode-allowed primitives that haven't been decided yet.
  for (const p of modeAllowed) {
    if (activated.has(p)) continue;
    if (skipped.some((s) => s.primitive === p)) continue;

    // AutoMode may auto-approve → skip Approve primitive.
    if (p === 'approve' && modeInfo.autoApproveEligible && taskShape !== 'multi-step') {
      skipped.push({ primitive: p, reason: 'auto-approved' });
      continue;
    }

    activated.add(p);
  }

  // Primitives the mode forbids outright.
  for (const p of Object.keys(PRIMITIVE_REGISTRY) as Primitive[]) {
    if (PRIMITIVE_REGISTRY[p].flow !== 'execution') continue;
    if (!modeAllowed.has(p) && !activated.has(p) && !skipped.some((s) => s.primitive === p)) {
      skipped.push({ primitive: p, reason: 'mode' });
    }
  }

  // Safety: PlanMode must not activate Apply / Step beyond Plan.
  if (mode === 'plan') {
    for (const forbidden of ['todo', 'approve', 'apply', 'step'] as Primitive[]) {
      if (activated.has(forbidden)) {
        activated.delete(forbidden);
        if (!skipped.some((s) => s.primitive === forbidden)) {
          skipped.push({ primitive: forbidden, reason: 'user-suppressed' });
        }
      }
    }
  }

  // Retry hint from executor overrides: even if task shape disagreed, a retry
  // observation means this round reuses Plan.
  if (lastObserveHint === 'retry') {
    for (const reuseCandidate of ['plan', 'todo', 'approve'] as Primitive[]) {
      if (activated.has(reuseCandidate)) {
        activated.delete(reuseCandidate);
        skipped.push({ primitive: reuseCandidate, reason: 'retry-reuse' });
      }
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function skipIfAllowed(
  primitive: Primitive,
  reason: PrimitiveSkipReason,
  modeAllowed: Set<Primitive>,
  activated: Set<Primitive>,
  skipped: { primitive: Primitive; reason: PrimitiveSkipReason }[],
): void {
  if (!modeAllowed.has(primitive)) return; // mode already forbids — don't double-report
  if (activated.has(primitive)) activated.delete(primitive);
  if (!skipped.some((s) => s.primitive === primitive)) {
    skipped.push({ primitive, reason });
  }
}

// =============================================================================
// Re-export FlowKind guard for callers
// =============================================================================

export function isCreationFlow(f: FlowKind): f is 'creation' {
  return f === 'creation';
}
