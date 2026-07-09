/**
 * usePlanActions - Plan review action callbacks
 *
 * Wraps AgentHostMessages plan review calls with activeConversationId binding.
 */

import { useCallback } from 'react';
import { AgentHostMessages } from '@/messages';

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
      AgentHostMessages.approvePlanStep(planId, stepId, activeConversationId);
    },
    [activeConversationId],
  );

  const handleRejectPlanStep = useCallback(
    (planId: string, stepId: string) => {
      if (!activeConversationId) return;
      AgentHostMessages.rejectPlanStep(planId, stepId, activeConversationId);
    },
    [activeConversationId],
  );

  const handleModifyPlanStep = useCallback(
    (planId: string, stepId: string, newDescription: string) => {
      if (!activeConversationId) return;
      AgentHostMessages.modifyPlanStep(planId, stepId, newDescription, activeConversationId);
    },
    [activeConversationId],
  );

  const handleApproveAllPlanSteps = useCallback(
    (planId: string) => {
      if (!activeConversationId) return;
      AgentHostMessages.approveAllPlanSteps(planId, activeConversationId);
    },
    [activeConversationId],
  );

  const handleRejectAllPlanSteps = useCallback(
    (planId: string) => {
      if (!activeConversationId) return;
      AgentHostMessages.rejectAllPlanSteps(planId, activeConversationId);
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
