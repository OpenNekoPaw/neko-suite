import { describe, expect, it } from 'vitest';
import {
  buildPlanApprovalExecutionMessage,
  buildPlanRejectionFeedbackMessage,
} from '../plan-review-messages';

describe('plan review messages', () => {
  it('builds the approved-plan execution message with optional plan content', () => {
    expect(buildPlanApprovalExecutionMessage('# Plan')).toContain(
      'Please execute the following plan:\n\n# Plan',
    );
    expect(buildPlanApprovalExecutionMessage()).toBe(
      'The plan has been approved. Please proceed with the implementation.',
    );
  });

  it('builds the rejected-plan feedback message', () => {
    expect(buildPlanRejectionFeedbackMessage()).toContain('Plan rejected.');
  });
});
