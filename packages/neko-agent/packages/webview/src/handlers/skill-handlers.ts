/**
 * Skill Message Handlers
 *
 * Handles: skillsList, skillInjection
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { SkillsListMessage, SkillInjectionMessage } from './messages';
import {
  projectInputSkillSummaries,
  projectSkillInjectionState,
} from '@/presenters/skill-presenter';
import { getLogger } from '../utils/logger';

const logger = getLogger('SkillHandlers');

/**
 * Handle 'skillsList' - Available skills from extension
 */
const handleSkillsList: MessageHandler<'skillsList'> = (message: SkillsListMessage, context) => {
  context.setSkills(projectInputSkillSummaries(message.skills));
};

/**
 * Handle 'skillInjection' - Skill applied, show indicator
 */
const handleSkillInjection: MessageHandler<'skillInjection'> = (
  message: SkillInjectionMessage,
  context,
) => {
  const conversationId = message.conversationId;
  if (!conversationId) {
    logger.warn('Ignoring skillInjection without conversationId', { skillName: message.skillName });
    return;
  }

  const activeSkillProjection = projectSkillInjectionState({
    conversationId,
    skillName: message.skillName,
    allowedTools: message.allowedTools,
  });
  context.setActiveSkill(activeSkillProjection.activeSkill);
};

export const skillHandlers: HandlerRegistration[] = [
  defineHandler('skillsList', handleSkillsList),
  defineHandler('skillInjection', handleSkillInjection),
];
