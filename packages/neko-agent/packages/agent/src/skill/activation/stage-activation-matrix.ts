/**
 * Mode × SDD Stage Activation Matrix
 *
 * See: docs/architecture/agent-unified-workflow.md §3 (L3 Mode Layer), §4 (L2 Flow)
 *
 *  L2 Mode      Stages allowed by default          Entry behaviour
 *  ---------    ------------------------------     -------------------------------
 *  PlanMode     draft → plan (no apply)            Always start from Draft
 *  AutoMode     draft / plan / apply               Entry stage picked by §3.2
 *                                                  rules (atomic → apply)
 *  AskMode      draft → plan → apply               Each Apply operation gated
 *                                                  by user confirmation
 *
 * The matrix represents *what the mode allows*; the stage-planner refines it
 * with task-shape rules (§3.2 entry-stage table) and the L0 approval engine
 * enforces per-operation gates.
 *
 * Note on AskMode: the agent-unified-workflow ADR §3 nominally collapses the
 * three-mode model to two (AutoMode + PlanMode). AskMode is preserved here
 * through PR2 of the refactor so existing consumers keep building; it behaves
 * as "AutoMode with per-operation confirmation" and can be retired when the
 * consumers are migrated.
 *
 * Pure data. No runtime deps beyond @neko-agent/types.
 */

import type { SddStage } from '@neko-agent/types';

// =============================================================================
// L2 modes — reused from mode-activation-matrix.ts
// =============================================================================

/**
 * L2 execution modes. Structurally identical to the legacy L2Mode in
 * mode-activation-matrix.ts; re-declared here to keep stage logic independent
 * of the deprecated primitive module.
 */
export type StageMode = 'plan' | 'ask' | 'auto';

// =============================================================================
// Matrix
// =============================================================================

export interface StageModeActivation {
  /** Stages the mode allows by default. */
  allowed: readonly SddStage[];
  /** Whether Apply (and its tool calls) is permitted. */
  allowsApply: boolean;
  /**
   * Whether the approval engine may auto-approve the Draft at Draft-stage end
   * (AutoMode only; PlanMode and AskMode always prompt).
   */
  autoApproveEligible: boolean;
  /** One-liner for telemetry. */
  description: string;
}

export const STAGE_MODE_MATRIX: Readonly<Record<StageMode, StageModeActivation>> = {
  plan: {
    allowed: ['draft', 'plan'],
    allowsApply: false,
    autoApproveEligible: false,
    description: 'PlanMode: stop after Plan, user reviews before Apply',
  },
  ask: {
    allowed: ['draft', 'plan', 'apply'],
    allowsApply: true,
    autoApproveEligible: false,
    description: 'AskMode: each Apply operation confirmed by user',
  },
  auto: {
    allowed: ['draft', 'plan', 'apply'],
    allowsApply: true,
    autoApproveEligible: true,
    description: 'AutoMode: entry stage picked per §3.2; Draft auto-approved for low-risk',
  },
};

// =============================================================================
// Helpers
// =============================================================================

export function getStageModeActivation(mode: StageMode): StageModeActivation {
  return STAGE_MODE_MATRIX[mode];
}

export function isStageModeAllowed(mode: StageMode, stage: SddStage): boolean {
  return STAGE_MODE_MATRIX[mode].allowed.includes(stage);
}
