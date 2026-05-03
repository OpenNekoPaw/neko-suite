import type { PlanStatusUpdateMessage } from './plan-review-presenter';
import { buildPlanStatusUpdateMessage } from './plan-review-presenter';
import {
  buildPlanApprovalExecutionMessage,
  buildPlanApprovalExecutionOverrides,
} from './plan-review-messages';

export interface PlanApprovalDispatchPlanInput {
  planId: string;
  conversationId: string;
  filePath?: string;
}

export interface PlanApprovalExecutionDispatch {
  conversationId: string;
  messageText: string;
  sessionMode: 'agent';
  executionOverrides: ReturnType<typeof buildPlanApprovalExecutionOverrides>;
}

export interface PlanFileReadErrorMessage {
  type: 'error';
  conversationId: string;
  message: string;
}

export interface PlanApprovalDispatchPlan {
  messageUpdate: {
    status: 'approved';
  };
  statusUpdateMessage: PlanStatusUpdateMessage;
  next:
    | {
        kind: 'read-plan-file';
        filePath: string;
      }
    | {
        kind: 'execute';
        dispatch: PlanApprovalExecutionDispatch;
      };
}

export function buildPlanApprovalDispatchPlan(
  input: PlanApprovalDispatchPlanInput,
): PlanApprovalDispatchPlan {
  return {
    messageUpdate: {
      status: 'approved',
    },
    statusUpdateMessage: buildPlanStatusUpdateMessage({
      planId: input.planId,
      conversationId: input.conversationId,
      status: 'approved',
    }),
    next: input.filePath
      ? {
          kind: 'read-plan-file',
          filePath: input.filePath,
        }
      : {
          kind: 'execute',
          dispatch: buildPlanApprovalExecutionDispatch({
            conversationId: input.conversationId,
          }),
        },
  };
}

export function buildPlanApprovalExecutionDispatch(input: {
  conversationId: string;
  planContent?: string;
}): PlanApprovalExecutionDispatch {
  return {
    conversationId: input.conversationId,
    messageText: buildPlanApprovalExecutionMessage(input.planContent),
    sessionMode: 'agent',
    executionOverrides: buildPlanApprovalExecutionOverrides(),
  };
}

export function buildPlanFileReadErrorMessage(input: {
  conversationId: string;
  error: unknown;
}): PlanFileReadErrorMessage {
  return {
    type: 'error',
    conversationId: input.conversationId,
    message: `Failed to read plan file: ${formatPlanFileReadError(input.error)}`,
  };
}

function formatPlanFileReadError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Unknown error';
}
