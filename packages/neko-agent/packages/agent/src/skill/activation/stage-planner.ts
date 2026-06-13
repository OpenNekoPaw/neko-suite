/**
 * IDC Stage Planner — pure function `planStages(...)`.
 *
 * See: docs/architecture/agent-unified-workflow.md §3 (entry rules), §4 (stages)
 *
 * Responsibility: for one ReAct round, decide which IDC stages to activate,
 * given L2 mode + task shape + entry signal.
 *
 * Pure: no side effects, no clock reads (caller supplies `now`), no I/O.
 *
 * Scope limits:
 *   - Does NOT dispatch stages (PR2's stage-dispatcher will).
 *   - Does NOT enforce mode × stage in a security sense (runtime guard does).
 *   - Does NOT evaluate high-risk operation approval gates (the L0 approval
 *     engine owns that at Apply-time).
 *
 * Renamed stages 2026-04-22 (ADR §4 revision):
 *   specify → draft, implement → apply, tasks merged into plan.
 */

import type {
  IdcStage,
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
 *   atomic-instruction  → rule 4 (e.g. "bump volume +3dB") → enter Apply
 *   multi-step          → rule 5 (e.g. "generate 3 covers") → enter Plan
 *   vague-creative      → rule 6 (fallback)                 → enter Draft
 *   referenced-artifact → rule 2 (user cited @draft-001)    → continue mid-DAG
 *   prompt-chain-skill → rule 3 (user invoked /tiktok-15s) → prompt-chain Skill
 *   high-risk-forced    → rule 1 (reversible=false present) → force Draft
 */
export type StageEntrySignal =
  | 'atomic-instruction'
  | 'multi-step'
  | 'vague-creative'
  | 'referenced-artifact'
  | 'prompt-chain-skill'
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
 *   1. Pick the entry stage (PlanMode always Draft; AutoMode per §3.2 rule;
 *      AskMode follows AutoMode entry rules but with approval on each Apply
 *      operation).
 *   2. Expand from entry to the end of the DAG, honouring mode allow-list.
 *   3. Apply task-shape skips (pure-think / retry / plan-only / clarification).
 *   4. Honour retry hint: drop Draft/Plan in favour of reusing prior.
 *   5. Sort by DAG order.
 */
export function planStages(inputs: StagePlanInputs): StageActivationDecision {
  const { mode, taskShape, entrySignal, round, now, lastObserveHint } = inputs;

  const allowed = new Set<IdcStage>(getStageModeActivation(mode).allowed);
  const activated = new Set<IdcStage>();
  const skipped: { stage: IdcStage; reason: StageSkipReason }[] = [];

  // Step 1: Resolve entry stage.
  const entryStage = resolveEntryStage(mode, entrySignal);

  // Step 2: Expand from entry to end, in DAG order, honouring mode allow-list.
  const allInOrder: IdcStage[] = ['draft', 'plan', 'apply'];
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

  // Step 4: Retry hint — reuse prior Draft/Plan.
  if (lastObserveHint === 'retry') {
    for (const reuseStage of ['draft', 'plan'] as IdcStage[]) {
      if (activated.has(reuseStage)) {
        activated.delete(reuseStage);
        if (!skipped.some((s) => s.stage === reuseStage)) {
          skipped.push({ stage: reuseStage, reason: 'retry-reuse' });
        }
      }
    }
  }

  // Step 5: PlanMode guard — strip Apply if a shape sneaked it in.
  if (mode === 'plan' && activated.has('apply')) {
    activated.delete('apply');
    if (!skipped.some((s) => s.stage === 'apply')) {
      skipped.push({ stage: 'apply', reason: 'user-suppressed' });
    }
  }

  // Ensure always-mandatory Apply stays (unless PlanMode / pure-think / plan-only).
  const registryMandatory = (
    Object.values(STAGE_REGISTRY) as { name: IdcStage; defaultMandatory: boolean }[]
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

function resolveEntryStage(mode: StageMode, signal: StageEntrySignal): IdcStage {
  // PlanMode (explicit) always starts at Draft — user chose the deep path.
  if (mode === 'plan') return 'draft';

  // Rule 1 (highest): high-risk operation present — force Draft so user
  // approves the Draft before any Apply happens. Cannot be overridden by
  // other entry signals.
  if (signal === 'high-risk-forced') return 'draft';

  // Rules 2–6 for AutoMode / AskMode:
  switch (signal) {
    case 'referenced-artifact':
      // User cited @draft-001 / @plan-001 → continue from Plan.
      return 'plan';
    case 'prompt-chain-skill':
      // Explicit Skill invocation starts from Plan; the prompt-chain guidance
      // can still steer Draft/Apply details inside IDC.
      return 'plan';
    case 'atomic-instruction':
      // "bump volume +3dB" — straight to Apply.
      return 'apply';
    case 'multi-step':
      // "generate 3 covers" — start at Plan (skip Draft).
      return 'plan';
    case 'vague-creative':
      // Fallback — "make a TikTok video". Full IDC path.
      return 'draft';
  }
}

// =============================================================================
// Task-shape skips
// =============================================================================

function applyTaskShapeSkips(
  taskShape: StageTaskShape,
  activated: Set<IdcStage>,
  skipped: { stage: IdcStage; reason: StageSkipReason }[],
): void {
  /**
   * Skip table per task shape:
   *   single-read      → skip draft / plan (Apply only)
   *   single-write     → skip draft (Plan + Apply)
   *   multi-step       → no skips
   *   pure-think       → skip plan / apply (Draft only, think-aloud)
   *   retry            → handled by lastObserveHint branch
   *   plan-only        → skip apply (stop after Plan)
   *   clarification    → skip draft / plan (Apply only)
   */
  const shapeSkips: Record<StageTaskShape, IdcStage[]> = {
    'single-read': ['draft', 'plan'],
    'single-write': ['draft'],
    'multi-step': [],
    'pure-think': ['plan', 'apply'],
    retry: [],
    'plan-only': ['apply'],
    clarification: ['draft', 'plan'],
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
