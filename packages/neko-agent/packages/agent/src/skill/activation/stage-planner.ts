/**
 * SDD Stage Planner — pure function `planStages(...)`.
 *
 * See: docs/architecture/agent-unified-workflow.md §3 (entry rules), §4 (stages)
 *
 * Responsibility: for one ReAct round, decide which SDD stages to activate,
 * given L2 mode + task shape + entry signal. Mirrors the shape of the legacy
 * `plan()` in activation-planner.ts so consumers can switch incrementally.
 *
 * Pure: no side effects, no clock reads (caller supplies `now`), no I/O.
 *
 * Scope limits:
 *   - Does NOT dispatch stages (PR2's stage-dispatcher will).
 *   - Does NOT enforce mode × stage in a security sense (runtime guard does).
 *   - Does NOT evaluate high-risk operation approval gates (the L0 approval
 *     engine owns that at Implement-time).
 */

import type {
  SddStage,
  StageActivationDecision,
  StageSkipReason,
  StageTaskShape,
} from '@neko-agent/types';

import { STAGE_REGISTRY, sortStagesByDag } from './stage-registry';
import { getStageModeActivation, type StageMode } from './stage-activation-matrix';

// =============================================================================
// Inputs
// =============================================================================

/**
 * Entry signal — ADR §3.2 rules 1–6, mapped to the stage the planner should
 * start from. Rules are evaluated upstream by the activation classifier; the
 * planner just honours the result.
 *
 *   atomic-instruction  → rules 4 (e.g. "bump volume +3dB") → enter Implement
 *   multi-step          → rule 5 (e.g. "generate 3 covers")  → enter Plan
 *   vague-creative      → rule 6 (fallback)                  → enter Specify
 *   referenced-artifact → rule 2 (user cited @proposal-001)  → continue mid-DAG
 *   workflow-template   → rule 3 (user invoked /tiktok-15s)  → Workflow-defined
 *   high-risk-forced    → rule 1 (reversible=false present)  → force Specify
 */
export type StageEntrySignal =
  | 'atomic-instruction'
  | 'multi-step'
  | 'vague-creative'
  | 'referenced-artifact'
  | 'workflow-template'
  | 'high-risk-forced';

export interface StagePlanInputs {
  /** L2 mode for this round. */
  mode: StageMode;
  /** Classification of the upcoming work (skip logic). */
  taskShape: StageTaskShape;
  /** Entry rule outcome from §3.2. Determines starting stage in AutoMode. */
  entrySignal: StageEntrySignal;
  /** Round index within the current run (0-based). */
  round: number;
  /** Wall-clock for the decision timestamp (injected for determinism). */
  now: () => number;
  /**
   * Optional hint from the last observe — autoheal retry, user cancel, etc.
   * Mirrors the primitive planner's `lastObserveHint`.
   */
  lastObserveHint?: 'retry' | 'user-cancel' | 'normal';
}

// =============================================================================
// Main
// =============================================================================

/**
 * Decide which stages to activate this round.
 *
 * Algorithm:
 *   1. Pick the entry stage (PlanMode always Specify; AutoMode per §3.2 rule;
 *      AskMode follows AutoMode entry rules but with approval on each
 *      Implement operation).
 *   2. Expand from entry to the end of the DAG, honouring mode allow-list.
 *   3. Apply task-shape skips (pure-think / retry / plan-only / clarification).
 *   4. Honour retry hint: drop Specify/Plan/Tasks in favour of reusing prior.
 *   5. Sort by DAG order.
 */
export function planStages(inputs: StagePlanInputs): StageActivationDecision {
  const { mode, taskShape, entrySignal, round, now, lastObserveHint } = inputs;

  const allowed = new Set<SddStage>(getStageModeActivation(mode).allowed);
  const activated = new Set<SddStage>();
  const skipped: { stage: SddStage; reason: StageSkipReason }[] = [];

  // Step 1: Resolve entry stage.
  const entryStage = resolveEntryStage(mode, entrySignal);

  // Step 2: Expand from entry to end, in DAG order, honouring mode allow-list.
  const allInOrder: SddStage[] = ['specify', 'plan', 'tasks', 'implement'];
  const entryIdx = allInOrder.indexOf(entryStage);
  for (let i = 0; i < allInOrder.length; i++) {
    const stage = allInOrder[i]!;
    if (i < entryIdx) {
      skipped.push({ stage, reason: 'entry-rule' });
      continue;
    }
    if (!allowed.has(stage)) {
      skipped.push({ stage, reason: 'mode' });
      continue;
    }
    activated.add(stage);
  }

  // Step 3: Task-shape skips.
  applyTaskShapeSkips(taskShape, activated, skipped);

  // Step 4: Retry hint — reuse prior Specify/Plan/Tasks.
  if (lastObserveHint === 'retry') {
    for (const reuseStage of ['specify', 'plan', 'tasks'] as SddStage[]) {
      if (activated.has(reuseStage)) {
        activated.delete(reuseStage);
        if (!skipped.some((s) => s.stage === reuseStage)) {
          skipped.push({ stage: reuseStage, reason: 'retry-reuse' });
        }
      }
    }
  }

  // Step 5: PlanMode guard — strip Implement if a shape sneaked it in.
  if (mode === 'plan' && activated.has('implement')) {
    activated.delete('implement');
    if (!skipped.some((s) => s.stage === 'implement')) {
      skipped.push({ stage: 'implement', reason: 'user-suppressed' });
    }
  }

  // Ensure always-mandatory Implement stays (unless PlanMode / pure-think / plan-only).
  const registryMandatory = (
    Object.values(STAGE_REGISTRY) as { name: SddStage; defaultMandatory: boolean }[]
  )
    .filter((m) => m.defaultMandatory)
    .map((m) => m.name);
  for (const mandatory of registryMandatory) {
    if (!activated.has(mandatory)) continue; // already dropped intentionally
  }

  return {
    taskShape,
    activated: sortStagesByDag([...activated]),
    skipped,
    decidedAt: now(),
    round,
  };
}

// =============================================================================
// Entry-stage resolution (ADR §3.2)
// =============================================================================

function resolveEntryStage(mode: StageMode, signal: StageEntrySignal): SddStage {
  // PlanMode (explicit) always starts at Specify — user chose the deep path.
  if (mode === 'plan') return 'specify';

  // Rule 1 (highest): high-risk operation present — force Specify so user
  // approves the Proposal before any Implement happens. Cannot be overridden
  // by other entry signals.
  if (signal === 'high-risk-forced') return 'specify';

  // Rules 2–6 for AutoMode / AskMode:
  switch (signal) {
    case 'referenced-artifact':
      // User cited @proposal-001 / @plan-001 → continue from that stage.
      // Conservative default: jump to Plan (the stage after Specify).
      return 'plan';
    case 'workflow-template':
      // Workflow invocation — the workflow itself picks its entry point. We
      // default to Plan, letting the workflow override if needed.
      return 'plan';
    case 'atomic-instruction':
      // "bump volume +3dB" — straight to Implement.
      return 'implement';
    case 'multi-step':
      // "generate 3 covers" — start at Plan (skip Specify).
      return 'plan';
    case 'vague-creative':
      // Fallback — "make a TikTok video". Full SDD path.
      return 'specify';
  }
}

// =============================================================================
// Task-shape skips
// =============================================================================

function applyTaskShapeSkips(
  taskShape: StageTaskShape,
  activated: Set<SddStage>,
  skipped: { stage: SddStage; reason: StageSkipReason }[],
): void {
  /**
   * Skip table per task shape:
   *   single-read      → skip specify / plan / tasks (Implement only)
   *   single-write     → skip specify (Plan + Tasks + Implement)
   *   multi-step       → no skips
   *   pure-think       → skip plan / tasks / implement (Specify only, think-aloud)
   *   retry            → handled by lastObserveHint branch
   *   plan-only        → skip implement (stop after Tasks)
   *   clarification    → skip specify / plan / tasks (Implement only)
   */
  const shapeSkips: Record<StageTaskShape, SddStage[]> = {
    'single-read': ['specify', 'plan', 'tasks'],
    'single-write': ['specify'],
    'multi-step': [],
    'pure-think': ['plan', 'tasks', 'implement'],
    retry: [],
    'plan-only': ['implement'],
    clarification: ['specify', 'plan', 'tasks'],
  };

  for (const stage of shapeSkips[taskShape]) {
    if (activated.has(stage)) {
      activated.delete(stage);
      if (!skipped.some((s) => s.stage === stage)) {
        skipped.push({ stage, reason: 'task-shape' });
      }
    }
  }
}
