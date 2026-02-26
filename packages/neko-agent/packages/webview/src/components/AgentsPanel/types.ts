/**
 * AgentsPanel Type Definitions
 *
 * Types for the global task control center component.
 */

import type { BackgroundTask, TaskStatus, TaskType } from '@/components/TaskListView';

// Re-export for convenience
export type { BackgroundTask, TaskStatus, TaskType };

/**
 * Agent execution phase
 */
export type AgentPhase =
  | 'idle'           // Waiting for task
  | 'thinking'       // Analyzing/planning
  | 'executing'      // Running tools
  | 'waiting'        // Waiting for user input
  | 'paused'         // User paused
  | 'completed'      // Finished
  | 'failed';        // Error occurred

/**
 * Parallel task group - multiple tasks running together
 */
export interface ParallelTaskGroup {
  id: string;
  name: string;
  taskIds: string[];
  overallProgress: number;
  completedCount: number;
  failedCount: number;
  runningCount: number;
  queuedCount: number;
  startTime: number;
  eta?: number; // Estimated time remaining in seconds
}

/**
 * Task statistics for the current day
 */
export interface TaskStatistics {
  todayCompleted: number;
  todayFailed: number;
  todayCancelled: number;
  totalDuration: number; // Total execution time in ms
  averageDuration: number; // Average task duration in ms
  successRate: number; // 0-100
}

/**
 * Queue management item with priority
 */
export interface QueuedTaskItem extends BackgroundTask {
  priority: number; // Higher = more urgent
  queuePosition: number;
  estimatedStartTime?: number;
}

/**
 * AgentsPanel props
 */
export interface AgentsPanelProps {
  // Task data
  tasks: BackgroundTask[];

  // Parallel task groups
  parallelGroups?: ParallelTaskGroup[];

  // Statistics (optional, calculated if not provided)
  statistics?: TaskStatistics;

  // Callbacks
  onCancelTask: (taskId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onViewResult: (taskId: string) => void;
  onClearCompleted: () => void;

  // Queue management
  onReorderQueue?: (taskId: string, newPriority: number) => void;
  onPauseTask?: (taskId: string) => void;
  onResumeTask?: (taskId: string) => void;

  // Batch operations
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onCancelAll?: () => void;
}

/**
 * Active tasks dashboard props
 */
export interface ActiveTasksDashboardProps {
  tasks: BackgroundTask[];
  parallelGroups?: ParallelTaskGroup[];
  onCancelTask: (taskId: string) => void;
  onViewResult: (taskId: string) => void;
}

/**
 * Queued task list props
 */
export interface QueuedTaskListProps {
  tasks: BackgroundTask[];
  onCancelTask: (taskId: string) => void;
  onReorderQueue?: (taskId: string, newPriority: number) => void;
}

/**
 * Task statistics panel props
 */
export interface TaskStatisticsPanelProps {
  statistics: TaskStatistics;
  completedTasks: BackgroundTask[];
}

/**
 * Quick actions props
 */
export interface QuickActionsProps {
  hasActiveTasks: boolean;
  hasQueuedTasks: boolean;
  hasPausedTasks: boolean;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onCancelAll?: () => void;
  onClearCompleted?: () => void;
}

/**
 * Calculate statistics from tasks
 */
export function calculateStatistics(tasks: BackgroundTask[]): TaskStatistics {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  const todayTasks = tasks.filter(t => new Date(t.createdAt).getTime() >= todayStart);

  const completed = todayTasks.filter(t => t.status === 'completed');
  const failed = todayTasks.filter(t => t.status === 'failed');
  const cancelled = todayTasks.filter(t => t.status === 'cancelled');

  // Calculate total duration from completed tasks
  let totalDuration = 0;
  for (const task of completed) {
    const start = new Date(task.createdAt).getTime();
    const end = new Date(task.updatedAt).getTime();
    totalDuration += end - start;
  }

  const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0;
  const total = completed.length + failed.length;
  const successRate = total > 0 ? (completed.length / total) * 100 : 0;

  return {
    todayCompleted: completed.length,
    todayFailed: failed.length,
    todayCancelled: cancelled.length,
    totalDuration,
    averageDuration: avgDuration,
    successRate,
  };
}

/**
 * Group tasks by status
 */
export function groupTasksByStatus(tasks: BackgroundTask[]) {
  const active: BackgroundTask[] = [];
  const queued: BackgroundTask[] = [];
  const completed: BackgroundTask[] = [];
  const failed: BackgroundTask[] = [];

  for (const task of tasks) {
    switch (task.status) {
      case 'processing':
        active.push(task);
        break;
      case 'queued':
        queued.push(task);
        break;
      case 'completed':
        completed.push(task);
        break;
      case 'failed':
      case 'cancelled':
        failed.push(task);
        break;
    }
  }

  return { active, queued, completed, failed };
}
