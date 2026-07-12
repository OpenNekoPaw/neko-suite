/**
 * Session Command Handlers
 *
 * Handlers for: new, resume, compact, plan
 */

import type { CommandHandler } from '../types';

/** Handle /new command (extension only). */
export const handleNew: CommandHandler = (_args, context) => {
  context.conversations?.create();

  return {
    handled: true,
    continueExecution: true,
    action: 'newConversation',
    semantic: { family: 'session', result: { kind: 'new-created' } },
  };
};

/** Handle /resume command (extension only). */
export const handleResume: CommandHandler = (_args, context) => {
  const conversations = context.conversations?.list() ?? [];

  return {
    handled: true,
    continueExecution: true,
    action: 'resumeConversation',
    data: {
      conversations: conversations.slice(0, 5).map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
      })),
    },
  };
};

/** Handle /compact command (extension only). */
export const handleCompact: CommandHandler = async (_args, context) => {
  const conversationId = context.conversations?.getActiveId();
  if (conversationId && context.contextManager) {
    await context.contextManager.compress(conversationId);
  }

  return {
    handled: true,
    continueExecution: true,
    action: 'compressContext',
    semantic: { family: 'session', result: { kind: 'compact-started' } },
  };
};

/** Handle /plan command (extension only). */
export const handlePlan: CommandHandler = (_args, context) => {
  const enabled = context.planMode?.toggle() ?? false;

  return {
    handled: true,
    continueExecution: true,
    action: 'togglePlanMode',
    data: { planMode: enabled },
    semantic: { family: 'session', result: { kind: 'plan-changed', enabled } },
  };
};
