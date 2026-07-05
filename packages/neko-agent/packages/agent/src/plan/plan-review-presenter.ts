import type { PlanStatus, PlanStepMessageUpdate } from '@neko-agent/types';
import { buildPlanRejectionFeedbackMessage } from './plan-review-messages';

export type PlanPromptMode = 'default' | 'plan';
export type PlanReviewDecision = Extract<PlanStatus, 'approved' | 'rejected'>;
export type PlanStepReviewAction = 'approve' | 'reject';

export interface PromptModeChangedMessage {
  type: 'promptModeChanged';
  conversationId: string;
  mode: PlanPromptMode;
  isPlanMode: boolean;
}

export interface PlanStatusUpdateMessage {
  type: 'planStatusUpdate';
  planId: string;
  conversationId: string;
  status: PlanReviewDecision;
}

export interface PlanStepStatusUpdateMessage {
  type: 'planStepStatusUpdate';
  planId: string;
  stepId: string;
  conversationId: string;
  status: Extract<PlanStatus, 'approved' | 'rejected' | 'modified'>;
  newDescription?: string;
}

export interface PlanRejectionFeedbackStreamMessage {
  type: 'streamText';
  conversationId: string;
  content: string;
}

export interface PlanStepReviewProjection {
  messageUpdate: PlanStepMessageUpdate;
  webviewMessage: PlanStepStatusUpdateMessage;
}

export function buildPromptModeChangedMessage(input: {
  conversationId: string;
  mode: PlanPromptMode;
  isPlanMode: boolean;
}): PromptModeChangedMessage {
  return {
    type: 'promptModeChanged',
    conversationId: requireConversationId(input.conversationId, 'promptModeChanged'),
    mode: input.mode,
    isPlanMode: input.isPlanMode,
  };
}

export function buildPlanStatusUpdateMessage(input: {
  planId: string;
  conversationId: string;
  status: PlanReviewDecision;
}): PlanStatusUpdateMessage {
  return {
    type: 'planStatusUpdate',
    planId: input.planId,
    conversationId: requireConversationId(input.conversationId, 'planStatusUpdate'),
    status: input.status,
  };
}

export function buildPlanRejectionFeedbackStreamMessage(
  conversationId: string,
): PlanRejectionFeedbackStreamMessage {
  return {
    type: 'streamText',
    conversationId: requireConversationId(conversationId, 'streamText'),
    content: buildPlanRejectionFeedbackMessage(),
  };
}

export function projectPlanStepActionReview(input: {
  planId: string;
  stepId: string;
  conversationId: string;
  action: PlanStepReviewAction;
}): PlanStepReviewProjection {
  const status = input.action === 'approve' ? 'approved' : 'rejected';

  return {
    messageUpdate: { status },
    webviewMessage: {
      type: 'planStepStatusUpdate',
      planId: input.planId,
      stepId: input.stepId,
      conversationId: requireConversationId(input.conversationId, 'planStepStatusUpdate'),
      status,
    },
  };
}

export function projectPlanStepModificationReview(input: {
  planId: string;
  stepId: string;
  conversationId: string;
  newDescription: string;
}): PlanStepReviewProjection {
  return {
    messageUpdate: {
      status: 'modified',
      description: input.newDescription,
    },
    webviewMessage: {
      type: 'planStepStatusUpdate',
      planId: input.planId,
      stepId: input.stepId,
      conversationId: requireConversationId(input.conversationId, 'planStepStatusUpdate'),
      status: 'modified',
      newDescription: input.newDescription,
    },
  };
}

function requireConversationId(conversationId: string, messageType: string): string {
  if (conversationId.trim().length === 0) {
    throw new Error(`${messageType} requires non-empty conversationId`);
  }
  return conversationId;
}
