/**
 * Skill Message Handlers
 *
 * Handles: skillsList, skillInjection
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { SkillsListMessage, SkillInjectionMessage } from './messages';

/**
 * Handle 'skillsList' - Available skills from extension
 */
const handleSkillsList: MessageHandler = (message: SkillsListMessage, context) => {
  context.setSkills(message.skills || []);
};

/**
 * Handle 'skillInjection' - Skill applied, show indicator
 */
const handleSkillInjection: MessageHandler = (message: SkillInjectionMessage, context) => {
  const conversationId = message.conversationId || context.activeConversationIdRef.current || '';
  context.setActiveSkill({
    skillName: message.skillName,
    allowedTools: message.allowedTools,
    conversationId,
  });
  // Clear any pending confirmation for this conversation
  context.setPendingSkillConfirm((prev) => {
    if (prev && prev.conversationId === conversationId) {
      return null;
    }
    return prev;
  });
};

export const skillHandlers: HandlerRegistration[] = [
  { type: 'skillsList', handler: handleSkillsList },
  { type: 'skillInjection', handler: handleSkillInjection },
];
