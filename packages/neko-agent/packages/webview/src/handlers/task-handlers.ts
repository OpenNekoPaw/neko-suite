/**
 * Task Message Handlers
 *
 * Handles: tasksUpdated, taskCreated, taskUpdated, taskRemoved
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  TasksUpdatedMessage,
  TaskCreatedMessage,
  TaskUpdatedMessage,
  TaskRemovedMessage,
} from './messages';
import { isTaskWorkItem } from '@/presenters/work-item-projection-presenter';
import {
  removeWorkItemForConversation,
  mergeBackgroundTaskSnapshotForConversation,
  upsertWorkItemsForConversation,
} from '@/presenters/work-item-state-presenter';
import {
  getActiveTimelineForMessage,
  hasActiveTimelineWorkItem,
  rejectActiveTimelineNonTimelineMessage,
} from './timeline-handlers';
import { getLogger } from '../utils/logger';

const logger = getLogger('TaskHandlers');

/**
 * Handle 'tasksUpdated' message - merge task list into a conversation work-item store.
 */
const handleTasksUpdated: MessageHandler<'tasksUpdated'> = (
  message: TasksUpdatedMessage,
  context,
) => {
  const conversationId = message.conversationId;
  if (!conversationId) {
    logger.warn('Ignoring tasksUpdated without conversationId');
    return;
  }

  context.setWorkItemsByConversation((prev) =>
    mergeBackgroundTaskSnapshotForConversation(
      prev,
      conversationId,
      (message.workItems || []).filter(isTaskWorkItem),
    ),
  );
};

/**
 * Handle 'taskCreated' message - New background task created
 */
const handleTaskCreated: MessageHandler<'taskCreated'> = (message: TaskCreatedMessage, context) => {
  const conversationId = message.conversationId;
  if (!conversationId) {
    logger.warn('Ignoring taskCreated without conversationId', message.workItem);
    return;
  }

  const activeTimeline = getActiveTimelineForMessage(context, conversationId, message.messageId);
  if (activeTimeline) {
    if (hasActiveTimelineWorkItem(activeTimeline.items, message.workItem.id)) {
      return;
    }
    rejectActiveTimelineNonTimelineMessage({
      context,
      messageType: message.type,
      reason: 'active timeline task updates must arrive as agentTurnTimeline',
    });
    return;
  }

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [message.workItem]),
  );
};

/**
 * Handle 'taskUpdated' message - Background task updated
 */
const handleTaskUpdated: MessageHandler<'taskUpdated'> = (message: TaskUpdatedMessage, context) => {
  logger.debug('Task updated:', message.workItem);
  const conversationId = message.conversationId;
  if (!conversationId) {
    logger.warn('Ignoring taskUpdated without conversationId', message.workItem);
    return;
  }

  const activeTimeline = getActiveTimelineForMessage(context, conversationId, undefined);
  if (activeTimeline) {
    if (hasActiveTimelineWorkItem(activeTimeline.items, message.workItem.id)) {
      return;
    }
    rejectActiveTimelineNonTimelineMessage({
      context,
      messageType: message.type,
      reason: 'active timeline task updates must arrive as agentTurnTimeline',
    });
    return;
  }

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [message.workItem]),
  );
};

/**
 * Handle 'taskRemoved' message - Background task removed
 */
const handleTaskRemoved: MessageHandler<'taskRemoved'> = (message: TaskRemovedMessage, context) => {
  const conversationId = message.conversationId;
  if (!conversationId) {
    logger.warn('Ignoring taskRemoved without conversationId', { taskId: message.taskId });
    return;
  }

  context.setWorkItemsByConversation((prev) =>
    removeWorkItemForConversation(prev, conversationId, message.taskId),
  );
};

/**
 * All task handler registrations
 */
export const taskHandlers: HandlerRegistration[] = [
  defineHandler('tasksUpdated', handleTasksUpdated),
  defineHandler('taskCreated', handleTaskCreated),
  defineHandler('taskUpdated', handleTaskUpdated),
  defineHandler('taskRemoved', handleTaskRemoved),
];
