/**
 * usePlanActions - Plan review action callbacks
 *
 * Wraps VSCodeMessages plan review calls with activeConversationId binding.
 */

import { useCallback } from 'react';
import { VSCodeMessages } from '@/messages';

export interface UsePlanActionsProps {
  activeConversationId: string | null;
}

export interface UsePlanActionsReturn {
  handleApprovePlanStep: (planId: string, stepId: string) => void;
  handleRejectPlanStep: (planId: string, stepId: string) => void;
  handleModifyPlanStep: (planId: string, stepId: string, newDescription: string) => void;
  handleApproveAllPlanSteps: (planId: string) => void;
  handleRejectAllPlanSteps: (planId: string) => void;
}

export function usePlanActions({
  activeConversationId,
}: UsePlanActionsProps): UsePlanActionsReturn {
  const handleApprovePlanStep = useCallback(
    (planId: string, stepId: string) => {
      if (!activeConversationId) return;
      VSCodeMessages.approvePlanStep(planId, stepId, activeConversationId);
    },
    [activeConversationId],
  );

  const handleRejectPlanStep = useCallback(
    (planId: string, stepId: string) => {
      if (!activeConversationId) return;
      VSCodeMessages.rejectPlanStep(planId, stepId, activeConversationId);
    },
    [activeConversationId],
  );

  const handleModifyPlanStep = useCallback(
    (planId: string, stepId: string, newDescription: string) => {
      if (!activeConversationId) return;
      VSCodeMessages.modifyPlanStep(planId, stepId, newDescription, activeConversationId);
    },
    [activeConversationId],
  );

  const handleApproveAllPlanSteps = useCallback(
    (planId: string) => {
      if (!activeConversationId) return;
      VSCodeMessages.approveAllPlanSteps(planId, activeConversationId);
    },
    [activeConversationId],
  );

  const handleRejectAllPlanSteps = useCallback(
    (planId: string) => {
      if (!activeConversationId) return;
      VSCodeMessages.rejectAllPlanSteps(planId, activeConversationId);
    },
    [activeConversationId],
  );

  return {
    handleApprovePlanStep,
    handleRejectPlanStep,
    handleModifyPlanStep,
    handleApproveAllPlanSteps,
    handleRejectAllPlanSteps,
  };
}
