import type { Plan, PlanStatus, PlanStep } from '@neko-agent/types';

export type PlanReviewBadgeTone = 'success' | 'danger' | 'warning';
export type PlanStepIconTone = 'success' | 'danger' | 'warning' | 'secondary';
export type PlanStepIconKind = 'approved' | 'rejected' | 'modified' | 'default';
export type PlanStepContentTone = 'default' | 'warning';
export type PlanStepContainerTone = 'default' | 'muted';

export interface PlanReviewStatsProjection {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface PlanReviewBadgeProjection {
  tone: PlanReviewBadgeTone;
  labelKey: 'chat.plan.approved' | 'chat.plan.rejected' | 'chat.plan.partial';
}

export interface PlanStepIconProjection {
  kind: PlanStepIconKind;
  tone: PlanStepIconTone;
}

export interface PlanReviewStepProjection {
  step: PlanStep;
  index: number;
  icon: PlanStepIconProjection;
  containerTone: PlanStepContainerTone;
  contentTone: PlanStepContentTone;
  isPending: boolean;
  isModified: boolean;
  showOriginalDescription: boolean;
}

export interface PlanReviewUiProjection {
  stats: PlanReviewStatsProjection;
  badge: PlanReviewBadgeProjection | null;
  steps: PlanReviewStepProjection[];
  hasPendingSteps: boolean;
  showBulkActions: boolean;
}

export interface PlanReviewProjectionInput {
  plan: Plan;
  canApproveAll?: boolean;
  canRejectAll?: boolean;
}

export function projectPlanReviewUiState(input: PlanReviewProjectionInput): PlanReviewUiProjection {
  const stats = projectPlanReviewStats(input.plan);
  return {
    stats,
    badge: projectPlanReviewBadge(input.plan.status, stats),
    steps: input.plan.steps.map((step, index) => projectPlanReviewStep(step, index)),
    hasPendingSteps: stats.pending > 0,
    showBulkActions:
      stats.pending > 0 && (input.canApproveAll === true || input.canRejectAll === true),
  };
}

function projectPlanReviewStats(plan: Plan): PlanReviewStatsProjection {
  let pending = 0;
  let approved = 0;
  let rejected = 0;

  for (const step of plan.steps) {
    if (step.status === 'pending') {
      pending += 1;
    } else if (step.status === 'approved' || step.status === 'modified') {
      approved += 1;
    } else if (step.status === 'rejected') {
      rejected += 1;
    }
  }

  return {
    total: plan.steps.length,
    pending,
    approved,
    rejected,
  };
}

function projectPlanReviewBadge(
  planStatus: PlanStatus,
  stats: PlanReviewStatsProjection,
): PlanReviewBadgeProjection | null {
  if (planStatus === 'approved' || (stats.pending === 0 && stats.rejected === 0)) {
    return { tone: 'success', labelKey: 'chat.plan.approved' };
  }

  if (planStatus === 'rejected' || (stats.pending === 0 && stats.approved === 0)) {
    return { tone: 'danger', labelKey: 'chat.plan.rejected' };
  }

  if (stats.pending === 0 && stats.approved > 0 && stats.rejected > 0) {
    return { tone: 'warning', labelKey: 'chat.plan.partial' };
  }

  return null;
}

function projectPlanReviewStep(step: PlanStep, index: number): PlanReviewStepProjection {
  return {
    step,
    index,
    icon: projectPlanStepIcon(step.status),
    containerTone: step.status === 'rejected' ? 'muted' : 'default',
    contentTone: step.status === 'modified' ? 'warning' : 'default',
    isPending: step.status === 'pending',
    isModified: step.status === 'modified',
    showOriginalDescription: step.status === 'modified' && Boolean(step.originalDescription),
  };
}

function projectPlanStepIcon(status: PlanStatus): PlanStepIconProjection {
  switch (status) {
    case 'approved':
      return { kind: 'approved', tone: 'success' };
    case 'rejected':
      return { kind: 'rejected', tone: 'danger' };
    case 'modified':
      return { kind: 'modified', tone: 'warning' };
    default:
      return { kind: 'default', tone: 'secondary' };
  }
}
