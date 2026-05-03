import type { ContentBlock, Plan } from '@neko-agent/types';
import { parsePlanMarkdown } from './plan-parser';

export interface PlanToolResultProjectionOptions {
  now?: () => number;
  createPlanId?: (timestamp: number) => string;
}

export interface PlanToolResultProjection {
  plan: Plan;
  contentBlock: ContentBlock;
}

export function createPlanContentBlockFromToolResultData(
  data: unknown,
  options: PlanToolResultProjectionOptions = {},
): PlanToolResultProjection | null {
  if (!isAwaitingPlanApprovalResult(data)) return null;

  const timestamp = options.now?.() ?? Date.now();
  const planId = options.createPlanId?.(timestamp) ?? `plan-${timestamp}`;
  const title =
    typeof data.title === 'string' && data.title.length > 0 ? data.title : 'Implementation Plan';
  const planContent = typeof data.plan === 'string' ? data.plan : '';
  const filePath = typeof data.filePath === 'string' ? data.filePath : '';

  const plan = parsePlanMarkdown(planContent, planId, title);
  plan.filePath = filePath;

  return {
    plan,
    contentBlock: {
      id: `block-plan-${plan.id}`,
      type: 'plan',
      timestamp,
      plan,
    },
  };
}

function isAwaitingPlanApprovalResult(
  data: unknown,
): data is Record<string, unknown> & { planMode: Record<string, unknown> } {
  if (!isRecord(data) || !isRecord(data.planMode)) return false;
  return data.planMode.status === 'awaiting_approval';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
