/**
 * useSkillActions - Skill confirmation and active skill management
 *
 * Handles skill confirm/decline/clear with conversation binding check.
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { VSCodeMessages, postMessage } from '@/components/hooks/useVSCode';
import type { BoundSkillConfirmRequest, BoundActiveSkillIndicator } from '@/handlers';

export interface UseSkillActionsProps {
  activeConversationId: string | null;
  pendingSkillConfirm: BoundSkillConfirmRequest | null;
  activeSkill: BoundActiveSkillIndicator | null;
  setPendingSkillConfirm: Dispatch<SetStateAction<BoundSkillConfirmRequest | null>>;
  setActiveSkill: Dispatch<SetStateAction<BoundActiveSkillIndicator | null>>;
}

export interface UseSkillActionsReturn {
  handleConfirmSkill: () => void;
  handleDeclineSkill: () => void;
  handleClearActiveSkill: () => void;
}

export function useSkillActions({
  activeConversationId,
  pendingSkillConfirm,
  activeSkill,
  setPendingSkillConfirm,
  setActiveSkill,
}: UseSkillActionsProps): UseSkillActionsReturn {
  const handleConfirmSkill = useCallback(() => {
    if (pendingSkillConfirm && pendingSkillConfirm.conversationId === activeConversationId) {
      VSCodeMessages.confirmSkill(
        pendingSkillConfirm.skillName,
        true,
        pendingSkillConfirm.conversationId,
      );
      setPendingSkillConfirm(null);
    }
  }, [pendingSkillConfirm, activeConversationId, setPendingSkillConfirm]);

  const handleDeclineSkill = useCallback(() => {
    if (pendingSkillConfirm && pendingSkillConfirm.conversationId === activeConversationId) {
      VSCodeMessages.confirmSkill(
        pendingSkillConfirm.skillName,
        false,
        pendingSkillConfirm.conversationId,
      );
      setPendingSkillConfirm(null);
    }
  }, [pendingSkillConfirm, activeConversationId, setPendingSkillConfirm]);

  const handleClearActiveSkill = useCallback(() => {
    if (activeSkill && activeSkill.conversationId === activeConversationId) {
      setActiveSkill(null);
      postMessage({ type: 'clearActiveSkill', conversationId: activeConversationId });
    }
  }, [activeSkill, activeConversationId, setActiveSkill]);

  return { handleConfirmSkill, handleDeclineSkill, handleClearActiveSkill };
}
