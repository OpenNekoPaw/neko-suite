/**
 * Session Command Handlers
 *
 * Handlers for: new, resume, compact, plan
 */

import type { CommandHandler } from '../types';

/**
 * Handle /new command (extension only)
 */
export const handleNew: CommandHandler = (_args, context) => {
  if (context.conversations) {
    context.conversations.create();
  }

  return {
    handled: true,
    continueExecution: true,
    output: 'New conversation created',
    action: 'newConversation',
  };
};

/**
 * Handle /resume command (extension only)
 */
export const handleResume: CommandHandler = (_args, context) => {
  const conversations = context.conversations?.list() ?? [];

  return {
    handled: true,
    continueExecution: true,
    action: 'resumeConversation',
    data: {
      conversations: conversations.slice(0, 5).map((c) => ({
        id: c.id,
        title: c.title,
      })),
    },
  };
};

/**
 * Handle /compact command (extension only)
 */
export const handleCompact: CommandHandler = async (_args, context) => {
  const activeId = context.conversations?.getActiveId();

  if (activeId && context.contextManager) {
    await context.contextManager.compress(activeId);
  }

  return {
    handled: true,
    continueExecution: true,
    output: 'Context compression initiated',
    action: 'compressContext',
  };
};

/**
 * Handle /plan command (extension only)
 */
export const handlePlan: CommandHandler = (_args, context) => {
  let planMode = false;

  if (context.planMode) {
    planMode = context.planMode.toggle();
  }

  return {
    handled: true,
    continueExecution: true,
    output: `Plan mode ${planMode ? 'enabled' : 'disabled'}`,
    action: 'togglePlanMode',
    data: { planMode },
  };
};
