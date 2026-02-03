/**
 * Task Module - DEPRECATED
 *
 * TaskManager has been moved to @neko/agent package.
 * This module now re-exports types from @neko/shared for backwards compatibility.
 *
 * @deprecated Import from '@neko/agent' for TaskManager implementation,
 *             or from '@neko/shared' for types only.
 */

// Re-export types from shared for backwards compatibility
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

// Re-export storage implementations (still available in platform for convenience)
export { MemoryTaskStorage } from './task-storage';
export {
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
  type FileTaskRecoveryStorageOptions,
} from './task-recovery-storage';