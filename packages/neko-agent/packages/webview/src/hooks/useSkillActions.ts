/**
 * useSkillActions - Active skill management
 *
 * Handles active skill clear with conversation binding check.
 */

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { VSCodeMessages } from '@/messages';
import type { BoundActiveSkillIndicator } from '@/handlers';

export interface UseSkillActionsProps {
  activeConversationId: string | null;
  activeSkill: BoundActiveSkillIndicator | null;
  setActiveSkill: Dispatch<SetStateAction<BoundActiveSkillIndicator | null>>;
}

export interface UseSkillActionsReturn {
  handleClearActiveSkill: (recordId?: string) => void;
}

export function useSkillActions({
  activeConversationId,
  activeSkill,
  setActiveSkill,
}: UseSkillActionsProps): UseSkillActionsReturn {
  const handleClearActiveSkill = useCallback(
    (recordId?: string) => {
      if (activeSkill && activeSkill.conversationId === activeConversationId) {
        const remainingRecords = recordId
          ? activeSkill.records?.filter((record) => record.id !== recordId)
          : [];
        setActiveSkill(
          remainingRecords && remainingRecords.length > 0
            ? {
                ...activeSkill,
                skillName: remainingRecords[0]?.skillName ?? activeSkill.skillName,
                records: remainingRecords,
              }
            : null,
        );
        VSCodeMessages.clearActiveSkill(activeConversationId, recordId ? { recordId } : undefined);
      }
    },
    [activeSkill, activeConversationId, setActiveSkill],
  );

  return { handleClearActiveSkill };
}
