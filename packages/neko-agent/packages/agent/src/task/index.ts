/**
 * Task Module - Async task management for Agent
 *
 * Provides task scheduling, persistence, recovery, and concurrency control.
 */

export { TaskManager, type TaskManagerOptions, type ConcurrencyConfig } from './task-manager';
export {
  MemoryTaskStorage,
  FileTaskStorage,
  createFileTaskStorage,
  type FileTaskStorageOptions,
} from './task-storage';
export {
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
  type FileTaskRecoveryStorageOptions,
} from './task-recovery-storage';

// Re-export types from shared for convenience
export type {
  Task,
  TaskType,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskProgressCallback,
  ITaskManager,
  ITaskStorage,
  ITaskRecoveryStorage,
  TaskRecoveryInfo,
  SerializableTask,
  TaskExecutor,
} from '@neko/shared';
