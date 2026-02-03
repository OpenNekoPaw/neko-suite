/**
 * Task Types - Re-export from @neko/shared
 *
 * @deprecated Import from '@neko/shared' directly for new code.
 */

export type {
  Task,
  TaskType,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskProgressCallback,
  ITaskManager as TaskManager,
  ITaskStorage,
  ITaskRecoveryStorage,
  TaskRecoveryInfo,
  SerializableTask,
  TaskExecutor,
} from '@neko/shared';
