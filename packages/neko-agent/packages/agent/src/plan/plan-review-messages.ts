export function buildPlanApprovalExecutionMessage(planContent?: string): string {
  if (planContent !== undefined) {
    return `The plan has been approved. Please execute the following plan:\n\n${planContent}`;
  }

  return 'The plan has been approved. Please proceed with the implementation.';
}

export function buildPlanApprovalExecutionOverrides(): {
  executionMode: 'auto';
  metadata: { planReview: { decision: 'approved' } };
} {
  return {
    executionMode: 'auto',
    metadata: {
      planReview: {
        decision: 'approved',
      },
    },
  };
}

export function buildPlanRejectionFeedbackMessage(): string {
  return '\n\n---\n**Plan rejected.** Please provide more details or a different approach if you would like me to create a new plan.';
}
