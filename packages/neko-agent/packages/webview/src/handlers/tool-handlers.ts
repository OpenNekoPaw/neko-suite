/**
 * Tool Message Handlers
 *
 * Handles: toolCall, toolResult
 *
 * Uses ContentBlock pattern for sequential rendering:
 * - Each tool call is a separate content block
 * - Tool calls appear in chronological order with text/thinking blocks
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type { BackgroundTask } from '@/components/TaskListView';
import type { ContentBlock, ToolCall, Plan, PlanStep, Message } from '@/components/types';
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
    // Match ## or ### headers as step boundaries
    const headerMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (headerMatch) {
      // Save previous step if exists
      if (currentStep.length > 0) {
        steps.push({
          id: `${planId}-step-${stepIndex}`,
          description: currentStep.join('\n').trim(),
          status: 'pending',
        });
        stepIndex++;
      }
      // Start new step with header as description
      currentStep = [headerMatch[1]];
    } else if (line.trim()) {
      // Add non-empty lines to current step
      currentStep.push(line);
    }
  }

  // Save last step
  if (currentStep.length > 0) {
    steps.push({
      id: `${planId}-step-${stepIndex}`,
      description: currentStep.join('\n').trim(),
      status: 'pending',
    });
  }

  // If no steps parsed (no headers), create single step with entire content
  if (steps.length === 0) {
    steps.push({
      id: `${planId}-step-0`,
      description: markdown.trim(),
      status: 'pending',
    });
  }

  return {
    id: planId,
    title,
    steps,
    status: 'pending',
  };
}

/**
 * Find target message for tool call update
 * Priority: 1) streamingMessageId 2) last streaming assistant message
 *           3) last assistant message AFTER the last user message (current turn only)
 */
function findTargetMessageForToolCall(
  messages: Array<{ id: string; role: string; isStreaming?: boolean }>,
  streamingMessageId: string | null
): number {
  // 1. Try streamingMessageId first
  if (streamingMessageId) {
    const idx = messages.findIndex(msg => msg.id === streamingMessageId);
    if (idx !== -1) return idx;
  }

  // 2. Fallback: find last streaming assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].isStreaming) {
      return i;
    }
  }

  // 3. Final fallback: find last assistant message that is AFTER the last user message
  //    This ensures we only update messages from the current turn, not previous turns
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
 * Handle 'toolCall' message - Tool invocation
 * Creates a tool_call content block for sequential display
 */
const handleToolCall: MessageHandler = (message, context) => {
  // Use messageId from extension if provided for precise targeting
  const targetMessageId = message.messageId || context.streamingMessageIdRef.current;

  logger.info('handleToolCall received:', {
    conversationId: message.conversationId,
    messageId: message.messageId,
    toolName: message.toolName,
    toolCallId: message.toolCallId,
    isCurrentConversation: context.isCurrentConversation(message.conversationId),
    targetMessageId,
  });

  if (context.isCurrentConversation(message.conversationId)) {
    context.setMessages(prev => {
      // First try to find by messageId (precise match)
      let targetIndex = targetMessageId
        ? prev.findIndex(msg => msg.id === targetMessageId)
        : -1;

      // Fallback to old logic only if no messageId provided
      if (targetIndex === -1 && !message.messageId) {
        targetIndex = findTargetMessageForToolCall(prev, context.streamingMessageIdRef.current);
      }

      logger.info(`toolCall targetIndex: ${targetIndex}, using messageId: ${!!message.messageId}`);

      const toolCallId = message.toolCallId || `tool-${Date.now()}`;
      const newToolCall: ToolCall = {
        id: toolCallId,
        name: message.toolName,
        arguments: message.arguments || {},
      };

      // Create a new tool_call content block
      const newBlock: ContentBlock = {
        id: `block-tool-${toolCallId}`,
        type: 'tool_call',
        timestamp: Date.now(),
        toolCall: newToolCall,
      };

      // If no target message found, create a new assistant message for tool calls
      if (targetIndex === -1) {
        logger.info('Creating new assistant message for toolCall');
        // Use messageId from extension if provided
        const newId = message.messageId || Date.now().toString();
        // Update ref so subsequent toolCalls/toolResults can find this message
        context.streamingMessageIdRef.current = newId;
        context.setStreamingMessageId(newId);
        return [
          ...prev,
          {
            id: newId,
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            toolCalls: [newToolCall],
            contentBlocks: [newBlock],
          },
        ];
      }

      // Add tool call to existing message
      return prev.map((msg, idx) =>
        idx === targetIndex
          ? {
              ...msg,
              toolCalls: [...(msg.toolCalls || []), newToolCall],
              contentBlocks: [...(msg.contentBlocks || []), newBlock],
            }
          : msg
      );
    });
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      // First try to find by messageId (precise match)
      let targetIndex = message.messageId
        ? msgs.findIndex(msg => msg.id === message.messageId)
        : -1;

      // Fallback to old logic only if no messageId provided
      if (targetIndex === -1 && !message.messageId) {
        targetIndex = findTargetMessageForToolCall(msgs, streaming.streamingMessageId);
      }

      const toolCallId = message.toolCallId || `tool-${Date.now()}`;
      const newToolCall: ToolCall = {
        id: toolCallId,
        name: message.toolName,
        arguments: message.arguments || {},
      };

      const newBlock: ContentBlock = {
        id: `block-tool-${toolCallId}`,
        type: 'tool_call',
        timestamp: Date.now(),
        toolCall: newToolCall,
      };

      // If no target message found, create a new assistant message
      if (targetIndex === -1) {
        // Use messageId from extension if provided
        const newId = message.messageId || Date.now().toString();
        return {
          messages: [
            ...msgs,
            {
              id: newId,
              role: 'assistant' as const,
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              toolCalls: [newToolCall],
              contentBlocks: [newBlock],
            },
          ],
          streaming: { ...streaming, streamingMessageId: newId },
        };
      }

      return {
        messages: msgs.map((msg, idx) =>
          idx === targetIndex
            ? {
                ...msg,
                toolCalls: [...(msg.toolCalls || []), newToolCall],
                contentBlocks: [...(msg.contentBlocks || []), newBlock],
              }
            : msg
        ),
        streaming,
      };
    });
  }
};

/**
 * Find target message for tool result update
 * Priority: 1) streamingMessageId 2) toolCallId match 3) last assistant message
 */
function findTargetMessageIndex(
  messages: Array<{ id: string; role: string; toolCalls?: Array<{ id: string }>; contentBlocks?: ContentBlock[] }>,
  streamingMessageId: string | null,
  toolCallId?: string
): number {
  // 1. Try streamingMessageId first
  if (streamingMessageId) {
    const idx = messages.findIndex(msg => msg.id === streamingMessageId);
    if (idx !== -1) return idx;
  }

  // 2. Fallback: find by toolCallId (check both toolCalls and contentBlocks)
  if (toolCallId) {
    const idx = messages.findIndex(msg =>
      msg.toolCalls?.some(tc => tc.id === toolCallId) ||
      msg.contentBlocks?.some(b => b.type === 'tool_call' && b.toolCall?.id === toolCallId)
    );
    if (idx !== -1) return idx;
  }

  // 3. Final fallback: find last assistant message with toolCalls
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].toolCalls?.length) {
      return i;
    }
  }

  return -1;
}

/**
 * Handle 'toolResult' message - Tool execution result
 * Updates the corresponding tool_call content block with the result
 */
const handleToolResult: MessageHandler = (message, context) => {
  const resultData = message.data as Record<string, unknown> | undefined;
  // Use messageId from extension if provided for precise targeting
  const targetMessageId = message.messageId || context.streamingMessageIdRef.current;

  // Debug: log tool result data
  logger.info('toolResult received:', {
    success: message.success,
    data: message.data,
    hasBackgroundMode: resultData?.backgroundMode,
    hasTaskId: resultData?.taskId,
    messageId: message.messageId,
    targetMessageId,
    toolCallId: message.toolCallId,
  });

  // 1. Update tool call result in messages (supports current and non-current conversations)
  if (context.isCurrentConversation(message.conversationId)) {
    context.setMessages(prev => {
      // First try to find by messageId (precise match)
      let targetIndex = targetMessageId
        ? prev.findIndex(msg => msg.id === targetMessageId)
        : -1;

      // Fallback to old logic only if no messageId provided
      if (targetIndex === -1 && !message.messageId) {
        targetIndex = findTargetMessageIndex(prev, context.streamingMessageIdRef.current, message.toolCallId);
      }

      if (targetIndex === -1) {
        logger.info('No target message found for toolResult');
        return prev;
      }

      return prev.map((msg, idx) => {
        if (idx !== targetIndex) return msg;

        // Update tool call result - match by toolCallId first, otherwise update the last one
        // Also clear pendingConfirmation when result arrives
        const updatedToolCalls = (msg.toolCalls || []).map((tc, tcIdx) => {
          const isMatch = message.toolCallId
            ? tc.id === message.toolCallId
            : tcIdx === (msg.toolCalls?.length || 0) - 1;
          return isMatch
            ? {
                ...tc,
                pendingConfirmation: false, // Clear confirmation when result arrives
                result: {
                  success: message.success,
                  data: message.data,
                  error: message.error,
                },
              }
            : tc;
        });

        // Update content blocks with tool result
        // Also clear pendingConfirmation when result arrives
        const updatedBlocks = (msg.contentBlocks || []).map(b => {
          if (b.type !== 'tool_call' || !b.toolCall) return b;
          const isMatch = message.toolCallId
            ? b.toolCall.id === message.toolCallId
            : false; // For contentBlocks, always require explicit match

          if (!isMatch && !message.toolCallId) {
            // If no toolCallId specified, update the last tool_call block without result
            const lastToolBlockWithoutResult = [...(msg.contentBlocks || [])]
              .reverse()
              .find(bl => bl.type === 'tool_call' && bl.toolCall && !bl.toolCall.result);
            if (lastToolBlockWithoutResult && b.id === lastToolBlockWithoutResult.id) {
              return {
                ...b,
                toolCall: {
                  ...b.toolCall,
                  pendingConfirmation: false, // Clear confirmation when result arrives
                  result: {
                    success: message.success,
                    data: message.data,
                    error: message.error,
                  },
                },
              };
            }
          }

          return isMatch
            ? {
                ...b,
                toolCall: {
                  ...b.toolCall,
                  pendingConfirmation: false, // Clear confirmation when result arrives
                  result: {
                    success: message.success,
                    data: message.data,
                    error: message.error,
                  },
                },
              }
            : b;
        });

        // Check if background task ID was returned (supports single and batch)
        let backgroundTaskIds = msg.backgroundTaskIds || [];

        if (resultData?.backgroundMode === true) {
          if (resultData?.batchMode === true && Array.isArray(resultData?.taskIds)) {
            backgroundTaskIds = [...backgroundTaskIds, ...(resultData.taskIds as string[])];
          } else if (resultData?.taskId) {
            backgroundTaskIds = [...backgroundTaskIds, resultData.taskId as string];
          }
        }

        // Check if this is an ExitPlanMode tool result - create plan ContentBlock
        let finalBlocks = updatedBlocks;
        if (resultData?.planMode && (resultData.planMode as Record<string, unknown>)?.status === 'awaiting_approval') {
          const planId = `plan-${Date.now()}`;
          const planTitle = (resultData.title as string) || 'Implementation Plan';
          const planContent = (resultData.plan as string) || '';
          const planFilePath = (resultData.filePath as string) || '';

          // Parse markdown into plan steps
          const plan = parsePlanMarkdown(planContent, planId, planTitle);
          // Store file path in plan for later use
          (plan as Plan & { filePath?: string }).filePath = planFilePath;

          // Create plan content block
          const planBlock: ContentBlock = {
            id: `block-plan-${planId}`,
            type: 'plan',
            timestamp: Date.now(),
            plan,
          };

          finalBlocks = [...updatedBlocks, planBlock];

          logger.info('Created plan ContentBlock:', {
            planId,
            title: planTitle,
            stepsCount: plan.steps.length,
            filePath: planFilePath,
          });
        }

        return {
          ...msg,
          toolCalls: updatedToolCalls,
          contentBlocks: finalBlocks,
          backgroundTaskIds: backgroundTaskIds.length > 0 ? backgroundTaskIds : undefined,
        };
      });
    });
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      // First try to find by messageId (precise match)
      let targetIndex = message.messageId
        ? msgs.findIndex(msg => msg.id === message.messageId)
        : -1;

      // Fallback to old logic only if no messageId provided
      if (targetIndex === -1 && !message.messageId) {
        targetIndex = findTargetMessageIndex(msgs, streaming.streamingMessageId, message.toolCallId);
      }

      if (targetIndex === -1) return { messages: msgs, streaming };

      return {
        messages: msgs.map((msg, idx) => {
          if (idx !== targetIndex) return msg;

          const updatedToolCalls = (msg.toolCalls || []).map((tc, tcIdx) => {
            const isMatch = message.toolCallId
              ? tc.id === message.toolCallId
              : tcIdx === (msg.toolCalls?.length || 0) - 1;
            return isMatch
              ? {
                  ...tc,
                  pendingConfirmation: false, // Clear confirmation when result arrives
                  result: {
                    success: message.success,
                    data: message.data,
                    error: message.error,
                  },
                }
              : tc;
          });

          // Update content blocks with tool result
          const updatedBlocks = (msg.contentBlocks || []).map(b => {
            if (b.type !== 'tool_call' || !b.toolCall) return b;
            const isMatch = message.toolCallId ? b.toolCall.id === message.toolCallId : false;
            return isMatch
              ? {
                  ...b,
                  toolCall: {
                    ...b.toolCall,
                    pendingConfirmation: false, // Clear confirmation when result arrives
                    result: {
                      success: message.success,
                      data: message.data,
                      error: message.error,
                    },
                  },
                }
              : b;
          });

          let backgroundTaskIds = msg.backgroundTaskIds || [];
          if (resultData?.backgroundMode === true) {
            if (resultData?.batchMode === true && Array.isArray(resultData?.taskIds)) {
              backgroundTaskIds = [...backgroundTaskIds, ...(resultData.taskIds as string[])];
            } else if (resultData?.taskId) {
              backgroundTaskIds = [...backgroundTaskIds, resultData.taskId as string];
            }
          }

          // Check if this is an ExitPlanMode tool result - create plan ContentBlock
          let finalBlocks = updatedBlocks;
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

            finalBlocks = [...updatedBlocks, planBlock];
          }

          return {
            ...msg,
            toolCalls: updatedToolCalls,
            contentBlocks: finalBlocks,
            backgroundTaskIds: backgroundTaskIds.length > 0 ? backgroundTaskIds : undefined,
          };
        }),
        streaming,
      };
    });
  }

  // 2. Create background task regardless of streamingMessageId (supports streaming and non-streaming)
  if (resultData?.backgroundMode === true && resultData?.taskId) {
    const taskId = resultData.taskId as string;

    // Extract info from resultData (not dependent on streamingMessageId)
    const taskMessage = (resultData.message as string) || '';
    const mediaId = (resultData.mediaId as string) || '';

    // Determine task type based on mediaId or message
    const taskType = mediaId.includes('video') || taskMessage.includes('video')
      ? 'video'
      : 'image';

    // Status mapping
    const statusMap: Record<string, 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'> = {
      pending: 'queued',
      processing: 'processing',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    };
    const rawStatus = (resultData.status as string) || 'pending';
    const mappedStatus = statusMap[rawStatus] || 'queued';

    // Create background task
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

  if (context.isCurrentConversation(message.conversationId)) {
    context.setMessages(prev => {
      // Find message containing this tool call
      const targetIndex = prev.findIndex(msg =>
        msg.toolCalls?.some(tc => tc.id === toolCallId) ||
        msg.contentBlocks?.some(b => b.type === 'tool_call' && b.toolCall?.id === toolCallId)
      );

      if (targetIndex === -1) {
        logger.info('No target message found for toolConfirmation');
        return prev;
      }

      return prev.map((msg, idx) => {
        if (idx !== targetIndex) return msg;

        // Update tool call with confirmation request
        const updatedToolCalls = (msg.toolCalls || []).map(tc =>
          tc.id === toolCallId
            ? {
                ...tc,
                pendingConfirmation: true,
                confirmation: {
                  action: (message.action as string) || '',
                  description: (message.description as string) || '',
                  details: (message.details as Record<string, unknown>) || {},
                },
              }
            : tc
        );

        // Update content blocks
        const updatedBlocks = (msg.contentBlocks || []).map(b => {
          if (b.type !== 'tool_call' || b.toolCall?.id !== toolCallId) return b;
          return {
            ...b,
            toolCall: {
              ...b.toolCall,
              pendingConfirmation: true,
              confirmation: {
                action: (message.action as string) || '',
                description: (message.description as string) || '',
                details: (message.details as Record<string, unknown>) || {},
              },
            },
          };
        });

        return {
          ...msg,
          toolCalls: updatedToolCalls,
          contentBlocks: updatedBlocks,
        };
      });
    });
  } else if (message.conversationId) {
    context.updateNonCurrentConversation(message.conversationId, (msgs, streaming) => {
      const targetIndex = msgs.findIndex(msg =>
        msg.toolCalls?.some(tc => tc.id === toolCallId) ||
        msg.contentBlocks?.some(b => b.type === 'tool_call' && b.toolCall?.id === toolCallId)
      );

      if (targetIndex === -1) return { messages: msgs, streaming };

      return {
        messages: msgs.map((msg, idx) => {
          if (idx !== targetIndex) return msg;

          const updatedToolCalls = (msg.toolCalls || []).map(tc =>
            tc.id === toolCallId
              ? {
                  ...tc,
                  pendingConfirmation: true,
                  confirmation: {
                    action: (message.action as string) || '',
                    description: (message.description as string) || '',
                    details: (message.details as Record<string, unknown>) || {},
                  },
                }
              : tc
          );

          const updatedBlocks = (msg.contentBlocks || []).map(b => {
            if (b.type !== 'tool_call' || b.toolCall?.id !== toolCallId) return b;
            return {
              ...b,
              toolCall: {
                ...b.toolCall,
                pendingConfirmation: true,
                confirmation: {
                  action: (message.action as string) || '',
                  description: (message.description as string) || '',
                  details: (message.details as Record<string, unknown>) || {},
                },
              },
            };
          });

          return {
            ...msg,
            toolCalls: updatedToolCalls,
            contentBlocks: updatedBlocks,
          };
        }),
        streaming,
      };
    });
  }
};

/**
 * Handle plan step status update from Extension
 * Updates the step status in the plan ContentBlock
 */
const handlePlanStepStatusUpdate: MessageHandler = (message, context) => {
  const { planId, stepId, status, newDescription, conversationId } = message;

  // Skip if not for current conversation
  if (conversationId && !context.isCurrentConversation(conversationId)) {
    // Update non-current conversation
    context.updateNonCurrentConversation(conversationId, (msgs, streaming) => {
      const updatedMessages = updatePlanStepInMessages(msgs, planId, stepId, status, newDescription);
      return { messages: updatedMessages, streaming };
    });
    return;
  }

  // Update current conversation
  context.setMessages(prev => updatePlanStepInMessages(prev, planId, stepId, status, newDescription));
};

/**
 * Handle overall plan status update from Extension
 * Updates the plan status in the plan ContentBlock
 */
const handlePlanStatusUpdate: MessageHandler = (message, context) => {
  const { planId, status, conversationId } = message;

  // Skip if not for current conversation
  if (conversationId && !context.isCurrentConversation(conversationId)) {
    context.updateNonCurrentConversation(conversationId, (msgs, streaming) => {
      const updatedMessages = updatePlanStatusInMessages(msgs, planId, status);
      return { messages: updatedMessages, streaming };
    });
    return;
  }

  // Update current conversation
  context.setMessages(prev => updatePlanStatusInMessages(prev, planId, status));
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
