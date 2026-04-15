/**
 * Task Message Handlers
 *
 * Handles: tasksUpdated, taskCreated, taskUpdated, taskRemoved
 */

import type { MessageHandler, HandlerRegistration } from './types';
import type {
  TasksUpdatedMessage,
  TaskCreatedMessage,
  TaskUpdatedMessage,
  TaskRemovedMessage,
} from './messages';
import { getLogger } from '../utils/logger';

const logger = getLogger('TaskHandlers');

/**
 * Handle 'tasksUpdated' message - Background tasks list updated
 */
const handleTasksUpdated: MessageHandler = (message: TasksUpdatedMessage, context) => {
  context.setBackgroundTasks(message.tasks || []);
};

/**
 * Handle 'taskCreated' message - New background task created
 */
const handleTaskCreated: MessageHandler = (message: TaskCreatedMessage, context) => {
  context.setBackgroundTasks((prev) => [message.task, ...prev]);
};

/**
 * Handle 'taskUpdated' message - Background task updated
 */
const handleTaskUpdated: MessageHandler = (message: TaskUpdatedMessage, context) => {
  logger.info('Task updated:', message.task);
  context.setBackgroundTasks((prev) =>
    prev.map((t) =>
      t.id === message.task.id
        ? { ...t, ...message.task } // Merge to preserve existing fields
        : t,
    ),
  );
};

/**
 * Handle 'taskRemoved' message - Background task removed
 */
const handleTaskRemoved: MessageHandler = (message: TaskRemovedMessage, context) => {
  context.setBackgroundTasks((prev) => prev.filter((t) => t.id !== message.taskId));
};

/**
 * All task handler registrations
 */
export const taskHandlers: HandlerRegistration[] = [
  { type: 'tasksUpdated', handler: handleTasksUpdated },
  { type: 'taskCreated', handler: handleTaskCreated },
  { type: 'taskUpdated', handler: handleTaskUpdated },
  { type: 'taskRemoved', handler: handleTaskRemoved },
];
