/**
 * Mode × SDD Stage Activation Matrix
 *
 * See: docs/architecture/agent-unified-workflow.md §3 (L3 Mode Layer), §4 (L2 Flow)
 *
 *  L2 Mode      Stages allowed by default             Entry behaviour
 *  ---------    -----------------------------------   -------------------------------
 *  PlanMode     specify → plan → tasks (no implement) Always start from Specify
 *  AutoMode     specify / plan / tasks / implement    Entry stage picked by §3.2
 *                                                     rules (atomic → implement)
 *  AskMode      specify → plan → tasks → implement    Each Implement operation gated
 *                                                     by user confirmation
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
  /** Whether Implement (and its tool calls) is permitted. */
  allowsImplement: boolean;
  /**
   * Whether the approval engine may auto-approve Proposal at Specify end
   * (AutoMode only; PlanMode and AskMode always prompt).
   */
  autoApproveEligible: boolean;
  /** One-liner for telemetry. */
  description: string;
}

export const STAGE_MODE_MATRIX: Readonly<Record<StageMode, StageModeActivation>> = {
  plan: {
    allowed: ['specify', 'plan', 'tasks'],
    allowsImplement: false,
    autoApproveEligible: false,
    description: 'PlanMode: stop after Tasks, user reviews before Implement',
  },
  ask: {
    allowed: ['specify', 'plan', 'tasks', 'implement'],
    allowsImplement: true,
    autoApproveEligible: false,
    description: 'AskMode: each Implement operation confirmed by user',
  },
  auto: {
    allowed: ['specify', 'plan', 'tasks', 'implement'],
    allowsImplement: true,
    autoApproveEligible: true,
    description: 'AutoMode: entry stage picked per §3.2; Proposal auto-approved for low-risk',
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
