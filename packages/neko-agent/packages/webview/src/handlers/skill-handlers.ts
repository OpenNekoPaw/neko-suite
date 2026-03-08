/**
 * Skill Message Handlers
 *
 * Handles: skillsList, skillConfirmRequest, skillInjection, skillCleared
 */

import type { MessageHandler, HandlerRegistration } from './types';

/**
 * Handle 'skillsList' - Available skills from extension
 */
const handleSkillsList: MessageHandler = (message, context) => {
  context.setSkills(message.skills || []);
};

/**
 * Handle 'skillConfirmRequest' - Skill confirmation banner
 */
const handleSkillConfirmRequest: MessageHandler = (message, context) => {
  context.setPendingSkillConfirm({
    skillName: message.skillName,
    skillDescription: message.skillDescription,
    relevance: message.relevance,
    reason: message.reason,
    conversationId: message.conversationId || context.activeConversationIdRef.current || '',
  });
};

/**
 * Handle 'skillInjection' - Skill applied, show indicator
 */
const handleSkillInjection: MessageHandler = (message, context) => {
  const conversationId = message.conversationId || context.activeConversationIdRef.current || '';
  context.setActiveSkill({
    skillName: message.skillName,
    allowedTools: message.allowedTools,
    conversationId,
  });
  // Clear any pending confirmation for this conversation
  context.setPendingSkillConfirm(prev => {
    if (prev && prev.conversationId === conversationId) {
      return null;
    }
    return prev;
  });
};

/**
 * Handle 'skillCleared' - Skill cleared for a conversation
 */
const handleSkillCleared: MessageHandler = (message, context) => {
  const conversationId = message.conversationId || context.activeConversationIdRef.current || '';
  context.setActiveSkill(prev => {
    if (prev && prev.conversationId === conversationId) {
      return null;
    }
    return prev;
  });
};

export const skillHandlers: HandlerRegistration[] = [
  { type: 'skillsList', handler: handleSkillsList },
  { type: 'skillConfirmRequest', handler: handleSkillConfirmRequest },
  { type: 'skillInjection', handler: handleSkillInjection },
  { type: 'skillCleared', handler: handleSkillCleared },
];
