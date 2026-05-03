import { describe, expect, it } from 'vitest';
import {
  buildPlanApprovalDispatchPlan,
  buildPlanApprovalExecutionDispatch,
  buildPlanFileReadErrorMessage,
} from '../plan-approval-dispatch';

describe('plan approval dispatch', () => {
  it('builds a direct execution plan when no plan file is present', () => {
    expect(
      buildPlanApprovalDispatchPlan({
        planId: 'plan-1',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      messageUpdate: { status: 'approved' },
      statusUpdateMessage: {
        type: 'planStatusUpdate',
        planId: 'plan-1',
        conversationId: 'conv-1',
        status: 'approved',
      },
      next: {
        kind: 'execute',
        dispatch: {
          conversationId: 'conv-1',
          messageText: 'The plan has been approved. Please proceed with the implementation.',
          sessionMode: 'agent',
          executionOverrides: {
            executionMode: 'auto',
            metadata: { planReview: { decision: 'approved' } },
          },
        },
      },
    });
  });

  it('builds a file read plan when a plan file is present', () => {
    expect(
      buildPlanApprovalDispatchPlan({
        planId: 'plan-1',
        conversationId: 'conv-1',
        filePath: '/tmp/plan.md',
      }).next,
    ).toEqual({
      kind: 'read-plan-file',
      filePath: '/tmp/plan.md',
    });
  });

  it('builds an execution dispatch with plan content', () => {
    expect(
      buildPlanApprovalExecutionDispatch({
        conversationId: 'conv-1',
        planContent: '# Plan',
      }),
    ).toEqual({
      conversationId: 'conv-1',
      messageText: 'The plan has been approved. Please execute the following plan:\n\n# Plan',
      sessionMode: 'agent',
      executionOverrides: {
        executionMode: 'auto',
        metadata: { planReview: { decision: 'approved' } },
      },
    });
  });

  it('builds a conversation-scoped file read error message', () => {
    expect(
      buildPlanFileReadErrorMessage({
        conversationId: 'conv-1',
        error: new Error('missing file'),
      }),
    ).toEqual({
      type: 'error',
      conversationId: 'conv-1',
      message: 'Failed to read plan file: missing file',
    });

    expect(
      buildPlanFileReadErrorMessage({
        conversationId: 'conv-2',
        error: 'bad',
      }),
    ).toEqual({
      type: 'error',
      conversationId: 'conv-2',
      message: 'Failed to read plan file: Unknown error',
    });
  });
});
