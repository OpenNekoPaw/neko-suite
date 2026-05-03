import type { ContentBlock, Message, PlanStatus } from '@neko-agent/types';

export interface PlanMessageUpdateResult {
  messages: Message[];
  updated: boolean;
}

export interface PlanStepMessageUpdate {
  status?: PlanStatus;
  description?: string;
}

export function updatePlanStatusInMessages(
  messages: readonly Message[],
  planId: string,
  status: PlanStatus,
): PlanMessageUpdateResult {
  let updated = false;

  const nextMessages = messages.map((message) => {
    if (!message.contentBlocks) return message;

    const contentBlocks = message.contentBlocks.map((block): ContentBlock => {
      if (block.type !== 'plan' || !block.plan || block.plan.id !== planId) {
        return block;
      }

      updated = true;
      return {
        ...block,
        plan: {
          ...block.plan,
          status,
        },
      };
    });

    return {
      ...message,
      contentBlocks,
    };
  });

  return { messages: nextMessages, updated };
}

export function updatePlanStepInMessages(
  messages: readonly Message[],
  planId: string,
  stepId: string,
  update: PlanStepMessageUpdate,
): PlanMessageUpdateResult {
  let updated = false;

  const nextMessages = messages.map((message) => {
    if (!message.contentBlocks) return message;

    const contentBlocks = message.contentBlocks.map((block): ContentBlock => {
      if (block.type !== 'plan' || !block.plan || block.plan.id !== planId) {
        return block;
      }

      const steps = block.plan.steps.map((step) => {
        if (step.id !== stepId) return step;

        updated = true;
        return {
          ...step,
          ...(update.status !== undefined ? { status: update.status } : {}),
          ...(update.description !== undefined ? { description: update.description } : {}),
        };
      });

      return {
        ...block,
        plan: {
          ...block.plan,
          steps,
        },
      };
    });

    return {
      ...message,
      contentBlocks,
    };
  });

  return { messages: nextMessages, updated };
}
