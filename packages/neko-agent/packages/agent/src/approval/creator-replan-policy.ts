import type { ApprovalBinding } from './approval-types';

export type CreatorReplanKind =
  | 'reorder'
  | 'batch-split'
  | 'equivalent-capability'
  | 'local-repair'
  | 'story'
  | 'character'
  | 'core-style'
  | 'core-sound'
  | 'primary-technique'
  | 'cost-risk'
  | 'mutation-scope'
  | 'delivery-boundary'
  | 'critical-input';

export interface CreatorReplanAssessment {
  readonly requiresRenewedApproval: boolean;
  readonly reason: string;
}

const MATERIAL_REPLAN_KINDS: ReadonlySet<CreatorReplanKind> = new Set([
  'story',
  'character',
  'core-style',
  'core-sound',
  'primary-technique',
  'cost-risk',
  'mutation-scope',
  'delivery-boundary',
  'critical-input',
]);

/**
 * Decides whether a creator-facing replan stays inside an existing approval.
 * This is a pure policy check; it stores no plan or approval state.
 */
export function assessCreatorReplan(input: {
  readonly approved: ApprovalBinding;
  readonly proposed: ApprovalBinding;
  readonly kind: CreatorReplanKind;
}): CreatorReplanAssessment {
  if (MATERIAL_REPLAN_KINDS.has(input.kind)) {
    return {
      requiresRenewedApproval: true,
      reason: `Material creator replan (${input.kind}) requires renewed approval.`,
    };
  }

  const changedBoundary = findChangedApprovalBoundary(input.approved, input.proposed);
  if (changedBoundary) {
    return {
      requiresRenewedApproval: true,
      reason: `Proposed replan changes the approved ${changedBoundary}.`,
    };
  }

  return {
    requiresRenewedApproval: false,
    reason: `Bounded ${input.kind} remains inside the approved creative and delivery scope.`,
  };
}

function findChangedApprovalBoundary(
  approved: ApprovalBinding,
  proposed: ApprovalBinding,
): string | undefined {
  if (approved.target !== proposed.target) return 'target';
  if (!sameStringSet(approved.criticalInputIds, proposed.criticalInputIds)) {
    return 'critical input identity';
  }
  if (!sameStringSet(approved.creativeScope, proposed.creativeScope)) return 'creative scope';
  if (approved.costRiskCeiling !== proposed.costRiskCeiling) return 'cost/risk ceiling';
  if (!sameStringSet(approved.mutationScope, proposed.mutationScope)) return 'mutation scope';
  if (approved.deliveryBoundary !== proposed.deliveryBoundary) return 'delivery boundary';
  return undefined;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
}
