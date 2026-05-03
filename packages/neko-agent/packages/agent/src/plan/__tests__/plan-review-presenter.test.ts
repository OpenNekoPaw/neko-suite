import { describe, expect, it } from 'vitest';
import {
  buildPlanRejectionFeedbackStreamMessage,
  buildPlanStatusUpdateMessage,
  buildPromptModeChangedMessage,
  projectPlanStepActionReview,
  projectPlanStepModificationReview,
} from '../plan-review-presenter';

describe('plan review presenter', () => {
  it('builds prompt mode and plan status messages', () => {
    expect(
      buildPromptModeChangedMessage({
        conversationId: 'conv-1',
        mode: 'plan',
        isPlanMode: true,
      }),
    ).toEqual({
      type: 'promptModeChanged',
      conversationId: 'conv-1',
      mode: 'plan',
      isPlanMode: true,
    });

    expect(
      buildPlanStatusUpdateMessage({
        planId: 'plan-1',
        conversationId: 'conv-1',
        status: 'approved',
      }),
    ).toEqual({
      type: 'planStatusUpdate',
      planId: 'plan-1',
      conversationId: 'conv-1',
      status: 'approved',
    });
  });

  it('projects plan step approval and rejection reviews', () => {
    expect(
      projectPlanStepActionReview({
        planId: 'plan-1',
        stepId: 'step-1',
        conversationId: 'conv-1',
        action: 'approve',
      }),
    ).toEqual({
      messageUpdate: { status: 'approved' },
      webviewMessage: {
        type: 'planStepStatusUpdate',
        planId: 'plan-1',
        stepId: 'step-1',
        conversationId: 'conv-1',
        status: 'approved',
      },
    });

    expect(
      projectPlanStepActionReview({
        planId: 'plan-1',
        stepId: 'step-2',
        conversationId: 'conv-1',
        action: 'reject',
      }).messageUpdate,
    ).toEqual({ status: 'rejected' });
  });

  it('projects plan step modification and rejection feedback', () => {
    expect(
      projectPlanStepModificationReview({
        planId: 'plan-1',
        stepId: 'step-1',
        conversationId: 'conv-1',
        newDescription: 'Updated step',
      }),
    ).toEqual({
      messageUpdate: { status: 'modified', description: 'Updated step' },
      webviewMessage: {
        type: 'planStepStatusUpdate',
        planId: 'plan-1',
        stepId: 'step-1',
        conversationId: 'conv-1',
        status: 'modified',
        newDescription: 'Updated step',
      },
    });

    expect(buildPlanRejectionFeedbackStreamMessage('conv-1')).toEqual({
      type: 'streamText',
      conversationId: 'conv-1',
      content: expect.stringContaining('Plan rejected'),
    });
  });
});
