import type { MessageBundle } from '@neko/shared';

export const tasks = {
  'tasks.title': 'Tasks',
  'tasks.column.task': 'Task',
  'tasks.column.source': 'Source',
  'tasks.column.type': 'Type',
  'tasks.column.status': 'Status',
  'tasks.column.progress': 'Progress',
  'tasks.column.started': 'Started',
  'tasks.column.actions': 'Actions',
  'tasks.empty': 'No active tasks.',
  'tasks.lane.running': 'Running ({count})',
  'tasks.lane.queued': 'Queued ({count})',
  'tasks.lane.completed': 'Completed ({count})',
} as const satisfies MessageBundle;
