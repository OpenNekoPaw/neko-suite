/**
 * usePlanActions - Plan review action callbacks
 *
 * Wraps VSCodeMessages plan review calls with activeConversationId binding.
 */

import { useCallback } from 'react';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

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

export function usePlanActions({ activeConversationId }: UsePlanActionsProps): UsePlanActionsReturn {
  const convId = activeConversationId || undefined;

  const handleApprovePlanStep = useCallback((planId: string, stepId: string) => {
    VSCodeMessages.approvePlanStep(planId, stepId, convId);
  }, [convId]);

  const handleRejectPlanStep = useCallback((planId: string, stepId: string) => {
    VSCodeMessages.rejectPlanStep(planId, stepId, convId);
  }, [convId]);

  const handleModifyPlanStep = useCallback((planId: string, stepId: string, newDescription: string) => {
    VSCodeMessages.modifyPlanStep(planId, stepId, newDescription, convId);
  }, [convId]);

  const handleApproveAllPlanSteps = useCallback((planId: string) => {
    VSCodeMessages.approveAllPlanSteps(planId, convId);
  }, [convId]);

  const handleRejectAllPlanSteps = useCallback((planId: string) => {
    VSCodeMessages.rejectAllPlanSteps(planId, convId);
  }, [convId]);

  return {
    handleApprovePlanStep,
    handleRejectPlanStep,
    handleModifyPlanStep,
    handleApproveAllPlanSteps,
    handleRejectAllPlanSteps,
  };
}
