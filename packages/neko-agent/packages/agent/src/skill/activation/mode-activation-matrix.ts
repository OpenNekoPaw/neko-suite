/**
 * Mode × Primitive Activation Matrix
 *
 * Encodes ADR §3.4: which primitives each L2 mode considers "enabled" by
 * default, for both the outer and inner rings.
 *
 *  L2 Mode      Creation primitives                 Execution primitives
 *  ---------    ----------------------------------  -----------------------------
 *  PlanMode     Orchestration → Proposal → Review   Plan → (stop)
 *  AskMode      Proposal → Review                   Plan → TODO → Approve → Apply → Step
 *  AutoMode     (can skip Orchestration / Review)   Plan → TODO → Apply → Step
 *                                                    (Approve auto-decided by strategy pack)
 *
 * The matrix represents *what the mode allows*, not *what the round will
 * run* — the activation planner (activation-planner.ts) then refines this
 * with task-shape logic (§3.2 / §3.3 skip tables).
 *
 * Pure data. No runtime dependencies beyond @neko-agent/types.
 */

import type { CreationPrimitive, ExecutionPrimitive, Primitive } from '@neko-agent/types';

// =============================================================================
// L2 modes
// =============================================================================

/**
 * L2 execution modes (see ADR §4.1). Named in camelCase to match TS idioms
 * rather than the prose form.
 */
export type L2Mode = 'plan' | 'ask' | 'auto';

// =============================================================================
// Matrix
// =============================================================================

export interface ModeActivation {
  /** Outer-ring primitives the mode considers enabled by default. */
  creationAllowed: readonly CreationPrimitive[];
  /** Inner-ring primitives the mode considers enabled by default. */
  executionAllowed: readonly ExecutionPrimitive[];
  /** Whether Apply (and anything past it) is permitted in this mode. */
  allowsApply: boolean;
  /** Whether the strategy pack may auto-approve (skipping Approve). */
  autoApproveEligible: boolean;
  /** Human-readable one-liner for telemetry. */
  description: string;
}

export const MODE_ACTIVATION_MATRIX: Readonly<Record<L2Mode, ModeActivation>> = {
  plan: {
    creationAllowed: ['orchestration', 'proposal', 'review'],
    executionAllowed: ['plan'],
    allowsApply: false,
    autoApproveEligible: false,
    description: 'PlanMode: plan only, stop before Apply',
  },
  ask: {
    creationAllowed: ['proposal', 'review', 'execution', 'status'],
    executionAllowed: ['plan', 'todo', 'approve', 'apply', 'step'],
    allowsApply: true,
    autoApproveEligible: false,
    description: 'AskMode: user confirms each Apply',
  },
  auto: {
    // Orchestration and Review can be skipped in AutoMode; Proposal /
    // Execution / Status remain available. The planner will drop Review
    // when task shape permits.
    creationAllowed: ['orchestration', 'proposal', 'review', 'execution', 'status'],
    executionAllowed: ['plan', 'todo', 'approve', 'apply', 'step'],
    allowsApply: true,
    autoApproveEligible: true,
    description: 'AutoMode: autonomous, Status summary post-hoc',
  },
};

// =============================================================================
// Helpers
// =============================================================================

export function getModeActivation(mode: L2Mode): ModeActivation {
  return MODE_ACTIVATION_MATRIX[mode];
}

/**
 * Is the primitive permitted by the mode (before task-shape filtering)?
 */
export function isModeAllowed(mode: L2Mode, primitive: Primitive): boolean {
  const activation = MODE_ACTIVATION_MATRIX[mode];
  return (
    (activation.creationAllowed as readonly Primitive[]).includes(primitive) ||
    (activation.executionAllowed as readonly Primitive[]).includes(primitive)
  );
}
