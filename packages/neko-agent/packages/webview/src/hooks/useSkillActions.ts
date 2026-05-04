/**
 * useSkillActions - Active skill management
 *
 * Handles active skill clear with conversation binding check.
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { VSCodeMessages } from '@/components/hooks/useVSCode';
import type { BoundActiveSkillIndicator } from '@/handlers';

export interface UseSkillActionsProps {
  activeConversationId: string | null;
  activeSkill: BoundActiveSkillIndicator | null;
  setActiveSkill: Dispatch<SetStateAction<BoundActiveSkillIndicator | null>>;
}

export interface UseSkillActionsReturn {
  handleClearActiveSkill: () => void;
}

export function useSkillActions({
  activeConversationId,
  activeSkill,
  setActiveSkill,
}: UseSkillActionsProps): UseSkillActionsReturn {
  const handleClearActiveSkill = useCallback(() => {
    if (activeSkill && activeSkill.conversationId === activeConversationId) {
      setActiveSkill(null);
      VSCodeMessages.clearActiveSkill(activeConversationId);
    }
  }, [activeSkill, activeConversationId, setActiveSkill]);

  return { handleClearActiveSkill };
}
