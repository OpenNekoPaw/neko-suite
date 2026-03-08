/**
 * Tool Message Handlers
 *
 * Handles: toolCall, toolResult, toolConfirmation, planStepStatusUpdate, planStatusUpdate
 *
 * Uses ContentBlock as the single source of truth for tool call data.
 * toolCalls[] is auto-derived from contentBlocks[] for backward compatibility.
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { ContentBlock, ToolCall, Plan, PlanStep, Message } from '@/components/types';
import { updateConversation } from './message-updater';
import {
  deriveToolCalls,
  addToolCallBlock,
  updateToolCallInBlocks,
  updateLastPendingToolCall,
} from '../utils/message-helpers';
import { getLogger } from '../utils/logger';

const logger = getLogger('ToolHandlers');

/**
 * Parse plan markdown content into Plan object
 * Extracts sections starting with ## or ### as steps
 */
function parsePlanMarkdown(markdown: string, planId: string, title: string): Plan {
  const lines = markdown.split('\n');
  const steps: PlanStep[] = [];
  let currentStep: string[] = [];
  let stepIndex = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headerMatch) {
      if (currentStep.length > 0) {
        steps.push({
          id: `${planId}-step-${stepIndex}`,
          description: currentStep.join('\n').trim(),
          status: 'pending',
        });
        stepIndex++;
      }
      currentStep = [headerMatch[1]];
    } else if (line.trim()) {
      currentStep.push(line);
    }
  }

  if (currentStep.length > 0) {
    steps.push({
      id: `${planId}-step-${stepIndex}`,
      description: currentStep.join('\n').trim(),
      status: 'pending',
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: `${planId}-step-0`,
      description: markdown.trim(),
      status: 'pending',
    });
  }

  return { id: planId, title, steps, status: 'pending' };
}

/**
 * Find target message for tool call update
 * Priority: 1) streamingMessageId 2) last streaming assistant 3) last assistant in current turn
 */
function findTargetMessageForToolCall(
  messages: Array<{ id: string; role: string; isStreaming?: boolean }>,
  streamingMessageId: string | null
): number {
  if (streamingMessageId) {
    const idx = messages.findIndex(msg => msg.id === streamingMessageId);
    if (idx !== -1) return idx;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].isStreaming) {
      return i;
    }
  }

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && i > lastUserIndex) {
      return i;
    }
  }

  return -1;
}

/**
 * Find target message for tool result update
 * Priority: 1) streamingMessageId 2) toolCallId match 3) last assistant with toolCalls
 */
function findTargetMessageIndex(
  messages: Array<{ id: string; role: string; toolCalls?: Array<{ id: string }>; contentBlocks?: ContentBlock[] }>,
  streamingMessageId: string | null,
  toolCallId?: string
): number {
  if (streamingMessageId) {
    const idx = messages.findIndex(msg => msg.id === streamingMessageId);
    if (idx !== -1) return idx;
  }

  if (toolCallId) {
    const idx = messages.findIndex(msg =>
      msg.contentBlocks?.some(b => b.type === 'tool_call' && b.toolCall?.id === toolCallId) ||
      msg.toolCalls?.some(tc => tc.id === toolCallId)
    );
    if (idx !== -1) return idx;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' &&
        (messages[i].contentBlocks?.some(b => b.type === 'tool_call') || messages[i].toolCalls?.length)) {
      return i;
    }
  }

  return -1;
}

/**
 * Handle 'toolCall' message - Tool invocation
 * Creates a tool_call content block; toolCalls[] is auto-derived
 */
const handleToolCall: MessageHandler = (message, context) => {
  logger.info('handleToolCall received:', {
    conversationId: message.conversationId,
    messageId: message.messageId,
    toolName: message.toolName,
    toolCallId: message.toolCallId,
    isCurrentConversation: context.isCurrentConversation(message.conversationId),
  });

  const toolCallId = message.toolCallId || `tool-${Date.now()}`;
  const newToolCall: ToolCall = {
    id: toolCallId,
    name: message.toolName,
    arguments: message.arguments || {},
  };

  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const targetMessageId = message.messageId || streamingId;
    let targetIndex = targetMessageId
      ? msgs.findIndex(msg => msg.id === targetMessageId)
      : -1;

    if (targetIndex === -1 && !message.messageId) {
      targetIndex = findTargetMessageForToolCall(msgs, streamingId);
    }

    logger.info(`toolCall targetIndex: ${targetIndex}, using messageId: ${!!message.messageId}`);

    // No target found - create new assistant message
    if (targetIndex === -1) {
      logger.info('Creating new assistant message for toolCall');
      const newId = message.messageId || Date.now().toString();
      const blocks = addToolCallBlock([], newToolCall);
      return {
        messages: [
          ...msgs,
          {
            id: newId,
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            contentBlocks: blocks,
            toolCalls: deriveToolCalls(blocks),
          },
        ],
        streamingMessageId: newId,
      };
    }

    // Add to existing message
    return {
      messages: msgs.map((msg, idx) => {
        if (idx !== targetIndex) return msg;
        const updatedBlocks = addToolCallBlock(msg.contentBlocks || [], newToolCall);
        return {
          ...msg,
          contentBlocks: updatedBlocks,
          toolCalls: deriveToolCalls(updatedBlocks),
        };
      }),
    };
  });
};

/**
 * Handle 'toolResult' message - Tool execution result
 * Updates the corresponding tool_call content block; toolCalls[] is auto-derived
 */
const handleToolResult: MessageHandler = (message, context) => {
  const resultData = message.data as Record<string, unknown> | undefined;

  logger.info('toolResult received:', {
    success: message.success,
    data: message.data,
    hasBackgroundMode: resultData?.backgroundMode,
    hasTaskId: resultData?.taskId,
    messageId: message.messageId,
    toolCallId: message.toolCallId,
  });

  const toolResult = {
    success: message.success,
    data: message.data,
    error: message.error,
  };

  // 1. Update tool call result in messages
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const targetMessageId = message.messageId || streamingId;
    let targetIndex = targetMessageId
      ? msgs.findIndex(msg => msg.id === targetMessageId)
      : -1;

    if (targetIndex === -1 && !message.messageId) {
      targetIndex = findTargetMessageIndex(msgs, streamingId, message.toolCallId);
    }

    if (targetIndex === -1) {
      logger.info('No target message found for toolResult');
      return { messages: msgs };
    }

    return {
      messages: msgs.map((msg, idx) => {
        if (idx !== targetIndex) return msg;

        // Update tool call in contentBlocks (single source of truth)
        const toolCallUpdater = (tc: ToolCall): ToolCall => ({
          ...tc,
          pendingConfirmation: false,
          result: toolResult,
        });

        let updatedBlocks: ContentBlock[];
        if (message.toolCallId) {
          updatedBlocks = updateToolCallInBlocks(msg.contentBlocks || [], message.toolCallId, toolCallUpdater);
        } else {
          updatedBlocks = updateLastPendingToolCall(msg.contentBlocks || [], toolCallUpdater);
        }

        // Handle background task IDs
        let backgroundTaskIds = msg.backgroundTaskIds || [];
        if (resultData?.backgroundMode === true) {
          if (resultData?.batchMode === true && Array.isArray(resultData?.taskIds)) {
            backgroundTaskIds = [...backgroundTaskIds, ...(resultData.taskIds as string[])];
          } else if (resultData?.taskId) {
            backgroundTaskIds = [...backgroundTaskIds, resultData.taskId as string];
          }
        }

        // Handle ExitPlanMode tool result - create plan ContentBlock
        if (resultData?.planMode && (resultData.planMode as Record<string, unknown>)?.status === 'awaiting_approval') {
          const planId = `plan-${Date.now()}`;
          const planTitle = (resultData.title as string) || 'Implementation Plan';
          const planContent = (resultData.plan as string) || '';
          const planFilePath = (resultData.filePath as string) || '';

          const plan = parsePlanMarkdown(planContent, planId, planTitle);
          (plan as Plan & { filePath?: string }).filePath = planFilePath;

          const planBlock: ContentBlock = {
            id: `block-plan-${planId}`,
            type: 'plan',
            timestamp: Date.now(),
            plan,
          };

          updatedBlocks = [...updatedBlocks, planBlock];

          logger.info('Created plan ContentBlock:', {
            planId,
            title: planTitle,
            stepsCount: plan.steps.length,
            filePath: planFilePath,
          });
        }

        return {
          ...msg,
          contentBlocks: updatedBlocks,
          toolCalls: deriveToolCalls(updatedBlocks),
          backgroundTaskIds: backgroundTaskIds.length > 0 ? backgroundTaskIds : undefined,
        };
      }),
    };
  });

  // 2. Create background task (independent of message update)
  if (resultData?.backgroundMode === true && resultData?.taskId) {
    const taskId = resultData.taskId as string;
    const taskMessage = (resultData.message as string) || '';
    const mediaId = (resultData.mediaId as string) || '';

    const taskType = mediaId.includes('video') || taskMessage.includes('video')
      ? 'video'
      : 'image';

    const statusMap: Record<string, 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'> = {
      pending: 'queued',
      processing: 'processing',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    };
    const rawStatus = (resultData.status as string) || 'pending';
    const mappedStatus = statusMap[rawStatus] || 'queued';

    const newTask: BackgroundTask = {
      id: taskId,
      type: taskType as 'image' | 'video',
      name: taskMessage.slice(0, 50) || `${taskType} generation`,
      prompt: taskMessage,
      providerId: (resultData.routedTo as Record<string, unknown>)?.provider as string || 'unknown',
      providerName: (resultData.routedTo as Record<string, unknown>)?.provider as string || 'AI Provider',
      status: mappedStatus,
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    logger.info('Creating background task:', newTask);

    context.setBackgroundTasks(prevTasks => {
      if (prevTasks.some(t => t.id === taskId)) {
        logger.info(`Task already exists, skipping: ${taskId}`);
        return prevTasks;
      }
      logger.info(`Added task to list, total: ${prevTasks.length + 1}`);
      return [newTask, ...prevTasks];
    });
  }
};

/**
 * Handle 'toolConfirmation' message - Tool requires user confirmation (ask mode)
 * Updates the corresponding tool_call to show confirmation UI
 */
const handleToolConfirmation: MessageHandler = (message, context) => {
  const toolCallId = message.toolCallId as string;

  logger.info('toolConfirmation received:', {
    conversationId: message.conversationId,
    toolCallId,
    toolName: message.toolName,
    action: message.action,
  });

  const confirmationData = {
    action: (message.action as string) || '',
    description: (message.description as string) || '',
    details: (message.details as Record<string, unknown>) || {},
  };

  updateConversation(context, message.conversationId, (msgs) => {
    const targetIndex = msgs.findIndex(msg =>
      msg.contentBlocks?.some(b => b.type === 'tool_call' && b.toolCall?.id === toolCallId) ||
      msg.toolCalls?.some(tc => tc.id === toolCallId)
    );

    if (targetIndex === -1) {
      logger.info('No target message found for toolConfirmation');
      return { messages: msgs };
    }

    return {
      messages: msgs.map((msg, idx) => {
        if (idx !== targetIndex) return msg;

        const updatedBlocks = updateToolCallInBlocks(msg.contentBlocks || [], toolCallId, tc => ({
          ...tc,
          pendingConfirmation: true,
          confirmation: confirmationData,
        }));

        return {
          ...msg,
          contentBlocks: updatedBlocks,
          toolCalls: deriveToolCalls(updatedBlocks),
        };
      }),
    };
  });
};

/**
 * Handle plan step status update from Extension
 */
const handlePlanStepStatusUpdate: MessageHandler = (message, context) => {
  const { planId, stepId, status, newDescription, conversationId } = message;

  updateConversation(context, conversationId, (msgs) => ({
    messages: updatePlanStepInMessages(msgs, planId, stepId, status, newDescription),
  }));
};

/**
 * Handle overall plan status update from Extension
 */
const handlePlanStatusUpdate: MessageHandler = (message, context) => {
  const { planId, status, conversationId } = message;

  updateConversation(context, conversationId, (msgs) => ({
    messages: updatePlanStatusInMessages(msgs, planId, status),
  }));
};

/**
 * Helper: Update a plan step in messages
 */
function updatePlanStepInMessages(
  messages: Message[],
  planId: string,
  stepId: string,
  status: string,
  newDescription?: string
): Message[] {
  return messages.map(msg => {
    if (!msg.contentBlocks) return msg;

    const updatedBlocks = msg.contentBlocks.map(block => {
      if (block.type !== 'plan' || !block.plan) return block;

      const plan = block.plan as Plan;
      if (plan.id !== planId) return block;

      const updatedSteps = plan.steps.map(step => {
        if (step.id !== stepId) return step;
        return {
          ...step,
          status: status as PlanStep['status'],
          ...(newDescription && { description: newDescription }),
        };
      });

      return {
        ...block,
        plan: { ...plan, steps: updatedSteps },
      };
    });

    return { ...msg, contentBlocks: updatedBlocks };
  });
}

/**
 * Helper: Update plan overall status in messages
 */
function updatePlanStatusInMessages(
  messages: Message[],
  planId: string,
  status: string
): Message[] {
  return messages.map(msg => {
    if (!msg.contentBlocks) return msg;

    const updatedBlocks = msg.contentBlocks.map(block => {
      if (block.type !== 'plan' || !block.plan) return block;

      const plan = block.plan as Plan;
      if (plan.id !== planId) return block;

      return {
        ...block,
        plan: { ...plan, status: status as Plan['status'] },
      };
    });

    return { ...msg, contentBlocks: updatedBlocks };
  });
}

/**
 * All tool handler registrations
 */
export const toolHandlers: HandlerRegistration[] = [
  { type: 'toolCall', handler: handleToolCall },
  { type: 'toolResult', handler: handleToolResult },
  { type: 'toolConfirmation', handler: handleToolConfirmation },
  { type: 'planStepStatusUpdate', handler: handlePlanStepStatusUpdate },
  { type: 'planStatusUpdate', handler: handlePlanStatusUpdate },
];
